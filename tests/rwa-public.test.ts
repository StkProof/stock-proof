import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  getMarketStatus,
  getTokenDynamic,
  getTokenMeta,
  listStockTokens,
  publicQ1Sources,
} from "@/lib/binance/rwa-public";

const NVDAB = "0x02fca66c1d1afb4e2a7884261eb00f63598a7436";

const LIST_DATA = [
  { chainId: "56", contractAddress: NVDAB, symbol: "NVDAB", ticker: "NVDA", type: 3, assetType: 1, multiplier: "1.000778223752807865", cs: "NVDABUSDT", d: 18 },
  { chainId: "56", contractAddress: "0xa9ee28c80f960b889dfbd1902055218cba016f75", symbol: "NVDAon", ticker: "NVDA", type: 1, assetType: 1, multiplier: "1.0017", d: 18 },
  { chainId: "1", contractAddress: "0x2d1f7226bd1f780af6b9a49dcc0ae00e8df4bdee", symbol: "NVDAon", ticker: "NVDA", type: 1, assetType: 1, multiplier: "1.0017", d: 18 },
  { chainId: "56", contractAddress: "0xc845b2894dbddd03858fd2d643b4ef725fe0849d", symbol: "NVDAx", ticker: "NVDA", type: 2, assetType: 1, multiplier: "1", d: 18 },
  { chainId: "56", contractAddress: "0x00c81d35eddf44c75d4db9e07bdcdc236eb0ebcf", symbol: "EEMon", ticker: "EEM", type: 1, assetType: 3, multiplier: "1.01", d: 18 },
];

function json(data: unknown): Response {
  return new Response(JSON.stringify({ code: "000000", success: true, data }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

let dir: string;
let fetchSpy: ReturnType<typeof vi.fn>;

beforeEach(async () => {
  dir = await mkdtemp(path.join(tmpdir(), "rwa-pub-"));
  process.env.STOCKPROOF_LOG_DIR = dir;
  process.env.STOCKPROOF_CALLER = "test";
  fetchSpy = vi.fn();
  vi.stubGlobal("fetch", fetchSpy);
});

afterEach(async () => {
  vi.unstubAllGlobals();
  delete process.env.STOCKPROOF_LOG_DIR;
  await rm(dir, { recursive: true, force: true });
});

describe("listStockTokens", () => {
  it("mapea type→wrapper, filtra a BSC y pasa por la puerta", async () => {
    fetchSpy.mockResolvedValue(json(LIST_DATA));
    const tokens = await listStockTokens();
    expect(tokens).not.toBe("unavailable");
    if (tokens === "unavailable") return;

    const nvda = tokens.filter((t) => t.ticker === "NVDA");
    expect(nvda.map((t) => t.wrapper).sort()).toEqual(["bstocks", "ondo", "xstocks"]);
    expect(nvda.every((t) => t.chainId === "56")).toBe(true);
    expect(nvda.find((t) => t.wrapper === "bstocks")?.spotPair).toBe("NVDABUSDT");
    expect(fetchSpy.mock.calls[0][0]).toContain("binance.com");
    const log = JSON.parse(
      (await readFile(path.join(dir, "binance-calls-test.jsonl"), "utf8")).trim().split("\n")[0],
    );
    expect(log.api).toBe("rwa");
  });

  it("code distinto de 000000 o forma rara → unavailable", async () => {
    fetchSpy.mockResolvedValue(new Response(JSON.stringify({ code: "999", success: false })));
    expect(await listStockTokens()).toBe("unavailable");
    fetchSpy.mockResolvedValue(json({ not: "a list" }));
    expect(await listStockTokens()).toBe("unavailable");
  });
});

describe("getTokenMeta", () => {
  it("las URLs de attestation se traducen a reportes soportados", async () => {
    fetchSpy.mockResolvedValue(
      json({
        symbol: "NVDAB",
        dailyAttestationReports: "https://www.binance.com/proof-of-collateral/bstocks",
        monthlyAttestationReports: "https://www.binance.com/proof-of-collateral/bstocks",
      }),
    );
    const profile = await getTokenMeta(NVDAB);
    expect(profile).toEqual({
      attestations: [
        { name: "dailyAttestationReports", supported: true, url: expect.stringContaining("binance.com") },
        { name: "monthlyAttestationReports", supported: true, url: expect.stringContaining("binance.com") },
      ],
    });
  });
});

describe("getTokenDynamic / getMarketStatus", () => {
  it("traduce precio del token, multiplicador y openState", async () => {
    fetchSpy.mockResolvedValue(
      json({
        tokenInfo: { price: "229.6986179157444611748", sharesMultiplier: "1.000778223752807865" },
        stockInfo: { price: null },
        statusInfo: { openState: true, reasonCode: "TRADING" },
      }),
    );
    const dynamic = await getTokenDynamic(NVDAB);
    expect(dynamic).toEqual({
      tokenPriceUsd: expect.closeTo(229.6986, 3),
      sharesMultiplier: expect.closeTo(1.00078, 4),
      stockPriceUsd: null,
      openState: true,
    });
  });

  it("estado global: openState y próximas aperturas", async () => {
    fetchSpy.mockResolvedValue(
      json({ marketStatus: "postmarket", openState: false, nextOpen: "2026-09-29T00:05:00Z", nextClose: "2026-09-28T23:59:00Z" }),
    );
    expect(await getMarketStatus()).toEqual({
      marketStatus: "closed",
      nextOpenAt: "2026-09-29T00:05:00Z",
      nextCloseAt: "2026-09-28T23:59:00Z",
    });
  });
});

describe("publicQ1Sources", () => {
  it("search agrupa por ticker y marca platformId como espera la decisión", async () => {
    fetchSpy.mockResolvedValue(json(LIST_DATA));
    const results = await publicQ1Sources().search("NVDA");
    expect(results).not.toBe("unavailable");
    if (results === "unavailable") return;
    const nvda = results.find((r) => r.ticker === "NVDA");
    expect(nvda?.assets.map((a) => a.platformId).sort()).toEqual(["bstock", "ondo", "xstocks"]);
    expect(nvda?.assets.map((a) => a.tokenContractAddress)).toContain(NVDAB);
  });

  it("profile consulta meta y standard va al nodo", async () => {
    fetchSpy.mockResolvedValue(json({ dailyAttestationReports: "https://x.test/r.pdf" }));
    const sources = publicQ1Sources({ rpcUrl: "https://rpc.test" });
    expect(await sources.profile("56", NVDAB)).toEqual({
      attestations: [{ name: "dailyAttestationReports", supported: true, url: "https://x.test/r.pdf" }],
    });
  });
});
