import { describe, expect, it } from "vitest";
import type { PublicToken } from "@/lib/binance/rwa-public";
import { buildEvaluateInput, type InputDeps, type InputSources } from "@/lib/evaluation-input";
import type { Quote } from "@/lib/evaluate";
import type { Q1Sources } from "@/lib/questions/q1";

const NVDAB = "0x02fca66c1d1afb4e2a7884261eb00f63598a7436";
const NVDAON = "0xa9ee28c80f960b889dfbd1902055218cba016f75";
const NVDAX = "0xc845b2894dbddd03858fd2d643b4ef725fe0849d";

const token = (wrapper: PublicToken["wrapper"], contractAddress: string): PublicToken => ({
  chainId: "56",
  contractAddress,
  symbol: `NVDA-${wrapper}`,
  ticker: "NVDA",
  wrapper,
  multiplier: 1,
  spotPair: null,
});

const LIST: PublicToken[] = [token("bstocks", NVDAB), token("ondo", NVDAON), token("xstocks", NVDAX)];

const OK_SOURCES: Q1Sources = {
  search: async () => [
    {
      ticker: "NVDA",
      assets: [
        { platformId: "bstock", binanceChainId: "56", tokenContractAddress: NVDAB, tokenSymbol: "NVDAB" },
        { platformId: "ondo", binanceChainId: "56", tokenContractAddress: NVDAON, tokenSymbol: "NVDAon" },
        { platformId: "xstocks", binanceChainId: "56", tokenContractAddress: NVDAX, tokenSymbol: "NVDAx" },
      ],
    },
  ],
  profile: async () => ({ attestations: [{ name: "daily", supported: true, url: "https://x.test/r.pdf" }] }),
  standard: async () => true,
};

function sources(overrides: Partial<InputSources> = {}): Partial<InputSources> {
  return {
    listTokens: async () => LIST,
    q1: OK_SOURCES,
    quote: async (_f, _t, _a, wrapper) =>
      ({ impactRatio: wrapper === "bstocks" ? 0.003 : 0.008, toAmount: 1 }),
    dynamic: async () => ({
      tokenPriceUsd: 229.7,
      sharesMultiplier: 1.0008,
      stockPriceUsd: 229.5,
      openState: true,
    }),
    marketStatus: async () => ({ marketStatus: "open", nextOpenAt: "2026-09-29T13:30:00Z", nextCloseAt: "" }),
    ...overrides,
  };
}

const withSign: InputDeps = { sign: async () => ({}), rpcUrl: "https://rpc.test" };

describe("buildEvaluateInput", () => {
  it("entrada inválida: devuelve lo mínimo y no consulta fuentes", async () => {
    let called = false;
    const deps: InputDeps = {
      ...withSign,
      overrides: { listTokens: async () => ((called = true), LIST) },
    };
    const input = await buildEvaluateInput({ ticker: "", amountUsd: 200 }, deps);
    expect(input.quotes).toBe("unavailable");
    expect(called).toBe(false);
  });

  it("modo público (sin sign): cotizaciones unavailable y la pregunta 1 sí corre", async () => {
    const input = await buildEvaluateInput(
      { ticker: "NVDA", amountUsd: 200, address: NVDAB },
      { sign: null, overrides: sources() },
    );
    expect(input.quotes).toBe("unavailable");
    expect(input.target).toEqual({ address: NVDAB, check: { ok: true } });
  });

  it("impostor: la pregunta 1 corta con la dirección revisada", async () => {
    const impostor = "0x000000000000000000000000000000000000dead";
    const input = await buildEvaluateInput(
      { ticker: "NVDA", amountUsd: 200, address: impostor },
      { sign: null, overrides: sources() },
    );
    expect(input.target?.address).toBe(impostor);
    expect(input.target?.check).toEqual({ ok: false, reason: "CONTRACT_NOT_LISTED" });
  });

  it("con sign arma las tres cotizaciones con autenticidad y orden estable", async () => {
    const input = await buildEvaluateInput(
      { ticker: "nvda", amountUsd: 200 },
      { ...withSign, overrides: sources() },
    );
    expect(Array.isArray(input.quotes)).toBe(true);
    const quotes = input.quotes as Quote[];
    expect(quotes.map((q) => q.wrapper)).toEqual(["bstocks", "ondo", "xstocks"]);
    const bstocks = quotes[0];
    expect(bstocks.impactRatio).toBeCloseTo(0.003);
    expect(bstocks.simulatedCostUsd).toBeCloseTo(200.6);
    expect(bstocks.authenticity).toEqual({ ok: true });
    expect(bstocks.side).toBe("buy");
  });

  it("falta un emisor para el ticker → cotizaciones unavailable", async () => {
    const input = await buildEvaluateInput(
      { ticker: "NVDA", amountUsd: 200 },
      {
        ...withSign,
        overrides: sources({ listTokens: async () => LIST.filter((t) => t.wrapper !== "ondo") }),
      },
    );
    expect(input.quotes).toBe("unavailable");
  });

  it("reference y regime reflejan los datos públicos del token de bStocks", async () => {
    const input = await buildEvaluateInput(
      { ticker: "NVDA", amountUsd: 200 },
      { ...withSign, overrides: sources() },
    );
    expect(input.reference).toEqual({
      referenceUsd: 229.5,
      poolUsd: 229.7,
      multiplierNote: "multiplier",
    });
    expect(input.regime).toEqual({ marketStatus: "open", nextOpenAt: "2026-09-29T13:30:00Z" });
  });

  it("mercado cerrado sin precio del subyacente → reference unavailable", async () => {
    const input = await buildEvaluateInput(
      { ticker: "NVDA", amountUsd: 200 },
      {
        ...withSign,
        overrides: sources({
          dynamic: async () => ({
            tokenPriceUsd: 229.7,
            sharesMultiplier: 1,
            stockPriceUsd: null,
            openState: false,
          }),
        }),
      },
    );
    expect(input.reference).toBe("unavailable");
  });

  it("exit queda unavailable en esta ventana", async () => {
    const input = await buildEvaluateInput(
      { ticker: "NVDA", amountUsd: 200 },
      { ...withSign, overrides: sources() },
    );
    expect(input.exit).toBe("unavailable");
  });
});
