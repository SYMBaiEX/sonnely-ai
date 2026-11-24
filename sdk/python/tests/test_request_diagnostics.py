import io
import json
import unittest
from email.message import Message
from unittest.mock import patch
from urllib.error import HTTPError

from sonnely import ResponseMetadata, Sonnely, SonnelyError


REQUEST = {
    "model": "z-ai/glm-5.3-flash",
    "messages": [{"role": "user", "content": "Say hello."}],
}
REQUEST_ID = "fixture-request"


def message(**values):
    headers = Message()
    for name, value in values.items():
        headers[name.replace("_", "-")] = value
    return headers


def response(body, request_id=REQUEST_ID, provider=None):
    stream = io.BytesIO(body)
    stream.headers = message(x_sonnely_request_id=request_id)
    if provider is not None:
        stream.headers["X-Sonnely-Provider"] = provider
    return stream


class RequestDiagnosticsTest(unittest.TestCase):
    def setUp(self):
        self.client = Sonnely("fixture-key")

    def test_completion_and_stream_forward_keys_and_report_metadata(self):
        completion = {"id": "provider-id", "sonnely_request_id": REQUEST_ID}
        observed = []
        with patch.object(
            self.client._opener,
            "open",
            side_effect=[
                response(json.dumps(completion).encode()),
                response(b'data: {"id":"provider-id"}\n\ndata: [DONE]\n\n'),
            ],
        ) as send:
            result = self.client.complete(
                REQUEST, idempotency_key="example-complete", on_response=observed.append,
            )
            self.assertEqual(result, completion)
            chunks = list(self.client.stream(
                REQUEST, idempotency_key="example-stream", on_response=observed.append,
            ))
            self.assertEqual(chunks, [{"id": "provider-id"}])
        self.assertEqual(
            [call.args[0].get_header("Idempotency-key") for call in send.call_args_list],
            ["example-complete", "example-stream"],
        )
        self.assertEqual(observed, [ResponseMetadata(REQUEST_ID, None)] * 2)

    def test_failover_order_and_serving_provider(self):
        policy = {"only": ["tinfoil", "near-ai", "phala"], "allow_fallbacks": True}
        request = {**REQUEST, "model": "deepseek-ai/DeepSeek-V4.1-Flash-1017", "provider": policy}
        observed = []
        with patch.object(
            self.client._opener, "open", side_effect=[
                response(b'{"sonnely_provider":"phala"}', provider="phala"),
                response(b'data: [DONE]\n\n', provider="phala"),
            ],
        ) as send:
            result = self.client.complete(request, on_response=observed.append)
            self.assertEqual(result["sonnely_provider"], "phala")
            list(self.client.stream(request, on_response=observed.append))
        self.assertEqual([json.loads(call.args[0].data)["provider"] for call in send.call_args_list], [policy] * 2)
        self.assertEqual(observed, [ResponseMetadata(REQUEST_ID, None, "phala")] * 2)

    def test_duplicate_and_rate_limit_errors_expose_headers_without_retrying(self):
        url = "https://example.test/chat/completions"
        conflict = HTTPError(
            url, 409, "Conflict", message(x_sonnely_request_id=REQUEST_ID),
            io.BytesIO(b'{"error":{"message":"This Idempotency-Key already started a request."}}'),
        )
        limit = HTTPError(url, 429, "Rate limit", message(retry_after="60"), io.BytesIO(b"Rate limit"))
        with patch.object(self.client._opener, "open", side_effect=[conflict, limit]) as send:
            with self.assertRaises(SonnelyError) as duplicate:
                self.client.complete(REQUEST, idempotency_key="example-conflict")
            self.assertEqual(send.call_count, 1)
            with self.assertRaises(SonnelyError) as throttled:
                self.client.complete(REQUEST)
        self.assertEqual(duplicate.exception.status, 409)
        self.assertEqual(duplicate.exception.request_id, REQUEST_ID)
        self.assertIsNone(duplicate.exception.retry_after)
        self.assertEqual(throttled.exception.status, 429)
        self.assertEqual(throttled.exception.retry_after, "60")
        self.assertIsNone(throttled.exception.request_id)

    def test_stream_errors_keep_the_original_request_id(self):
        streams = [
            response(b'data: {"error":{"message":"Settlement is pending.","code":502}}\n\n', provider="phala"),
            response(b"data: {}\n\n", provider="phala"),
        ]
        with patch.object(self.client._opener, "open", side_effect=streams):
            for error in ("Settlement is pending.", "The stream ended before Sonnely confirmed settlement."):
                with self.subTest(error=error), self.assertRaises(SonnelyError) as failed:
                    list(self.client.stream(REQUEST))
                self.assertEqual(str(failed.exception), error)
                self.assertEqual(failed.exception.status, 502)
                self.assertEqual(failed.exception.request_id, REQUEST_ID)
                self.assertEqual(failed.exception.provider, "phala")


if __name__ == "__main__":
    unittest.main()
