// Lightweight in-memory rate limiter for auth-related server actions.
//
// This is a defense-in-depth measure against basic credential-stuffing /
// brute-force attempts on sign-in. It is intentionally simple:
//
// - It is per-server-instance only. In a multi-instance deployment (e.g.
//   several serverless/edge instances behind a load balancer) each instance
//   tracks its own counts, so this does NOT provide a hard guarantee.
// - For real production protection, pair this with infrastructure-level
//   rate limiting / WAF rules (e.g. Vercel Firewall, Cloudflare, an API
//   gateway) and/or a shared store (Redis, Upstash) keyed the same way.
//
// Still, this meaningfully slows down naive automated attempts and costs
// nothing to run.

type Attempt = {
  count: number;
  firstAttemptAt: number;
};

const attempts = new Map<string, Attempt>();

const WINDOW_MS = 15 * 60 * 1000; // 15 minutes
const MAX_ATTEMPTS = 10;

// Periodically clear stale entries so the map doesn't grow unbounded.
function pruneStaleEntries(now: number) {
  for (const [key, attempt] of attempts) {
    if (now - attempt.firstAttemptAt > WINDOW_MS) {
      attempts.delete(key);
    }
  }
}

/**
 * Checks whether `key` (e.g. a normalized email address, optionally combined
 * with an IP address) has exceeded the allowed number of attempts in the
 * current window. Call `recordFailure(key)` after a failed attempt and
 * `resetAttempts(key)` after a successful one.
 */
export function isRateLimited(key: string): boolean {
  const now = Date.now();
  pruneStaleEntries(now);

  const attempt = attempts.get(key);
  if (!attempt) return false;

  if (now - attempt.firstAttemptAt > WINDOW_MS) {
    attempts.delete(key);
    return false;
  }

  return attempt.count >= MAX_ATTEMPTS;
}

export function recordFailure(key: string): void {
  const now = Date.now();
  const attempt = attempts.get(key);

  if (!attempt || now - attempt.firstAttemptAt > WINDOW_MS) {
    attempts.set(key, { count: 1, firstAttemptAt: now });
    return;
  }

  attempt.count += 1;
}

export function resetAttempts(key: string): void {
  attempts.delete(key);
}
