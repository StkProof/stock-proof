# Spec: conexión a datos reales (`/api/evaluate`)

- **Estado**: borrador — Agustín pidió implementar junto con la spec (28 sep 2026); la aprobación en el pull request cubre spec e implementación.
- **Fecha**: 2026-09-28
- **Autor**: Devin, a partir de `../stockproof-vault/MVP.md` (primera ventana) y `Plan.md` (ola 1–2)
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
3. El adaptador de cotización (`/api/v1/dex/aggregator/quote`) devuelve impacto como proporción (`priceImpactPercent` / 100) y `simulatedCostUsd = amountUsd × (1 + impacto)`. Cualquier fallo de red, HTTP, `code` distinto de `0`/`"000000"` o formato raro es `"unavailable"`.
4. En modo público, la pregunta 1 usa las mismas reglas (`decideAuthenticity`): la lista oficial sale del endpoint público (solo `chainId` `"56"`), el attestation de las URLs de `meta/ai` y el estándar del `supportsInterface` ya existente.
5. `reference` se arma con el `dynamic/ai` del token ganador esperado (bStocks si está listado; si no, el primer emisor con contrato en BSC): `poolUsd = tokenInfo.price`, `referenceUsd = stockInfo.price` normalizado por `sharesMultiplier` si el pool cotiza por acción y el token es fracción — si algún campo falta, esa parte queda fuera y `evaluate` la marca «sin dato».
6. `regime` sale del estado global (`market/status/ai`): `openState` → `open`/`closed`, `nextOpen` → `nextOpenAt`.
7. `exit` queda `"unavailable"` en esta ventana (su adaptador es otra tarea; el formato ya lo admite).
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
- Emisor sin contrato en BSC para ese ticker → su cotización no se arma; si el conjunto de cotizaciones queda incompleto, `quotes: "unavailable"`.
- Cotización sin `priceImpactPercent` → esa cotización es `"unavailable"` y, con ella, el conjunto.
- Reloj del servidor corridori: el timestamp se pide fresco en cada firma; Binance valida la ventana.
- El endpoint corre solo en servidor (`export const runtime = "nodejs"`).

## Fuera de alcance

- Exit Now (simulación de venta), Exit Risk (señales) y las horas de mint/redeem por emisor: `exit` queda `"unavailable"` hasta su tarea.
- Reglas de corte de las preguntas 3 y 4 (hoy los datos entran sin cortar).
- Simulación con la Transaction API y la firma del swap (propuesta de Agustín en la ola 2).
- La frase en castellano y los topes de `constraints` (ola 4).

## Plan de implementación

1. `lib/binance/sign.ts`: `signWeb3Request(method, requestPath, body?)` devuelve los tres headers o `null` si falta credencial. `binanceWeb3Signer()` construye el `SignRequest` que ya esperan `lib/binance/rwa.ts` y el adaptador de cotización.
2. `lib/binance/rwa-public.ts`: los cuatro GET públicos con validación de formato, `Q1Sources` públicas y el mapa `type → wrapper`.
3. `lib/binance/trading.ts`: `getAggregatedQuote` firmado → `{ impactRatio, simulatedCostUsd } | "unavailable"`.
4. `lib/questions/q1.ts`: extraer `checkContractSources(target, sources)`; `checkContract` queda como atajo con las fuentes firmadas (sin cambio de comportamiento).
5. `lib/evaluation-input.ts`: `buildEvaluateInput(request, deps)` arma el `EvaluateInput`.
6. `app/api/evaluate/route.ts`: POST con deps reales según credenciales; `runtime = "nodejs"`.
7. Pantalla: opción «en vivo» en el selector que llama al endpoint.
8. Tests con `fetch` y credenciales mockeados; `npm run check` en verde.

## Criterios de aceptación

- [ ] `X-OC-SIGN` se calcula sobre `timestamp + método + "/build" + path + "?" + query + cuerpo` y los tres headers viajan (unitario con clave fija y vector conocido; RSA/Ed25519 se verifica con la clave pública).
- [ ] Sin credenciales, `buildEvaluateInput` devuelve cotizaciones `"unavailable"` y la pregunta 1 decide con fuentes públicas (unitario con dobles).
- [ ] `POST /api/evaluate` con dirección impostora devuelve `cut` de la pregunta 1 con `address` (unitario del route con deps mockeadas).
- [ ] Una respuesta de cotización con `priceImpactPercent` se traduce a proporción y a `simulatedCostUsd`; sin ese campo es `"unavailable"` (unitario).
- [ ] `reference`/`regime` reflejan los campos reales de `dynamic`/`status`, o quedan «sin dato» (unitario).
- [ ] La escena «en vivo» de la pantalla muestra el resultado real (e2e con route mockeado no aplica: basta unitario del componente o e2e contra el endpoint real sin credenciales, que responde `unavailable` honesto).
- [ ] `npm run check` en verde.
