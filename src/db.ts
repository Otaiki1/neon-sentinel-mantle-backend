import Database from "better-sqlite3";

export type Db = Database.Database;

export function initDb(path: string): Db {
  const db = new Database(path);
  db.pragma("journal_mode = WAL");

  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      wallet TEXT PRIMARY KEY,
      commitment TEXT NOT NULL,
      verified INTEGER NOT NULL DEFAULT 0,
      last_verification_request_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS runs (
      run_hash TEXT PRIMARY KEY,
      wallet TEXT NOT NULL,
      extraction_value TEXT NOT NULL,
      identity_commitment TEXT NOT NULL,
      status TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS raw_runs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      wallet TEXT NOT NULL,
      session_id TEXT,
      run_hash TEXT NOT NULL,
      extraction_value TEXT NOT NULL,
      status TEXT NOT NULL,
      payload TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS faucet_claims (
      wallet TEXT NOT NULL,
      token TEXT NOT NULL,
      last_claim_at TEXT NOT NULL,
      PRIMARY KEY (wallet, token)
    );

    CREATE TABLE IF NOT EXISTS audit_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      event_type TEXT NOT NULL,
      wallet TEXT,
      details TEXT,
      success INTEGER NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS rate_limits (
      key TEXT PRIMARY KEY,
      window_start INTEGER NOT NULL,
      count INTEGER NOT NULL
    );
  `);

  return db;
}

export function logAudit(
  db: Db,
  eventType: string,
  wallet: string | null,
  details: string,
  success: boolean
): void {
  const stmt = db.prepare(
    `INSERT INTO audit_logs (event_type, wallet, details, success, created_at)
     VALUES (?, ?, ?, ?, ?)`
  );
  stmt.run(eventType, wallet, details, success ? 1 : 0, new Date().toISOString());
}

