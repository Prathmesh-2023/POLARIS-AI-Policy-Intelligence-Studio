from __future__ import annotations

import asyncio
import os
import random
from typing import Any

import httpx

from json_util import parse_json_object

GROQ_URL = "https://api.groq.com/openai/v1/chat/completions"
GROQ_MODEL = os.getenv("GROQ_MODEL", "openai/gpt-oss-120b")
TEMPERATURE = 0.3

# Free-tier Groq keys cannot handle 3 parallel completions. One at a time.
_groq_lock = asyncio.Semaphore(1)


class GroqError(Exception):
    pass


def _retry_after_seconds(response: httpx.Response, attempt: int) -> float:
    """Honour Groq's Retry-After when present (free-tier 429s carry a real
    wait), otherwise exponential backoff. A little jitter avoids lock-step
    retries when several runs are queued behind the semaphore."""
    header = response.headers.get("retry-after")
    base: float
    if header:
        try:
            base = min(max(float(header), 1.0), 60.0)
        except ValueError:
            base = min(3.0 * (2**attempt), 45.0)
    else:
        base = min(3.0 * (2**attempt), 45.0)
    return base + random.uniform(0.0, 1.5)


async def chat_json(
    client: httpx.AsyncClient,
    *,
    system: str,
    user: str,
    api_key: str | None = None,
) -> dict[str, Any]:
    # A per-request key (the user's own Groq key, sent from the app) wins over the
    # server's env key. It is threaded in from the pipeline and never persisted.
    api_key = (api_key or "").strip() or os.getenv("GROQ_API_KEY")
    if not api_key:
        raise GroqError(
            "No Groq API key available — set GROQ_API_KEY on the server "
            "or add your own key in the app under Settings."
        )

    payload = {
        "model": GROQ_MODEL,
        "temperature": TEMPERATURE,
        "response_format": {"type": "json_object"},
        "messages": [
            {"role": "system", "content": system},
            {"role": "user", "content": user},
        ],
    }

    last_error: Exception | None = None
    rate_limited = False
    async with _groq_lock:
        for attempt in range(6):
            try:
                response = await client.post(
                    GROQ_URL,
                    headers={
                        "Authorization": f"Bearer {api_key}",
                        "Content-Type": "application/json",
                    },
                    json=payload,
                    timeout=90.0,
                )
                if response.status_code == 429:
                    rate_limited = True
                    wait = _retry_after_seconds(response, attempt)
                    last_error = httpx.HTTPStatusError(
                        f"429 Too Many Requests (retrying in {wait:.0f}s)",
                        request=response.request,
                        response=response,
                    )
                    await asyncio.sleep(wait)
                    continue
                response.raise_for_status()
                body = response.json()
                content = body["choices"][0]["message"]["content"]
                parsed = parse_json_object(content)
                await asyncio.sleep(0.5)  # small gap so free-tier RPM/TPM is not burst
                return parsed
            except GroqError:
                raise
            except Exception as exc:
                last_error = exc
                if attempt >= 5:
                    break
                await asyncio.sleep(1.0)
        if rate_limited:
            raise GroqError(
                "Groq rate limit reached (429) — the free-tier quota is exhausted. "
                "Wait a minute and re-run, or set a higher-quota GROQ_API_KEY."
            )
        raise GroqError(str(last_error)[:240] if last_error else "Groq call failed")
