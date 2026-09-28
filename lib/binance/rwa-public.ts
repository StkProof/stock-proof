import type { CallContext } from "@/lib/binance/call-log";
import { binanceRequest } from "@/lib/binance/request";
import type { RwaSearchResult, UnderlyingProfile } from "@/lib/binance/rwa";
import { supportsInterface } from "@/lib/chain/supports-interface";
import type { WrapperId } from "@/lib/evaluate";
import type { Q1Sources } from "@/lib/questions/q1";

/**
 * Los endpoints públicos de la web de Binance (`/bapi/defi/...`), sin credenciales. Cubren la
 * lista oficial de stock tokens, la metadata con attestation, el precio del token y del
 * subyacente, y el estado de mercado. Verificados contra producción el 28 sep 2026.
 *
 * Toda llamada pasa por `binanceRequest` (una sola puerta, registro incluido) y el host ya es
 * `*.binance.com`. Un fallo de red, HTTP, `code` distinto de `"000000"` o un formato raro es
 * `"unavailable"`: se declara sin dato en vez de inventarlo.
 */
export const PUBLIC_BASE_URL = "https://www.binance.com";

const LIST_PATH = "/bapi/defi/v1/public/wallet-direct/buw/wallet/market/token/rwa/stock/detail/list/ai";
const META_PATH = "/bapi/defi/v1/public/wallet-direct/buw/wallet/market/token/rwa/meta/ai";
const DYNAMIC_PATH = "/bapi/defi/v2/public/wallet-direct/buw/wallet/market/token/rwa/dynamic/ai";
const STATUS_PATH = "/bapi/defi/v1/public/wallet-direct/buw/wallet/market/token/rwa/market/status/ai";

export const BSC_CHAIN_ID = "56";

/** `type` de la lista pública → emisor. Otros tipos no son acciones tokenizadas de los tres. */
export const WRAPPER_OF_TYPE: Record<number, WrapperId> = {
  1: "ondo",
  2: "xstocks",
  3: "bstocks",
};

export type PublicToken = {
  chainId: string;
  contractAddress: string;
  symbol: string;
  ticker: string;
  wrapper: WrapperId;
  multiplier: number | "unavailable";
  /** Par spot de Binance, si el token lo tiene (bStocks). */
  spotPair: string | null;
};

export type PublicDynamic = {
  /** Precio del token en USD, en la ruta on-chain. */
  tokenPriceUsd: number | "unavailable";
  /** Fracción de acción por token (bStocks/Ondo traen multiplicador; xStocks suele ser 1). */
  sharesMultiplier: number | "unavailable";
  /** Precio publicado del subyacente en USD; `null` fuera de rueda. */
  stockPriceUsd: number | null | "unavailable";
  openState: boolean | "unavailable";
};

export type PublicMarketStatus = {
  marketStatus: "open" | "closed" | "unavailable";
  nextOpenAt: string | "unavailable";
  nextCloseAt: string | "unavailable";
};

export type PublicDeps = {
  baseUrl?: string;
  context?: CallContext;
};

const UNAVAILABLE = Symbol("unavailable");

/** Lista oficial pública de stock tokens. Solo `chainId "56"` (BSC mainnet, regla del brief). */
export async function listStockTokens(
  deps: PublicDeps = {},
): Promise<PublicToken[] | "unavailable"> {
  const data = await publicGet(LIST_PATH, {}, deps);
  if (data === UNAVAILABLE || !Array.isArray(data)) return "unavailable";

  const tokens: PublicToken[] = [];
  for (const item of data) {
    if (!isRecord(item)) return "unavailable";
    const wrapper = typeof item.type === "number" ? WRAPPER_OF_TYPE[item.type] : undefined;
    if (
      wrapper === undefined ||
      typeof item.chainId !== "string" ||
      item.chainId !== BSC_CHAIN_ID ||
      typeof item.contractAddress !== "string" ||
      typeof item.symbol !== "string" ||
      typeof item.ticker !== "string"
    ) {
      continue;
    }
    const multiplier = typeof item.multiplier === "string" ? Number(item.multiplier) : NaN;
    tokens.push({
      chainId: item.chainId,
      contractAddress: item.contractAddress,
      symbol: item.symbol,
      ticker: item.ticker,
      wrapper,
      multiplier: Number.isFinite(multiplier) ? multiplier : "unavailable",
      spotPair: typeof item.cs === "string" ? item.cs : null,
    });
  }
  return tokens;
}

/** Metadata pública del token: las URLs de attestation son el `UnderlyingProfile` de la pregunta 1. */
export async function getTokenMeta(
  contractAddress: string,
  deps: PublicDeps = {},
): Promise<UnderlyingProfile | "unavailable"> {
  const data = await publicGet(
    META_PATH,
    { chainId: BSC_CHAIN_ID, contractAddress },
    deps,
  );
  if (data === UNAVAILABLE || !isRecord(data)) return "unavailable";

  const attestations = ["dailyAttestationReports", "monthlyAttestationReports"].flatMap(
    (name) => {
      const url = data[name];
      return typeof url === "string" && url.length > 0 ? [{ name, supported: true, url }] : [];
    },
  );
  return { attestations };
}

/** Precio y estado del token + subyacente (`dynamic/ai`). Campos faltantes = "unavailable". */
export async function getTokenDynamic(
  contractAddress: string,
  deps: PublicDeps = {},
): Promise<PublicDynamic | "unavailable"> {
  const data = await publicGet(
    DYNAMIC_PATH,
    { chainId: BSC_CHAIN_ID, contractAddress },
    deps,
  );
  if (data === UNAVAILABLE || !isRecord(data)) return "unavailable";

  const tokenInfo = isRecord(data.tokenInfo) ? data.tokenInfo : {};
  const stockInfo = isRecord(data.stockInfo) ? data.stockInfo : {};
  const statusInfo = isRecord(data.statusInfo) ? data.statusInfo : {};

  const tokenPrice = typeof tokenInfo.price === "string" ? Number(tokenInfo.price) : NaN;
  const multiplier =
    typeof tokenInfo.sharesMultiplier === "string" ? Number(tokenInfo.sharesMultiplier) : NaN;

  return {
    tokenPriceUsd: Number.isFinite(tokenPrice) && tokenPrice > 0 ? tokenPrice : "unavailable",
    sharesMultiplier:
      Number.isFinite(multiplier) && multiplier > 0 ? multiplier : "unavailable",
    stockPriceUsd:
      typeof stockInfo.price === "string" && Number.isFinite(Number(stockInfo.price))
        ? Number(stockInfo.price)
        : stockInfo.price === null || stockInfo.price === undefined
          ? null
          : "unavailable",
    openState: typeof statusInfo.openState === "boolean" ? statusInfo.openState : "unavailable",
  };
}

/** Estado global del mercado de acciones (`market/status/ai`): abierto/cerrado y próxima apertura. */
export async function getMarketStatus(
  deps: PublicDeps = {},
): Promise<PublicMarketStatus | "unavailable"> {
  const data = await publicGet(STATUS_PATH, {}, deps);
  if (data === UNAVAILABLE || !isRecord(data)) return "unavailable";

  const openState = typeof data.openState === "boolean" ? data.openState : null;
  return {
    marketStatus:
      openState === null ? "unavailable" : openState ? "open" : "closed",
    nextOpenAt: typeof data.nextOpen === "string" ? data.nextOpen : "unavailable",
    nextCloseAt: typeof data.nextClose === "string" ? data.nextClose : "unavailable",
  };
}

/**
 * Las fuentes de la pregunta 1 en modo público: lista de `detail/list/ai`, attestation de
 * `meta/ai` y el mismo `supportsInterface` del nodo. La decisión sigue siendo `decideAuthenticity`.
 */
export function publicQ1Sources(
  deps: PublicDeps & { rpcUrl?: string } = {},
): Q1Sources {
  return {
    search: async (keyword) => searchInPublicList(keyword, deps),
    profile: (_chainId, address) => getTokenMeta(address, deps),
    standard: (address, interfaceId) => supportsInterface(address, interfaceId, deps.rpcUrl),
  };
}

/**
 * Emula `searchRwa`: agrupa por ticker los tokens de la lista cuyo ticker o símbolo coincide con
 * el keyword. `platformId` toma los valores que `checkListing` espera (bstock/ondo/xstocks).
 */
async function searchInPublicList(
  keyword: string,
  deps: PublicDeps,
): Promise<RwaSearchResult[] | "unavailable"> {
  const tokens = await listStockTokens(deps);
  if (tokens === "unavailable") return "unavailable";

  const wanted = keyword.trim().toLowerCase();
  const matched = tokens.filter(
    (token) =>
      token.ticker.toLowerCase() === wanted || token.symbol.toLowerCase() === wanted,
  );

  const byTicker = new Map<string, RwaSearchResult>();
  for (const token of matched) {
    const result = byTicker.get(token.ticker) ?? { ticker: token.ticker, assets: [] };
    result.assets.push({
      platformId: token.wrapper === "bstocks" ? "bstock" : token.wrapper,
      binanceChainId: token.chainId,
      tokenContractAddress: token.contractAddress,
      tokenSymbol: token.symbol,
    });
    byTicker.set(token.ticker, result);
  }
  return [...byTicker.values()];
}

async function publicGet(
  path: string,
  query: Record<string, string>,
  deps: PublicDeps,
): Promise<unknown> {
  const base = new URL(deps.baseUrl ?? PUBLIC_BASE_URL);
  const queryString = Object.entries(query)
    .map(([name, value]) => `${encodeURIComponent(name)}=${encodeURIComponent(value)}`)
    .join("&");
  const url = `${base.origin}${path}${queryString ? `?${queryString}` : ""}`;

  let response: Response;
  try {
    response = await binanceRequest({
      api: "rwa",
      url,
      params: query,
      context: deps.context,
    });
  } catch {
    return UNAVAILABLE;
  }
  if (!response.ok) return UNAVAILABLE;

  let body: unknown;
  try {
    body = await response.json();
  } catch {
    return UNAVAILABLE;
  }
  if (!isRecord(body) || body.code !== "000000" || body.success !== true) {
    return UNAVAILABLE;
  }
  return body.data;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
