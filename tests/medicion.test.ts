import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CallLogEntry } from "@/lib/binance/call-log";
import type { MarketResult } from "@/lib/binance/market";
import type { PublicToken } from "@/lib/binance/rwa-public";
import { dataFileName, parseDuration, resolveConfig } from "@/lib/medicion/config";
import { measureRound, selectTokens, type MeasuredToken } from "@/lib/medicion/pools";
import { RateLimitExceeded, createRateGuard } from "@/lib/medicion/rate-guard";
import tradesFixture from "./fixtures/market/trades-qqqb.json";
import poolsFixture from "./fixtures/market/top-liquidity-qqqb.json";

const QQQB = "0x205812cdbed920aff76c6580abd681a46d11efc7";
const QQQON = "0x0cde6936d305d5b34667fc46425e852efd73559a";
const ok = <T>(data: T): MarketResult<T> => ({ kind: "ok", data });
const limited = (retryAfterSec: number | null = null): MarketResult<never> => ({ kind: "rate-limited", retryAfterSec });

/** Reloj simulado: `sleep` avanza el tiempo en vez de esperar. */
function fakeClock() {
  const clock = { t: 0, sleeps: [] as number[] };
  return {
    clock,
    now: () => clock.t,
    sleep: async (ms: number) => {
      clock.sleeps.push(ms);
      clock.t += ms;
    },
  };
}

describe("createRateGuard", () => {
  it("nunca deja menos de 500 ms entre dos llamadas, aunque respondan rápido", async () => {
    const { clock, now, sleep } = fakeClock();
    const guard = createRateGuard({ now, sleep });
    const startedAt: number[] = [];
    const call = async () => {
      startedAt.push(clock.t);
      clock.t += 120;
      return ok(null);
    };

    for (let index = 0; index < 6; index++) await guard.run(call);

    const gaps = startedAt.slice(1).map((at, index) => at - startedAt[index]);
    expect(gaps).toHaveLength(5);
    for (const gap of gaps) expect(gap).toBeGreaterThanOrEqual(500);
  });

  it("ante un límite espera el retry-after y reintenta una vez", async () => {
    const { clock, now, sleep } = fakeClock();
    const guard = createRateGuard({ now, sleep });
    const call = vi.fn<() => Promise<MarketResult<string>>>()
      .mockResolvedValueOnce(limited(7))
      .mockResolvedValueOnce(ok("datos"));

    expect(await guard.run(call)).toEqual(ok("datos"));
    expect(call).toHaveBeenCalledTimes(2);
    expect(clock.sleeps).toContain(7000);
  });

  it("sin retry-after espera 60 s", async () => {
    const { clock, now, sleep } = fakeClock();
    const guard = createRateGuard({ now, sleep });
    const call = vi.fn<() => Promise<MarketResult<string>>>()
      .mockResolvedValueOnce(limited())
      .mockResolvedValueOnce(ok("datos"));

    await guard.run(call);
    expect(clock.sleeps).toContain(60_000);
  });

  it("si el reintento también es límite lo devuelve, y al tercer límite seguido lanza", async () => {
    const { now, sleep } = fakeClock();
    const guard = createRateGuard({ now, sleep });
    const alwaysLimited = vi.fn(async () => limited(1));

    expect(await guard.run(alwaysLimited)).toEqual(limited(1));
    await expect(guard.run(alwaysLimited)).rejects.toBeInstanceOf(RateLimitExceeded);
    expect(alwaysLimited).toHaveBeenCalledTimes(3);
  });

  it("una respuesta buena entre límites reinicia la cuenta", async () => {
    const { now, sleep } = fakeClock();
    const guard = createRateGuard({ now, sleep });
    const call = vi.fn<() => Promise<MarketResult<string>>>()
      .mockResolvedValueOnce(limited())
      .mockResolvedValueOnce(limited())
      .mockResolvedValueOnce(ok("datos"))
      .mockResolvedValueOnce(limited())
      .mockResolvedValueOnce(limited());

    expect(await guard.run(call)).toEqual(limited());
    expect(await guard.run(call)).toEqual(ok("datos"));
    expect(await guard.run(call)).toEqual(limited());
  });
});

describe("resolveConfig", () => {
  const repo = "/repo/stock-proof";
  const env = { STOCKPROOF_MEDICION_DIR: "/datos/mediciones", STOCKPROOF_LOG_DIR: "/datos/mediciones/logs" };

  it("toma duración, tickers y carpetas; por defecto 72 h y los cuatro tickers", () => {
    expect(resolveConfig([], env, repo)).toEqual({
      durationMs: 72 * 3_600_000,
      tickers: ["QQQ", "SPY", "NVDA", "SPCX"],
      dataDir: "/datos/mediciones",
      logDir: "/datos/mediciones/logs",
      envFile: null,
    });
    expect(resolveConfig(["--duracion", "10m", "--tickers", "qqq, spy"], env, repo)).toMatchObject({
      durationMs: 600_000,
      tickers: ["QQQ", "SPY"],
    });
  });

  it("se niega a arrancar sin alguna de las dos carpetas", () => {
    expect(() => resolveConfig([], { STOCKPROOF_LOG_DIR: "/datos/logs" }, repo)).toThrow("STOCKPROOF_MEDICION_DIR");
    expect(() => resolveConfig([], { STOCKPROOF_MEDICION_DIR: "/datos" }, repo)).toThrow("STOCKPROOF_LOG_DIR");
  });

  it("se niega si una carpeta cae dentro del repo (los datos no se commitean)", () => {
    expect(() => resolveConfig([], { ...env, STOCKPROOF_LOG_DIR: "/repo/stock-proof/logs" }, repo)).toThrow(
      "dentro del repo",
    );
    expect(() => resolveConfig([], { ...env, STOCKPROOF_MEDICION_DIR: repo }, repo)).toThrow("dentro del repo");
  });

  it("rechaza duraciones y opciones que no entiende", () => {
    expect(() => parseDuration("10")).toThrow("--duracion");
    expect(() => parseDuration("0h")).toThrow("--duracion");
    expect(() => resolveConfig(["--intervalo", "1m"], env, repo)).toThrow("opción desconocida");
  });

  it("nombra el archivo por la fecha UTC", () => {
    expect(dataFileName(new Date("2026-10-07T23:59:00-03:00"))).toBe("pools-2026-10-08.jsonl");
  });
});

describe("selectTokens", () => {
  it("se queda con los tokens de los tickers pedidos, sin mayúsculas", () => {
    const base = { chainId: "56", multiplier: 1, spotPair: null } as unknown as PublicToken;
    const list: PublicToken[] = [
      { ...base, ticker: "QQQ", wrapper: "bstocks", symbol: "QQQB", contractAddress: QQQB },
      { ...base, ticker: "QQQ", wrapper: "ondo", symbol: "QQQon", contractAddress: QQQON },
      { ...base, ticker: "AAPL", wrapper: "xstocks", symbol: "AAPLx", contractAddress: "0x1" },
    ];
    expect(selectTokens(list, ["qqq"]).map((token) => token.symbol)).toEqual(["QQQB", "QQQon"]);
  });
});

describe("measureRound", () => {
  const ENV_KEYS = ["STOCKPROOF_CALLER", "STOCKPROOF_LOG_DIR"] as const;
  const savedEnv: Partial<Record<(typeof ENV_KEYS)[number], string>> = {};
  let dir: string;
  const tokens: MeasuredToken[] = [
    { ticker: "QQQ", wrapper: "bstocks", symbol: "QQQB", contractAddress: QQQB },
    { ticker: "QQQ", wrapper: "ondo", symbol: "QQQon", contractAddress: QQQON },
  ];

  beforeEach(async () => {
    for (const key of ENV_KEYS) savedEnv[key] = process.env[key];
    dir = await mkdtemp(path.join(tmpdir(), "stockproof-medicion-"));
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

  /** Binance responde en orden; el RPC (otro host) revierte todo. */
  function stubNetwork(binance: Response[]) {
    const fake = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      if (String(url).startsWith("https://rpc.test")) {
        const calls = JSON.parse(String(init?.body)) as { id: number }[];
        return Response.json(calls.map(({ id }) => ({ jsonrpc: "2.0", id, error: { code: 3, message: "reverted" } })));
      }
      const next = binance.shift();
      if (next === undefined) throw new Error("el doble de fetch no tiene más respuestas");
      return next;
    });
    vi.stubGlobal("fetch", fake);
    return fake;
  }

  /** Los fills del fixture son de 2026-10-08T00:07:59Z; 10 minutos después ya cubren la ventana de 5. */
  const NOW = Date.parse("2026-10-08T00:18:00Z");

  function deps(lastSeenAt = new Map<string, number>()) {
    const { now, sleep } = fakeClock();
    return {
      guard: createRateGuard({ now, sleep }),
      market: { sign: () => ({ "X-OC-APIKEY": "k" }), context: { purpose: "medicion-pools" } },
      rpcUrl: "https://rpc.test",
      now: () => NOW,
      marketStatus: async () => ({ marketStatus: "closed" as const, nextOpenAt: "x", nextCloseAt: "y" }),
      lastSeenAt,
    };
  }

  /** Una página de `trades` con un fill real de QQQB por cada hora pedida (segundos antes de NOW). */
  function page(secondsAgo: number[], cursor: string | null) {
    const base = tradesFixture.data.trades[2];
    return Response.json({
      code: 0,
      msg: "success",
      data: {
        cursor,
        trades: secondsAgo.map((ago) => ({ ...base, txHash: `0x${ago}`, time: NOW - ago * 1000 })),
      },
    });
  }

  it("en la ronda con pools guarda fills y pools por token; un error de un token queda en su línea y la ronda sigue", async () => {
    stubNetwork([
      Response.json(tradesFixture),
      Response.json(poolsFixture),
      new Response("caído", { status: 500 }),
      Response.json({ code: 0, msg: "success", data: [] }),
    ]);

    const lines = await measureRound(tokens, 0, deps());

    expect(lines).toHaveLength(2);
    const [qqqb, qqqon] = lines;
    expect(qqqb).toMatchObject({ round: 0, symbol: "QQQB", token: QQQB, at: "2026-10-08T00:18:00.000Z" });
    expect(qqqb).toMatchObject({ tradePages: 1, tradesTruncated: false });
    expect(qqqb.marketStatus).toMatchObject({ marketStatus: "closed" });
    expect(qqqb.trades).toHaveLength(8);
    expect(qqqb.trades![2].priceUsd).toBeCloseTo(758.79, 1);
    expect(qqqb.pools).toHaveLength(5);
    // Los tres con contrato y liquidez se intentaron leer (el RPC revirtió); los RFQ no se leen.
    expect(qqqb.pools!.map((pool) => pool.price)).toEqual([null, null, "unavailable", "unavailable", "unavailable"]);
    expect(qqqon.trades).toBeNull();
    expect(qqqon.tradesError).toBe("HTTP 500");
    expect(qqqon.pools).toEqual([]);

    const logged = (await readFile(path.join(dir, "binance-calls-medicion.jsonl"), "utf8"))
      .split("\n")
      .filter(Boolean)
      .map((raw) => JSON.parse(raw) as CallLogEntry);
    expect(logged).toHaveLength(4);
    expect(new Set(logged.map((line) => `${line.caller}/${line.api}/${line.context.purpose}`))).toEqual(
      new Set(["medicion/market/medicion-pools"]),
    );
  });

  describe("paginación de trades", () => {
    const one = [tokens[0]];

    it("en la primera ronda pagina con el cursor hasta cubrir los 5 minutos y recuerda el fill más nuevo", async () => {
      const fake = stubNetwork([page([10, 100], "c1"), page([150, 200], "c2"), page([250, 320], "c3")]);
      const seen = new Map<string, number>();

      const [line] = await measureRound(one, 1, deps(seen));

      expect(fake).toHaveBeenCalledTimes(3);
      expect(String(fake.mock.calls[1][0])).toContain("&cursor=c1");
      expect(String(fake.mock.calls[2][0])).toContain("&cursor=c2");
      expect(line).toMatchObject({ tradePages: 3, tradesTruncated: false });
      expect(line.trades).toHaveLength(6);
      expect(seen.get(QQQB)).toBe(NOW - 10_000);
    });

    it("en las rondas siguientes para al llegar al fill más nuevo de la ronda anterior", async () => {
      const fake = stubNetwork([page([10, 70], "c1")]);
      const seen = new Map([[QQQB, NOW - 60_000]]);

      const [line] = await measureRound(one, 1, deps(seen));

      expect(fake).toHaveBeenCalledTimes(1);
      expect(line).toMatchObject({ tradePages: 1, tradesTruncated: false });
      expect(seen.get(QQQB)).toBe(NOW - 10_000);
    });

    it("con el tope de 10 páginas corta y marca la línea como truncada", async () => {
      const pages = Array.from({ length: 11 }, (_, index) => page([index * 10 + 1, index * 10 + 2], `c${index + 1}`));
      const fake = stubNetwork(pages);

      const [line] = await measureRound(one, 1, deps());

      expect(fake).toHaveBeenCalledTimes(10);
      expect(line).toMatchObject({ tradePages: 10, tradesTruncated: true });
      expect(line.trades).toHaveLength(20);
    });

    it("un error a mitad de camino deja los fills ya leídos y el motivo", async () => {
      stubNetwork([page([10, 100], "c1"), new Response("caído", { status: 500 })]);

      const [line] = await measureRound(one, 1, deps());

      expect(line.trades).toHaveLength(2);
      expect(line).toMatchObject({ tradePages: 1, tradesTruncated: false, tradesError: "HTTP 500" });
    });

    it("sin cursor siguiente no pide más, aunque no haya cubierto la ventana", async () => {
      const fake = stubNetwork([page([10, 20], null)]);
      const [line] = await measureRound(one, 1, deps());
      expect(fake).toHaveBeenCalledTimes(1);
      expect(line).toMatchObject({ tradePages: 1, tradesTruncated: false });
    });
  });

  it("fuera de la ronda horaria solo pide fills", async () => {
    const fake = stubNetwork([Response.json(tradesFixture), Response.json(tradesFixture)]);

    const lines = await measureRound(tokens, 1, deps());

    expect(fake).toHaveBeenCalledTimes(2);
    expect(lines.every((line) => line.pools === undefined)).toBe(true);
  });
});
