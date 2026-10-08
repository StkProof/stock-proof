import { afterEach, describe, expect, it, vi } from "vitest";
import { priceFromReserves, priceFromSqrtPriceX96, readPoolPrices } from "@/lib/chain/pool-price";

// Lecturas reales de BSC del 7 oct 2026.
const QQQB = "0x205812cdbed920aff76c6580abd681a46d11efc7";
const USDT = "0x55d398326f99059ff775485246999027b3197955";
const WBNB = "0xbb4cdb9cbd36b01bd1cbaebf2de08d9173bc095c";
/** PancakeSwap V3 QQQB/USDT: token0 = QQQB, token1 = USDT, ambos con 18 decimales. */
const V3_POOL = "0xe531fcb1f5a195de7608b9f4f9518544c2cdb693";
const V3_SQRT = 0x1b8d6ec3d3ce3b21a7a7373644n;
/** PancakeSwap V2 QQQB/WBNB: token0 = QQQB. */
const V2_POOL = "0x0f494581240974b082075af27e087e92612f90dd";
const V2_RESERVE0 = 0x577473d88fd6d82a9n;
const V2_RESERVE1 = 0x55cdb042733189f73n;

const word = (value: bigint | string) =>
  (typeof value === "bigint" ? value.toString(16) : value.replace(/^0x/, "")).padStart(64, "0");

afterEach(() => vi.unstubAllGlobals());

describe("priceFromSqrtPriceX96", () => {
  it("con el token como token0 da la contraparte por token (759 USDT por QQQB)", () => {
    expect(priceFromSqrtPriceX96(V3_SQRT, true, 18, 18)).toBeCloseTo(759.1387, 3);
  });

  it("con el token como token1 invierte el precio", () => {
    expect(priceFromSqrtPriceX96(V3_SQRT, false, 18, 18)).toBeCloseTo(1 / 759.1387, 9);
  });

  it("ajusta por decimales distintos: 2000 de una contraparte de 6 decimales por token de 18", () => {
    // raw = token1/token0 en unidades mínimas = 2000e6 / 1e18.
    const sqrt = BigInt(Math.round(Math.sqrt(2000e6 / 1e18) * 2 ** 96));
    expect(priceFromSqrtPriceX96(sqrt, true, 18, 6)).toBeCloseTo(2000, 6);
  });
});

describe("priceFromReserves", () => {
  it("con el token como token0 da reserva de la contraparte sobre reserva del token (0,981 WBNB por QQQB)", () => {
    expect(priceFromReserves(V2_RESERVE0, V2_RESERVE1, true, 18, 18)).toBeCloseTo(0.98112, 5);
  });

  it("con el token como token1 da la inversa", () => {
    expect(priceFromReserves(V2_RESERVE0, V2_RESERVE1, false, 18, 18)).toBeCloseTo(1 / 0.98112, 4);
  });

  it("ajusta por decimales distintos: 2 tokens de 18 contra 1500 de una contraparte de 6", () => {
    expect(priceFromReserves(2n * 10n ** 18n, 1500n * 10n ** 6n, true, 18, 6)).toBeCloseTo(750, 9);
    expect(priceFromReserves(1500n * 10n ** 6n, 2n * 10n ** 18n, false, 18, 6)).toBeCloseTo(750, 9);
  });
});

describe("readPoolPrices", () => {
  /** Responde cada `eth_call` del batch según dirección y selector; un revert si no está en la tabla. */
  function stubRpc(table: Record<string, string>) {
    const fake = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      const calls = JSON.parse(String(init?.body)) as { id: number; params: [{ to: string; data: string }] }[];
      return Response.json(
        calls.map(({ id, params: [{ to, data }] }) => {
          const result = table[`${to.toLowerCase()}:${data}`];
          return result === undefined
            ? { jsonrpc: "2.0", id, error: { code: 3, message: "execution reverted: 0x" } }
            : { jsonrpc: "2.0", id, result };
        }),
      );
    });
    vi.stubGlobal("fetch", fake);
    return fake;
  }

  const decimals18 = `0x${word(18n)}`;

  it("lee V3 por slot0 y, si slot0 revierte, V2 por getReserves, en dos POST", async () => {
    const fake = stubRpc({
      [`${V3_POOL}:0x3850c7bd`]: `0x${word(V3_SQRT)}${word(0n)}`,
      [`${V3_POOL}:0x0dfe1681`]: `0x${word(QQQB)}`,
      [`${V3_POOL}:0xd21220a7`]: `0x${word(USDT)}`,
      [`${V2_POOL}:0x0902f1ac`]: `0x${word(V2_RESERVE0)}${word(V2_RESERVE1)}${word(0n)}`,
      [`${V2_POOL}:0x0dfe1681`]: `0x${word(QQQB)}`,
      [`${V2_POOL}:0xd21220a7`]: `0x${word(WBNB)}`,
      [`${QQQB}:0x313ce567`]: decimals18,
      [`${USDT}:0x313ce567`]: decimals18,
      [`${WBNB}:0x313ce567`]: decimals18,
    });

    const prices = await readPoolPrices(
      [
        { poolAddress: V3_POOL, tokenAddress: QQQB },
        { poolAddress: V2_POOL.toUpperCase().replace("0X", "0x"), tokenAddress: QQQB },
      ],
      "https://rpc.test",
    );

    expect(fake).toHaveBeenCalledTimes(2);
    const v3 = prices.get(V3_POOL);
    const v2 = prices.get(V2_POOL);
    expect(v3).toMatchObject({ kind: "v3", quoteAddress: USDT });
    expect(v3 !== "unavailable" && v3?.price).toBeCloseTo(759.1387, 3);
    expect(v2).toMatchObject({ kind: "v2", quoteAddress: WBNB });
    expect(v2 !== "unavailable" && v2?.price).toBeCloseTo(0.98112, 5);
  });

  it("con 15 pools parte el batch: el nodo público rechaza entero un batch de 40 eth_call", async () => {
    const pools = Array.from({ length: 15 }, (_, index) => `0x${(index + 1).toString(16).padStart(40, "0")}`);
    const table: Record<string, string> = {
      [`${QQQB}:0x313ce567`]: decimals18,
      [`${USDT}:0x313ce567`]: decimals18,
    };
    for (const pool of pools) {
      table[`${pool}:0x3850c7bd`] = `0x${word(V3_SQRT)}${word(0n)}`;
      table[`${pool}:0x0dfe1681`] = `0x${word(QQQB)}`;
      table[`${pool}:0xd21220a7`] = `0x${word(USDT)}`;
    }
    const inner = stubRpc(table);
    const sizes: number[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
        const size = (JSON.parse(String(init?.body)) as unknown[]).length;
        sizes.push(size);
        if (size > 30) {
          return Response.json([{ jsonrpc: "2.0", id: null, error: { code: -32005, message: "batch triggered rate limit" } }]);
        }
        return inner(url, init);
      }),
    );

    const prices = await readPoolPrices(
      pools.map((poolAddress) => ({ poolAddress, tokenAddress: QQQB })),
      "https://rpc.test",
    );

    expect(Math.max(...sizes)).toBeLessThanOrEqual(20);
    expect([...prices.values()].every((price) => price !== "unavailable" && price.kind === "v3")).toBe(true);
  });

  it("un pool donde fallan las dos lecturas queda unavailable", async () => {
    stubRpc({
      [`${V3_POOL}:0x0dfe1681`]: `0x${word(QQQB)}`,
      [`${V3_POOL}:0xd21220a7`]: `0x${word(USDT)}`,
      [`${QQQB}:0x313ce567`]: decimals18,
      [`${USDT}:0x313ce567`]: decimals18,
    });
    const prices = await readPoolPrices([{ poolAddress: V3_POOL, tokenAddress: QQQB }], "https://rpc.test");
    expect(prices.get(V3_POOL)).toBe("unavailable");
  });

  it("si la red falla, todos quedan unavailable sin lanzar", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Promise.reject(new Error("sin red"))));
    const prices = await readPoolPrices([{ poolAddress: V3_POOL, tokenAddress: QQQB }], "https://rpc.test");
    expect(prices.get(V3_POOL)).toBe("unavailable");
  });
});
