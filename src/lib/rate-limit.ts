// Simple in-memory rate limiter for server API routes
const tracker = new Map<string, { count: number; resetTime: number }>();

/**
 * Checks if a given IP has exceeded the allowed request limit within the window time.
 * @param ip Client IP address
 * @param limit Maximum allowed requests per window
 * @param windowMs Window duration in milliseconds (default 60000 = 1 minute)
 * @returns true if rate limited, false otherwise
 */
export function isRateLimited(ip: string, limit: number = 30, windowMs: number = 60000): boolean {
  const now = Date.now();

  // Periodic cleanup if map grows too large to prevent memory leak
  if (tracker.size > 1000) {
    for (const [key, val] of tracker.entries()) {
      if (now > val.resetTime) {
        tracker.delete(key);
      }
    }
  }

  const entry = tracker.get(ip);

  if (!entry) {
    tracker.set(ip, { count: 1, resetTime: now + windowMs });
    return false;
  }

  if (now > entry.resetTime) {
    entry.count = 1;
    entry.resetTime = now + windowMs;
    return false;
  }

  entry.count++;
  if (entry.count > limit) {
    return true;
  }

  return false;
}
