import type { MarketResult } from "@/lib/binance/market";

/**
 * Ritmo y límite de las llamadas firmadas de la medición (`specs/medicion-pools.md`).
 * La key permite 5 de peso por segundo (`x-oc-ratelimit-limit`); con 500 ms de separación
 * quedan como máximo 2 por segundo. Ante un límite se espera `retry-after` y se reintenta una vez.
 */

export const MIN_GAP_MS = 500;
export const DEFAULT_RETRY_MS = 60_000;
export const MAX_CONSECUTIVE_LIMITS = 3;

export class RateLimitExceeded extends Error {
  constructor(count: number) {
    super(`${count} respuestas de límite seguidas: la medición se corta para no arriesgar un baneo de IP`);
    this.name = "RateLimitExceeded";
  }
}

export type RateGuardDeps = {
  now: () => number;
  sleep: (ms: number) => Promise<void>;
};

export type RateGuard = {
  /** Corre la llamada respetando el ritmo. Lanza `RateLimitExceeded` al tercer límite seguido. */
  run<T>(call: () => Promise<MarketResult<T>>): Promise<MarketResult<T>>;
};

export function createRateGuard({ now, sleep }: RateGuardDeps): RateGuard {
  let lastCallAt: number | null = null;
  let consecutiveLimits = 0;

  async function attempt<T>(call: () => Promise<MarketResult<T>>): Promise<MarketResult<T>> {
    if (lastCallAt !== null) {
      const wait = lastCallAt + MIN_GAP_MS - now();
      if (wait > 0) await sleep(wait);
    }
    lastCallAt = now();
    const result = await call();
    if (result.kind === "rate-limited") {
      consecutiveLimits += 1;
      if (consecutiveLimits >= MAX_CONSECUTIVE_LIMITS) throw new RateLimitExceeded(consecutiveLimits);
    } else {
      consecutiveLimits = 0;
    }
    return result;
  }

  return {
    async run(call) {
      const first = await attempt(call);
      if (first.kind !== "rate-limited") return first;
      await sleep(first.retryAfterSec === null ? DEFAULT_RETRY_MS : first.retryAfterSec * 1000);
      return attempt(call);
    },
  };
}
