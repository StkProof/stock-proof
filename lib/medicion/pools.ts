import {
  fillUsdPrice,
  getTopLiquidity,
  getTrades,
  type MarketDeps,
  type MarketPool,
} from "@/lib/binance/market";
import type { PublicMarketStatus, PublicToken } from "@/lib/binance/rwa-public";
import { readPoolPrices, type PoolPrice } from "@/lib/chain/pool-price";
import type { RateGuard } from "@/lib/medicion/rate-guard";

/**
 * Una ronda de la medición de pools (`specs/medicion-pools.md`): por token, los últimos fills y,
 * si toca, los pools con su precio on-chain. Solo datos crudos; el análisis es otra tarea.
 */

export const ROUND_INTERVAL_MS = 5 * 60_000;
/** Pools una vez por hora: cada 12 rondas de 5 minutos. */
export const POOLS_EVERY_ROUNDS = 12;
export const DEFAULT_TICKERS = ["QQQ", "SPY", "NVDA", "SPCX"];
/** Tope de páginas de `trades` por token y ronda (1.000 fills). */
export const MAX_TRADE_PAGES = 10;

export type MeasuredToken = Pick<PublicToken, "ticker" | "wrapper" | "symbol" | "contractAddress">;

export type FillLine = {
  txHash: string;
  dexName: string;
  type: string;
  volumeUsd: number;
  tokenAmount: number;
  priceUsd: number;
  counterSymbol: string | null;
  counterAddress: string | null;
  time: number;
};

export type PoolLine = {
  pool: string;
  protocolName: string | null;
  liquidityUsd: number | null;
  poolAddress: string;
  tokens: MarketPool["tokens"];
  /** `null`: no se lee (RFQ sin liquidez o id de Uniswap V4). */
  price: number | "unavailable" | null;
  priceSource: "v3" | "v2" | null;
  quoteAddress: string | null;
};

export type RoundLine = {
  at: string;
  round: number;
  marketStatus: PublicMarketStatus | "unavailable";
  ticker: string;
  wrapper: string;
  symbol: string;
  token: string;
  /** `null` si no se pudo leer ni una página. */
  trades: FillLine[] | null;
  tradesError?: string;
  /** Páginas de 100 leídas en la ronda. */
  tradePages?: number;
  /** Se llegó al tope de páginas sin alcanzar los fills de la ronda anterior: hay un hueco. */
  tradesTruncated?: boolean;
  /** Solo en las rondas con pools. */
  pools?: PoolLine[] | null;
  poolsError?: string;
};

export type RoundDeps = {
  guard: RateGuard;
  market: MarketDeps;
  rpcUrl: string;
  now: () => number;
  marketStatus: () => Promise<PublicMarketStatus | "unavailable">;
  /** Hora (ms) del fill más nuevo visto por token, en minúsculas. `measureRound` la actualiza. */
  lastSeenAt: Map<string, number>;
};

/** Filtra la lista pública por tickers (sin mayúsculas). */
export function selectTokens(tokens: PublicToken[], tickers: string[]): MeasuredToken[] {
  const wanted = new Set(tickers.map((ticker) => ticker.toUpperCase()));
  return tokens
    .filter((token) => wanted.has(token.ticker.toUpperCase()))
    .map(({ ticker, wrapper, symbol, contractAddress }) => ({ ticker, wrapper, symbol, contractAddress }));
}

/** Pools que tienen contrato de 20 bytes y liquidez publicada: los únicos que se leen por RPC. */
export function isReadablePool(pool: MarketPool): boolean {
  return /^0x[0-9a-fA-F]{40}$/.test(pool.poolAddress) && pool.liquidityUsd !== null;
}

/**
 * Corre una ronda. Un error de un token queda en su línea y la ronda sigue; solo
 * `RateLimitExceeded` (del guard) corta todo.
 */
export async function measureRound(
  tokens: MeasuredToken[],
  round: number,
  deps: RoundDeps,
): Promise<RoundLine[]> {
  const roundStart = deps.now();
  const marketStatus = await deps.marketStatus();
  const withPools = round % POOLS_EVERY_ROUNDS === 0;
  const lines: RoundLine[] = [];

  for (const token of tokens) {
    const line: RoundLine = {
      at: new Date(deps.now()).toISOString(),
      round,
      marketStatus,
      ticker: token.ticker,
      wrapper: token.wrapper,
      symbol: token.symbol,
      token: token.contractAddress,
      trades: null,
    };

    Object.assign(line, await fetchFills(token.contractAddress, roundStart, deps));

    if (withPools) {
      line.pools = null;
      const pools = await deps.guard.run(() => getTopLiquidity(token.contractAddress, deps.market));
      if (pools.kind === "ok") {
        line.pools = await priceThePools(pools.data, token.contractAddress, deps.rpcUrl);
      } else {
        line.poolsError = pools.kind === "rate-limited" ? "rate-limited" : pools.reason;
      }
    }
    lines.push(line);
  }
  return lines;
}

/**
 * Pagina `trades` hacia atrás hasta el fill más nuevo que ya se vio de este token (en la primera
 * ronda, 5 minutos antes de `roundStart`), o hasta `MAX_TRADE_PAGES`. Los fills del borde pueden
 * repetirse entre rondas: el análisis deduplica. Un error a mitad de camino deja lo ya leído.
 */
async function fetchFills(
  tokenAddress: string,
  roundStart: number,
  deps: RoundDeps,
): Promise<Pick<RoundLine, "trades" | "tradesError" | "tradePages" | "tradesTruncated">> {
  const key = tokenAddress.toLowerCase();
  const target = deps.lastSeenAt.get(key) ?? roundStart - ROUND_INTERVAL_MS;
  const fills: FillLine[] = [];
  let cursor: string | undefined;
  let pages = 0;
  let reachedTarget = false;
  let error: string | undefined;

  while (pages < MAX_TRADE_PAGES) {
    const page = await deps.guard.run(() => getTrades(tokenAddress, deps.market, cursor));
    if (page.kind !== "ok") {
      error = page.kind === "rate-limited" ? "rate-limited" : page.reason;
      break;
    }
    pages += 1;
    fills.push(...page.data.trades.map((trade) => ({ ...trade, priceUsd: fillUsdPrice(trade) })));
    const oldest = Math.min(...page.data.trades.map((trade) => trade.time));
    if (page.data.trades.length === 0 || page.data.cursor === null || oldest <= target) {
      reachedTarget = true;
      break;
    }
    cursor = page.data.cursor;
  }

  if (fills.length > 0) {
    deps.lastSeenAt.set(key, Math.max(deps.lastSeenAt.get(key) ?? 0, ...fills.map((fill) => fill.time)));
  }
  return {
    trades: pages === 0 ? null : fills,
    tradePages: pages,
    tradesTruncated: error === undefined && !reachedTarget,
    ...(error === undefined ? {} : { tradesError: error }),
  };
}

async function priceThePools(pools: MarketPool[], tokenAddress: string, rpcUrl: string): Promise<PoolLine[]> {
  const readable = pools.filter(isReadablePool);
  const prices = await readPoolPrices(
    readable.map((pool) => ({ poolAddress: pool.poolAddress, tokenAddress })),
    rpcUrl,
  );
  return pools.map((pool) => {
    const read: PoolPrice | null = isReadablePool(pool)
      ? (prices.get(pool.poolAddress.toLowerCase()) ?? "unavailable")
      : null;
    return {
      ...pool,
      price: read === null ? null : read === "unavailable" ? "unavailable" : read.price,
      priceSource: read === null || read === "unavailable" ? null : read.kind,
      quoteAddress: read === null || read === "unavailable" ? null : read.quoteAddress,
    };
  });
}
