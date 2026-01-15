import dotenv from "dotenv";
import { z } from "zod";

dotenv.config();

const envSchema = z.object({
  PORT: z.coerce.number().int().positive().optional(),
  RPC_URL: z.string().min(1),
  CHAIN_ID: z.coerce.bigint(),
  TRUSTED_SIGNER_PRIVATE_KEY: z.string().min(1),
  ECDSA_VERIFIER_ADDRESS: z.string().min(1),
  NEON_IDENTITY_ADDRESS: z.string().min(1).optional(),
  HUB_ADDRESS: z.string().min(1).optional(),
  USDT_ADDRESS: z.string().min(1).optional(),
  METH_ADDRESS: z.string().min(1).optional(),
  FAUCET_SIGNER_PRIVATE_KEY: z.string().min(1).optional(),
  DATABASE_PATH: z.string().min(1).optional(),
  SIGN_IDENTITY_LIMIT: z.coerce.number().int().positive().optional(),
  SIGN_IDENTITY_WINDOW_MS: z.coerce.number().int().positive().optional(),
  SIGN_GAME_LIMIT: z.coerce.number().int().positive().optional(),
  SIGN_GAME_WINDOW_MS: z.coerce.number().int().positive().optional(),
  FAUCET_WINDOW_MS: z.coerce.number().int().positive().optional(),
  FAUCET_USDT_AMOUNT: z.coerce.number().positive().optional(),
  FAUCET_METH_AMOUNT: z.coerce.number().positive().optional()
});

const env = envSchema.parse(process.env);

export const config = {
  port: env.PORT ?? 4000,
  rpcUrl: env.RPC_URL,
  chainId: env.CHAIN_ID,
  trustedSignerPrivateKey: env.TRUSTED_SIGNER_PRIVATE_KEY,
  ecdsaVerifierAddress: env.ECDSA_VERIFIER_ADDRESS,
  neonIdentityAddress: env.NEON_IDENTITY_ADDRESS,
  hubAddress: env.HUB_ADDRESS,
  usdtAddress: env.USDT_ADDRESS,
  methAddress: env.METH_ADDRESS,
  faucetSignerPrivateKey: env.FAUCET_SIGNER_PRIVATE_KEY,
  databasePath: env.DATABASE_PATH ?? "./data/neon.db",
  signIdentityLimit: env.SIGN_IDENTITY_LIMIT ?? 3,
  signIdentityWindowMs: env.SIGN_IDENTITY_WINDOW_MS ?? 60 * 60 * 1000,
  signGameLimit: env.SIGN_GAME_LIMIT ?? 10,
  signGameWindowMs: env.SIGN_GAME_WINDOW_MS ?? 10 * 60 * 1000,
  faucetWindowMs: env.FAUCET_WINDOW_MS ?? 24 * 60 * 60 * 1000,
  faucetUsdtAmount: env.FAUCET_USDT_AMOUNT ?? 1000,
  faucetMethAmount: env.FAUCET_METH_AMOUNT ?? 0.1
};

