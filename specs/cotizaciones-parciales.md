# Spec: cotizaciones reales — wallet del agente, monto en unidades mínimas, conjunto parcial

- **Estado**: borrador — Agustín decidió las dos cosas que esta spec fija en la misma sesión (28 sep 2026); la aprueba en el pull request.
- **Fecha**: 2026-09-28
- **Autor**: Devin (líder), a partir del sondeo en vivo del 28 sep 2026 (`logs/binance-calls-desconocido.jsonl`, caller `desconocido`) y de las decisiones de Agustín
- **Cubre**: continuación de #7 (cotización de la pregunta 2)
- **Modifica**: el invariante «una cotización por wrapper, las tres o nada» de `specs/formato-evaluacion.md` y `specs/preguntas-1-y-2.md`, y los casos borde 46–47 de `specs/conexion-datos.md`. La pantalla no cambia: `quoteGaps` es aditivo y la versión actual lo ignora.

## Contexto y problema

La verificación en vivo contra `/api/v1/dex/aggregator/quote` mostró que la pregunta 2 no fallaba por fondos ni por la API key, sino por dos errores nuestros y una realidad del venue:

1. **Faltaba `userWalletAddress`** en el query. Los venues RFQ (Ondo, xStocks) responden `40001` sin ella: cotizan solo sabiendo qué wallet ejecutaría el swap.
2. **`amount` iba en la unidad equivocada.** El endpoint espera unidades mínimas del token de entrada (USDT BSC: 18 decimales). Mandábamos `amountUsd.toString()` = `"200"` (200 wei ≈ 0 USD), lo que producía `40374` («insufficient liquidity») en bStocks y `40375` («Minimum order amount is 5 USD») en Ondo. Con `200 × 10^18` ambos devuelven quote real (impacto ~0.0006–0.0009%).
3. **Un venue puede no cotizar aunque el token esté listado.** xStocks siguió en `40374` con wallet y monto correctos. Con el invariante «las tres o nada», esa ausencia dejaba toda la pregunta 2 en «sin dato» aunque dos venues hubieran cotizado de verdad.

## Comportamiento esperado

1. `AGENT_WALLET_ADDRESS` (variable de entorno del servidor, nunca en el browser): la address EVM en BSC del agente. Cuando está definida y no vacía, viaja como `userWalletAddress` en el query firmado del quote. Si falta, la llamada sale igual: los venues que la exijan responden su error y caen en su gap. Es la misma wallet que ejecutaría el swap en la ola de firma (premio Agentic Wallet).
2. `amount` del quote es `amountUsd` convertido a unidades mínimas del token de pago. La conversión es exacta (enteros/cadena, nunca float): `200` → `"200000000000000000000"`. Más decimales que el token se truncan, no se redondean.
3. El conjunto de cotizaciones es **parcial con motivo**: se cotiza cada wrapper que tiene contrato listado para el ticker; el que no devuelve quote usable entra como `quoteGap` y no hunde el conjunto.
4. `EvaluateInput` suma `quoteGaps?: QuoteGap[]` y `evaluate` lo propaga opcionalmente a `pass`, `cut` y `unavailable` de la pregunta 2. `QuoteGap = { wrapper: WrapperId; reason: QuoteGapReason }` con:
   - `NOT_LISTED` — el emisor no tiene contrato en BSC para ese ticker en la lista oficial (no se cotiza).
   - `NO_QUOTE` — el venue respondió error, vino sin `data` o con formato raro (cubre wallet faltante, liquidez, monto mínimo).
5. `evaluate` acepta **una o más** cotizaciones válidas (misma validación por campo, sin duplicados, orden estable `bstocks → ondo → xstocks`). Con **cero** cotizaciones válidas sigue `unavailable` de la pregunta 2 con `QUOTES_UNAVAILABLE`.
6. `simulatedCostUsd` se sigue calculando en USD (`amountUsd × (1 + impactRatio)`); las unidades mínimas son solo del request a Binance.
7. Todo lo demás no cambia: una sola puerta (`binanceRequest`), fail closed, la pregunta 1 por el contrato de cada cotización. El ganador es el de menor impacto de compra **entre los que pueden firmar** (compra y venta bajo el tope, ver `specs/preguntas-1-y-2.md`); el desempate sigue el orden de wrappers.

## Reglas fijas

- **Fail closed**: cero cotizaciones válidas ⇒ `QUOTES_UNAVAILABLE`; nunca se rellena un venue ausente con un número inventado.
- **`quoteGaps` es diagnóstico**: no cambia la elegibilidad ni el ganador; informa a la pantalla (cuando la dibuje) y al DX report qué venue faltó y por qué.
- **Aditivo**: `quoteGaps` es opcional en la entrada y en el resultado; consumidores viejos lo ignoran sin romperse.
- **El venue decide**: sin contrato listado no se cotiza (`NOT_LISTED`); con contrato listado y sin quote, `NO_QUOTE`. La pregunta 1 no corre sobre contratos sin cotización (no hay ruta que evaluar).
- **La wallet es dato público** (es una address on-chain): se registra en `params` del log como cualquier otro parámetro; no es secreto.

## Casos borde

- `AGENT_WALLET_ADDRESS` ausente o vacía → el request sale sin `userWalletAddress`; los venues RFQ responden `40001` y quedan `NO_QUOTE`.
- `amountUsd` fraccional (`5.5`) → unidades mínimas exactas; `amountUsd` con más de 18 decimales se trunca.
- Un solo venue cotiza → la pregunta 2 decide sobre ese conjunto y `quoteGaps` lista los otros dos.
- Ningún venue cotiza → `unavailable` de la pregunta 2 con `quoteGaps` completo.
- Wrapper con contrato listado cuya pregunta 1 cortaría: si cotiza, su `authenticity` decide como hoy; si no cotiza, va `NO_QUOTE` y no se evalúa su contrato.

## Fuera de alcance

- Pedir la wallet al usuario en el request o en la pantalla (hoy sale del `.env` del servidor).
- Ejecutar el swap con esa wallet (ola de firma).
- Textos de pantalla para `quoteGaps` (área de Luciano; el campo ya viaja en el resultado).
- Una segunda cotización de venta para buscar un tamaño menor que sí pase: Exit Now cotiza solo el `toTokenAmount` real de la compra (misma conversión de unidades), y si falla no se estima ni se itera.

## Plan de implementación

1. `lib/binance/trading.ts`: `getAggregatedQuote` acepta `walletAddress?` y la agrega como `userWalletAddress` al query cuando viene; el comentario de `amount` dice unidades mínimas del token de entrada.
2. `lib/evaluation-input.ts`: `realInputDeps` lee `AGENT_WALLET_ADDRESS`; `buildQuotes` convierte `amountUsd` a unidades mínimas de USDT (18 decimales, exacto) y devuelve las cotizaciones que llegaron más un `quoteGap` por wrapper sin quote.
3. `lib/evaluate.ts`: tipo `QuoteGap`, `quoteGaps` en `EvaluateInput` y en las variantes del `Evaluation` que exponen cotizaciones; `normalizeQuotes` exige ≥ 1 válida (sigue dedupe, validación y orden estable).
4. `.env.example`: `AGENT_WALLET_ADDRESS` documentada (opcional; sin ella quedan `NO_QUOTE` los venues que la exijan).
5. Tests: `trading.test.ts` (param `userWalletAddress` en el query y en la firma), `evaluation-input.test.ts` (wei exacto, gaps `NOT_LISTED`/`NO_QUOTE`, parciales), `evaluate.test.ts` (una cotización decide, gaps propagados, cero cotizaciones sigue `unavailable`).
6. Specs hermanas actualizadas en el mismo cambio (`preguntas-1-y-2.md`, `formato-evaluacion.md`, casos borde de `conexion-datos.md`).

## Criterios de aceptación

- [ ] `getAggregatedQuote` manda `userWalletAddress` cuando viene `walletAddress` y la firma cubre el query completo (unitario: el path firmado contiene el param).
- [ ] `amountUsd` entra al quote en unidades mínimas del token de pago, exacto y sin floats (unitario: `200` → `200000000000000000000`; `5.5` → `5500000000000000000`).
- [ ] Con dos cotizaciones y una que falla, `buildEvaluateInput` devuelve las dos `quotes` y un `quoteGap` con su `reason` (unitario con dobles).
- [ ] `evaluate` decide `pass`/`cut` con un subconjunto de cotizaciones; con cero devuelve `unavailable` `QUOTES_UNAVAILABLE`; `quoteGaps` llega al resultado (unitario).
- [ ] Un wrapper sin contrato listado produce `NOT_LISTED` sin llamar al quote; uno listado sin quote produce `NO_QUOTE` (unitario).
- [ ] `npm run check` en verde.
