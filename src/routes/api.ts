import type { Router } from "express";
import { ethers } from "ethers";
import { z } from "zod";
import type { Db } from "../db.js";
import { logAudit } from "../db.js";
import { checkRateLimit } from "../rateLimit.js";
import {
  computeExtractionValue,
  computeRunHash,
  ensureBytes32,
  normalizeAddress,
  parseUint256
} from "../utils.js";
import { logger } from "../logger.js";

type ApiDeps = {
  db: Db;
  provider: ethers.JsonRpcProvider;
  trustedSigner: ethers.Wallet;
  faucetSigner?: ethers.Wallet;
  chainId: bigint;
  ecdsaVerifierAddress: string;
  neonIdentityAddress?: string;
  signIdentityLimit: number;
  signIdentityWindowMs: number;
  signGameLimit: number;
  signGameWindowMs: number;
  faucetWindowMs: number;
  faucetUsdtAmount: number;
  faucetMethAmount: number;
  usdtAddress?: string;
  methAddress?: string;
};

const identitySchema = z.object({
  wallet: z.string(),
  commitment: z.union([z.string(), z.number(), z.bigint()])
});

const runSchema = z.object({
  wallet: z.string(),
  runHash: z.string(),
  extractionValue: z.union([z.string(), z.number(), z.bigint()]),
  identityCommitment: z.union([z.string(), z.number(), z.bigint()]),
  raw: z.unknown().optional()
});

const rawRunSchema = z.object({
  wallet: z.string(),
  sessionId: z.string().optional(),
  events: z.array(z.unknown()).optional(),
  score: z.number().optional()
});

const faucetSchema = z.object({
  wallet: z.string(),
  token: z.enum(["USDT", "METH"]).optional()
});

const identityTypes = {
  IdentityRegistration: [
    { name: "commitment", type: "uint256" },
    { name: "wallet", type: "address" }
  ]
};

const runTypes = {
  GameRunSubmission: [
    { name: "runHash", type: "bytes32" },
    { name: "extractionValue", type: "uint256" },
    { name: "identityCommitment", type: "uint256" },
    { name: "player", type: "address" }
  ]
};

function eip712Domain(chainId: bigint, verifyingContract: string) {
  return {
    name: "ECDSAVerifier",
    version: "1",
    chainId,
    verifyingContract
  };
}

function getClientIp(req: { headers: Record<string, string | string[] | undefined>; ip?: string }) {
  const forwarded = req.headers["x-forwarded-for"];
  if (typeof forwarded === "string") {
    return forwarded.split(",")[0]?.trim() ?? "unknown";
  }
  if (Array.isArray(forwarded)) {
    return forwarded[0] ?? "unknown";
  }
  return req.ip ?? "unknown";
}

async function isIdentityVerified(
  deps: ApiDeps,
  wallet: string
): Promise<boolean | null> {
  if (!deps.neonIdentityAddress) {
    return null;
  }
  const contract = new ethers.Contract(
    deps.neonIdentityAddress,
    ["function isVerified(address) view returns (bool)"],
    deps.provider
  );
  return contract.isVerified(wallet);
}

export function registerApiRoutes(router: Router, deps: ApiDeps): void {
  router.get("/health", (_req, res) => {
    res.json({ ok: true });
  });

  router.post("/sign-identity", async (req, res) => {
    let wallet: string | null = null;
    try {
      const payload = identitySchema.parse(req.body);
      wallet = normalizeAddress(payload.wallet);
      const commitment = parseUint256(payload.commitment);

      const rateKey = `sign-identity:${wallet}`;
      const rateResult = checkRateLimit(
        deps.db,
        rateKey,
        deps.signIdentityLimit,
        deps.signIdentityWindowMs
      );
      if (!rateResult.allowed) {
        return res.status(429).json({ error: "rate_limited" });
      }

      const existing = deps.db
        .prepare("SELECT commitment, verified FROM users WHERE wallet = ?")
        .get(wallet) as { commitment: string; verified: number } | undefined;

      if (existing?.verified === 1) {
        return res.status(409).json({ error: "already_verified" });
      }

      if (existing && existing.commitment !== commitment.toString()) {
        return res.status(400).json({ error: "commitment_mismatch" });
      }

      const now = new Date().toISOString();
      deps.db
        .prepare(
          `INSERT INTO users (wallet, commitment, verified, last_verification_request_at, created_at, updated_at)
           VALUES (?, ?, 0, ?, ?, ?)
           ON CONFLICT(wallet) DO UPDATE SET commitment = excluded.commitment,
             last_verification_request_at = excluded.last_verification_request_at,
             updated_at = excluded.updated_at`
        )
        .run(wallet, commitment.toString(), now, now, now);

      const domain = eip712Domain(deps.chainId, deps.ecdsaVerifierAddress);
      const signature = await deps.trustedSigner.signTypedData(domain, identityTypes, {
        commitment,
        wallet
      });

      logAudit(
        deps.db,
        "sign_identity",
        wallet,
        JSON.stringify({ commitment: commitment.toString() }),
        true
      );

      return res.status(200).json({ signature });
    } catch (error) {
      logAudit(
        deps.db,
        "sign_identity",
        wallet,
        JSON.stringify({ error: (error as Error).message }),
        false
      );
      logger.error({ error }, "sign-identity failed");
      return res.status(400).json({ error: "invalid_request" });
    }
  });

  router.post("/game/run/raw", (req, res) => {
    let wallet: string | null = null;
    try {
      const payload = rawRunSchema.parse(req.body);
      wallet = normalizeAddress(payload.wallet);
      const runPayload = { ...payload, wallet };
      const runHash = computeRunHash(runPayload);
      const extractionValue = computeExtractionValue(runPayload);
      const now = new Date().toISOString();

      deps.db
        .prepare(
          `INSERT INTO raw_runs (wallet, session_id, run_hash, extraction_value, status, payload, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?)`
        )
        .run(
          wallet,
          payload.sessionId ?? null,
          runHash,
          extractionValue.toString(),
          "valid",
          JSON.stringify(runPayload),
          now
        );

      return res.status(200).json({
        runHash,
        extractionValue: extractionValue.toString()
      });
    } catch (error) {
      logger.error({ error }, "raw-run failed");
      return res.status(400).json({ error: "invalid_request" });
    }
  });

  router.post("/sign-game-run", async (req, res) => {
    let wallet: string | null = null;
    try {
      const payload = runSchema.parse(req.body);
      wallet = normalizeAddress(payload.wallet);
      const runHash = ensureBytes32(payload.runHash);
      const extractionValue = parseUint256(payload.extractionValue);
      const identityCommitment = parseUint256(payload.identityCommitment);

      const rateKey = `sign-game:${wallet}`;
      const rateResult = checkRateLimit(
        deps.db,
        rateKey,
        deps.signGameLimit,
        deps.signGameWindowMs
      );
      if (!rateResult.allowed) {
        return res.status(429).json({ error: "rate_limited" });
      }

      const existingRun = deps.db
        .prepare("SELECT run_hash FROM runs WHERE run_hash = ?")
        .get(runHash);
      if (existingRun) {
        return res.status(409).json({ error: "duplicate_run" });
      }

      if (payload.raw) {
        const computedHash = computeRunHash(payload.raw);
        const computedValue = computeExtractionValue(payload.raw);
        if (computedHash !== runHash) {
          return res.status(400).json({ error: "run_hash_mismatch" });
        }
        if (computedValue !== extractionValue) {
          return res.status(400).json({ error: "extraction_value_mismatch" });
        }
      }

      const verified = await isIdentityVerified(deps, wallet);
      if (verified === false) {
        return res.status(403).json({ error: "identity_not_verified" });
      }

      const domain = eip712Domain(deps.chainId, deps.ecdsaVerifierAddress);
      const signature = await deps.trustedSigner.signTypedData(domain, runTypes, {
        runHash,
        extractionValue,
        identityCommitment,
        player: wallet
      });

      deps.db
        .prepare(
          `INSERT INTO runs (run_hash, wallet, extraction_value, identity_commitment, status, created_at)
           VALUES (?, ?, ?, ?, ?, ?)`
        )
        .run(
          runHash,
          wallet,
          extractionValue.toString(),
          identityCommitment.toString(),
          "signed",
          new Date().toISOString()
        );

      logAudit(
        deps.db,
        "sign_game_run",
        wallet,
        JSON.stringify({ runHash, extractionValue: extractionValue.toString() }),
        true
      );

      return res.status(200).json({
        signature,
        approved: true,
        runHash,
        extractionValue: extractionValue.toString(),
        identityCommitment: identityCommitment.toString()
      });
    } catch (error) {
      logAudit(
        deps.db,
        "sign_game_run",
        wallet,
        JSON.stringify({ error: (error as Error).message }),
        false
      );
      logger.error({ error }, "sign-game-run failed");
      return res.status(400).json({ error: "invalid_request" });
    }
  });

  router.post("/faucet", async (req, res) => {
    let wallet: string | null = null;
    try {
      if (!deps.faucetSigner) {
        return res.status(500).json({ error: "faucet_not_configured" });
      }
      const payload = faucetSchema.parse(req.body);
      wallet = normalizeAddress(payload.wallet);
      const token = payload.token ?? "USDT";
      const tokenAddress = token === "USDT" ? deps.usdtAddress : deps.methAddress;
      if (!tokenAddress) {
        return res.status(400).json({ error: "token_not_configured" });
      }

      const ip = getClientIp(req);
      const ipLimit = checkRateLimit(deps.db, `faucet-ip:${ip}`, 5, deps.faucetWindowMs);
      if (!ipLimit.allowed) {
        return res.status(429).json({ error: "rate_limited" });
      }

      const existing = deps.db
        .prepare("SELECT last_claim_at FROM faucet_claims WHERE wallet = ? AND token = ?")
        .get(wallet, token) as { last_claim_at: string } | undefined;

      if (existing) {
        const last = Date.parse(existing.last_claim_at);
        if (Date.now() - last < deps.faucetWindowMs) {
          return res.status(429).json({ error: "already_claimed" });
        }
      }

      const amount =
        token === "USDT"
          ? ethers.parseUnits(deps.faucetUsdtAmount.toString(), 6)
          : ethers.parseUnits(deps.faucetMethAmount.toString(), 18);

      const tokenContract = new ethers.Contract(
        tokenAddress,
        [
          "function mint(address to, uint256 amount) returns (bool)",
          "function balanceOf(address) view returns (uint256)"
        ],
        deps.faucetSigner
      );

      const tx = await tokenContract.mint(wallet, amount);
      const receipt = await tx.wait();
      const balance = await tokenContract.balanceOf(wallet);
      const now = new Date().toISOString();

      deps.db
        .prepare(
          `INSERT INTO faucet_claims (wallet, token, last_claim_at)
           VALUES (?, ?, ?)
           ON CONFLICT(wallet, token) DO UPDATE SET last_claim_at = excluded.last_claim_at`
        )
        .run(wallet, token, now);

      logAudit(
        deps.db,
        "faucet_mint",
        wallet,
        JSON.stringify({ token, amount: amount.toString(), txHash: tx.hash }),
        true
      );

      return res.status(200).json({
        txHash: tx.hash,
        amount: amount.toString(),
        balance: balance.toString(),
        blockNumber: receipt?.blockNumber ?? null
      });
    } catch (error) {
      logAudit(
        deps.db,
        "faucet_mint",
        wallet,
        JSON.stringify({ error: (error as Error).message }),
        false
      );
      logger.error({ error }, "faucet failed");
      return res.status(400).json({ error: "invalid_request" });
    }
  });

  router.get("/user/:wallet", (req, res) => {
    try {
      const wallet = normalizeAddress(req.params.wallet);
      const user = deps.db
        .prepare(
          `SELECT wallet, commitment, verified, last_verification_request_at, created_at, updated_at
           FROM users WHERE wallet = ?`
        )
        .get(wallet);
      if (!user) {
        return res.status(404).json({ error: "not_found" });
      }
      return res.status(200).json({
        wallet: user.wallet,
        commitment: user.commitment,
        verified: Boolean(user.verified),
        lastVerificationRequestAt: user.last_verification_request_at,
        createdAt: user.created_at,
        updatedAt: user.updated_at
      });
    } catch (error) {
      return res.status(400).json({ error: "invalid_request" });
    }
  });
}

