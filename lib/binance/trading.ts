import type { CallContext } from "@/lib/binance/call-log";
import { binanceRequest } from "@/lib/binance/request";
import type { SignRequest } from "@/lib/binance/rwa";
import type { Side, WrapperId } from "@/lib/evaluate";

/**
 * `GET /api/v1/dex/aggregator/quote` de la Trading API firmada (`/build`, X-OC-*).
 * `data` es una lista de cotizaciones por vendor; cada una trae `priceImpactPercent`.
 * Verificado contra el SDK oficial (`binance_sdk_web3_wallet`, 28 sep 2026).
 */
export const TRADING_BASE_URL = "https://web3.binance.com";
export const QUOTE_PATH = "/api/v1/dex/aggregator/quote";

/** USDT BEP-20 en BSC mainnet: la moneda con la que la demo paga y cobra. */
export const USDT_BSC = "0x55d398326f99059fF775485246999027B3197955";
/** Decimales de USDT en BSC: los montos de la Trading API van en unidades mínimas (wei). */
export const USDT_BSC_DECIMALS = 18;

/**
 * Convierte `amount` (unidades del token) a unidades mínimas como cadena de enteros, con
 * aritmética exacta: lo que excede `decimals` se trunca, nunca se redondea ni pasa por float.
 * `200` con 18 → `"200000000000000000000"`; `5.5` → `"5500000000000000000"`.
 */
export function toMinimalUnits(amount: number, decimals: number): string {
  const [whole, fraction = ""] = expandExponential(amount.toString()).split(".");
  const digits = (fraction + "0".repeat(decimals)).slice(0, decimals);
  return BigInt(whole + digits).toString();
}

/** Pasa `1.9e-19` a `"0.00000000000000000019"`: `toString` puede devolver notación exponencial. */
function expandExponential(text: string): string {
  const match = /^(-?)(\d+)(?:\.(\d+))?[eE]([+-]?\d+)$/.exec(text);
  if (match === null) return text;
  const [, sign, whole, fraction = "", exponent] = match;
  const digits = whole + fraction;
  const point = whole.length + Number(exponent);
  if (point <= 0) return `${sign}0.${"0".repeat(-point)}${digits}`;
  if (point >= digits.length) return sign + digits + "0".repeat(point - digits.length);
  return `${sign}${digits.slice(0, point)}.${digits.slice(point)}`;
}

export type AggregatedQuote = {
  /** Proporción de impacto del precio (`priceImpactPercent` / 100). */
  impactRatio: number;
  /** Monto del token de salida (en unidades del token, no USD). */
  toAmount: number;
  vendor: string;
  quoteId: string | null;
};

export type TradingDeps = {
  sign: SignRequest;
  baseUrl?: string;
  context?: CallContext;
};

/**
 * Cotiza `amount` de `from` a `to` en la chain 56. Devuelve la mejor cotización por impacto,
 * o `"unavailable"` ante cualquier fallo de red, HTTP, `code` o formato.
 */
export async function getAggregatedQuote(
  args: {
    fromTokenAddress: string;
    toTokenAddress: string;
    /** En unidades mínimas del `from` token (wei: USDT en BSC tiene 18 decimales). */
    amount: string;
    /** Address EVM en BSC de la wallet que ejecutaría el swap: los venues RFQ la exigen. */
    walletAddress?: string;
    binanceChainId?: string;
    /** Contexto del registro: para qué es la cotización. */
    purpose?: string;
    side?: Side;
    wrapper?: WrapperId;
  },
  deps: TradingDeps,
): Promise<AggregatedQuote | "unavailable"> {
  const query: Record<string, string> = {
    binanceChainId: args.binanceChainId ?? "56",
    amount: args.amount,
    fromTokenAddress: args.fromTokenAddress,
    toTokenAddress: args.toTokenAddress,
  };
  const wallet = args.walletAddress?.trim();
  if (wallet) query.userWalletAddress = wallet;
  const queryString = Object.entries(query)
    .map(([name, value]) => `${encodeURIComponent(name)}=${encodeURIComponent(value)}`)
    .join("&");
  const requestPath = `/build${QUOTE_PATH}?${queryString}`;

  const base = new URL(deps.baseUrl ?? TRADING_BASE_URL);
  const headers = await deps.sign("GET", requestPath, "");

  let response: Response;
  try {
    response = await binanceRequest({
      api: "trading",
      url: `${base.origin}${requestPath}`,
      params: query,
      headers,
      context: {
        ...deps.context,
        purpose: args.purpose ?? deps.context?.purpose,
        side: args.side,
        wrapper: args.wrapper,
      },
    });
  } catch {
    return "unavailable";
  }
  if (!response.ok) return "unavailable";

  let body: unknown;
  try {
    body = await response.json();
  } catch {
    return "unavailable";
  }
  if (!isRecord(body) || (body.code !== 0 && body.code !== "0")) return "unavailable";
  if (!Array.isArray(body.data)) return "unavailable";

  let best: AggregatedQuote | null = null;
  for (const item of body.data) {
    if (!isRecord(item)) continue;
    const impact = typeof item.priceImpactPercent === "string" || typeof item.priceImpactPercent === "number"
      ? Number(item.priceImpactPercent)
      : NaN;
    const toAmount =
      typeof item.toTokenAmount === "string" || typeof item.toTokenAmount === "number"
        ? Number(item.toTokenAmount)
        : NaN;
    if (!Number.isFinite(impact) || !Number.isFinite(toAmount)) continue;
    const quote: AggregatedQuote = {
      impactRatio: impact / 100,
      toAmount,
      vendor: typeof item.vendorName === "string" ? item.vendorName : "desconocido",
      quoteId: typeof item.quoteId === "string" ? item.quoteId : null,
    };
    if (best === null || Math.abs(quote.impactRatio) < Math.abs(best.impactRatio)) best = quote;
  }
  return best ?? "unavailable";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
