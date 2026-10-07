import { describe, expect, it } from "vitest";
import type { ExitBlock, Quote, WrapperExit, WrapperId } from "@/lib/evaluate";
import { decideQuestion2 } from "@/lib/questions/q2";
import { IMPACT_LIMIT } from "@/lib/thresholds";

function quote(wrapper: WrapperId, impactRatio: number): Quote {
  return {
    wrapper,
    address: `0x${wrapper}`,
    side: "buy",
    impactRatio,
    simulatedCostUsd: 200 * (1 + impactRatio),
    authenticity: { ok: true },
  };
}

function sell(costRatio: number): ExitBlock["now"] {
  return { recoveredUsd: 198, costRatio, simulatedAt: "2026-10-07T12:00:00Z" };
}

function exits(now: Partial<Record<WrapperId, ExitBlock["now"]>>): Map<WrapperId, WrapperExit> {
  return new Map(
    (Object.keys(now) as WrapperId[]).map((wrapper) => [
      wrapper,
      { wrapper, now: now[wrapper] ?? "unavailable", availability: "unavailable" },
    ]),
  );
}

describe("decideQuestion2", () => {
  it("corta por la compra cuando ningún emisor entra bajo el tope", () => {
    const result = decideQuestion2(
      [quote("bstocks", 0.02), quote("ondo", IMPACT_LIMIT + 0.0001)],
      exits({ bstocks: sell(0.005), ondo: sell(0.005) }),
    );
    expect(result).toEqual({ kind: "cut", reason: "IMPACT_OVER_LIMIT" });
  });

  it("corta por la venta cuando la compra entra pero la venta medida supera el tope", () => {
    const result = decideQuestion2(
      [quote("bstocks", 0.004)],
      exits({ bstocks: sell(0.03) }),
    );
    expect(result).toEqual({ kind: "cut", reason: "EXIT_OVER_LIMIT" });
  });

  it("no firma ni corta cuando ninguna venta se pudo medir", () => {
    const result = decideQuestion2(
      [quote("bstocks", 0.004), quote("ondo", 0.005)],
      exits({ bstocks: "unavailable" }),
    );
    expect(result).toEqual({ kind: "unavailable", reason: "EXIT_NOW_UNAVAILABLE" });
  });

  it("gana el siguiente firmable cuando el más barato no puede salir", () => {
    const result = decideQuestion2(
      [quote("bstocks", 0.002), quote("ondo", 0.006), quote("xstocks", 0.008)],
      exits({ bstocks: sell(0.05), ondo: sell(0.007), xstocks: sell(0.004) }),
    );
    expect(result).toMatchObject({ kind: "pass", tied: false, winner: { wrapper: "ondo" } });
  });

  it("el empate entre firmables se rompe por bStocks, Ondo, xStocks", () => {
    const result = decideQuestion2(
      [quote("xstocks", 0.005), quote("ondo", 0.005), quote("bstocks", 0.005)],
      exits({ xstocks: sell(0.006), ondo: sell(0.006), bstocks: "unavailable" }),
    );
    expect(result).toMatchObject({ kind: "pass", tied: true, winner: { wrapper: "ondo" } });
  });

  it("compra y venta justo en el tope todavía firman", () => {
    const result = decideQuestion2(
      [quote("bstocks", IMPACT_LIMIT)],
      exits({ bstocks: sell(IMPACT_LIMIT) }),
    );
    expect(result).toMatchObject({ kind: "pass", winner: { wrapper: "bstocks" } });
  });
});
