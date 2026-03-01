"""
Thread-safe sliding-window rate limiter.

Each (key, limit, window) triple maintains its own deque of timestamps.
Old entries are evicted lazily on every check so memory stays bounded.

Usage:
    from services.rate_limiter import limiter

    allowed, retry_after = limiter.check("login:127.0.0.1", limit=10, window=60)
    if not allowed:
        raise HTTPException(429, headers={"Retry-After": str(retry_after)})
"""
import time
from collections import defaultdict, deque
from threading import Lock


class SlidingWindowLimiter:
    def __init__(self):
        self._buckets: dict[str, deque] = defaultdict(deque)
        self._lock = Lock()

    def check(self, key: str, limit: int, window: int) -> tuple[bool, int]:
        """
        Return (allowed, retry_after_seconds).

        `allowed` is False when the caller has reached `limit` requests
        within the last `window` seconds.  `retry_after` is the number of
        seconds until the oldest request falls outside the window.
        """
        now = time.monotonic()
        cutoff = now - window

        with self._lock:
            dq = self._buckets[key]

            # Evict timestamps that have aged out of the window
            while dq and dq[0] <= cutoff:
                dq.popleft()

            if len(dq) >= limit:
                retry_after = max(1, int(dq[0] - cutoff) + 1)
                return False, retry_after

            dq.append(now)
            return True, 0

    def reset(self, key: str) -> None:
        """Clear the bucket for a key.  Primarily useful in tests."""
        with self._lock:
            self._buckets.pop(key, None)

    def reset_all(self) -> None:
        """Clear every bucket.  Useful for test teardown."""
        with self._lock:
            self._buckets.clear()


# Module-level singleton — shared across all requests in the same process
limiter = SlidingWindowLimiter()
