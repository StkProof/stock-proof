import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { newEvaluationId, type CallLogEntry } from "@/lib/binance/call-log";
import { binanceRequest } from "@/lib/binance/request";

const URL_QUOTE = "https://api.binance.com/sapi/v1/rwa/quote?symbol=NVDA";
const ENV_KEYS = ["STOCKPROOF_CALLER", "STOCKPROOF_ENV", "STOCKPROOF_LOG_DIR"] as const;

let dir: string;
const savedEnv: Partial<Record<(typeof ENV_KEYS)[number], string>> = {};

function stubFetch(...responses: (Response | Error)[]) {
  const fake = vi.fn(async () => {
    const next = responses.shift();
    if (next === undefined) throw new Error("el doble de fetch no tiene más respuestas");
    if (next instanceof Error) throw next;
    return next;
  });
  vi.stubGlobal("fetch", fake);
  return fake;
}

async function readLines(caller = "test"): Promise<CallLogEntry[]> {
  const text = await readFile(path.join(dir, `binance-calls-${caller}.jsonl`), "utf8");
  return text
    .split("\n")
    .filter(Boolean)
    .map((raw) => JSON.parse(raw) as CallLogEntry);
}

beforeEach(async () => {
  for (const key of ENV_KEYS) savedEnv[key] = process.env[key];
  dir = await mkdtemp(path.join(tmpdir(), "stockproof-log-"));
  process.env.STOCKPROOF_LOG_DIR = dir;
  process.env.STOCKPROOF_CALLER = "test";
  process.env.STOCKPROOF_ENV = "ci";
});

afterEach(async () => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  for (const key of ENV_KEYS) {
    if (savedEnv[key] === undefined) delete process.env[key];
    else process.env[key] = savedEnv[key];
  }
  await rm(dir, { recursive: true, force: true });
});

describe("binanceRequest", () => {
  it("anota una llamada que sale bien con todos los campos y devuelve la respuesta sin cambios", async () => {
    const original = Response.json({ price: "181.20", wrapper: "bstocks" });
    stubFetch(original);

    const returned = await binanceRequest({
      api: "rwa",
      url: URL_QUOTE,
      method: "POST",
      params: { symbol: "NVDA", amount: 200 },
      context: { ticker: "NVDA", amountUsd: 200, side: "buy", wrapper: "bstocks", purpose: "q2" },
    });

    expect(returned).toBe(original);
    expect(await returned.json()).toEqual({ price: "181.20", wrapper: "bstocks" });

    const [entry] = await readLines();
    expect(Object.keys(entry).sort()).toEqual(
      [
        "ts",
        "caller",
        "env",
        "api",
        "endpoint",
        "method",
        "params",
        "context",
        "status",
        "ok",
        "durationMs",
        "error",
        "response",
      ].sort(),
    );
    expect(entry).toMatchObject({
      caller: "test",
      env: "ci",
      api: "rwa",
      endpoint: "/sapi/v1/rwa/quote",
      method: "POST",
      params: { symbol: "NVDA", amount: 200 },
      context: { ticker: "NVDA", amountUsd: 200, side: "buy", wrapper: "bstocks", purpose: "q2" },
      status: 200,
      ok: true,
      error: null,
      response: { body: { price: "181.20", wrapper: "bstocks" }, truncated: false },
    });
    expect(new Date(entry.ts).toISOString()).toBe(entry.ts);
    expect(entry.durationMs).toBeGreaterThanOrEqual(0);
  });

  it("anota un error HTTP y quien llama recibe la misma respuesta con el error", async () => {
    stubFetch(Response.json({ code: -1003, msg: "Too many requests" }, { status: 429 }));

    const returned = await binanceRequest({ api: "market", url: URL_QUOTE });

    expect(returned.status).toBe(429);
    expect(await returned.json()).toEqual({ code: -1003, msg: "Too many requests" });
    const [entry] = await readLines();
    expect(entry).toMatchObject({ ok: false, status: 429, error: "HTTP 429", method: "GET" });
  });

  it("anota una falla de red y vuelve a lanzar el mismo error", async () => {
    const failure = new TypeError("fetch failed");
    stubFetch(failure);

    await expect(binanceRequest({ api: "market", url: URL_QUOTE })).rejects.toBe(failure);

    const [entry] = await readLines();
    expect(entry).toMatchObject({ status: null, ok: false, error: "fetch failed", response: null });
  });

  it("nunca anota la key, el secreto ni la firma", async () => {
    const fake = stubFetch(Response.json({ ok: true }));

    await binanceRequest({
      api: "trading",
      url: URL_QUOTE,
      headers: { "X-API-KEY": "clave-secreta" },
      params: {
        symbol: "NVDA",
        signature: "firma-secreta",
        apiKey: "clave-secreta",
        nested: { apiSecret: "secreto-anidado" },
      },
    });

    // La key sí viaja a Binance: el ocultamiento es solo del registro.
    expect(fake).toHaveBeenCalledWith(URL_QUOTE, expect.objectContaining({
      headers: { "X-API-KEY": "clave-secreta" },
    }));
    const text = await readFile(path.join(dir, "binance-calls-test.jsonl"), "utf8");
    expect(text).not.toContain("clave-secreta");
    expect(text).not.toContain("firma-secreta");
    expect(text).not.toContain("secreto-anidado");
    const [entry] = await readLines();
    expect(entry.params).toEqual({
      symbol: "NVDA",
      signature: "[oculto]",
      apiKey: "[oculto]",
      nested: { apiSecret: "[oculto]" },
    });
  });

  it("devuelve la respuesta aunque el registro no se pueda escribir", async () => {
    const notADir = path.join(dir, "archivo-comun");
    await writeFile(notADir, "no soy una carpeta");
    process.env.STOCKPROOF_LOG_DIR = notADir;
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const original = Response.json({ price: "181.20" });
    stubFetch(original);

    const returned = await binanceRequest({ api: "rwa", url: URL_QUOTE });

    expect(returned).toBe(original);
    expect(console.warn).toHaveBeenCalledOnce();
  });

  it("sin STOCKPROOF_CALLER anota «desconocido» en su propio archivo", async () => {
    delete process.env.STOCKPROOF_CALLER;
    stubFetch(Response.json({}));

    await binanceRequest({ api: "rwa", url: URL_QUOTE });

    expect(await readdir(dir)).toEqual(["binance-calls-desconocido.jsonl"]);
    const [entry] = await readLines("desconocido");
    expect(entry.caller).toBe("desconocido");
  });

  it("dos llamadas seguidas dejan dos líneas en orden, cada una JSON válido", async () => {
    stubFetch(Response.json({ n: 1 }), Response.json({ n: 2 }));

    await binanceRequest({ api: "rwa", url: URL_QUOTE, context: { purpose: "primera" } });
    await binanceRequest({ api: "rwa", url: URL_QUOTE, context: { purpose: "segunda" } });

    const raw = (await readFile(path.join(dir, "binance-calls-test.jsonl"), "utf8"))
      .split("\n")
      .filter(Boolean);
    expect(raw).toHaveLength(2);
    expect(raw.map((l) => (JSON.parse(l) as CallLogEntry).context.purpose)).toEqual([
      "primera",
      "segunda",
    ]);
  });

  it("recorta a 20 KB una respuesta grande y la marca como cortada", async () => {
    const big = JSON.stringify({ rows: "x".repeat(30 * 1024) });
    stubFetch(new Response(big, { status: 200 }));

    const returned = await binanceRequest({ api: "rwa", url: URL_QUOTE });

    expect(await returned.text()).toBe(big);
    const [entry] = await readLines();
    expect(entry.response?.truncated).toBe(true);
    expect(typeof entry.response?.body).toBe("string");
    expect(Buffer.byteLength(entry.response?.body as string, "utf8")).toBe(20 * 1024);
  });

  it("guarda como texto una respuesta que no es JSON", async () => {
    const html = "<html><body>502 Bad Gateway</body></html>";
    stubFetch(new Response(html, { status: 502 }));

    await binanceRequest({ api: "rwa", url: URL_QUOTE });

    const [entry] = await readLines();
    expect(entry.response).toEqual({ body: html, truncated: false });
    expect(entry).toMatchObject({ ok: false, status: 502 });
  });

  it("guarda evaluationId, referencePriceAt y txHash tal como llegan", async () => {
    stubFetch(Response.json({}), Response.json({}), Response.json({}));
    const evaluationId = newEvaluationId();
    const referencePriceAt = "2026-09-25T20:00:00.000Z";
    const txHash = "0xabc123";

    await binanceRequest({
      api: "rwa",
      url: URL_QUOTE,
      context: { evaluationId, wrapper: "bstocks", referencePriceAt },
    });
    await binanceRequest({ api: "rwa", url: URL_QUOTE, context: { evaluationId, wrapper: "ondo" } });
    await binanceRequest({
      api: "transaction",
      url: URL_QUOTE,
      context: { evaluationId, wrapper: "xstocks", txHash },
    });

    const entries = await readLines();
    expect(entries.map((e) => e.context.evaluationId)).toEqual([
      evaluationId,
      evaluationId,
      evaluationId,
    ]);
    expect(entries.map((e) => e.context.wrapper)).toEqual(["bstocks", "ondo", "xstocks"]);
    expect(entries[0].context.referencePriceAt).toBe(referencePriceAt);
    expect(entries[2].context.txHash).toBe(txHash);
  });
});

describe("binanceRequest: casos de la revisión", () => {
  it("anota params con referencias circulares sin romper la llamada", async () => {
    const original = Response.json({ ok: true });
    stubFetch(original);
    const params: Record<string, unknown> = { symbol: "NVDA" };
    params.self = params;

    const returned = await binanceRequest({ api: "rwa", url: URL_QUOTE, params });

    expect(returned).toBe(original);
    const [entry] = await readLines();
    expect(entry.params).toEqual({ symbol: "NVDA", self: "[circular]" });
  });

  it("con params circulares y falla de red, relanza el error original", async () => {
    const failure = new TypeError("fetch failed");
    stubFetch(failure);
    const params: Record<string, unknown> = {};
    params.self = params;

    await expect(binanceRequest({ api: "rwa", url: URL_QUOTE, params })).rejects.toBe(failure);
  });

  it("al recortar conserva un «\uFFFD» que venía completo en la respuesta", async () => {
    const text = "a".repeat(20 * 1024 - 3) + "\uFFFD" + "b".repeat(100);
    stubFetch(new Response(text));

    await binanceRequest({ api: "rwa", url: URL_QUOTE });

    const [entry] = await readLines();
    expect(entry.response?.body).toBe("a".repeat(20 * 1024 - 3) + "\uFFFD");
  });

  it("al recortar no deja un carácter UTF-8 a medias", async () => {
    // «ñ» ocupa 2 bytes: el límite cae entre sus dos bytes.
    const text = "a".repeat(20 * 1024 - 1) + "ñ" + "b".repeat(100);
    stubFetch(new Response(text));

    await binanceRequest({ api: "rwa", url: URL_QUOTE });

    const [entry] = await readLines();
    expect(entry.response?.body).toBe("a".repeat(20 * 1024 - 1));
    expect(entry.response?.truncated).toBe(true);
  });

  it("tapa en la respuesta la key y la firma si Binance las repite", async () => {
    const echoed = { msg: "firma inválida", apiKey: "clave-secreta", got: "firma-secreta" };
    const original = Response.json(echoed, { status: 400 });
    stubFetch(original);

    const returned = await binanceRequest({
      api: "trading",
      url: `${URL_QUOTE}&signature=firma-secreta`,
      headers: { "X-MBX-APIKEY": "clave-secreta" },
    });

    // Quien llama recibe la respuesta intacta; solo el registro la tapa.
    expect(await returned.json()).toEqual(echoed);
    const text = await readFile(path.join(dir, "binance-calls-test.jsonl"), "utf8");
    expect(text).not.toContain("clave-secreta");
    expect(text).not.toContain("firma-secreta");
    const [entry] = await readLines();
    expect(entry.response?.body).toEqual({
      msg: "firma inválida",
      apiKey: "[oculto]",
      got: "[oculto]",
    });
  });

  it("no manda la key a un host que no es de Binance, y anota el rechazo", async () => {
    const fake = stubFetch(Response.json({}));

    for (const url of [
      "https://evil.example/api/v3/ticker/price",
      "https://binance.com.evil.example/x",
      "http://api.binance.com/api/v3/ticker/price",
    ]) {
      await expect(
        binanceRequest({ api: "market", url, headers: { "X-MBX-APIKEY": "clave-secreta" } }),
      ).rejects.toThrow("host no permitido");
    }

    expect(fake).not.toHaveBeenCalled();
    const entries = await readLines();
    expect(entries).toHaveLength(3);
    expect(entries.every((e) => e.status === null && e.ok === false)).toBe(true);
  });
});

describe("newEvaluationId", () => {
  it("devuelve un identificador distinto en cada llamada", () => {
    expect(newEvaluationId()).not.toBe(newEvaluationId());
  });
});
