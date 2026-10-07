/**
 * Los números que deciden si una orden pasa o se corta. Viven solo acá: la lógica y la
 * pantalla los importan, nadie los repite (`Plan.md`, «Dónde nos podemos pisar»). Todos
 * los ratios son fracciones: 0.01 = 1%.
 */

/**
 * Umbral de impacto de la pregunta 2, para la compra y para la venta del mismo monto
 * (Exit Now): 1% = 0.01.
 */
export const IMPACT_LIMIT = 0.01;

/**
 * Cuánto pueden diferir dos pools del mismo ticker y seguir «coincidiendo» (pregunta 4).
 * Medido en el tape de bStocks: QQQB discrepa 0,012% entre pools y convive con el libro
 * clavado; en un nombre fino la discrepancia del mismo minuto llegó a 0,239%
 * (`../vault-stockproof/Dolores.md` §3 y §5).
 */
export const POOLS_DIVERGENCE_LIMIT = 0.001;

/**
 * Tolerancia de punto flotante para «es el mismo número» en la pregunta 3, no un umbral
 * de desvío. Absorbe el error de una multiplicación (~1e-13 relativo); la regla del vault
 * no fija porcentaje: o el precio es el de la acción, o el desvío tiene una causa conocida.
 */
export const PRICE_MATCH_TOLERANCE = 1e-9;
