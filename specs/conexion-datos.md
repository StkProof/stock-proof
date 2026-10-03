# Spec: conexión a datos reales (`/api/evaluate`)

- **Estado**: borrador — Agustín pidió implementar junto con la spec (28 sep 2026); la aprobación en el pull request cubre spec e implementación.
- **Fecha**: 2026-09-28
- **Autor**: Devin, a partir de `../vault-stockproof/MVP.md` (primera ventana) y `Plan.md` (ola 1–2)
- **Cubre**: issues #2 (cliente firmado), #7 (cotización para la pregunta 2) y #9 (conectar la pantalla a `evaluate`), en la parte que arma `EvaluateInput`.

## Contexto y problema

La pantalla ya dibuja los seis estados, pero lee ejemplos fijos. Para la demo hace falta que «Evaluar» corra la decisión de verdad: resolver el ticker a contratos oficiales, revisar la pregunta 1, cotizar en la ruta de cada emisor y traducir todo a la entrada de `evaluate`.

Hay dos fuentes ya verificadas (28 sep 2026):

- **API pública de la web de Binance** (`GET https://www.binance.com/bapi/defi/...`, sin credenciales): lista de stock tokens con contrato y emisor por `type` (1 = Ondo, 2 = xStocks, 3 = bStocks), metadata con URLs de attestation, precio del token y del subyacente, y estado de mercado (global y por activo).
- **API firmada web3** (`https://web3.binance.com/build/api/v1/...`, headers `X-OC-APIKEY`/`X-OC-TIMESTAMP`/`X-OC-SIGN`): búsqueda y perfil oficiales, cotización del agregador (`priceImpactPercent`, `toTokenAmount`), y simulación de transacciones.

Sin credenciales no hay cotización: el orquestador trabaja igual con la parte pública y declara `"unavailable"` lo que no puede traer. Nunca inventa impacto.

## Comportamiento esperado

1. `POST /api/evaluate` con `{ ticker, amountUsd, address? }` devuelve un `Evaluation` ya evaluado.
2. La firma `X-OC-SIGN` cubre `timestamp(ISO 8601) + MÉTODO + "/build" + path + "?" + query + cuerpo` (cuerpo JSON compacto, sin campos `null`), firmado con HMAC-SHA256 (clave `BINANCE_API_SECRET`, base64) o con clave privada RSA/Ed25519 (`BINANCE_PRIVATE_KEY`, base64 de la firma PKCS1-v1_5/Ed25519).
   - **Credenciales**: se leen del entorno por `binanceCredentials`. Los nombres canónicos `BINANCE_API_KEY`/`BINANCE_API_SECRET`/`BINANCE_PRIVATE_KEY` tienen prioridad; el portal puede entregar los alias `API_KEY`/`SECRET_KEY`/`API_SECRET`, que solo se usan si el nombre canónico falta o está vacío/espacios (un alias vacío nunca pisa a un valor válido).
3. El adaptador de cotización (`/api/v1/dex/aggregator/quote`) devuelve impacto como proporción (`priceImpactPercent` / 100) y `simulatedCostUsd = amountUsd × (1 + impacto)`. El `amount` viaja en unidades mínimas del token de pago y el query suma `userWalletAddress` desde `AGENT_WALLET_ADDRESS` cuando está definida (ver `specs/cotizaciones-parciales.md`). Cualquier fallo de red, HTTP, `code` distinto de `0`/`"000000"` o formato raro es `"unavailable"` para ese wrapper (gap `NO_QUOTE`), no para el conjunto.
4. En modo público, la pregunta 1 usa las mismas reglas (`decideAuthenticity`): la lista oficial sale del endpoint público (solo `chainId` `"56"`), el attestation de las URLs de `meta/ai` y el estándar del `supportsInterface` ya existente.
5. `reference` se arma con el `dynamic/ai` **de cada wrapper que cotizó**, sin elegir ganador: `tokenPriceUsd = tokenInfo.price`, `referenceUsd = stockInfo.price` (`null` fuera de rueda) y `sharesMultiplier` crudo. `evaluate` corre `decideQuestion3` sobre la entrada del candidato; el orquestador no pre-decide el desvío ni el multiplicador.
6. `regime` sale del estado global (`market/status/ai`): `openState` → `open`/`closed`, `nextOpen` → `nextOpenAt`. Va crudo para `decideQuestion4`; la divergencia de pools y el libro no se miden todavía y no se inventan.
7. Por cada compra que llegó se pide **la venta del mismo monto** (`quoteExitNow`, `side: "sell"`, `amount` = el `toTokenAmount` real de esa compra, con la misma `userWalletAddress`) y la disponibilidad (`buildExitAvailability`, con la misma lectura de `market/status/ai` que la pregunta 4). Van en `exits` por wrapper: `now` es la compuerta de `evaluate`, `availability` informa. `exit.risk` queda `"unavailable"` (issue #19).
8. La pantalla suma una escena «en vivo»: llama al endpoint y muestra el resultado real; las escenas fijas siguen para el video.
9. Toda llamada a Binance pasa por `binanceRequest` (registro incluido). La key solo viaja en headers, solo a `*.binance.com`, solo en el servidor.
10. Sin `BINANCE_API_KEY` + credencial de firma, el endpoint sigue funcionando en modo público: la pregunta 1 decide de verdad y las cotizaciones quedan `"unavailable"`.

## Reglas fijas

- **Fail closed**: cualquier dato que falte sale como `"unavailable"`; nunca se estima ni se rellena.
- **Una sola puerta**: público y firmado salen por `binanceRequest`; la diferencia son los headers.
- **El servidor decide, la pantalla muestra**: el route no transforma el `Evaluation`; la pantalla no reevalúa.
- **Sin credenciales no se firma**: si faltan, no se intenta la ruta firmada (error de configuración, no de red).
- **`ticker` y `amountUsd` inválidos** no llaman a nada: el route responde `invalid` directo (el mismo `evaluate` lo decide con entrada local).

## Casos borde

- Lista pública vacía o con forma distinta → la pregunta 1 devuelve `LIST_UNAVAILABLE` (sin dato, no impostor).
- `address` que no está en la lista → `CONTRACT_NOT_LISTED` (impostor, escena 3 del video).
- `address` en la lista pero de otro `type` → se usa el emisor real del contrato, no el pedido.
- Emisor sin contrato en BSC para ese ticker → su cotización no se arma; entra como `quoteGap` `NOT_LISTED` y el resto del conjunto decide igual (`specs/cotizaciones-parciales.md`).
- Cotización sin `priceImpactPercent` o con error del venue → ese wrapper es `quoteGap` `NO_QUOTE`; `quotes: "unavailable"` solo cuando no llegó ninguna.
- Venta sin cotización de vuelta → `exits[].now` queda `"unavailable"` y ese wrapper no firma; venta con `priceImpactPercent` → `costRatio` medido que `evaluate` compara con `IMPACT_LIMIT`. Ni se estima un monto menor ni se itera la cotización.
- Reloj del servidor corridori: el timestamp se pide fresco en cada firma; Binance valida la ventana.
- El endpoint corre solo en servidor (`export const runtime = "nodejs"`).

## Fuera de alcance

- Exit Risk (señales observables, issue #19): `exit.risk` queda `"unavailable"`. Las horas de mint/redeem que el emisor no publica quedan «sin dato» dentro de `availability`.
- Divergencia de pools y libro clavado medidos (la entrada `Q4Input` ya los admite crudos; la fuente todavía no existe).
- Simulación con la Transaction API y la firma del swap (propuesta de Agustín en la ola 2, issue #22).
- La frase en castellano y los topes de `constraints` (ola 4).

## Plan de implementación

1. `lib/binance/sign.ts`: `signWeb3Request(method, requestPath, body?)` devuelve los tres headers o `null` si falta credencial. `binanceWeb3Signer()` construye el `SignRequest` que ya esperan `lib/binance/rwa.ts` y el adaptador de cotización.
2. `lib/binance/rwa-public.ts`: los cuatro GET públicos con validación de formato, `Q1Sources` públicas y el mapa `type → wrapper`.
3. `lib/binance/trading.ts`: `getAggregatedQuote` firmado → `{ impactRatio, simulatedCostUsd } | "unavailable"`.
4. `lib/questions/q1.ts`: extraer `checkContractSources(target, sources)`; `checkContract` queda como atajo con las fuentes firmadas (sin cambio de comportamiento).
5. `lib/evaluation-input.ts`: `buildEvaluateInput(request, deps)` arma el `EvaluateInput` — por cada compra, la venta del mismo monto (`toTokenAmount` real), la disponibilidad y los precios crudos.
6. `app/api/evaluate/route.ts`: POST con deps reales según credenciales; `runtime = "nodejs"`.
7. Pantalla: opción «en vivo» en el selector que llama al endpoint.
8. Tests con `fetch` y credenciales mockeados; `npm run check` en verde.

## Criterios de aceptación

- [ ] `X-OC-SIGN` se calcula sobre `timestamp + método + "/build" + path + "?" + query + cuerpo` y los tres headers viajan (unitario con clave fija y vector conocido; RSA/Ed25519 se verifica con la clave pública).
- [ ] Sin credenciales, `buildEvaluateInput` devuelve cotizaciones `"unavailable"` y la pregunta 1 decide con fuentes públicas (unitario con dobles).
- [ ] `POST /api/evaluate` con dirección impostora devuelve `cut` de la pregunta 1 con `address` (unitario del route con deps mockeadas).
- [ ] Una respuesta de cotización con `priceImpactPercent` se traduce a proporción y a `simulatedCostUsd`; sin ese campo es `"unavailable"` (unitario).
- [ ] `reference`/`regime` reflejan los campos reales de `dynamic`/`status` por wrapper cotizado, o quedan «sin dato» (unitario).
- [ ] La venta se cotiza con el `toTokenAmount` real de cada compra y la wallet del agente; una venta que no llega queda `"unavailable"` en `exits[].now` (unitario con dobles).
- [ ] La escena «en vivo» de la pantalla muestra el resultado real (e2e con route mockeado no aplica: basta unitario del componente o e2e contra el endpoint real sin credenciales, que responde `unavailable` honesto).
- [ ] `npm run check` en verde.
