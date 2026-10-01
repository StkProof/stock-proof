import type { Regime } from "@/lib/evaluate";
import type { Q4Result } from "@/lib/questions/q4-reasons";

/**
 * Cuánto pueden diferir dos pools del mismo ticker y seguir «coincidiendo». Fracción,
 * como los demás ratios (0.001 = 0,1%). Medido en el tape de bStocks: QQQB discrepa
 * 0,012% entre pools y convive con el libro clavado; en un nombre fino la discrepancia
 * del mismo minuto llegó a 0,239% (`../vault-stockproof/Dolores.md` §3 y §5).
 */
export const POOLS_DIVERGENCE_LIMIT = 0.001;

/**
 * Lo que la pregunta 4 mira, ya traído. La función es pura: no llama a la red y no
 * completa lo que no se midió.
 */
export type Q4Input = {
  /** Estado del mercado de contado del subyacente. «Cerrado» no corta por el reloj. */
  marketStatus: "open" | "closed";
  /** Libro clavado. Ausente si no se midió: el régimen lo declara `"unavailable"`. */
  bookFrozen?: boolean;
  /**
   * Diferencia relativa entre dos pools del mismo ticker (fracción: 0.01 = 1%).
   * Ausente si no se midió: no se inventa una divergencia, `poolsAgree` queda
   * `"unavailable"` y no corta.
   */
  poolsDiffRatio?: number;
  /** ISO 8601 UTC. Viaja al régimen del comprobante; no decide. */
  nextOpenAt?: string;
  /** Propuesta de partir la orden (la computa otra parte). Viaja; no decide acá. */
  suggestSplit?: boolean;
};

/**
 * Pregunta 4: «¿en qué régimen está este ticker?» (Idea.md, regla del 30 sep 2026).
 *
 * - El mercado cerrado no corta por el reloj: un nombre líquido un sábado firma.
 * - Si el libro está clavado, pasa y `regime.bookFrozen` queda en `true` para que el
 *   comprobante lo diga.
 * - Si los pools no coinciden, corta (`POOLS_DISAGREE`): es el único corte de esta
 *   pregunta y corre aunque el libro esté clavado.
 * - Sin dato de pools no se corta: `poolsAgree` queda `"unavailable"`.
 *
 * El corte del nombre fino cuando la venta es cara es Exit Now, otra compuerta: no se
 * implementa acá.
 */
export function decideQuestion4(input: Q4Input): Q4Result {
  const regime = buildRegime(input);
  if (regime.poolsAgree === false) {
    return { ok: false, reason: "POOLS_DISAGREE", regime };
  }
  return { ok: true, regime };
}

function buildRegime(input: Q4Input): Regime {
  return {
    marketStatus: input.marketStatus,
    nextOpenAt: input.nextOpenAt ?? "unavailable",
    poolsAgree: poolsAgree(input.poolsDiffRatio),
    bookFrozen: input.bookFrozen ?? "unavailable",
    suggestSplit: input.suggestSplit ?? false,
  };
}

/** La diferencia se mide por magnitud. Un número que no es finito es «sin dato». */
function poolsAgree(ratio: number | undefined): boolean | "unavailable" {
  if (ratio === undefined || !Number.isFinite(ratio)) {
    return "unavailable";
  }
  return Math.abs(ratio) <= POOLS_DIVERGENCE_LIMIT;
}
