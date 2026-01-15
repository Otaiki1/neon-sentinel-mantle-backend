import type { Db } from "./db.js";

export type RateLimitResult = { allowed: boolean; retryAfterMs?: number };

export function checkRateLimit(
  db: Db,
  key: string,
  maxRequests: number,
  windowMs: number
): RateLimitResult {
  const now = Date.now();
  const row = db
    .prepare("SELECT window_start, count FROM rate_limits WHERE key = ?")
    .get(key) as { window_start: number; count: number } | undefined;

  if (!row || now - row.window_start >= windowMs) {
    db.prepare(
      "INSERT OR REPLACE INTO rate_limits (key, window_start, count) VALUES (?, ?, ?)"
    ).run(key, now, 1);
    return { allowed: true };
  }

  if (row.count >= maxRequests) {
    return { allowed: false, retryAfterMs: windowMs - (now - row.window_start) };
  }

  db.prepare("UPDATE rate_limits SET count = ? WHERE key = ?").run(row.count + 1, key);
  return { allowed: true };
}

