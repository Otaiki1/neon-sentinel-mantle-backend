# Neon Sentinel Backend

Minimal backend services for the ECDSA-based Neon Sentinel deployment.

## Setup

Install dependencies:

```
pnpm install
```

Run in dev:

```
pnpm dev
```

## Environment Variables

Required:

-   `RPC_URL`
-   `CHAIN_ID`
-   `TRUSTED_SIGNER_PRIVATE_KEY`
-   `ECDSA_VERIFIER_ADDRESS`

Optional (feature-gated):

-   `NEON_IDENTITY_ADDRESS` (enables on-chain verified checks)
-   `USDT_ADDRESS`
-   `METH_ADDRESS`
-   `FAUCET_SIGNER_PRIVATE_KEY`
-   `DATABASE_PATH` (default `./data/neon.db`)
-   `PORT` (default `4000`)
-   `SIGN_IDENTITY_LIMIT`, `SIGN_IDENTITY_WINDOW_MS`
-   `SIGN_GAME_LIMIT`, `SIGN_GAME_WINDOW_MS`
-   `FAUCET_WINDOW_MS`
-   `FAUCET_USDT_AMOUNT`, `FAUCET_METH_AMOUNT`

## API Documentation

See `API_DOCS.md` for endpoint details, request/response shapes, and error codes.
