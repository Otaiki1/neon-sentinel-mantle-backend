import { ethers } from "ethers";
import { createApp } from "./app.js";
import { config } from "./config.js";
import { initDb } from "./db.js";
import { logger } from "./logger.js";

const provider = new ethers.JsonRpcProvider(config.rpcUrl);
const trustedSigner = new ethers.Wallet(
    config.trustedSignerPrivateKey,
    provider
);
const faucetSigner = config.faucetSignerPrivateKey
    ? new ethers.Wallet(config.faucetSignerPrivateKey, provider)
    : undefined;

const db = initDb(config.databasePath);

const app = createApp(
    {
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
        methAddress: config.methAddress,
    },
    {
        corsOrigins: config.corsOrigins,
    }
);

app.listen(config.port, () => {
    logger.info({ port: config.port }, "Neon Sentinel backend listening");
});
