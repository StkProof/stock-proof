import { describe, expect, it } from "vitest";
import { Q2_CUT_REASONS, WRAPPERS, type QuestionId } from "@/lib/evaluate";
import { Q1_CUT_REASONS, Q1_UNAVAILABLE_REASONS } from "@/lib/questions/q1-reasons";
import {
  QUESTION_TEXT,
  reasonText,
  WRAPPER_LABEL,
} from "@/components/messages";

describe("reasonText", () => {
  const KNOWN_CODES = [
    ...Q1_CUT_REASONS,
    ...Q1_UNAVAILABLE_REASONS,
    ...Q2_CUT_REASONS,
    "QUOTES_UNAVAILABLE",
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
