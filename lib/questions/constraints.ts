import type { ConstraintCode, Constraints, Quote, Reference } from "@/lib/evaluate";

/**
 * Topes de la frase, mirados después de las cuatro preguntas sobre el ganador. Informan
 * cuáles no se cumplieron; la decisión de firmar es del agente. Sin topes, `undefined`.
 */
export function checkConstraints(
  constraints: Constraints | undefined,
  winner: Quote,
  reference: Reference,
): { violated: ConstraintCode[] } | undefined {
  if (constraints === undefined) {
    return undefined;
  }
  const violated: ConstraintCode[] = [];
  if (
    constraints.maxImpactRatio !== undefined &&
    winner.impactRatio > constraints.maxImpactRatio
  ) {
    violated.push("MAX_IMPACT_RATIO");
  }
  if (
    constraints.maxDeviationRatio !== undefined &&
    typeof reference.deviationRatio === "number" &&
    reference.deviationRatio > constraints.maxDeviationRatio
  ) {
    violated.push("MAX_DEVIATION_RATIO");
  }
  return { violated };
}
