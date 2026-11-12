// In-memory rate limiter with bounded capacity and safer client key extraction
const MAX_TRACKER_ENTRIES = 2000;
const tracker = new Map<string, { count: number; resetTime: number }>();

/**
 * Extracts a client identifier without blindly trusting spoofable X-Forwarded-For chains
 * unless TRUST_PROXY=true is explicitly enabled.
 */
export function getClientRateLimitKey(request: Request, scope: string = "global"): string {
  const realIp = request.headers.get("x-real-ip")?.trim();
  const forwarded = request.headers.get("x-forwarded-for");
  const trustProxy = process.env.TRUST_PROXY === "true";

  let ip = "local";
  if (realIp) {
    ip = realIp;
  } else if (trustProxy && forwarded) {
    const parts = forwarded.split(",").map((s) => s.trim()).filter(Boolean);
    ip = parts[parts.length - 1] || "local";
  } else if (forwarded) {
    // Without trusted proxy, include host/ua fingerprint to reduce trivial single-header bypass
    const ua = (request.headers.get("user-agent") || "unknown").slice(0, 48);
    ip = `${forwarded.split(",")[0].trim()}:${ua}`;
  }
  return `${scope}:${ip}`;
}

/**
 * Checks if a given key has exceeded the allowed request limit within the window time.
 * @param key Client identifier / IP address
 * @param limit Maximum allowed requests per window
 * @param windowMs Window duration in milliseconds (default 60000 = 1 minute)
 * @returns true if rate limited, false otherwise
 */
export function isRateLimited(key: string, limit: number = 30, windowMs: number = 60000): boolean {
  const now = Date.now();

  if (tracker.size > 1000) {
    for (const [k, val] of tracker.entries()) {
      if (now > val.resetTime) {
        tracker.delete(k);
      }
    }
  }

  // Hard cap to prevent unbounded memory growth under IP-spray attacks
  if (tracker.size >= MAX_TRACKER_ENTRIES && !tracker.has(key)) {
    const oldestKey = tracker.keys().next().value;
    if (oldestKey !== undefined) {
      tracker.delete(oldestKey);
    }
  }

  const entry = tracker.get(key);

  if (!entry) {
    tracker.set(key, { count: 1, resetTime: now + windowMs });
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
