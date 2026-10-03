import { describe, expect, it, vi } from "vitest";
import type { PublicToken } from "@/lib/binance/rwa-public";
import { toMinimalUnits } from "@/lib/binance/trading";
import {
  buildEvaluateInput,
  realInputDeps,
  type InputDeps,
  type InputSources,
} from "@/lib/evaluation-input";
import type { Quote, WrapperExit } from "@/lib/evaluate";
import { BSTOCKS_REDEMPTION_VENUE } from "@/lib/questions/exit-availability";
import type { Q1Sources } from "@/lib/questions/q1";
import type { Q3Input } from "@/lib/questions/q3";

const NVDAB = "0x02fca66c1d1afb4e2a7884261eb00f63598a7436";
const NVDAON = "0xa9ee28c80f960b889dfbd1902055218cba016f75";
const NVDAX = "0xc845b2894dbddd03858fd2d643b4ef725fe0849d";

const CONTRACT_OF: Record<string, string> = {
  bstocks: NVDAB,
  ondo: NVDAON,
  xstocks: NVDAX,
};

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

/** Cantidad de token que cada compra devolvió (wei del token del wrapper). */
const TO_TOKEN_AMOUNT: Record<string, string> = {
  bstocks: "873263851190316305",
  ondo: "871000000000000000",
  xstocks: "869000000000000000",
};

function sources(overrides: Partial<InputSources> = {}): Partial<InputSources> {
  return {
    listTokens: async () => LIST,
    q1: OK_SOURCES,
    quote: async (_f, _t, _a, wrapper) => ({
      impactRatio: wrapper === "bstocks" ? 0.003 : 0.008,
      toAmount: 0.87,
      toTokenAmount: TO_TOKEN_AMOUNT[wrapper],
    }),
    dynamic: async () => ({
      tokenPriceUsd: 229.7,
      sharesMultiplier: 1.0008,
      stockPriceUsd: 229.5,
      openState: true,
    }),
    marketStatus: async () => ({
      marketStatus: "open",
      nextOpenAt: "2026-09-29T13:30:00Z",
      nextCloseAt: "",
    }),
    exitNow: async () => ({
      recoveredUsd: 199,
      costRatio: 0.004,
      simulatedAt: "2026-09-28T12:00:05Z",
    }),
    exitAvailability: async () => "unavailable",
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
    expect(input.exits).toBeUndefined();
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
    expect(input.quoteGaps).toBeUndefined();
  });

  it("un wrapper sin contrato listado queda NOT_LISTED y no se cotiza ni se le pide la venta", async () => {
    const quote = vi.fn<InputSources["quote"]>(async (_f, _t, _a, wrapper) => ({
      impactRatio: wrapper === "bstocks" ? 0.003 : 0.008,
      toAmount: 0.87,
      toTokenAmount: TO_TOKEN_AMOUNT[wrapper],
    }));
    const exitNow = vi.fn<InputSources["exitNow"]>(async () => "unavailable");
    const exitAvailability = vi.fn<InputSources["exitAvailability"]>(async () => "unavailable");
    const input = await buildEvaluateInput(
      { ticker: "NVDA", amountUsd: 200 },
      {
        ...withSign,
        overrides: sources({
          listTokens: async () => LIST.filter((t) => t.wrapper !== "ondo"),
          quote,
          exitNow,
          exitAvailability,
        }),
      },
    );

    // Ondo no tiene contrato: ni se llamó al venue ni a la venta. El resto cotiza igual.
    expect(quote.mock.calls.map((call) => call[3])).toEqual(["bstocks", "xstocks"]);
    expect(exitNow.mock.calls.map((call) => call[0].wrapper)).toEqual(["bstocks", "xstocks"]);
    expect(exitAvailability.mock.calls.map((call) => call[0])).toEqual(["bstocks", "xstocks"]);
    expect((input.quotes as Quote[]).map((q) => q.wrapper)).toEqual(["bstocks", "xstocks"]);
    expect(input.quoteGaps).toEqual([{ wrapper: "ondo", reason: "NOT_LISTED" }]);
  });

  it("un venue sin quote queda NO_QUOTE y su contrato no se evalúa ni se le pide la venta", async () => {
    const search = vi.fn(OK_SOURCES.search);
    const profile = vi.fn(OK_SOURCES.profile);
    const exitNow = vi.fn<InputSources["exitNow"]>(async () => "unavailable");
    const input = await buildEvaluateInput(
      { ticker: "NVDA", amountUsd: 200 },
      {
        ...withSign,
        overrides: sources({
          quote: async (_f, _t, _a, wrapper) =>
            wrapper === "ondo"
              ? "unavailable"
              : { impactRatio: 0.003, toAmount: 0.87, toTokenAmount: TO_TOKEN_AMOUNT[wrapper] },
          exitNow,
          q1: { ...OK_SOURCES, search, profile },
        }),
      },
    );

    expect((input.quotes as Quote[]).map((q) => q.wrapper)).toEqual(["bstocks", "xstocks"]);
    expect(input.quoteGaps).toEqual([{ wrapper: "ondo", reason: "NO_QUOTE" }]);
    // La venta se pide solo por las compras que llegaron.
    expect(exitNow.mock.calls.map((call) => call[0].wrapper)).toEqual(["bstocks", "xstocks"]);
    // La pregunta 1 corrió solo para bStocks (xStocks no tiene lista oficial; Ondo sin ruta).
    expect(search).toHaveBeenCalledTimes(1);
    expect(profile.mock.calls.map((call) => call[1])).toEqual([NVDAB]);
  });

  it("ningún venue cotiza → quotes unavailable con los tres gaps y sin salidas", async () => {
    const input = await buildEvaluateInput(
      { ticker: "NVDA", amountUsd: 200 },
      { ...withSign, overrides: sources({ quote: async () => "unavailable" }) },
    );

    expect(input.quotes).toBe("unavailable");
    expect(input.exits).toBeUndefined();
    expect(input.quoteGaps).toEqual([
      { wrapper: "bstocks", reason: "NO_QUOTE" },
      { wrapper: "ondo", reason: "NO_QUOTE" },
      { wrapper: "xstocks", reason: "NO_QUOTE" },
    ]);
  });

  it("el quote recibe el monto en unidades mínimas de USDT, sin floats", async () => {
    const quote = vi.fn<InputSources["quote"]>(async (_f, _t, _a, wrapper) => ({
      impactRatio: 0.003,
      toAmount: 0.87,
      toTokenAmount: TO_TOKEN_AMOUNT[wrapper],
    }));
    const deps = { ...withSign, overrides: sources({ quote }) };

    await buildEvaluateInput({ ticker: "NVDA", amountUsd: 200 }, deps);
    expect(quote.mock.calls[0][2]).toBe("200000000000000000000");

    await buildEvaluateInput({ ticker: "NVDA", amountUsd: 5.5 }, deps);
    expect(quote.mock.calls[3][2]).toBe("5500000000000000000");
  });

  it("la venta se cotiza por cada compra con el toTokenAmount real y la wallet del agente", async () => {
    const exitNow = vi.fn<InputSources["exitNow"]>(async () => ({
      recoveredUsd: 199,
      costRatio: 0.004,
      simulatedAt: "2026-09-28T12:00:05Z",
    }));
    const deps: InputDeps = {
      ...withSign,
      walletAddress: "0xAGENTE",
      overrides: sources({ exitNow }),
    };
    const input = await buildEvaluateInput({ ticker: "NVDA", amountUsd: 200 }, deps);

    for (const [args] of exitNow.mock.calls) {
      expect(args.amount).toBe(TO_TOKEN_AMOUNT[args.wrapper]);
      expect(args.tokenAddress).toBe(CONTRACT_OF[args.wrapper]);
      expect(args.walletAddress).toBe("0xAGENTE");
    }
    // Las salidas viajan por wrapper, sin decidir: la compuerta es de `evaluate`.
    const exits = input.exits as WrapperExit[];
    expect(exits.map((exit) => exit.wrapper)).toEqual(["bstocks", "ondo", "xstocks"]);
    for (const exit of exits) {
      expect(exit.now).toEqual({
        recoveredUsd: 199,
        costRatio: 0.004,
        simulatedAt: "2026-09-28T12:00:05Z",
      });
    }
  });

  it("reenvía el tope de la frase y no lo inventa si no vino", async () => {
    const withCap = await buildEvaluateInput(
      { ticker: "NVDA", amountUsd: 200, maxImpactRatio: 0.005 },
      { ...withSign, overrides: sources() },
    );
    expect(withCap.constraints).toEqual({ maxImpactRatio: 0.005 });

    const without = await buildEvaluateInput(
      { ticker: "NVDA", amountUsd: 200 },
      { ...withSign, overrides: sources() },
    );
    expect(without.constraints).toBeUndefined();
  });

  it.each([0, -0.01, Number.NaN, Number.POSITIVE_INFINITY])(
    "un tope %s no es un número finito mayor a cero: no se reenvía",
    async (maxImpactRatio) => {
      const input = await buildEvaluateInput(
        { ticker: "NVDA", amountUsd: 200, maxImpactRatio },
        { ...withSign, overrides: sources() },
      );
      expect(input.constraints).toBeUndefined();
    },
  );

  it("la venta que no cotiza queda «sin dato» en la salida, no se inventa un número", async () => {
    const input = await buildEvaluateInput(
      { ticker: "NVDA", amountUsd: 200 },
      {
        ...withSign,
        overrides: sources({
          exitNow: async (args) =>
            args.wrapper === "ondo"
              ? "unavailable"
              : { recoveredUsd: 199, costRatio: 0.004, simulatedAt: "2026-09-28T12:00:05Z" },
        }),
      },
    );

    const exits = input.exits as WrapperExit[];
    expect(exits.find((exit) => exit.wrapper === "ondo")?.now).toBe("unavailable");
    expect(exits.find((exit) => exit.wrapper === "bstocks")?.now).toMatchObject({
      costRatio: 0.004,
    });
  });

  it("una venta que lanza error queda «sin dato» y no tumba las demás", async () => {
    const input = await buildEvaluateInput(
      { ticker: "NVDA", amountUsd: 200 },
      {
        ...withSign,
        overrides: sources({
          exitNow: async (args) => {
            if (args.wrapper === "ondo") throw new Error("red caída");
            return { recoveredUsd: 199, costRatio: 0.004, simulatedAt: "2026-09-28T12:00:05Z" };
          },
        }),
      },
    );

    const exits = input.exits as WrapperExit[];
    expect(exits.find((exit) => exit.wrapper === "ondo")?.now).toBe("unavailable");
    expect(exits.find((exit) => exit.wrapper === "bstocks")?.now).toMatchObject({
      costRatio: 0.004,
    });
  });

  it("la disponibilidad de salida se arma por wrapper con las reglas publicadas", async () => {
    // Sin override de exitAvailability: usa la real (`buildExitAvailability`) con la
    // misma lectura de mercado que la pregunta 4, memoizada en una sola llamada.
    const marketStatus = vi.fn(async () => ({
      marketStatus: "closed" as const,
      nextOpenAt: "2026-09-29T13:30:00Z",
      nextCloseAt: "unavailable" as const,
    }));
    const overrides = sources({ marketStatus });
    delete overrides.exitAvailability;
    const input = await buildEvaluateInput(
      { ticker: "NVDA", amountUsd: 200 },
      { ...withSign, overrides },
    );

    const exits = input.exits as WrapperExit[];
    const bstocks = exits.find((exit) => exit.wrapper === "bstocks");
    expect(bstocks?.availability).toMatchObject({
      marketStatus: "closed",
      nextOpenAt: "2026-09-29T13:30:00Z",
      mintRedeemHours: "unavailable",
      redemptionVenue: BSTOCKS_REDEMPTION_VENUE,
    });
    // Sin regla publicada del emisor, el canje de Ondo queda «sin dato».
    expect(exits.find((exit) => exit.wrapper === "ondo")?.availability).toMatchObject({
      redemptionVenue: "unavailable",
    });
    // Una sola lectura del estado de mercado alimentó la pregunta 4 y las tres salidas.
    expect(marketStatus).toHaveBeenCalledTimes(1);
  });

  it("los precios de la pregunta 3 entran crudos por wrapper, sin decidir el desvío", async () => {
    const dynamic = vi.fn<InputSources["dynamic"]>(async (address) => ({
      tokenPriceUsd: address === NVDAON ? 245 : 229.7,
      sharesMultiplier: address === NVDAON ? "unavailable" : 1.0008,
      stockPriceUsd: 229.5,
      openState: true,
    }));
    const input = await buildEvaluateInput(
      { ticker: "NVDA", amountUsd: 200 },
      { ...withSign, overrides: sources({ dynamic }) },
    );

    const reference = input.reference as Q3Input[];
    expect(reference.map((entry) => entry.wrapper)).toEqual(["bstocks", "ondo", "xstocks"]);
    expect(reference.find((entry) => entry.wrapper === "bstocks")).toEqual({
      wrapper: "bstocks",
      tokenPriceUsd: 229.7,
      referenceUsd: 229.5,
      sharesMultiplier: 1.0008,
    });
    // Ondo trae su propio precio y su ausencia de multiplicador: `evaluate` decide.
    expect(reference.find((entry) => entry.wrapper === "ondo")).toEqual({
      wrapper: "ondo",
      tokenPriceUsd: 245,
      referenceUsd: 229.5,
      sharesMultiplier: "unavailable",
    });
    // Se consultó el dynamic de cada wrapper que cotizó.
    expect(dynamic.mock.calls.map((call) => call[0])).toEqual([NVDAB, NVDAON, NVDAX]);
  });

  it("el subyacente fuera de rueda (null) entra crudo: la pregunta 3 lo declara sin dato", async () => {
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

    const reference = input.reference as Q3Input[];
    expect(reference[0]).toMatchObject({ tokenPriceUsd: 229.7, referenceUsd: null });
  });

  it("el régimen entra crudo: estado de mercado y próxima apertura, sin acuerdo de pools", async () => {
    const input = await buildEvaluateInput(
      { ticker: "NVDA", amountUsd: 200 },
      { ...withSign, overrides: sources() },
    );
    expect(input.regime).toEqual({
      marketStatus: "open",
      nextOpenAt: "2026-09-29T13:30:00Z",
    });
    // Sin fuente de pools todavía: el campo ni se declara, `decideQuestion4` decide.
    expect(input.regime).not.toHaveProperty("poolsAgree");
    expect(input.regime).not.toHaveProperty("poolsDiffRatio");
  });

  it("sin estado de mercado el régimen queda «sin dato»", async () => {
    const input = await buildEvaluateInput(
      { ticker: "NVDA", amountUsd: 200 },
      {
        ...withSign,
        overrides: sources({
          marketStatus: async () => ({
            marketStatus: "unavailable" as const,
            nextOpenAt: "unavailable" as const,
            nextCloseAt: "unavailable" as const,
          }),
        }),
      },
    );
    expect(input.regime).toBe("unavailable");
  });
});

describe("toMinimalUnits", () => {
  it("convierte a unidades mínimas con aritmética exacta y trunca el exceso", () => {
    expect(toMinimalUnits(200, 18)).toBe("200000000000000000000");
    expect(toMinimalUnits(5.5, 18)).toBe("5500000000000000000");
    expect(toMinimalUnits(0.1, 18)).toBe("100000000000000000");
    // 19 decimales de fracción exceden los 18 del token: se trunca a cero, no redondea.
    expect(toMinimalUnits(1.9e-19, 18)).toBe("0");
    expect(toMinimalUnits(123456789, 6)).toBe("123456789000000");
  });
});

describe("realInputDeps", () => {
  it("lee AGENT_WALLET_ADDRESS recortada; vacía o ausente queda undefined", () => {
    const env = { ...process.env };
    delete env.AGENT_WALLET_ADDRESS;
    expect(
      realInputDeps({ ...env, AGENT_WALLET_ADDRESS: "  0xAgente " }).walletAddress,
    ).toBe("0xAgente");
    expect(realInputDeps(env).walletAddress).toBeUndefined();
    expect(realInputDeps({ ...env, AGENT_WALLET_ADDRESS: "   " }).walletAddress).toBeUndefined();
  });
});
