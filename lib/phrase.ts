/**
 * Tope de costo de la frase, escrito en por ciento («1» = 1 %, «0,5» = 0,5 %).
 * Vacío: la frase no pide tope. Inválido: `null`. Válido: fracción (`0.01` = 1 %).
 * El tope se mira después de las cuatro preguntas; esta función no decide el corte.
 */
export function impactRatioFromPercent(raw: string): number | null | undefined {
  const trimmed = raw.trim();
  if (trimmed.length === 0) return undefined;
  const value = Number(trimmed.replace(",", "."));
  if (!Number.isFinite(value) || value <= 0 || value > 100) return null;
  return value / 100;
}
