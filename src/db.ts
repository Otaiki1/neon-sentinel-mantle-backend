import { createRequire } from "module";

export type DbStatement = {
  get: (...params: unknown[]) => unknown;
  run: (...params: unknown[]) => { changes?: number; lastInsertRowid?: number };
};

export type Db = {
  prepare: (sql: string) => DbStatement;
  exec?: (sql: string) => void;
  pragma?: (pragma: string) => void;
};

type UserRow = {
  wallet: string;
  commitment: string;
  verified: number;
  last_verification_request_at: string | null;
  created_at: string;
  updated_at: string;
};

type RunRow = {
  run_hash: string;
  wallet: string;
  extraction_value: string;
  identity_commitment: string;
  status: string;
  created_at: string;
};

class MemoryDb implements Db {
  private users = new Map<string, UserRow>();
  private runs = new Map<string, RunRow>();
  private rawRuns: Array<Record<string, unknown>> = [];
  private faucetClaims = new Map<string, { last_claim_at: string }>();
  private auditLogs: Array<Record<string, unknown>> = [];
  private rateLimits = new Map<string, { window_start: number; count: number }>();

  prepare(sql: string): DbStatement {
    const normalized = sql.replace(/\s+/g, " ").trim().toLowerCase();

    if (normalized.startsWith("select commitment, verified from users")) {
      return {
        get: (wallet: unknown) => this.users.get(String(wallet)) ?? undefined,
        run: () => ({ changes: 0 })
      };
    }

    if (normalized.startsWith("select wallet, commitment, verified")) {
      return {
        get: (wallet: unknown) => this.users.get(String(wallet)) ?? undefined,
        run: () => ({ changes: 0 })
      };
    }

    if (normalized.startsWith("insert into users")) {
      return {
        get: () => undefined,
        run: (
          wallet: unknown,
          commitment: unknown,
          lastVerification: unknown,
          createdAt: unknown,
          updatedAt: unknown
        ) => {
          const key = String(wallet);
          const existing = this.users.get(key);
          const row: UserRow = {
            wallet: key,
            commitment: String(commitment),
            verified: existing?.verified ?? 0,
            last_verification_request_at: (lastVerification as string) ?? null,
            created_at: existing?.created_at ?? String(createdAt),
            updated_at: String(updatedAt)
          };
          this.users.set(key, row);
          return { changes: 1 };
        }
      };
    }

    if (normalized.startsWith("insert into raw_runs")) {
      return {
        get: () => undefined,
        run: (
          wallet: unknown,
          sessionId: unknown,
          runHash: unknown,
          extractionValue: unknown,
          status: unknown,
          payload: unknown,
          createdAt: unknown
        ) => {
          this.rawRuns.push({
            wallet,
            session_id: sessionId,
            run_hash: runHash,
            extraction_value: extractionValue,
            status,
            payload,
            created_at: createdAt
          });
          return { changes: 1, lastInsertRowid: this.rawRuns.length };
        }
      };
    }

    if (normalized.startsWith("select run_hash from runs")) {
      return {
        get: (runHash: unknown) => {
          const row = this.runs.get(String(runHash));
          return row ? { run_hash: row.run_hash } : undefined;
        },
        run: () => ({ changes: 0 })
      };
    }

    if (normalized.startsWith("insert into runs")) {
      return {
        get: () => undefined,
        run: (
          runHash: unknown,
          wallet: unknown,
          extractionValue: unknown,
          identityCommitment: unknown,
          status: unknown,
          createdAt: unknown
        ) => {
          this.runs.set(String(runHash), {
            run_hash: String(runHash),
            wallet: String(wallet),
            extraction_value: String(extractionValue),
            identity_commitment: String(identityCommitment),
            status: String(status),
            created_at: String(createdAt)
          });
          return { changes: 1 };
        }
      };
    }

    if (normalized.startsWith("select last_claim_at from faucet_claims")) {
      return {
        get: (wallet: unknown, token: unknown) => {
          const key = `${String(wallet)}:${String(token)}`;
          return this.faucetClaims.get(key) ?? undefined;
        },
        run: () => ({ changes: 0 })
      };
    }

    if (normalized.startsWith("insert into faucet_claims")) {
      return {
        get: () => undefined,
        run: (wallet: unknown, token: unknown, lastClaimAt: unknown) => {
          const key = `${String(wallet)}:${String(token)}`;
          this.faucetClaims.set(key, { last_claim_at: String(lastClaimAt) });
          return { changes: 1 };
        }
      };
    }

    if (normalized.startsWith("insert into audit_logs")) {
      return {
        get: () => undefined,
        run: (eventType: unknown, wallet: unknown, details: unknown, success: unknown, createdAt: unknown) => {
          this.auditLogs.push({
            event_type: eventType,
            wallet,
            details,
            success,
            created_at: createdAt
          });
          return { changes: 1 };
        }
      };
    }

    if (normalized.startsWith("select window_start, count from rate_limits")) {
      return {
        get: (key: unknown) => this.rateLimits.get(String(key)) ?? undefined,
        run: () => ({ changes: 0 })
      };
    }

    if (normalized.startsWith("insert or replace into rate_limits")) {
      return {
        get: () => undefined,
        run: (key: unknown, windowStart: unknown, count: unknown) => {
          this.rateLimits.set(String(key), {
            window_start: Number(windowStart),
            count: Number(count)
          });
          return { changes: 1 };
        }
      };
    }

    if (normalized.startsWith("update rate_limits set count")) {
      return {
        get: () => undefined,
        run: (count: unknown, key: unknown) => {
          const current = this.rateLimits.get(String(key));
          if (current) {
            current.count = Number(count);
          } else {
            this.rateLimits.set(String(key), {
              window_start: Date.now(),
              count: Number(count)
            });
          }
          return { changes: 1 };
        }
      };
    }

    return {
      get: () => undefined,
      run: () => ({ changes: 0 })
    };
  }
}

export function initDb(path: string): Db {
  const require = createRequire(import.meta.url);
  try {
    const Database = require("better-sqlite3");
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
    return db as Db;
  } catch (error) {
    if (process.env.NODE_ENV !== "test") {
      throw error;
    }
    return new MemoryDb();
  }
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

