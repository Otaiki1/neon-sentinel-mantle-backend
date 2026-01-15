import { getAddress, isAddress, isHexString, keccak256, toUtf8Bytes } from "ethers";

export function normalizeAddress(value: string): string {
  if (!isAddress(value)) {
    throw new Error("Invalid wallet address");
  }
  return getAddress(value);
}

export function parseUint256(value: string | number | bigint): bigint {
  try {
    const parsed = typeof value === "bigint" ? value : BigInt(value);
    if (parsed < 0n || parsed > (1n << 256n) - 1n) {
      throw new Error("Value out of range");
    }
    return parsed;
  } catch {
    throw new Error("Invalid uint256");
  }
}

export function ensureBytes32(value: string): string {
  if (!isHexString(value, 32)) {
    throw new Error("Invalid bytes32");
  }
  return value;
}

export function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(",")}]`;
  }
  const keys = Object.keys(value as Record<string, unknown>).sort();
  const entries = keys.map((key) => {
    const val = (value as Record<string, unknown>)[key];
    return `${JSON.stringify(key)}:${stableStringify(val)}`;
  });
  return `{${entries.join(",")}}`;
}

export function computeRunHash(payload: unknown): string {
  const canonical = stableStringify(payload);
  return keccak256(toUtf8Bytes(canonical));
}

export function computeExtractionValue(payload: unknown): bigint {
  if (payload && typeof payload === "object") {
    const record = payload as Record<string, unknown>;
    const score = record.score;
    if (typeof score === "number" && Number.isFinite(score)) {
      return BigInt(Math.max(0, Math.floor(score)));
    }
    const extractionValue = record.extractionValue;
    if (typeof extractionValue === "number" && Number.isFinite(extractionValue)) {
      return BigInt(Math.max(0, Math.floor(extractionValue)));
    }
    const events = record.events;
    if (Array.isArray(events)) {
      const total = events.reduce((acc, event) => {
        if (event && typeof event === "object") {
          const val = (event as Record<string, unknown>).value;
          if (typeof val === "number" && Number.isFinite(val)) {
            return acc + Math.max(0, Math.floor(val));
          }
        }
        return acc;
      }, 0);
      return BigInt(total);
    }
  }
  return 0n;
}

