# Tarea: Conexión a datos reales (`/api/evaluate`)

- Estado: en curso
- Spec: specs/conexion-datos.md (Estado: borrador — Agustín pidió implementar junto con la spec; la aprueba en el pull request)
- Issues que cubre: #2 (cliente firmado), #7 (cotización pregunta 2), #9 (conectar a evaluate)
- Rama: `feat/conexion-datos`, sobre `feat/pantalla-estados` (que ya trae el formato congelado y el merge de `feat/registro-llamadas` con `assertBinanceHost`)
- Criterios de aceptación (de la spec):
  - [x] `X-OC-SIGN` firma `timestamp + método + "/build" + path + "?" + query + cuerpo`; soporta HMAC (`BINANCE_API_SECRET`) y clave RSA/Ed25519 (`BINANCE_PRIVATE_KEY`) (unitario `tests/binance-sign.test.ts`, 12 tests).
  - [x] Sin credenciales, `buildEvaluateInput` deja cotizaciones `"unavailable"` y la pregunta 1 decide con fuentes públicas (unitario `tests/evaluation-input.test.ts`).
  - [x] Dirección impostora → `cut` de la pregunta 1 con `address`; verificado en vivo contra la lista pública de Binance (`0x…dead` → `CONTRACT_NOT_LISTED`; `NVDAB` real pasa la pregunta 1 con attestation y BEP-8056 por el RPC público).
  - [x] `priceImpactPercent` se traduce a proporción y `simulatedCostUsd = monto × (1 + impacto)`; sin el campo es `"unavailable"` (unitario `tests/trading.test.ts`).
  - [x] `reference`/`regime` reflejan `dynamic`/`status` públicos o quedan «sin dato» (unitario).
  - [x] La pantalla tiene escena «En vivo» que llama a `POST /api/evaluate`; las seis escenas del demo siguen fijas (e2e).
  - [x] `npm run check` en verde.
- Plan: firmante → fuentes públicas → cotización firmada → orquestador → route → escena en vivo.
- Decisiones:
  - `checkContract` sigue igual; la inyección va por `checkContractSources`/`Q1Sources` y `publicQ1Sources`/`signedQ1Sources` comparten `decideAuthenticity`.
  - El `type` de la lista pública mapea 1→Ondo, 2→xStocks, 3→bStocks; xStocks sigue sin lista oficial en RWA Data (ADR 0002) aunque el endpoint la traiga.
  - La cotización exige las tres rutas (spec congelada): un emisor sin contrato o sin quote deja el conjunto «sin dato».
  - `exit` queda `"unavailable"`; la simulación de venta es la tarea siguiente con la Transaction API.
  - `binanceCredentials` acepta los alias del portal `API_KEY`/`SECRET_KEY`/`API_SECRET`, pero solo si el nombre canónico `BINANCE_*` falta o está vacío: gana el primer valor no vacío ya recortado.
- Bloqueos:
  - `BINANCE_API_KEY` + `BINANCE_API_SECRET` (o `BINANCE_PRIVATE_KEY`) no están en `.env`: las cotizaciones (pregunta 2) quedan «sin dato» hasta que la credencial llegue.
  - `STOCKPROOF_CALLER` sin definir: las llamadas reales se anotan como `desconocido`.
- Último resumen: `POST /api/evaluate` ya evalúa en vivo. `lib/binance/sign.ts` firma X-OC-* (HMAC o RSA/Ed25519 con autodetección, payload = timestamp+método+/build+path+query+cuerpo compacto, verificado contra el SDK oficial); `binanceCredentials` acepta además los alias del portal `API_KEY`/`SECRET_KEY`/`API_SECRET` cuando el nombre `BINANCE_*` falta o está vacío. `lib/binance/rwa-public.ts` trae lista oficial, metadata con attestation, dinámica (precio token/acción, multiplicador, estado) y estado de mercado sin credenciales. `lib/binance/trading.ts` cotiza `/api/v1/dex/aggregator/quote` firmado con mejor-impacto-entre-vendors. `lib/evaluation-input.ts` arma el `EvaluateInput`: ticker→contratos por la lista, pregunta 1 por contrato (firmada si hay key, pública si no), tres cotizaciones o «sin dato», reference del token bStocks (o el primero listado) y régimen del estado global. `app/api/evaluate/route.ts` expone POST (runtime nodejs). La pantalla suma la escena «En vivo». `npm run check` en verde: lint, typecheck, 122 unitarios (30 nuevos) y 7 e2e. Verificación en vivo real: impostor → corte q1; NVDAB real → pasa q1 y queda en «sin cotización» (falta la key).

## Revisión

- **Veredicto: Aprobado** (revisión del harness, 28 sep 2026 ~20:30 -03). La spec `specs/conexion-datos.md` sigue en estado `borrador`: la aprobación final de Agustín —que cubre spec e implementación— ocurre en el pull request, según el acuerdo registrado.
- Comandos corridos por el revisor: `git status`, `git diff` completo de los 6 archivos modificados, `npm run check` → **verde**: eslint sin errores, `tsc --noEmit` limpio, 122 unitarios (10 archivos) y 7 e2e pasando.
- Criterios verificados contra código y tests: firma `X-OC-SIGN` (payload y las tres variantes HMAC/RSA/Ed25519, `tests/binance-sign.test.ts`); modo público sin credenciales con cotizaciones `"unavailable"` y pregunta 1 real (`tests/evaluation-input.test.ts`); impostor → corte de la pregunta 1; `priceImpactPercent`→proporción y `simulatedCostUsd` (`tests/trading.test.ts`); `reference`/`regime` desde `dynamic`/`status` (`tests/rwa-public.test.ts`, `evaluation-input`); escena «En vivo» (e2e en verde); una sola puerta — `fetch` solo existe dentro de `binanceRequest`.
- Corrección de alias: especificada en la spec (criterio 2, viñeta «Credenciales»), en `.env.example` y en Decisiones; implementada con `firstNonEmpty` (el canónico `BINANCE_*` gana; el alias solo se usa si el canónico falta o está vacío/espacios) y cubierta por 5 tests nuevos en `tests/binance-sign.test.ts` (aceptación, prioridad de key y de secret, `null` sin firma, canónico vacío que no pisa al alias).
- Secretos: el diff de `logs/binance-calls-desconocido.jsonl` (19 líneas nuevas de llamadas reales) no contiene API keys, secretos ni headers — solo params y respuestas públicas (direcciones de contrato, precios, estado de mercado, errores de quote). `.env` no está trackeado (`.gitignore`). Conforme a `specs/registro-llamadas.md`, las líneas se suben y no se borran.
- Observación menor (no bloqueante): `getAggregatedQuote` acepta `code` `0`/`"0"`; la spec menciona `"000000"` (formato de los endpoints `/bapi` públicos). Los logs reales muestran que `/build` devuelve `code` entero, y un `"000000"` improbable caería en `"unavailable"` — fail-closed, seguro. Si se quiere cubrir también ese formato, va en una corrección futura.
