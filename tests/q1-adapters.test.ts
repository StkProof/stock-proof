import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CallLogEntry } from "@/lib/binance/call-log";
import { getUnderlyingProfile, searchRwa, type RwaDeps } from "@/lib/binance/rwa";
import { supportsInterface } from "@/lib/chain/supports-interface";
import { BEP8056_INTERFACE_ID, checkContract } from "@/lib/questions/q1";
import errorCode from "./fixtures/rwa/error-code.json";
import profileAttested from "./fixtures/rwa/profile-attested.json";
import profileNoAttestation from "./fixtures/rwa/profile-no-attestation.json";
import searchEmpty from "./fixtures/rwa/search-empty.json";
import searchQqq from "./fixtures/rwa/search-qqq.json";

const BSTOCK = "0x1a2B3c4d00000000000000000000000000C0FFEE";
const ONDO = "0xa9ee28c80f960b889dfbd1902055218cba016f75";
const LOOKALIKE = "0x1a2b3c4d99999999999999999999999999c0ffee";
const RPC = "https://bsc-rpc.test/";
const SIGNATURE = "firma-secreta-de-test";
const ENV_KEYS = ["STOCKPROOF_CALLER", "STOCKPROOF_ENV", "STOCKPROOF_LOG_DIR"] as const;

const TRUE_WORD = "0x" + "0".repeat(63) + "1";
const FALSE_WORD = "0x" + "0".repeat(64);

let dir: string;
const savedEnv: Partial<Record<(typeof ENV_KEYS)[number], string>> = {};

const sign = vi.fn((method: string, requestPath: string) => ({
  "X-OC-APIKEY": "key-de-test",
  "X-OC-TIMESTAMP": "2026-09-28T12:00:00.000Z",
  "X-OC-SIGN": `${SIGNATURE}:${method}:${requestPath}`,
}));

const deps: RwaDeps = { sign, baseUrl: "https://web3.binance.com/build" };

type Route = { match: string; reply: () => Response | Error };

/** `fetch` doble: responde según el primer `match` contenido en la URL. Anota cada URL pedida. */
function stubFetch(routes: Route[]) {
  const fake = vi.fn<typeof fetch>(async (input) => {
    const url = String(input);
    const route = routes.find((candidate) => url.includes(candidate.match));
    if (route === undefined) throw new Error(`el doble de fetch no conoce ${url}`);
    const reply = route.reply();
    if (reply instanceof Error) throw reply;
    return reply;
  });
  vi.stubGlobal("fetch", fake);
  return fake;
}

const json = (body: unknown, status = 200) => () => Response.json(body, { status });
const rpcResult = (result: string) => json({ jsonrpc: "2.0", id: 1, result });
const rpcError = (code: number, message: string) =>
  json({ jsonrpc: "2.0", id: 1, error: { code, message } });

function calledUrls(fake: ReturnType<typeof stubFetch>): string[] {
  return fake.mock.calls.map(([input]) => String(input));
}

async function readLines(): Promise<CallLogEntry[]> {
  const text = await readFile(path.join(dir, "binance-calls-test.jsonl"), "utf8");
  return text
    .split("\n")
    .filter(Boolean)
    .map((raw) => JSON.parse(raw) as CallLogEntry);
}

beforeEach(async () => {
  for (const key of ENV_KEYS) savedEnv[key] = process.env[key];
  dir = await mkdtemp(path.join(tmpdir(), "stockproof-q1-"));
  process.env.STOCKPROOF_LOG_DIR = dir;
  process.env.STOCKPROOF_CALLER = "test";
  process.env.STOCKPROOF_ENV = "ci";
  sign.mockClear();
});

afterEach(async () => {
  vi.unstubAllGlobals();
  for (const key of ENV_KEYS) {
    if (savedEnv[key] === undefined) delete process.env[key];
    else process.env[key] = savedEnv[key];
  }
  await rm(dir, { recursive: true, force: true });
});

describe("searchRwa", () => {
  it("traduce la búsqueda a tipos propios", async () => {
    stubFetch([{ match: "rwa/search", reply: json(searchQqq) }]);

    const results = await searchRwa("QQQ", deps);

    expect(results).not.toBe("unavailable");
    if (results === "unavailable") return;
    expect(results.map((result) => result.ticker)).toEqual(["QQQ", "QQQM"]);
    expect(results[0].assets[0]).toEqual({
      platformId: "bstock",
      binanceChainId: "56",
      tokenContractAddress: BSTOCK,
      tokenSymbol: "QQQB",
    });
  });

  it("firma la ruta con /build y la query, y llama a esa misma URL", async () => {
    const fake = stubFetch([{ match: "rwa/search", reply: json(searchEmpty) }]);

    await searchRwa(" QQQ ", deps);

    expect(sign).toHaveBeenCalledWith("GET", "/build/api/v1/dex/market/rwa/search?keyword=QQQ", "");
    expect(calledUrls(fake)).toEqual([
      "https://web3.binance.com/build/api/v1/dex/market/rwa/search?keyword=QQQ",
    ]);
  });

  it("devuelve una lista vacía si el ticker no existe", async () => {
    stubFetch([{ match: "rwa/search", reply: json(searchEmpty) }]);
    expect(await searchRwa("NOEXISTE", deps)).toEqual([]);
  });

  it("devuelve unavailable ante error HTTP, code distinto de 0, falla de red o cuerpo que no se entiende", async () => {
    const replies = [
      json({ code: 40102, msg: "Invalid signature" }, 401),
      json(errorCode),
      () => new Error("ECONNRESET"),
      () => new Response("<html>mantenimiento</html>", { status: 200 }),
      json({ code: 0, data: { ticker: "QQQ" } }),
      json({ code: 0, data: [{ ticker: "QQQ", assets: [{ platformId: "bstock" }] }] }),
    ];
    for (const reply of replies) {
      stubFetch([{ match: "rwa/search", reply }]);
      expect(await searchRwa("QQQ", deps)).toBe("unavailable");
    }
  });

  it("anota la llamada con api rwa y purpose q1, sin la firma", async () => {
    stubFetch([{ match: "rwa/search", reply: json(searchQqq) }]);

    await searchRwa("QQQ", { ...deps, context: { purpose: "q1", ticker: "QQQ" } });

    const [line] = await readLines();
    expect(line).toMatchObject({
      api: "rwa",
      endpoint: "/build/api/v1/dex/market/rwa/search",
      params: { keyword: "QQQ" },
      context: { purpose: "q1", ticker: "QQQ" },
      ok: true,
    });
    const raw = await readFile(path.join(dir, "binance-calls-test.jsonl"), "utf8");
    expect(raw).not.toContain(SIGNATURE);
    expect(raw).not.toContain("key-de-test");
  });
});

describe("getUnderlyingProfile", () => {
  it("traduce protections a una lista de reportes", async () => {
    const fake = stubFetch([{ match: "underlying-profile", reply: json(profileAttested) }]);

    const profile = await getUnderlyingProfile("56", BSTOCK, deps);

    expect(profile).toEqual({
      attestations: [
        { name: "dailyAttestationReport", supported: false, url: null },
        {
          name: "monthlyAttestationReport",
          supported: true,
          url: "https://static.example.test/attestation/monthly-2026-08.pdf",
        },
      ],
    });
    expect(calledUrls(fake)[0]).toBe(
      `https://web3.binance.com/build/api/v1/dex/market/rwa/underlying-profile?binanceChainId=56&tokenContractAddress=${BSTOCK}`,
    );
  });

  it("devuelve una lista vacía si el perfil no trae protections", async () => {
    stubFetch([{ match: "underlying-profile", reply: json({ code: 0, data: { platformId: "bstock" } }) }]);
    expect(await getUnderlyingProfile("56", BSTOCK, deps)).toEqual({ attestations: [] });
  });

  it("devuelve unavailable si protections o un reporte no tienen la forma esperada", async () => {
    const shapes = [
      [],
      "error",
      { dailyAttestationReport: "sí" },
      { dailyAttestationReport: { supported: "true", url: null } },
      { dailyAttestationReport: { supported: true, url: null }, monthlyAttestationReport: null },
    ];
    for (const protections of shapes) {
      stubFetch([{ match: "underlying-profile", reply: json({ code: 0, data: { protections } }) }]);
      expect(await getUnderlyingProfile("56", BSTOCK, deps)).toBe("unavailable");
    }
  });

  it("devuelve unavailable con data null, error HTTP, code distinto de 0 o falla de red", async () => {
    const replies = [
      json({ code: 0, msg: "success", data: null }),
      json({ code: 404, msg: "not found" }, 404),
      json(errorCode),
      () => new Error("timeout"),
    ];
    for (const reply of replies) {
      stubFetch([{ match: "underlying-profile", reply }]);
      expect(await getUnderlyingProfile("56", BSTOCK, deps)).toBe("unavailable");
    }
  });
});

describe("supportsInterface", () => {
  it("manda un eth_call a supportsInterface(0xa60bf13d) en la dirección pedida", async () => {
    const fake = stubFetch([{ match: RPC, reply: rpcResult(TRUE_WORD) }]);

    await supportsInterface(BSTOCK, BEP8056_INTERFACE_ID, RPC);

    const init = fake.mock.calls[0][1] ?? {};
    expect(JSON.parse(String(init.body))).toMatchObject({
      method: "eth_call",
      params: [{ to: BSTOCK, data: "0x01ffc9a7a60bf13d" + "0".repeat(56) }, "latest"],
    });
  });

  it("0x…01 es true y 0x…00 es false", async () => {
    stubFetch([{ match: RPC, reply: rpcResult(TRUE_WORD) }]);
    expect(await supportsInterface(BSTOCK, BEP8056_INTERFACE_ID, RPC)).toBe(true);
    stubFetch([{ match: RPC, reply: rpcResult(FALSE_WORD) }]);
    expect(await supportsInterface(BSTOCK, BEP8056_INTERFACE_ID, RPC)).toBe(false);
  });

  it("un revert o una respuesta vacía es false (BEP-20 común sin ERC-165)", async () => {
    for (const reply of [rpcError(3, "execution reverted"), rpcError(-32000, "execution reverted"), rpcResult("0x")]) {
      stubFetch([{ match: RPC, reply }]);
      expect(await supportsInterface(LOOKALIKE, BEP8056_INTERFACE_ID, RPC)).toBe(false);
    }
  });

  it("red, HTTP, otro error del nodo o un resultado que no es hex es unavailable", async () => {
    const replies = [
      () => new Error("ECONNREFUSED"),
      json({ error: "bad gateway" }, 502),
      rpcError(-32005, "limit exceeded"),
      rpcResult("no-es-hex"),
    ];
    for (const reply of replies) {
      stubFetch([{ match: RPC, reply }]);
      expect(await supportsInterface(BSTOCK, BEP8056_INTERFACE_ID, RPC)).toBe("unavailable");
    }
  });

  it("sin URL de RPC, lanza en vez de inventar una respuesta", async () => {
    await expect(supportsInterface(BSTOCK, BEP8056_INTERFACE_ID, "")).rejects.toThrow("BSC_RPC_URL");
  });
});

describe("checkContract", () => {
  const q1Deps = { rwa: deps, rpcUrl: RPC };

  it("pasa QQQB oficial: consulta lista, attestation y estándar, y anota las dos llamadas a Binance con purpose q1", async () => {
    const fake = stubFetch([
      { match: "rwa/search", reply: json(searchQqq) },
      { match: "underlying-profile", reply: json(profileAttested) },
      { match: RPC, reply: rpcResult(TRUE_WORD) },
    ]);

    const result = await checkContract({ ticker: "QQQB", wrapper: "bstocks", address: BSTOCK }, q1Deps);

    expect(result).toEqual({ ok: true });
    expect(calledUrls(fake)).toHaveLength(3);
    const lines = await readLines();
    expect(lines.map((line) => line.context)).toEqual([
      { purpose: "q1", ticker: "QQQB", wrapper: "bstocks" },
      { purpose: "q1", ticker: "QQQB", wrapper: "bstocks" },
    ]);
  });

  it("corta al impostor en la lista y no consulta attestation ni BSC", async () => {
    const fake = stubFetch([{ match: "rwa/search", reply: json(searchQqq) }]);

    const result = await checkContract({ ticker: "QQQB", wrapper: "bstocks", address: LOOKALIKE }, q1Deps);

    expect(result).toEqual({ ok: false, reason: "CONTRACT_NOT_LISTED" });
    expect(calledUrls(fake)).toHaveLength(1);
  });

  it("corta sin attestation y no consulta BSC", async () => {
    const fake = stubFetch([
      { match: "rwa/search", reply: json(searchQqq) },
      { match: "underlying-profile", reply: json(profileNoAttestation) },
    ]);

    const result = await checkContract({ ticker: "QQQB", wrapper: "bstocks", address: BSTOCK }, q1Deps);

    expect(result).toEqual({ ok: false, reason: "ATTESTATION_MISSING" });
    expect(calledUrls(fake)).toHaveLength(2);
  });

  it("corta un bStock que no es BEP-8056", async () => {
    stubFetch([
      { match: "rwa/search", reply: json(searchQqq) },
      { match: "underlying-profile", reply: json(profileAttested) },
      { match: RPC, reply: rpcError(3, "execution reverted") },
    ]);

    const result = await checkContract({ ticker: "QQQB", wrapper: "bstocks", address: BSTOCK }, q1Deps);

    expect(result).toEqual({ ok: false, reason: "STANDARD_NOT_BEP8056" });
  });

  it("pasa un Ondo oficial sin consultar BSC", async () => {
    const fake = stubFetch([
      { match: "rwa/search", reply: json(searchQqq) },
      { match: "underlying-profile", reply: json(profileAttested) },
    ]);

    const result = await checkContract({ ticker: "QQQ", wrapper: "ondo", address: ONDO }, q1Deps);

    expect(result).toEqual({ ok: true });
    expect(calledUrls(fake).some((url) => url.includes(RPC))).toBe(false);
  });

  it("devuelve LIST_UNAVAILABLE para xStocks sin llamar a nadie", async () => {
    const fake = stubFetch([]);

    const result = await checkContract({ ticker: "QQQ", wrapper: "xstocks", address: BSTOCK }, q1Deps);

    expect(result).toEqual({ ok: false, reason: "LIST_UNAVAILABLE" });
    expect(fake).not.toHaveBeenCalled();
  });

  it("nunca pasa si una fuente no responde", async () => {
    stubFetch([{ match: "rwa/search", reply: () => new Error("ECONNRESET") }]);
    expect(
      await checkContract({ ticker: "QQQB", wrapper: "bstocks", address: BSTOCK }, q1Deps),
    ).toEqual({ ok: false, reason: "LIST_UNAVAILABLE" });

    stubFetch([
      { match: "rwa/search", reply: json(searchQqq) },
      { match: "underlying-profile", reply: json(errorCode) },
    ]);
    expect(
      await checkContract({ ticker: "QQQB", wrapper: "bstocks", address: BSTOCK }, q1Deps),
    ).toEqual({ ok: false, reason: "ATTESTATION_UNAVAILABLE" });

    stubFetch([
      { match: "rwa/search", reply: json(searchQqq) },
      { match: "underlying-profile", reply: json(profileAttested) },
      { match: RPC, reply: () => new Error("ECONNREFUSED") },
    ]);
    expect(
      await checkContract({ ticker: "QQQB", wrapper: "bstocks", address: BSTOCK }, q1Deps),
    ).toEqual({ ok: false, reason: "CHAIN_UNAVAILABLE" });
  });
});
