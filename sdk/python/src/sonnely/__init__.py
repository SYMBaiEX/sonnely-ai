"""Server-side client for the Sonnely inference API."""

from __future__ import annotations

import json
from typing import Any, Iterator
from urllib.error import HTTPError
from urllib.request import HTTPRedirectHandler, Request, build_opener

__all__ = ["Sonnely", "SonnelyError"]


class SonnelyError(Exception):
    """An HTTP or stream error from the Sonnely gateway."""

    def __init__(self, message: str, status: int):
        super().__init__(message)
        self.status = status


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

    def _send(self, path: str, body: dict[str, Any] | None = None, *, receipt: bool = False):
        headers: dict[str, str] = {}
        if body is not None:
            if not self._api_key:
                raise SonnelyError("A Sonnely API key is required for completions.", 401)
            headers["Authorization"] = f"Bearer {self._api_key}"
            headers["Content-Type"] = "application/json"
            if receipt:
                headers["X-Sonnely-Receipt"] = "v1"
        request = Request(
            self._base_url + path,
            data=json.dumps(body, ensure_ascii=False, separators=(",", ":")).encode() if body is not None else None,
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
            raise SonnelyError(message, error.code) from None

    def models(self) -> dict[str, Any]:
        """List public models and provider routes."""
        with self._send("/models") as response:
            return json.load(response)

    def complete(self, request: dict[str, Any], *, receipt: bool = False) -> dict[str, Any]:
        """Request a single completion."""
        with self._send("/chat/completions", {**request, "stream": False}, receipt=receipt) as response:
            return json.load(response)

    def stream(
        self, request: dict[str, Any], *, receipt: bool = False, include_usage: bool = True
    ) -> Iterator[dict[str, Any]]:
        """Yield completion chunks and require Sonnely's settlement marker."""
        body = {**request, "stream": True, "stream_options": {"include_usage": include_usage}}
        with self._send("/chat/completions", body, receipt=receipt) as response:
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
                        raise SonnelyError(error.get("message", "Sonnely stream failed."), error.get("code", 502))
                    yield event
        raise SonnelyError("The stream ended before Sonnely confirmed settlement.", 502)
