import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CallLogEntry } from "@/lib/binance/call-log";
import {
  fillUsdPrice,
  getTopLiquidity,
  getTrades,
  parseTopLiquidity,
  parseTrades,
  type MarketDeps,
} from "@/lib/binance/market";
import { isReadablePool } from "@/lib/medicion/pools";
import tradesFixture from "./fixtures/market/trades-qqqb.json";
import poolsFixture from "./fixtures/market/top-liquidity-qqqb.json";

const QQQB = "0x205812cdbed920aff76c6580abd681a46d11efc7";
const ENV_KEYS = ["STOCKPROOF_CALLER", "STOCKPROOF_LOG_DIR"] as const;

let dir: string;
const savedEnv: Partial<Record<(typeof ENV_KEYS)[number], string>> = {};
const deps: MarketDeps = { sign: () => ({ "X-OC-APIKEY": "k" }), context: { purpose: "medicion-pools" } };

function stubFetch(...responses: Response[]) {
  const fake = vi.fn<(url: string | URL | Request, init?: RequestInit) => Promise<Response>>(async () => {
    const next = responses.shift();
    if (next === undefined) throw new Error("el doble de fetch no tiene más respuestas");
    return next;
  });
  vi.stubGlobal("fetch", fake);
  return fake;
}

beforeEach(async () => {
  for (const key of ENV_KEYS) savedEnv[key] = process.env[key];
  dir = await mkdtemp(path.join(tmpdir(), "stockproof-market-"));
  process.env.STOCKPROOF_LOG_DIR = dir;
  process.env.STOCKPROOF_CALLER = "medicion";
});

afterEach(async () => {
  vi.unstubAllGlobals();
  for (const key of ENV_KEYS) {
    if (savedEnv[key] === undefined) delete process.env[key];
    else process.env[key] = savedEnv[key];
  }
  await rm(dir, { recursive: true, force: true });
});

describe("parseTrades con la respuesta real de QQQB (7 oct 2026)", () => {
  it("da el precio USD de cada fill como volume / monto del token, sea la contraparte USDT, WBNB o un memecoin", () => {
    const trades = parseTrades(tradesFixture.data, QQQB)!;

    expect(trades).toHaveLength(8);
    const usdt = trades.find((trade) => trade.counterSymbol === "USDT")!;
    expect(fillUsdPrice(usdt)).toBeCloseTo(99.069620016365054746 / 0.1305611906979647, 6);
    expect(fillUsdPrice(usdt)).toBeCloseTo(758.79, 1);
    // El mismo fill ruteado por un memecoin (Flap) también sale cerca de 759 en USD.
    const flap = trades.find((trade) => trade.dexName === "Flap (BSC)")!;
    expect(fillUsdPrice(flap)).toBeGreaterThan(750);
    expect(fillUsdPrice(flap)).toBeLessThan(770);
    expect(flap.counterAddress).toBe("0x824f7b992f1679faec2500fe12d7fa82d29e7777");
  });

  it("encuentra el monto del token aunque el contrato venga en mayúsculas", () => {
    const trades = parseTrades(tradesFixture.data, QQQB.toUpperCase().replace("0X", "0x"))!;
    expect(trades).toHaveLength(8);
    expect(trades[0].tokenAmount).toBeCloseTo(0.020150118103535091, 15);
  });

  it("descarta fills sin el token, con monto cero o con números rotos, y sigue con el resto", () => {
    const [good] = tradesFixture.data.trades;
    const otherToken = { ...good, changedTokenInfo: [good.changedTokenInfo[1]] };
    const zero = { ...good, changedTokenInfo: [{ ...good.changedTokenInfo[0], amount: "0" }] };
    const broken = { ...good, volume: "abc" };
    const trades = parseTrades({ cursor: "", trades: [otherToken, zero, broken, good] }, QQQB)!;

    expect(trades).toHaveLength(1);
    expect(trades[0].txHash).toBe(good.txHash);
  });

  it("una lista vacía es válida; otra forma es null", () => {
    expect(parseTrades({ cursor: null, trades: [] }, QQQB)).toEqual([]);
    expect(parseTrades([], QQQB)).toBeNull();
  });
});

describe("parseTopLiquidity con la respuesta real de QQQB (7 oct 2026)", () => {
  it("lee liquidez y montos, deja null la liquidez de los RFQ y solo marca para leer los pools con contrato y liquidez", () => {
    const pools = parseTopLiquidity(poolsFixture.data)!;

    expect(pools).toHaveLength(5);
    const v3 = pools.find((pool) => pool.poolAddress === "0xe531fcb1f5a195de7608b9f4f9518544c2cdb693")!;
    expect(v3.liquidityUsd).toBeCloseTo(621347.68, 1);
    expect(v3.tokens.map((token) => token.symbol)).toEqual(["QQQB", "USDT"]);
    const bebop = pools.find((pool) => pool.protocolName === "Bebop")!;
    expect(bebop.liquidityUsd).toBeNull();
    expect(pools.filter(isReadablePool)).toHaveLength(3);
    expect(isReadablePool({ ...v3, poolAddress: `0x${"ab".repeat(32)}` })).toBe(false);
  });
});

describe("getTrades / getTopLiquidity", () => {
  it("firman la ruta con /build, pasan por binanceRequest y anotan con caller medicion y api market", async () => {
    const sign = vi.fn(() => ({ "X-OC-APIKEY": "k" }));
    const fake = stubFetch(Response.json(tradesFixture), Response.json(poolsFixture));

    const trades = await getTrades(QQQB, { ...deps, sign });
    const pools = await getTopLiquidity(QQQB, { ...deps, sign });

    expect(trades.kind).toBe("ok");
    expect(pools.kind).toBe("ok");
    expect(sign).toHaveBeenCalledWith(
      "GET",
      `/build/api/v1/dex/market/trades?binanceChainId=56&tokenContractAddress=${QQQB}&limit=100`,
      "",
    );
    expect(String(fake.mock.calls[1][0])).toBe(
      `https://web3.binance.com/build/api/v1/dex/market/token/top-liquidity?binanceChainId=56&tokenContractAddress=${QQQB}`,
    );
    const lines = (await readFile(path.join(dir, "binance-calls-medicion.jsonl"), "utf8"))
      .split("\n")
      .filter(Boolean)
      .map((raw) => JSON.parse(raw) as CallLogEntry);
    expect(lines.map((line) => [line.caller, line.api, line.context.purpose])).toEqual([
      ["medicion", "market", "medicion-pools"],
      ["medicion", "market", "medicion-pools"],
    ]);
  });

  it("devuelve el cursor de la página y, si se lo pasa, lo firma en la query", async () => {
    const sign = vi.fn(() => ({ "X-OC-APIKEY": "k" }));
    stubFetch(Response.json(tradesFixture));

    const result = await getTrades(QQQB, { ...deps, sign }, "abc=");

    expect(result.kind === "ok" && result.data.cursor).toBe(tradesFixture.data.cursor);
    expect(result.kind === "ok" && result.data.trades).toHaveLength(8);
    expect(sign).toHaveBeenCalledWith(
      "GET",
      `/build/api/v1/dex/market/trades?binanceChainId=56&tokenContractAddress=${QQQB}&limit=100&cursor=abc%3D`,
      "",
    );
  });

  it("el code 100004 de Binance también es rate-limited", async () => {
    stubFetch(Response.json({ code: 100004, msg: "Too many requests" }, { headers: { "retry-after": "3" } }));
    expect(await getTrades(QQQB, deps)).toEqual({ kind: "rate-limited", retryAfterSec: 3 });
  });

  it("HTTP 429 es rate-limited con el retry-after del header", async () => {
    stubFetch(new Response("", { status: 429, headers: { "retry-after": "7" } }));
    expect(await getTrades(QQQB, deps)).toEqual({ kind: "rate-limited", retryAfterSec: 7 });
  });

  it("otro code de negocio es error con su motivo, no rate-limited", async () => {
    stubFetch(Response.json({ code: 40001, msg: "invalid param" }));
    expect(await getTrades(QQQB, deps)).toEqual({ kind: "error", reason: "code 40001: invalid param" });
  });
});
