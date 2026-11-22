# Sonnely SDK for Python

Run text inference on Sonnely from Python 3.10 or newer. Create a funded [Sonnely API key](https://sonnely.com/console/keys) and store it server-side as `SONNELY_API_KEY`.

```python
import os
from sonnely import Sonnely

sonnely = Sonnely(os.environ["SONNELY_API_KEY"])
request = {
    "model": "z-ai/glm-5.3-flash",
    "messages": [{"role": "user", "content": "Describe winter in two words."}],
    "max_tokens": 128,
    "max_cost_microusd": 500,
}
result = sonnely.complete(request, receipt=True)
print(result["choices"][0]["message"]["content"], result["usage"])
```

Call `models()` for live routes and rates. Use `stream(request, receipt=True)` for an iterator that yields text deltas and final usage. The iterator requires the gateway's settlement marker to complete normally. Each completion or stream is billed separately.

[SDK guide](https://docs.sonnely.com/docs/sdks) · [API reference](https://docs.sonnely.com/docs/api) · [Usage](https://sonnely.com/console/usage)
