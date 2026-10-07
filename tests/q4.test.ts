import { describe, expect, it } from "vitest";
import { decideQuestion4, type Q4Input } from "@/lib/questions/q4";
import { Q4_CUT_REASONS } from "@/lib/questions/q4-reasons";
import { POOLS_DIVERGENCE_LIMIT } from "@/lib/thresholds";

function input(overrides: Partial<Q4Input> = {}): Q4Input {
  return { marketStatus: "open", ...overrides };
}

describe("decideQuestion4", () => {
  it("pasa con el mercado abierto y los pools coincidiendo", () => {
    expect(decideQuestion4(input({ poolsDiffRatio: 0.0002 }))).toEqual({
      ok: true,
      regime: {
        marketStatus: "open",
        nextOpenAt: "unavailable",
        poolsAgree: true,
        bookFrozen: "unavailable",
        suggestSplit: false,
      },
    });
  });

  it("un sábado con el libro clavado pasa y el régimen lo marca para el comprobante", () => {
    const result = decideQuestion4(
      input({ marketStatus: "closed", bookFrozen: true, nextOpenAt: "2026-10-05T13:30:00Z" }),
    );
    expect(result).toEqual({
      ok: true,
      regime: {
        marketStatus: "closed",
        nextOpenAt: "2026-10-05T13:30:00Z",
        poolsAgree: "unavailable",
        bookFrozen: true,
        suggestSplit: false,
      },
    });
  });

  it("el mercado cerrado no corta por el reloj: sin libro clavado ni divergencia, pasa", () => {
    for (const bookFrozen of [undefined, false] as const) {
      const result = decideQuestion4(input({ marketStatus: "closed", bookFrozen }));
      expect(result.ok).toBe(true);
      if (result.ok) expect(result.regime.marketStatus).toBe("closed");
    }
  });

  it("corta con POOLS_DISAGREE cuando los pools no coinciden, abierto o cerrado", () => {
    for (const marketStatus of ["open", "closed"] as const) {
      expect(decideQuestion4(input({ marketStatus, poolsDiffRatio: 0.0024 }))).toEqual({
        ok: false,
        reason: "POOLS_DISAGREE",
        regime: {
          marketStatus,
          nextOpenAt: "unavailable",
          poolsAgree: false,
          bookFrozen: "unavailable",
          suggestSplit: false,
        },
      });
    }
  });

  it("los pools que no coinciden cortan aunque el libro esté clavado", () => {
    const result = decideQuestion4(
      input({ marketStatus: "closed", bookFrozen: true, poolsDiffRatio: 0.0024 }),
    );
    expect(result).toMatchObject({ ok: false, reason: "POOLS_DISAGREE" });
    if (!result.ok) {
      expect(result.regime.poolsAgree).toBe(false);
      expect(result.regime.bookFrozen).toBe(true);
    }
  });

  it("sin dato de pools no inventa una divergencia: pasa con poolsAgree «unavailable»", () => {
    const result = decideQuestion4(input());
    expect(result).toMatchObject({ ok: true });
    if (result.ok) expect(result.regime.poolsAgree).toBe("unavailable");
  });

  it("no completa el dato ausente: libro y próxima apertura quedan «unavailable»", () => {
    const result = decideQuestion4(input({ marketStatus: "closed" }));
    expect(result).toEqual({
      ok: true,
      regime: {
        marketStatus: "closed",
        nextOpenAt: "unavailable",
        poolsAgree: "unavailable",
        bookFrozen: "unavailable",
        suggestSplit: false,
      },
    });
  });

  it("una diferencia en el límite cuenta como pools que coinciden; arriba, corta", () => {
    expect(
      decideQuestion4(input({ poolsDiffRatio: POOLS_DIVERGENCE_LIMIT })),
    ).toMatchObject({ ok: true, regime: { poolsAgree: true } });
    expect(
      decideQuestion4(input({ poolsDiffRatio: POOLS_DIVERGENCE_LIMIT + 0.0001 })),
    ).toMatchObject({ ok: false, reason: "POOLS_DISAGREE" });
  });

  it("la diferencia cuenta por magnitud: un desvío negativo corta igual", () => {
    expect(
      decideQuestion4(input({ poolsDiffRatio: -0.0024 })),
    ).toMatchObject({ ok: false, reason: "POOLS_DISAGREE" });
    expect(decideQuestion4(input({ poolsDiffRatio: -0.0002 }))).toMatchObject({ ok: true });
  });

  it("una diferencia que no es un número finito es «sin dato», no un corte", () => {
    for (const poolsDiffRatio of [Number.NaN, Number.POSITIVE_INFINITY]) {
      const result = decideQuestion4(input({ poolsDiffRatio }));
      expect(result).toMatchObject({ ok: true, regime: { poolsAgree: "unavailable" } });
    }
  });

  it("el libro no clavado se declara: bookFrozen queda en false, no en «unavailable»", () => {
    expect(decideQuestion4(input({ bookFrozen: false }))).toMatchObject({
      ok: true,
      regime: { bookFrozen: false },
    });
  });

  it("nextOpenAt y suggestSplit viajan al régimen sin decidir", () => {
    const result = decideQuestion4(
      input({
        marketStatus: "closed",
        nextOpenAt: "2026-10-05T13:30:00Z",
        suggestSplit: true,
      }),
    );
    expect(result).toMatchObject({
      ok: true,
      regime: { nextOpenAt: "2026-10-05T13:30:00Z", suggestSplit: true },
    });
  });
});

describe("códigos de motivo", () => {
  it("el único corte de la pregunta 4 es POOLS_DISAGREE", () => {
    expect(Q4_CUT_REASONS).toEqual(["POOLS_DISAGREE"]);
  });
});
