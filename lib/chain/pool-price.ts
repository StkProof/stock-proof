/**
 * Precio actual de un pool en BSC leído on-chain (`specs/medicion-pools.md`). Primero `slot0()`
 * (V3); si revierte o viene vacío, `getReserves()` (V2). No es Binance: no pasa por
 * `binanceRequest` ni se anota. El precio queda en unidades del token contraparte (USDT, WBNB…).
 */

const SELECTOR = {
  slot0: "0x3850c7bd",
  getReserves: "0x0902f1ac",
  token0: "0x0dfe1681",
  token1: "0xd21220a7",
  decimals: "0x313ce567",
} as const;

const TIMEOUT_MS = 10_000;
/** El nodo público de BSC rechaza el batch entero con 40 `eth_call` (medido el 7 oct 2026); con 30 responde. */
const MAX_BATCH = 20;
const Q96 = 2 ** 96;
const WORD = 64;

export type PoolPriceRequest = {
  poolAddress: string;
  tokenAddress: string;
};

export type PoolPrice =
  | {
      kind: "v3" | "v2";
      /** Contraparte por unidad del token medido. */
      price: number;
      quoteAddress: string;
    }
  | "unavailable";

/**
 * `sqrtPriceX96` de `slot0()` a precio del token en la contraparte. `(sqrt / 2^96)^2` es
 * token1/token0 en unidades mínimas; se ajusta por decimales y se invierte si el token es token1.
 */
export function priceFromSqrtPriceX96(
  sqrtPriceX96: bigint,
  tokenIsToken0: boolean,
  tokenDecimals: number,
  quoteDecimals: number,
): number {
  const ratio = Number(sqrtPriceX96) / Q96;
  const raw = ratio * ratio;
  const perToken = tokenIsToken0 ? raw : 1 / raw;
  return perToken * 10 ** (tokenDecimals - quoteDecimals);
}

/** Reservas de `getReserves()` a precio del token en la contraparte. */
export function priceFromReserves(
  reserve0: bigint,
  reserve1: bigint,
  tokenIsToken0: boolean,
  tokenDecimals: number,
  quoteDecimals: number,
): number {
  const [tokenReserve, quoteReserve] = tokenIsToken0 ? [reserve0, reserve1] : [reserve1, reserve0];
  return Number(quoteReserve) / 10 ** quoteDecimals / (Number(tokenReserve) / 10 ** tokenDecimals);
}

/**
 * Lee el precio de varios pools en dos batches JSON-RPC: pools (`slot0`, `getReserves`, `token0`,
 * `token1`) y después `decimals()` de cada token. Clave del resultado: `poolAddress` en minúsculas.
 * Un pool sin ninguna lectura válida queda `"unavailable"`; si falla la red, todos.
 */
export async function readPoolPrices(
  requests: PoolPriceRequest[],
  rpcUrl: string,
): Promise<Map<string, PoolPrice>> {
  const prices = new Map<string, PoolPrice>();
  if (requests.length === 0) return prices;

  const poolCalls = requests.flatMap((request) =>
    [SELECTOR.slot0, SELECTOR.getReserves, SELECTOR.token0, SELECTOR.token1].map((data) => ({
      to: request.poolAddress,
      data,
    })),
  );
  const poolResults = await rpcBatch(poolCalls, rpcUrl);

  const reads = requests.map((request, index) => {
    const [slot0, reserves, token0, token1] = poolResults.slice(index * 4, index * 4 + 4);
    return {
      request,
      sqrtPriceX96: firstWord(slot0),
      reserves: twoWords(reserves),
      token0: addressFrom(token0),
      token1: addressFrom(token1),
    };
  });

  const tokens = [...new Set(reads.flatMap((read) => [read.token0, read.token1]).filter(isString))];
  const decimalResults = await rpcBatch(
    tokens.map((to) => ({ to, data: SELECTOR.decimals })),
    rpcUrl,
  );
  const decimals = new Map<string, number>();
  tokens.forEach((token, index) => {
    const value = firstWord(decimalResults[index]);
    if (value !== null && value <= 255n) decimals.set(token, Number(value));
  });

  for (const read of reads) {
    prices.set(read.request.poolAddress.toLowerCase(), priceOf(read, decimals));
  }
  return prices;
}

type PoolRead = {
  request: PoolPriceRequest;
  sqrtPriceX96: bigint | null;
  reserves: [bigint, bigint] | null;
  token0: string | null;
  token1: string | null;
};

function priceOf(read: PoolRead, decimals: Map<string, number>): PoolPrice {
  const token = read.request.tokenAddress.toLowerCase();
  if (read.token0 === null || read.token1 === null) return "unavailable";
  const tokenIsToken0 = read.token0 === token;
  if (!tokenIsToken0 && read.token1 !== token) return "unavailable";
  const quoteAddress = tokenIsToken0 ? read.token1 : read.token0;
  const tokenDecimals = decimals.get(token);
  const quoteDecimals = decimals.get(quoteAddress);
  if (tokenDecimals === undefined || quoteDecimals === undefined) return "unavailable";

  if (read.sqrtPriceX96 !== null && read.sqrtPriceX96 > 0n) {
    const price = priceFromSqrtPriceX96(read.sqrtPriceX96, tokenIsToken0, tokenDecimals, quoteDecimals);
    if (Number.isFinite(price) && price > 0) return { kind: "v3", price, quoteAddress };
  }
  if (read.reserves !== null && read.reserves[0] > 0n && read.reserves[1] > 0n) {
    const [reserve0, reserve1] = read.reserves;
    const price = priceFromReserves(reserve0, reserve1, tokenIsToken0, tokenDecimals, quoteDecimals);
    if (Number.isFinite(price) && price > 0) return { kind: "v2", price, quoteAddress };
  }
  return "unavailable";
}

/**
 * Un `eth_call` por llamada, en POSTs de hasta `MAX_BATCH` enviados uno tras otro. Cada resultado
 * es el hex o `null` (revert, error o red).
 */
async function rpcBatch(calls: { to: string; data: string }[], rpcUrl: string): Promise<(string | null)[]> {
  const results: (string | null)[] = [];
  for (let start = 0; start < calls.length; start += MAX_BATCH) {
    results.push(...(await rpcPost(calls.slice(start, start + MAX_BATCH), rpcUrl)));
  }
  return results;
}

async function rpcPost(calls: { to: string; data: string }[], rpcUrl: string): Promise<(string | null)[]> {
  const empty = calls.map(() => null);
  let body: unknown;
  try {
    const response = await fetch(rpcUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(
        calls.map((call, id) => ({ jsonrpc: "2.0", id, method: "eth_call", params: [call, "latest"] })),
      ),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!response.ok) return empty;
    body = await response.json();
  } catch {
    return empty;
  }
  if (!Array.isArray(body)) return empty;

  const results: (string | null)[] = [...empty];
  for (const item of body) {
    if (item === null || typeof item !== "object") continue;
    const { id, result } = item as { id?: unknown; result?: unknown };
    if (typeof id === "number" && id >= 0 && id < calls.length && isHex(result)) results[id] = result;
  }
  return results;
}

function firstWord(result: string | null | undefined): bigint | null {
  if (!result || result.length < 2 + WORD) return null;
  return BigInt(`0x${result.slice(2, 2 + WORD)}`);
}

function twoWords(result: string | null | undefined): [bigint, bigint] | null {
  if (!result || result.length < 2 + WORD * 2) return null;
  return [BigInt(`0x${result.slice(2, 2 + WORD)}`), BigInt(`0x${result.slice(2 + WORD, 2 + WORD * 2)}`)];
}

function addressFrom(result: string | null | undefined): string | null {
  if (!result || result.length < 2 + WORD) return null;
  return `0x${result.slice(2 + WORD - 40, 2 + WORD)}`.toLowerCase();
}

function isHex(value: unknown): value is string {
  return typeof value === "string" && /^0x[0-9a-f]*$/i.test(value);
}

function isString(value: string | null): value is string {
  return value !== null;
}
