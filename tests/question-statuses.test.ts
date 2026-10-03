import { describe, expect, it } from "vitest";
import { evaluationExamples } from "@/lib/evaluation-examples";
import { operationStops, pulseStop, questionStatuses } from "@/lib/question-statuses";

describe("operationStops", () => {
  it("con pass las cuatro preguntas y la firma pasaron, y el pulso llega a la firma", () => {
    const stops = operationStops(evaluationExamples.pass);
    expect(stops).toEqual(["passed", "passed", "passed", "passed", "passed"]);
    expect(pulseStop(stops)).toBe(4);
  });

  it("el corte por la venta frena en la pregunta 2 y no llega a la firma", () => {
    const stops = operationStops(evaluationExamples.cutExitNow);
    expect(stops).toEqual(["passed", "cut", "skipped", "skipped", "skipped"]);
    expect(pulseStop(stops)).toBe(1);
  });

  it("el contrato impostor frena en la primera parada", () => {
    const stops = operationStops(evaluationExamples.cutQuestion1);
    expect(stops).toEqual(["cut", "skipped", "skipped", "skipped", "skipped"]);
    expect(pulseStop(stops)).toBe(0);
  });

  it("un dato que falta se ve como «sin dato», no como corte", () => {
    const stops = operationStops(evaluationExamples.unavailable);
    expect(stops[0]).toBe("unknown");
    expect(stops[4]).toBe("skipped");
  });

  it("las paradas de las preguntas coinciden con la lista del resultado", () => {
    for (const evaluation of Object.values(evaluationExamples)) {
      const statuses = questionStatuses(evaluation);
      expect(operationStops(evaluation).slice(0, 4)).toEqual([
        statuses[1],
        statuses[2],
        statuses[3],
        statuses[4],
      ]);
    }
  });
});
