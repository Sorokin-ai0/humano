/** Lightweight per-isolate limiter; replace with a distributed adapter at scale. */
export class SlidingWindowRateLimiter {
  private readonly windows = new Map<
    string,
    { startedAt: number; requests: number }
  >();

  constructor(
    private readonly requestLimit: number,
    private readonly windowMs: number,
  ) {}

  check(key: string, now = Date.now()): {
    allowed: boolean;
    retryAfterSeconds: number;
  } {
    const current = this.windows.get(key);
    if (!current || now - current.startedAt >= this.windowMs) {
      this.windows.set(key, { startedAt: now, requests: 1 });
      return { allowed: true, retryAfterSeconds: 0 };
    }
    if (current.requests >= this.requestLimit) {
      return {
        allowed: false,
        retryAfterSeconds: Math.max(
          1,
          Math.ceil((this.windowMs - (now - current.startedAt)) / 1000),
        ),
      };
    }
    current.requests += 1;
    return { allowed: true, retryAfterSeconds: 0 };
  }
}
