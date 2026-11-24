"""Server-side client for the Sonnely inference API."""

from __future__ import annotations

import json
import re
from dataclasses import dataclass
from email.message import Message
from pathlib import Path
from urllib.parse import urlsplit, urlunsplit
from uuid import uuid4
from typing import Any, Callable, Iterator
from urllib.error import HTTPError
from urllib.request import HTTPRedirectHandler, Request, build_opener

__all__ = ["ResponseMetadata", "Sonnely", "SonnelyError"]


@dataclass(frozen=True)
class ResponseMetadata:
    """Request metadata returned by the Sonnely gateway."""

    request_id: str | None
    retry_after: str | None


def _response_metadata(headers: Message | None) -> ResponseMetadata:
    if headers is None:
        return ResponseMetadata(None, None)
    return ResponseMetadata(headers.get("X-Sonnely-Request-Id"), headers.get("Retry-After"))


class SonnelyError(Exception):
    """An HTTP or stream error from the Sonnely gateway."""

    def __init__(
        self, message: str, status: int, *, metadata: ResponseMetadata | None = None,
    ):
        super().__init__(message)
        self.status = status
        self.request_id: str | None = metadata.request_id if metadata is not None else None
        self.retry_after: str | None = metadata.retry_after if metadata is not None else None


class _NoRedirect(HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


class Sonnely:
    def __init__(
        self,
        api_key: str | None = None,
        *,
        base_url: str = "https://sonnely.com/api/sonnely/v1",
        timeout: float = 70,
    ):
        self._api_key = api_key
        self._base_url = base_url.rstrip("/")
        self._timeout = timeout
        self._opener = build_opener(_NoRedirect())

    def _send(self, path: str, body: dict[str, Any] | None = None, *, receipt: bool = False, upload: tuple[str, Path, str] | None = None, idempotency_key: str | None = None):
        headers = {"User-Agent": "SonnelySDK-Python"}
        if body is not None:
            if not self._api_key:
                raise SonnelyError("A Sonnely API key is required for completions.", 401)
            headers["Authorization"] = f"Bearer {self._api_key}"
            headers["Content-Type"] = "application/json"
            if receipt:
                headers["X-Sonnely-Receipt"] = "v1"
        data = json.dumps(body, ensure_ascii=False, separators=(",", ":")).encode() if body is not None else None
        if upload is not None:
            field, file_path, mime = upload
            boundary = uuid4().hex
            headers["Content-Type"] = f"multipart/form-data; boundary={boundary}"
            if any(not re.fullmatch(r"[a-z_]+", name) for name in (body or {})):
                raise ValueError("Invalid multipart field name.")
            parts = [
                f'--{boundary}\r\nContent-Disposition: form-data; name="{name}"\r\n\r\n{value}\r\n'.encode()
                for name, value in (body or {}).items()
            ]
            parts.append(
                f'--{boundary}\r\nContent-Disposition: form-data; name="{field}"; filename="upload"\r\n'
                f'Content-Type: {mime}\r\n\r\n'.encode() + file_path.read_bytes() + f"\r\n--{boundary}--\r\n".encode()
            )
            data = b"".join(parts)
        if idempotency_key is not None:
            headers["Idempotency-Key"] = idempotency_key
        request = Request(
            self._base_url + path,
            data=data,
            headers=headers,
        )
        try:
            return self._opener.open(request, timeout=self._timeout)
        except HTTPError as error:
            with error:
                try:
                    message = json.load(error)["error"]["message"]
                except (ValueError, KeyError, TypeError):
                    message = f"Sonnely returned HTTP {error.code}."
            raise SonnelyError(message, error.code, metadata=_response_metadata(error.headers)) from None

    def models(self) -> dict[str, Any]:
        """List public models and provider routes."""
        with self._send("/models") as response:
            return json.load(response)

    def provider_models(self) -> dict[str, Any]:
        """List provider inventories and gateway routes."""
        with self._send("/provider-models") as response:
            return json.load(response)

    def infer(
        self, endpoint: str, request: dict[str, Any], *,
        file: str | Path | None = None, idempotency_key: str | None = None,
    ) -> tuple[dict[str, Any] | bytes, str | None]:
        """Run specialized inference and return (result, request reference)."""
        import mimetypes

        upload_fields = {
            "audio/transcriptions": "file", "audio/translations": "file",
            "convert/file": "files", "images/edits": "image",
        }
        json_endpoints = {
            "responses", "redact", "embeddings", "rerank", "systemone",
            "images/generations", "audio/speech",
        }
        if endpoint not in json_endpoints and endpoint not in upload_fields:
            raise ValueError("Unknown specialized inference endpoint.")
        upload = None
        if endpoint in upload_fields:
            if file is None:
                raise ValueError("This endpoint requires a file.")
            path = Path(file)
            mime = {
                ".m4a": "audio/mp4",
                ".ogg": "audio/ogg",
                ".webm": "audio/webm",
                ".wav": "audio/wav",
            }.get(path.suffix.lower()) or mimetypes.guess_type(path.name)[0] or "application/octet-stream"
            upload = upload_fields[endpoint], path, mime
        elif file is not None:
            raise ValueError("This endpoint accepts JSON.")
        with self._send("/" + endpoint, request, upload=upload, idempotency_key=idempotency_key) as response:
            data = response.read() if endpoint == "audio/speech" else json.load(response)
            return data, response.headers.get("X-Sonnely-Request-Id")

    def realtime_connection(self) -> tuple[str, dict[str, str]]:
        """Return the WebSocket URL and headers for a server-side client."""
        if not self._api_key:
            raise SonnelyError("A Sonnely API key is required for inference.", 401)
        url = urlsplit(self._base_url + "/realtime")
        if url.scheme not in ("https", "http"):
            raise ValueError("Use an HTTP(S) base URL.")
        return (
            urlunsplit(("wss" if url.scheme == "https" else "ws", url.netloc, url.path,
                        "model=voxtral-mini-4b-realtime", "")),
            {"Authorization": f"Bearer {self._api_key}"},
        )

    def complete(
        self,
        request: dict[str, Any],
        *,
        receipt: bool = False,
        idempotency_key: str | None = None,
        on_response: Callable[[ResponseMetadata], None] | None = None,
    ) -> dict[str, Any]:
        """Request a single completion."""
        with self._send(
            "/chat/completions", {**request, "stream": False},
            receipt=receipt, idempotency_key=idempotency_key,
        ) as response:
            data = json.load(response)
            if on_response is not None:
                on_response(_response_metadata(response.headers))
            return data

    def stream(
        self,
        request: dict[str, Any],
        *,
        receipt: bool = False,
        include_usage: bool = True,
        idempotency_key: str | None = None,
        on_response: Callable[[ResponseMetadata], None] | None = None,
    ) -> Iterator[dict[str, Any]]:
        """Yield completion chunks and require Sonnely's settlement marker."""
        body = {**request, "stream": True, "stream_options": {"include_usage": include_usage}}
        with self._send(
            "/chat/completions", body, receipt=receipt, idempotency_key=idempotency_key,
        ) as response:
            metadata = _response_metadata(response.headers)
            if on_response is not None:
                on_response(metadata)
            fields = []
            for raw_line in response:
                line = raw_line.decode("utf-8").rstrip("\r\n")
                if line.startswith("data:"):
                    fields.append(line[5:].removeprefix(" "))
                elif not line and fields:
                    data = "\n".join(fields)
                    fields.clear()
                    if data == "[DONE]":
                        return
                    event = json.loads(data)
                    if "error" in event:
                        error = event["error"]
                        raise SonnelyError(
                            error.get("message", "Sonnely stream failed."),
                            error.get("code", 502),
                            metadata=metadata,
                        )
                    yield event
        raise SonnelyError("The stream ended before Sonnely confirmed settlement.", 502, metadata=metadata)
