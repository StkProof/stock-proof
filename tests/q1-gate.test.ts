import { describe, expect, it } from "vitest";
import type { Quote, WrapperId } from "@/lib/evaluate";
import { checkTarget, decideQuestion1 } from "@/lib/questions/q1-gate";
import type { Q1Result } from "@/lib/questions/q1-reasons";

function quote(wrapper: WrapperId, impactRatio: number, authenticity: Q1Result): Quote {
  return {
    wrapper,
    address: `0x${wrapper}`,
    side: "buy",
    impactRatio,
    simulatedCostUsd: 200,
    authenticity,
  };
}

describe("checkTarget", () => {
  it("el contrato auténtico sigue", () => {
    expect(checkTarget({ ok: true })).toEqual({ kind: "pass" });
  });

  it("un chequeo que no llegó es «no se pudo verificar», no impostor", () => {
    expect(checkTarget("unavailable")).toEqual({ kind: "unavailable", reason: "LIST_UNAVAILABLE" });
    expect(checkTarget({ ok: false, reason: "CHAIN_UNAVAILABLE" })).toEqual({
      kind: "unavailable",
      reason: "CHAIN_UNAVAILABLE",
    });
  });

  it("el impostor corta con su motivo", () => {
    expect(checkTarget({ ok: false, reason: "CONTRACT_NOT_LISTED" })).toEqual({
      kind: "cut",
      reason: "CONTRACT_NOT_LISTED",
    });
  });
});

describe("decideQuestion1", () => {
  it("solo las cotizaciones auténticas quedan elegibles", () => {
    const result = decideQuestion1([
      quote("bstocks", 0.002, { ok: false, reason: "ATTESTATION_MISSING" }),
      quote("ondo", 0.006, { ok: true }),
    ]);
    expect(result).toMatchObject({ kind: "pass", eligible: [{ wrapper: "ondo" }] });
  });

  it("si todas son impostoras, corta con el motivo del de menor impacto", () => {
    const result = decideQuestion1([
      quote("ondo", 0.006, { ok: false, reason: "CONTRACT_NOT_LISTED" }),
      quote("bstocks", 0.002, { ok: false, reason: "STANDARD_NOT_BEP8056" }),
    ]);
    expect(result).toEqual({ kind: "cut", reason: "STANDARD_NOT_BEP8056" });
  });

  it("una sin verificar gana sobre los impostores: no se pudo evaluar", () => {
    const result = decideQuestion1([
      quote("bstocks", 0.002, { ok: false, reason: "CONTRACT_NOT_LISTED" }),
      quote("xstocks", 0.009, { ok: false, reason: "ATTESTATION_UNAVAILABLE" }),
    ]);
    expect(result).toEqual({ kind: "unavailable", reason: "ATTESTATION_UNAVAILABLE" });
  });
});
