import { describe, expect, it } from "vitest";
import { Q2_CUT_REASONS, WRAPPERS, type QuestionId } from "@/lib/evaluate";
import { Q1_CUT_REASONS, Q1_UNAVAILABLE_REASONS } from "@/lib/questions/q1-reasons";
import {
  Q3_CUT_REASONS,
  Q3_PASS_CODES,
  Q3_UNAVAILABLE_REASONS,
} from "@/lib/questions/q3-reasons";
import { Q4_CUT_REASONS } from "@/lib/questions/q4-reasons";
import {
  QUESTION_TEXT,
  quoteGapText,
  reasonText,
  signalText,
  WRAPPER_LABEL,
} from "@/components/messages";

describe("reasonText", () => {
  const KNOWN_CODES = [
    ...Q1_CUT_REASONS,
    ...Q1_UNAVAILABLE_REASONS,
    ...Q2_CUT_REASONS,
    "QUOTES_UNAVAILABLE",
    ...Q3_PASS_CODES,
    ...Q3_CUT_REASONS,
    ...Q3_UNAVAILABLE_REASONS,
    ...Q4_CUT_REASONS,
  ];

  it("todo código conocido tiene frase en castellano", () => {
    for (const code of KNOWN_CODES) {
      const text = reasonText(code);
      expect(text).not.toBe("Motivo no reconocido.");
      expect(text).not.toContain(code);
    }
  });

  it("un código desconocido se muestra genérico, nunca crudo", () => {
    const text = reasonText("CODIGO_QUE_NO_EXISTE");
    expect(text).toBe("Motivo no reconocido.");
    expect(text).not.toContain("CODIGO_QUE_NO_EXISTE");
  });
});

describe("signalText", () => {
  it("traduce las señales que ya muestra la pantalla y no deja el código crudo", () => {
    expect(signalText("POOL_DISPERSION")).toBe("Dispersión entre pools");
    expect(signalText("OFF_HOURS_WEEKEND")).toBe("Fuera del horario del emisor");
    expect(signalText("POOL_DISPERSION")).not.toContain("POOL_DISPERSION");
    expect(signalText("OFF_HOURS_WEEKEND")).not.toContain("OFF_HOURS_WEEKEND");
  });

  it("una señal desconocida se muestra genérica, nunca cruda", () => {
    const text = signalText("SENAL_RARA");
    expect(text).toBe("Señal sin nombre reconocido.");
    expect(text).not.toContain("SENAL_RARA");
  });
});

describe("quoteGapText", () => {
  it("traduce los dos motivos conocidos y no muestra un código crudo", () => {
    expect(quoteGapText("NOT_LISTED")).toBe("no figura en la lista oficial");
    expect(quoteGapText("NO_QUOTE")).toBe("no devolvió cotización");
    expect(quoteGapText("NOT_LISTED")).not.toContain("NOT_LISTED");
    expect(quoteGapText("NO_QUOTE")).not.toContain("NO_QUOTE");
  });

  it("un motivo desconocido se muestra genérico, nunca crudo", () => {
    const text = quoteGapText("GAP_RARO");
    expect(text).toBe("sin cotización, por un motivo no reconocido");
    expect(text).not.toContain("GAP_RARO");
  });
});

describe("QUESTION_TEXT", () => {
  it("tiene texto para las cuatro preguntas, en orden", () => {
    const ids: QuestionId[] = [1, 2, 3, 4];
    for (const id of ids) {
      expect(QUESTION_TEXT[id].length).toBeGreaterThan(0);
    }
  });
});

describe("WRAPPER_LABEL", () => {
  it("nombra los tres emisores del contrato", () => {
    for (const wrapper of WRAPPERS) {
      expect(WRAPPER_LABEL[wrapper].length).toBeGreaterThan(0);
    }
  });
});
