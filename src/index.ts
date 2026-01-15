import express from "express";
import helmet from "helmet";
import morgan from "morgan";
import rateLimit from "express-rate-limit";
import { ethers } from "ethers";
import { config } from "./config.js";
import { initDb } from "./db.js";
import { registerApiRoutes } from "./routes/api.js";
import { logger } from "./logger.js";

const app = express();

app.use(helmet());
app.use(express.json({ limit: "1mb" }));
app.use(morgan("combined"));

const ipLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 60,
  standardHeaders: true,
  legacyHeaders: false
});
app.use(ipLimiter);

const provider = new ethers.JsonRpcProvider(config.rpcUrl);
const trustedSigner = new ethers.Wallet(config.trustedSignerPrivateKey, provider);
const faucetSigner = config.faucetSignerPrivateKey
  ? new ethers.Wallet(config.faucetSignerPrivateKey, provider)
  : undefined;

const db = initDb(config.databasePath);

registerApiRoutes(app, {
  db,
  provider,
  trustedSigner,
  faucetSigner,
  chainId: config.chainId,
  ecdsaVerifierAddress: config.ecdsaVerifierAddress,
  neonIdentityAddress: config.neonIdentityAddress,
  signIdentityLimit: config.signIdentityLimit,
  signIdentityWindowMs: config.signIdentityWindowMs,
  signGameLimit: config.signGameLimit,
  signGameWindowMs: config.signGameWindowMs,
  faucetWindowMs: config.faucetWindowMs,
  faucetUsdtAmount: config.faucetUsdtAmount,
  faucetMethAmount: config.faucetMethAmount,
  usdtAddress: config.usdtAddress,
  methAddress: config.methAddress
});

app.listen(config.port, () => {
  logger.info({ port: config.port }, "Neon Sentinel backend listening");
});

