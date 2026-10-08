import type { CallContext } from "@/lib/binance/call-log";
import { binanceRequest } from "@/lib/binance/request";
import type { SignRequest } from "@/lib/binance/rwa";
import { WEB3_BASE_URL } from "@/lib/binance/sign";

/**
 * Market API de la web3 de Binance (`/build/api/v1/dex/market/...`), solo lo que usa la medición
 * de pools (`specs/medicion-pools.md`). Firmado como el resto (`X-OC-*`) y siempre por `binanceRequest`.
 */

const BSC_CHAIN_ID = "56";
const TRADES_LIMIT = 100;

/** Código de negocio de límite excedido en las APIs de Binance (además de HTTP 429). */
const RATE_LIMIT_CODES = new Set(["100004"]);

export type MarketDeps = {
  sign: SignRequest;
  /** Por defecto `https://web3.binance.com`. */
  baseUrl?: string;
  context?: CallContext;
};

export type MarketResult<T> =
  | { kind: "ok"; data: T }
  /** `retryAfterSec`: el header `retry-after`, si vino. */
  | { kind: "rate-limited"; retryAfterSec: number | null }
  | { kind: "error"; reason: string };

export type MarketTrade = {
  txHash: string;
  dexName: string;
  /** `buy` o `sell`, tal como lo da la API. */
  type: string;
  /** USD del fill. */
  volumeUsd: number;
  /** Cantidad del token medido en el fill. */
  tokenAmount: number;
  counterSymbol: string | null;
  counterAddress: string | null;
  /** ms desde epoch. */
  time: number;
};

export type MarketPoolToken = {
  symbol: string;
  address: string;
  amount: number | null;
};

export type MarketPool = {
  pool: string;
  protocolName: string | null;
  /** `null` en venues RFQ (Bebop, Native, xChange). */
  liquidityUsd: number | null;
  /** 20 bytes en pools comunes; 32 bytes en Uniswap V4 (id, no contrato). */
  poolAddress: string;
  tokens: MarketPoolToken[];
};

export type TradesPage = {
  trades: MarketTrade[];
  /** Para pedir la página siguiente (fills más viejos). `null` si no hay más. */
  cursor: string | null;
};

/**
 * `GET /api/v1/dex/market/trades`: 100 fills del token en BSC, del más nuevo al más viejo. Con
 * `cursor` (el de la página anterior) sigue hacia atrás sin repetir.
 */
export async function getTrades(
  tokenAddress: string,
  deps: MarketDeps,
  cursor?: string,
): Promise<MarketResult<TradesPage>> {
  const query: Record<string, string> = {
    binanceChainId: BSC_CHAIN_ID,
    tokenContractAddress: tokenAddress,
    limit: String(TRADES_LIMIT),
  };
  if (cursor) query.cursor = cursor;
  const result = await marketGet("/api/v1/dex/market/trades", query, deps);
  if (result.kind !== "ok") return result;
  const trades = parseTrades(result.data, tokenAddress);
  if (trades === null) return { kind: "error", reason: "formato de trades inesperado" };
  const next = isRecord(result.data) && typeof result.data.cursor === "string" && result.data.cursor ? result.data.cursor : null;
  return { kind: "ok", data: { trades, cursor: next } };
}

/** `GET /api/v1/dex/market/token/top-liquidity`: hasta 15 pools del token en BSC. */
export async function getTopLiquidity(
  tokenAddress: string,
  deps: MarketDeps,
): Promise<MarketResult<MarketPool[]>> {
  const result = await marketGet(
    "/api/v1/dex/market/token/top-liquidity",
    { binanceChainId: BSC_CHAIN_ID, tokenContractAddress: tokenAddress },
    deps,
  );
  if (result.kind !== "ok") return result;
  const pools = parseTopLiquidity(result.data);
  return pools === null ? { kind: "error", reason: "formato de top-liquidity inesperado" } : { kind: "ok", data: pools };
}

/**
 * `data` de `trades` (`{cursor, trades}`) a fills del token. El monto sale de `changedTokenInfo`
 * comparando el contrato sin mayúsculas. Se descartan fills sin el token, con monto ≤ 0 o con
 * números rotos. `null` si la forma no es la esperada.
 */
export function parseTrades(data: unknown, tokenAddress: string): MarketTrade[] | null {
  if (!isRecord(data) || !Array.isArray(data.trades)) return null;
  const token = tokenAddress.toLowerCase();
  const trades: MarketTrade[] = [];
  for (const raw of data.trades) {
    if (!isRecord(raw) || !Array.isArray(raw.changedTokenInfo)) continue;
    const legs = raw.changedTokenInfo.filter(isRecord);
    const own = legs.find((leg) => lower(leg.tokenContractAddress) === token);
    const counter = legs.find((leg) => lower(leg.tokenContractAddress) !== token);
    const tokenAmount = positiveNumber(own?.amount);
    const volumeUsd = positiveNumber(raw.volume);
    const time = Number(raw.time);
    if (tokenAmount === null || volumeUsd === null || !Number.isFinite(time)) continue;
    trades.push({
      txHash: String(raw.txHash ?? ""),
      dexName: String(raw.dexName ?? ""),
      type: String(raw.type ?? ""),
      volumeUsd,
      tokenAmount,
      counterSymbol: typeof counter?.tokenSymbol === "string" ? counter.tokenSymbol : null,
      counterAddress: typeof counter?.tokenContractAddress === "string" ? counter.tokenContractAddress : null,
      time,
    });
  }
  return trades;
}

/** Precio USD del fill: `volume / monto del token`. */
export function fillUsdPrice(trade: Pick<MarketTrade, "volumeUsd" | "tokenAmount">): number {
  return trade.volumeUsd / trade.tokenAmount;
}

/** `data` de `top-liquidity` (lista de pools). `null` si no es una lista. */
export function parseTopLiquidity(data: unknown): MarketPool[] | null {
  if (!Array.isArray(data)) return null;
  const pools: MarketPool[] = [];
  for (const raw of data) {
    if (!isRecord(raw) || typeof raw.poolAddress !== "string") continue;
    const tokens = Array.isArray(raw.liquidityAmount)
      ? raw.liquidityAmount.filter(isRecord).map((leg) => ({
          symbol: String(leg.tokenSymbol ?? ""),
          address: String(leg.tokenContractAddress ?? ""),
          amount: finiteNumber(leg.tokenAmount),
        }))
      : [];
    pools.push({
      pool: String(raw.pool ?? ""),
      protocolName: typeof raw.protocolName === "string" ? raw.protocolName : null,
      liquidityUsd: finiteNumber(raw.liquidityUsd),
      poolAddress: raw.poolAddress,
      tokens,
    });
  }
  return pools;
}

async function marketGet(
  path: string,
  query: Record<string, string>,
  deps: MarketDeps,
): Promise<MarketResult<unknown>> {
  const base = new URL(deps.baseUrl ?? WEB3_BASE_URL);
  const requestPath = `/build${path}?${new URLSearchParams(query).toString()}`;
  const headers = await deps.sign("GET", requestPath, "");

  let response: Response;
  try {
    response = await binanceRequest({
      api: "market",
      url: `${base.origin}${requestPath}`,
      params: query,
      headers,
      context: deps.context,
    });
  } catch (error) {
    return { kind: "error", reason: `red: ${error instanceof Error ? error.message : String(error)}` };
  }
  if (response.status === 429) return { kind: "rate-limited", retryAfterSec: retryAfter(response) };
  if (!response.ok) return { kind: "error", reason: `HTTP ${response.status}` };

  let body: unknown;
  try {
    body = await response.json();
  } catch {
    return { kind: "error", reason: "respuesta no es JSON" };
  }
  if (!isRecord(body)) return { kind: "error", reason: "respuesta sin forma" };
  const code = String(body.code);
  if (code === "0") return { kind: "ok", data: body.data };
  if (RATE_LIMIT_CODES.has(code)) return { kind: "rate-limited", retryAfterSec: retryAfter(response) };
  return { kind: "error", reason: `code ${code}: ${String(body.msg ?? body.message ?? "")}` };
}

function retryAfter(response: Response): number | null {
  const seconds = Number(response.headers.get("retry-after"));
  return Number.isFinite(seconds) && seconds > 0 ? seconds : null;
}

function positiveNumber(value: unknown): number | null {
  const parsed = finiteNumber(value);
  return parsed !== null && parsed > 0 ? parsed : null;
}

function finiteNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function lower(value: unknown): string | null {
  return typeof value === "string" ? value.toLowerCase() : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
