# Tarea: Conexión a datos reales (`/api/evaluate`)

- Estado: en curso
- Spec: specs/conexion-datos.md (Estado: borrador — Agustín pidió implementar junto con la spec; la aprueba en el pull request)
- Issues que cubre: #2 (cliente firmado), #7 (cotización pregunta 2), #9 (conectar a evaluate)
- Rama: `feat/conexion-datos`, sobre `feat/pantalla-estados` (que ya trae el formato congelado y el merge de `feat/registro-llamadas` con `assertBinanceHost`)
- Criterios de aceptación (de la spec):
  - [x] `X-OC-SIGN` firma `timestamp + método + "/build" + path + "?" + query + cuerpo`; soporta HMAC (`BINANCE_API_SECRET`) y clave RSA/Ed25519 (`BINANCE_PRIVATE_KEY`) (unitario `tests/binance-sign.test.ts`, 7 tests).
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
- Bloqueos:
  - `BINANCE_API_KEY` + `BINANCE_API_SECRET` (o `BINANCE_PRIVATE_KEY`) no están en `.env`: las cotizaciones (pregunta 2) quedan «sin dato» hasta que la credencial llegue.
  - `STOCKPROOF_CALLER` sin definir: las llamadas reales se anotan como `desconocido`.
- Último resumen: `POST /api/evaluate` ya evalúa en vivo. `lib/binance/sign.ts` firma X-OC-* (HMAC o RSA/Ed25519 con autodetección, payload = timestamp+método+/build+path+query+cuerpo compacto, verificado contra el SDK oficial). `lib/binance/rwa-public.ts` trae lista oficial, metadata con attestation, dinámica (precio token/acción, multiplicador, estado) y estado de mercado sin credenciales. `lib/binance/trading.ts` cotiza `/api/v1/dex/aggregator/quote` firmado con mejor-impacto-entre-vendors. `lib/evaluation-input.ts` arma el `EvaluateInput`: ticker→contratos por la lista, pregunta 1 por contrato (firmada si hay key, pública si no), tres cotizaciones o «sin dato», reference del token bStocks (o el primero listado) y régimen del estado global. `app/api/evaluate/route.ts` expone POST (runtime nodejs). La pantalla suma la escena «En vivo». `npm run check` en verde: lint, typecheck, 117 unitarios (25 nuevos) y 7 e2e. Verificación en vivo real: impostor → corte q1; NVDAB real → pasa q1 y queda en «sin cotización» (falta la key).

## Revisión

- (pendiente)
