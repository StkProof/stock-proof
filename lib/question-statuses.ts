import type { Evaluation } from "@/lib/evaluate";

export const QUESTION_IDS = [1, 2, 3, 4] as const;

export type QuestionStatus = "passed" | "cut" | "unknown" | "skipped";

/**
 * Las preguntas corren en orden: en un `cut`/`unavailable` de la pregunta N las
 * anteriores pasaron y las siguientes no se corrieron (spec de formato).
 */
export function questionStatuses(
  evaluation: Evaluation,
): Record<(typeof QUESTION_IDS)[number], QuestionStatus> {
  if (evaluation.kind === "pass") {
    return { 1: "passed", 2: "passed", 3: "passed", 4: "passed" };
  }
  if (evaluation.kind === "invalid") {
    return { 1: "skipped", 2: "skipped", 3: "skipped", 4: "skipped" };
  }
  const statuses = {} as Record<(typeof QUESTION_IDS)[number], QuestionStatus>;
  for (const id of QUESTION_IDS) {
    if (id < evaluation.question) {
      statuses[id] = "passed";
    } else if (id === evaluation.question) {
      statuses[id] = evaluation.kind === "cut" ? "cut" : "unknown";
    } else {
      statuses[id] = "skipped";
    }
  }
  return statuses;
}

/**
 * Las cinco paradas del recorrido de la landing: las cuatro preguntas y la firma.
 * La firma pasa solo con `pass`; si no, no se llega. No decide nada: lee el resultado.
 */
export function operationStops(evaluation: Evaluation): QuestionStatus[] {
  const statuses = questionStatuses(evaluation);
  return [
    ...QUESTION_IDS.map((id) => statuses[id]),
    evaluation.kind === "pass" ? "passed" : "skipped",
  ];
}

/** Índice de la parada donde se detiene el pulso: la primera que no pasó, o la firma. */
export function pulseStop(stops: QuestionStatus[]): number {
  const index = stops.findIndex((status) => status !== "passed");
  return index === -1 ? stops.length - 1 : index;
}
