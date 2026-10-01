import {
  getMarketStatus,
  type PublicDeps,
  type PublicMarketStatus,
} from "@/lib/binance/rwa-public";
import type { ExitBlock, Source, WrapperId } from "@/lib/evaluate";

/**
 * Exit Availability: las reglas publicadas que aplican para salir — si el mercado está
 * abierto, cuándo abre, en qué horario el emisor emite y canjea, y dónde se canjea por
 * la acción. La capa informa y no decide (Diferenciador.md): nunca produce un corte.
 * Un dato que no llegó es "unavailable"; nunca se completa con un valor inventado.
 */

/** La capa `availability` del bloque de salida (forma congelada en specs/formato-evaluacion.md). */
export type ExitAvailability = ExitBlock["availability"];

/**
 * Reglas publicadas del emisor que llegaron en una respuesta pública. Hoy ninguno de los
 * endpoints consultados las expone; el día que una fuente las traiga entran por acá.
 */
export type PublishedIssuerRules = {
  /** Horario de mint y redeem publicado por el emisor, tal como se publica. */
  mintRedeemHours?: string;
  /** Dónde se canjea el token por la acción, publicado por el emisor. */
  redemptionVenue?: string;
};

/** Las consultas que necesita la capa, inyectadas (mismo patrón que `Q1Sources`). */
export type ExitAvailabilitySources = {
  /** Estado del mercado de acciones: abierto/cerrado y próxima apertura. */
  marketStatus(): Promise<PublicMarketStatus | "unavailable">;
  /**
   * Reglas publicadas por el emisor de ese wrapper. Opcional: hoy la respuesta pública
   * no las trae y los campos quedan "unavailable".
   */
  issuerRules?(wrapper: WrapperId): Promise<PublishedIssuerRules | "unavailable">;
};

/** Las fuentes reales: los endpoints públicos de la web de Binance (`rwa-public.ts`). */
export function publicExitAvailabilitySources(deps: PublicDeps = {}): ExitAvailabilitySources {
  return { marketStatus: () => getMarketStatus(deps) };
}

/**
 * Canje del bStock por la acción: conversión 1:1 en Binance, no en el pool
 * (Diferenciador.md — decisión del vault, no se deduce de la API). El texto llega a la
 * pantalla tal cual, igual que el de `lib/evaluation-examples.ts`.
 */
export const BSTOCKS_REDEMPTION_VENUE = "Binance (conversión 1:1, no en el pool)";

const MARKET_STATUS_SOURCE: Source = { name: "Binance RWA Data" };

/**
 * Arma la capa `availability` de un wrapper. Sin estado de mercado la capa entera queda
 * "unavailable" (su `marketStatus` no admite «sin dato»); con estado, cada campo que no
 * llegó queda "unavailable" por su cuenta.
 */
export async function buildExitAvailability(
  wrapper: WrapperId,
  sources: ExitAvailabilitySources,
): Promise<ExitAvailability> {
  const status = await sources.marketStatus().catch((): "unavailable" => "unavailable");
  if (status === "unavailable" || status.marketStatus === "unavailable") {
    return "unavailable";
  }

  const rules = await publishedIssuerRules(wrapper, sources);
  return {
    marketStatus: status.marketStatus,
    nextOpenAt: status.nextOpenAt,
    mintRedeemHours: rules?.mintRedeemHours || "unavailable",
    // El canje del bStock es la decisión del vault; para Ondo y xStocks solo vale lo
    // que el emisor publicó — sin regla publicada, "unavailable".
    redemptionVenue:
      wrapper === "bstocks"
        ? BSTOCKS_REDEMPTION_VENUE
        : rules?.redemptionVenue || "unavailable",
    source: MARKET_STATUS_SOURCE,
  };
}

async function publishedIssuerRules(
  wrapper: WrapperId,
  sources: ExitAvailabilitySources,
): Promise<PublishedIssuerRules | undefined> {
  if (sources.issuerRules === undefined) return undefined;
  const rules = await sources.issuerRules(wrapper).catch((): "unavailable" => "unavailable");
  return rules === "unavailable" ? undefined : rules;
}
