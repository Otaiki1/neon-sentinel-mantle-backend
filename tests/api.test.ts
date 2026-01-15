import { describe, expect, it } from "vitest";
import request from "supertest";
import { ethers } from "ethers";
import { createApp } from "../src/app.js";
import { initDb } from "../src/db.js";
import { computeExtractionValue, computeRunHash } from "../src/utils.js";

process.env.NODE_ENV = "test";

function makeTestApp() {
  const db = initDb(":memory:");
  const provider = new ethers.JsonRpcProvider("http://127.0.0.1:8545");
  const trustedSigner = new ethers.Wallet(
    "0x59c6995e998f97a5a0044986f595d5b5c5a20c0a29f29d6d9a5f4f5d7d6f3c8a",
    provider
  );
  return createApp(
    {
      db,
      provider,
      trustedSigner,
      chainId: 5001n,
      ecdsaVerifierAddress: "0x0000000000000000000000000000000000000001",
      signIdentityLimit: 5,
      signIdentityWindowMs: 60_000,
      signGameLimit: 5,
      signGameWindowMs: 60_000,
      faucetWindowMs: 60_000,
      faucetUsdtAmount: 1000,
      faucetMethAmount: 0.1
    },
    { ipRateLimitPerMinute: 1000 }
  );
}

describe("API", () => {
  it("responds to health", async () => {
    const app = makeTestApp();
    const res = await request(app).get("/health");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
  });

  it("signs identity and blocks mismatched commitment", async () => {
    const app = makeTestApp();
    const wallet = "0x1111111111111111111111111111111111111111";

    const res = await request(app).post("/sign-identity").send({
      wallet,
      commitment: "123"
    });
    expect(res.status).toBe(200);
    expect(res.body.signature).toMatch(/^0x[0-9a-f]+$/i);

    const mismatch = await request(app).post("/sign-identity").send({
      wallet,
      commitment: "456"
    });
    expect(mismatch.status).toBe(400);
    expect(mismatch.body.error).toBe("commitment_mismatch");
  });

  it("computes raw run hash + extraction value", async () => {
    const app = makeTestApp();
    const payload = {
      wallet: "0x2222222222222222222222222222222222222222",
      sessionId: "session-1",
      events: [{ value: 3 }, { value: 2 }],
      score: 10
    };
    const res = await request(app).post("/game/run/raw").send(payload);
    expect(res.status).toBe(200);
    expect(res.body.runHash).toMatch(/^0x[0-9a-f]{64}$/i);
    expect(res.body.extractionValue).toBe("10");
  });

  it("signs game run and blocks duplicates", async () => {
    const app = makeTestApp();
    const wallet = "0x3333333333333333333333333333333333333333";
    const raw = { wallet, score: 7, events: [{ value: 1 }] };
    const runHash = computeRunHash(raw);
    const extractionValue = computeExtractionValue(raw);

    const res = await request(app).post("/sign-game-run").send({
      wallet,
      runHash,
      extractionValue: extractionValue.toString(),
      identityCommitment: "999",
      raw
    });
    expect(res.status).toBe(200);
    expect(res.body.signature).toMatch(/^0x[0-9a-f]+$/i);

    const dup = await request(app).post("/sign-game-run").send({
      wallet,
      runHash,
      extractionValue: extractionValue.toString(),
      identityCommitment: "999"
    });
    expect(dup.status).toBe(409);
    expect(dup.body.error).toBe("duplicate_run");
  });

  it("fails faucet when not configured", async () => {
    const app = makeTestApp();
    const res = await request(app).post("/faucet").send({
      wallet: "0x4444444444444444444444444444444444444444"
    });
    expect(res.status).toBe(500);
    expect(res.body.error).toBe("faucet_not_configured");
  });
});

