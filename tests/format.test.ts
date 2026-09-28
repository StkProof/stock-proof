import { describe, expect, it } from "vitest";
import {
  formatCurrency,
  formatPercent,
  formatUsd,
  formatUtcDateTime,
  timeSince,
} from "@/lib/format";

describe("formatCurrency", () => {
  it("formatea un monto en pesos argentinos", () => {
    expect(formatCurrency(1999.5)).toBe("$ 1.999,50");
  });

  it("formatea el cero", () => {
    expect(formatCurrency(0)).toBe("$ 0,00");
  });

  it("rechaza valores no finitos", () => {
    expect(() => formatCurrency(NaN)).toThrow("número finito");
    expect(() => formatCurrency(Infinity)).toThrow("número finito");
  });
});

describe("formatUsd", () => {
  it("formatea un monto en dólares con reglas es-AR", () => {
    expect(formatUsd(1999.5)).toBe("US$\u00a01.999,50");
  });

  it("formatea el cero y montos chicos", () => {
    expect(formatUsd(0)).toBe("US$\u00a00,00");
    expect(formatUsd(44.2)).toBe("US$\u00a044,20");
  });

  it("rechaza valores no finitos", () => {
    expect(() => formatUsd(NaN)).toThrow("número finito");
    expect(() => formatUsd(Infinity)).toThrow("número finito");
  });
});

describe("formatPercent", () => {
  it("un ratio de 0.01 se lee como 1% con coma decimal", () => {
    expect(formatPercent(0.01)).toBe("1,00%");
    expect(formatPercent(0.008)).toBe("0,80%");
    expect(formatPercent(0.063)).toBe("6,30%");
  });

  it("rechaza valores no finitos", () => {
    expect(() => formatPercent(NaN)).toThrow("número finito");
  });
});

describe("formatUtcDateTime", () => {
  it("formatea una fecha ISO en texto es-AR", () => {
    expect(formatUtcDateTime("2026-09-28T12:00:05Z")).toBe("28 sept 2026, 12:00 p. m.");
  });

  it("una fecha que no se puede leer es «sin dato»", () => {
    expect(formatUtcDateTime("no-es-una-fecha")).toBe("sin dato");
  });
});

describe("timeSince", () => {
  const now = new Date("2026-09-28T12:00:00Z");

  it("cuenta la edad en segundos, minutos, horas y días", () => {
    expect(timeSince("2026-09-28T11:59:55Z", now)).toBe("hace 5 segundos");
    expect(timeSince("2026-09-28T11:40:00Z", now)).toBe("hace 20 minutos");
    expect(timeSince("2026-09-28T07:00:00Z", now)).toBe("hace 5 horas");
    expect(timeSince("2026-09-25T12:00:00Z", now)).toBe("hace 3 días");
  });

  it("una fecha futura se lee «dentro de»", () => {
    expect(timeSince("2026-09-28T14:00:00Z", now)).toBe("dentro de 2 horas");
  });

  it("una fecha que no se puede leer es «sin dato»", () => {
    expect(timeSince("???", now)).toBe("sin dato");
  });
});
