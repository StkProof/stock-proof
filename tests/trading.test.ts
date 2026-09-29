import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getAggregatedQuote, USDT_BSC } from "@/lib/binance/trading";
import type { SignRequest } from "@/lib/binance/rwa";

const NVDAB = "0x02fca66c1d1afb4e2a7884261eb00f63598a7436";

const sign: SignRequest = async () => ({ "X-OC-APIKEY": "k", "X-OC-SIGN": "s", "X-OC-TIMESTAMP": "t" });
const deps = { sign };

function json(data: unknown, code: number | string = 0): Response {
  return new Response(JSON.stringify({ code, data }), { status: 200 });
}

let dir: string;
let fetchSpy: ReturnType<typeof vi.fn>;

beforeEach(async () => {
  dir = await mkdtemp(path.join(tmpdir(), "trading-"));
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

describe("getAggregatedQuote", () => {
  it("firma la ruta /build con la query y elige la cotización de menor impacto", async () => {
    fetchSpy.mockResolvedValue(
      json([
        { quoteId: "q1", vendorName: "lento", fromTokenAmount: "200", toTokenAmount: "0.86", priceImpactPercent: "0.9" },
        { quoteId: "q2", vendorName: "rapido", fromTokenAmount: "200", toTokenAmount: "0.87", priceImpactPercent: "0.3" },
      ]),
    );
    const signed: SignRequest = vi.fn(async () => ({}));
    const quote = await getAggregatedQuote(
      { fromTokenAddress: USDT_BSC, toTokenAddress: NVDAB, amount: "200", wrapper: "bstocks" },
      { sign: signed },
    );
    expect(quote).toEqual({
      impactRatio: expect.closeTo(0.003),
      toAmount: 0.87,
      vendor: "rapido",
      quoteId: "q2",
    });
    const [method, requestPath] = (signed as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(method).toBe("GET");
    expect(requestPath).toContain("/build/api/v1/dex/aggregator/quote?");
    expect(requestPath).toContain("binanceChainId=56");
    expect(requestPath).toContain("amount=200");
    expect(fetchSpy.mock.calls[0][0]).toContain("https://web3.binance.com/build/api/v1/dex/aggregator/quote");
  });

  it("manda userWalletAddress en el query firmado solo cuando viene walletAddress", async () => {
    fetchSpy.mockResolvedValue(json([{ toTokenAmount: "1", priceImpactPercent: "0.1" }]));
    const signed: SignRequest = vi.fn(async () => ({}));

    await getAggregatedQuote(
      {
        fromTokenAddress: USDT_BSC,
        toTokenAddress: NVDAB,
        amount: "200000000000000000000",
        walletAddress: "0xAGENTE",
      },
      { sign: signed },
    );
    const [, conWallet] = (signed as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(conWallet).toContain("userWalletAddress=0xAGENTE");
    expect(fetchSpy.mock.calls[0][0]).toContain("userWalletAddress=0xAGENTE");

    // Sin wallet (o vacía) el parámetro no aparece ni en la firma ni en la URL.
    await getAggregatedQuote(
      { fromTokenAddress: USDT_BSC, toTokenAddress: NVDAB, amount: "200000000000000000000" },
      { sign: signed },
    );
    const [, sinWallet] = (signed as ReturnType<typeof vi.fn>).mock.calls[1];
    expect(sinWallet).not.toContain("userWalletAddress");
    expect(fetchSpy.mock.calls[1][0]).not.toContain("userWalletAddress");

    await getAggregatedQuote(
      { fromTokenAddress: USDT_BSC, toTokenAddress: NVDAB, amount: "1", walletAddress: "   " },
      { sign: signed },
    );
    const [, vacia] = (signed as ReturnType<typeof vi.fn>).mock.calls[2];
    expect(vacia).not.toContain("userWalletAddress");
  });

  it("sin priceImpactPercent legible → unavailable; sin data en lista → unavailable", async () => {
    fetchSpy.mockResolvedValue(json([{ vendorName: "x", toTokenAmount: "0.8" }]));
    expect(
      await getAggregatedQuote({ fromTokenAddress: USDT_BSC, toTokenAddress: NVDAB, amount: "200" }, deps),
    ).toBe("unavailable");

    fetchSpy.mockResolvedValue(json({ quoteId: "no-es-lista" }));
    expect(
      await getAggregatedQuote({ fromTokenAddress: USDT_BSC, toTokenAddress: NVDAB, amount: "200" }, deps),
    ).toBe("unavailable");
  });

  it("error HTTP, code distinto de 0 y red caída → unavailable", async () => {
    fetchSpy.mockResolvedValue(new Response("nope", { status: 500 }));
    expect(
      await getAggregatedQuote({ fromTokenAddress: USDT_BSC, toTokenAddress: NVDAB, amount: "200" }, deps),
    ).toBe("unavailable");

    fetchSpy.mockResolvedValue(json([], 40101));
    expect(
      await getAggregatedQuote({ fromTokenAddress: USDT_BSC, toTokenAddress: NVDAB, amount: "200" }, deps),
    ).toBe("unavailable");

    fetchSpy.mockRejectedValue(new Error("dns"));
    expect(
      await getAggregatedQuote({ fromTokenAddress: USDT_BSC, toTokenAddress: NVDAB, amount: "200" }, deps),
    ).toBe("unavailable");
  });
});
