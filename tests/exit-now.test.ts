import { afterEach, describe, expect, it, vi } from "vitest";
import { getAggregatedQuote, USDT_BSC } from "@/lib/binance/trading";
import type { SignRequest } from "@/lib/binance/rwa";
import { IMPACT_LIMIT } from "@/lib/evaluate";
import { quoteExitNow } from "@/lib/questions/exit-now";

const NVDAB = "0x02fca66c1d1afb4e2a7884261eb00f63598a7436";

const sign: SignRequest = async () => ({});

afterEach(() => {
  vi.useRealTimers();
});

describe("quoteExitNow", () => {
  it("cotiza la venta del mismo monto: side sell y direcciones invertidas (token → USDT)", async () => {
    const quote = vi.fn<typeof getAggregatedQuote>(async () => ({
      impactRatio: 0.004,
      toAmount: 199_000_000_000_000_000_000,
      toTokenAmount: "199000000000000000000",
      vendor: "LiquidMesh",
      quoteId: "q1",
    }));
    const context = { ticker: "NVDA", amountUsd: 200, evaluationId: "ev-1" };

    const result = await quoteExitNow(
      {
        tokenAddress: NVDAB,
        amount: "873263851190316305",
        wrapper: "bstocks",
        walletAddress: "0xAGENTE",
      },
      { sign, quote, context },
    );

    // El mismo monto y wrapper que la compra; del token hacia USDT, con side "sell".
    if (result === "unavailable") throw new Error("cotizó de verdad");
    expect(result.recoveredUsd).toBeCloseTo(199);
    expect(quote).toHaveBeenCalledTimes(1);
    const [args, deps] = quote.mock.calls[0];
    expect(args.fromTokenAddress).toBe(NVDAB);
    expect(args.toTokenAddress).toBe(USDT_BSC);
    expect(args.amount).toBe("873263851190316305");
    expect(args.side).toBe("sell");
    expect(args.wrapper).toBe("bstocks");
    expect(args.walletAddress).toBe("0xAGENTE");
    expect(args.purpose).toBe("exit-now");
    expect(deps.context).toEqual(context);
  });

  it("devuelve cuánto se recupera en USD y un costo bajo el tope, fechado a este instante", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-01T12:00:00Z"));
    const quote: typeof getAggregatedQuote = async () => ({
      impactRatio: 0.004,
      toAmount: 199_000_000_000_000_000_000,
      toTokenAmount: "199000000000000000000",
      vendor: "LiquidMesh",
      quoteId: "q1",
    });

    const result = await quoteExitNow(
      { tokenAddress: NVDAB, amount: "873263851190316305", wrapper: "bstocks" },
      { sign, quote },
    );

    // toTokenAmount de la venta llega en unidades mínimas de USDT (18 decimales).
    expect(result).toEqual({
      recoveredUsd: expect.closeTo(199),
      costRatio: expect.closeTo(0.004),
      simulatedAt: "2026-10-01T12:00:00.000Z",
    });
    if (result !== "unavailable") expect(result.costRatio).toBeLessThan(IMPACT_LIMIT);
  });

  it("un impacto de venta negativo viaja como costo positivo comparable con el tope", async () => {
    const quote: typeof getAggregatedQuote = async () => ({
      impactRatio: -0.03,
      toAmount: 194_000_000_000_000_000_000,
      toTokenAmount: "194000000000000000000",
      vendor: "LiquidMesh",
      quoteId: "q2",
    });

    const result = await quoteExitNow(
      { tokenAddress: NVDAB, amount: "873263851190316305", wrapper: "bstocks" },
      { sign, quote },
    );

    if (result === "unavailable") throw new Error("cotizó de verdad");
    expect(result.costRatio).toBeCloseTo(0.03);
    expect(result.costRatio).toBeGreaterThan(IMPACT_LIMIT);
  });

  it("la venta que no cotiza devuelve unavailable: no inventa un número", async () => {
    const quote: typeof getAggregatedQuote = async () => "unavailable";

    const result = await quoteExitNow(
      { tokenAddress: NVDAB, amount: "873263851190316305", wrapper: "ondo" },
      { sign, quote },
    );

    expect(result).toBe("unavailable");
  });
});
