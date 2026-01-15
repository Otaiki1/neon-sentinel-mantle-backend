# Neon Sentinel Backend API

Base URL: `http://localhost:4000`

All endpoints accept and return JSON.

## Auth & Rate Limits

-   Public endpoints are rate-limited by IP and wallet.
-   If rate limited, you will receive `429` with `{ error: "rate_limited" }`.

## Environment Requirements

These must be configured on the backend:

-   `TRUSTED_SIGNER_PRIVATE_KEY`
-   `ECDSA_VERIFIER_ADDRESS`
-   `CHAIN_ID`
-   `RPC_URL`

Optional:

-   `NEON_IDENTITY_ADDRESS` (enables on-chain verification checks)
-   `USDT_ADDRESS`, `METH_ADDRESS`, `FAUCET_SIGNER_PRIVATE_KEY`
-   `CORS_ORIGINS` (comma-separated list of allowed frontend origins)

## Common Errors

-   `400` `{ error: "invalid_request" }`
-   `403` `{ error: "identity_not_verified" }`
-   `409` `{ error: "duplicate_run" | "already_verified" }`
-   `429` `{ error: "rate_limited" | "already_claimed" }`
-   `500` `{ error: "faucet_not_configured" }`

---

## Health Check

**GET** `/health`

**Response**

```
{ "ok": true }
```

---

## Sign Identity

**POST** `/sign-identity`

**Request**

```
{
  "wallet": "0xabc...",
  "commitment": "123456789"
}
```

**Response**

```
{ "signature": "0x..." }
```

**Notes**

-   EIP-712 domain: `ECDSAVerifier` / version `1`
-   Primary type: `IdentityRegistration(commitment,uint256 wallet,address)`

---

## Raw Game Run (Derive runHash)

**POST** `/game/run/raw`

**Request (example)**

```
{
  "wallet": "0xabc...",
  "sessionId": "session-1",
  "events": [{ "value": 3 }, { "value": 2 }],
  "score": 10
}
```

**Response**

```
{
  "runHash": "0x...",
  "extractionValue": "10"
}
```

**Notes**

-   `runHash` is a deterministic `keccak256` of a stable JSON representation.
-   `extractionValue` is derived from `score` or summed `events[].value` (fallback `0`).

---

## Sign Game Run

**POST** `/sign-game-run`

**Request (minimum)**

```
{
  "wallet": "0xabc...",
  "runHash": "0x...",
  "extractionValue": "100",
  "identityCommitment": "123"
}
```

**Request (with raw data validation)**

```
{
  "wallet": "0xabc...",
  "runHash": "0x...",
  "extractionValue": "100",
  "identityCommitment": "123",
  "raw": {
    "wallet": "0xabc...",
    "score": 100,
    "events": []
  }
}
```

**Response**

```
{
  "signature": "0x...",
  "approved": true,
  "runHash": "0x...",
  "extractionValue": "100",
  "identityCommitment": "123"
}
```

**Notes**

-   EIP-712 domain: `ECDSAVerifier` / version `1`
-   Primary type: `GameRunSubmission(runHash,extractionValue,identityCommitment,player)`
-   If `raw` is provided, the backend recomputes `runHash` and `extractionValue`.

---

## Faucet

**POST** `/faucet`

**Request**

```
{
  "wallet": "0xabc...",
  "token": "USDT"
}
```

**Response**

```
{
  "txHash": "0x...",
  "amount": "1000000000",
  "balance": "1000000000",
  "blockNumber": 123456
}
```

**Notes**

-   `token` defaults to `"USDT"`.
-   Requires `FAUCET_SIGNER_PRIVATE_KEY` + token address set.

---

## User Lookup

**GET** `/user/:wallet`

**Response**

```
{
  "wallet": "0xabc...",
  "commitment": "123",
  "verified": false,
  "lastVerificationRequestAt": "2025-01-01T00:00:00.000Z",
  "createdAt": "2025-01-01T00:00:00.000Z",
  "updatedAt": "2025-01-01T00:00:00.000Z"
}
```
