import { describe, expect, it } from "vitest";
import { impactRatioFromPercent } from "@/lib/phrase";

describe("impactRatioFromPercent", () => {
  it("vacío no pide tope", () => {
    expect(impactRatioFromPercent("")).toBeUndefined();
    expect(impactRatioFromPercent("  ")).toBeUndefined();
  });

  it("convierte el por ciento de la frase a fracción", () => {
    expect(impactRatioFromPercent("1")).toBeCloseTo(0.01);
    expect(impactRatioFromPercent("0,5")).toBeCloseTo(0.005);
    expect(impactRatioFromPercent("100")).toBeCloseTo(1);
  });

  it("rechaza cero, negativo, más de 100 y lo que no es número", () => {
    for (const raw of ["0", "-1", "100.1", "abc", "NaN"]) {
      expect(impactRatioFromPercent(raw)).toBeNull();
    }
  });
});
