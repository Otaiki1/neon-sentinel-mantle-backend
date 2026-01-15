import express from "express";
import helmet from "helmet";
import morgan from "morgan";
import rateLimit from "express-rate-limit";
import type { Db } from "./db.js";
import { registerApiRoutes } from "./routes/api.js";
import type { ethers } from "ethers";

export type AppDeps = {
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

export type AppOptions = {
  ipRateLimitPerMinute?: number;
};

export function createApp(deps: AppDeps, options: AppOptions = {}) {
  const app = express();
  app.use(helmet());
  app.use(express.json({ limit: "1mb" }));
  app.use(morgan("combined"));

  const ipLimiter = rateLimit({
    windowMs: 60 * 1000,
    limit: options.ipRateLimitPerMinute ?? 60,
    standardHeaders: true,
    legacyHeaders: false
  });
  app.use(ipLimiter);

  registerApiRoutes(app, deps);
  return app;
}

