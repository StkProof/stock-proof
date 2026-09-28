# Tarea: Registro de llamadas a Binance

- Estado: en revisión
- Spec: specs/registro-llamadas.md (Estado: borrador; la aprueba Agustín en el pull request)
- Issue: #4
- Criterios de aceptación:
  - [x] Una llamada que sale bien deja una línea con todos los campos de la tabla, y la puerta devuelve la respuesta sin cambios (unitario `tests/binance-request.test.ts` con `fetch` sustituido por un doble).
  - [x] Una llamada con error HTTP deja una línea con `ok: false`, `status` y `error`, y quien llamó recibe el error igual que sin registro (unitario).
  - [x] Una falla de red deja una línea con `status: null` y el error, y el error llega a quien llamó (unitario).
  - [x] La API key, el secreto y la firma no aparecen en ninguna línea del registro (unitario que busca esos valores en el archivo escrito).
  - [x] Si escribir el registro falla, la puerta devuelve igual la respuesta de Binance (unitario con la carpeta de logs apuntando a un lugar donde no se puede escribir).
  - [x] Sin `STOCKPROOF_CALLER`, la línea tiene `caller: "desconocido"` y va a `logs/binance-calls-desconocido.jsonl` (unitario).
  - [x] `evaluationId`, `referencePriceAt` y `txHash` se guardan en la línea tal como los pasó quien llamó, y dos llamadas con el mismo `evaluationId` quedan unidas por ese valor (unitario).
  - [x] `newEvaluationId()` devuelve un identificador distinto en cada llamada (unitario).
  - [x] Dos llamadas seguidas dejan dos líneas, en orden, cada una JSON válido por sí sola (unitario).
  - [x] `.env.example` documenta `STOCKPROOF_CALLER`, `STOCKPROOF_ENV` y `STOCKPROOF_LOG_DIR`.
  - [x] `npm run check` sigue en verde.
- Plan:
  1. Tipos y reglas de ocultamiento en `lib/binance/call-log.ts`.
  2. La puerta: `binanceRequest` en `lib/binance/request.ts`.
  3. Variables de entorno en `.env.example`.
  4. Tests en `tests/binance-request.test.ts`.
  5. Cierre: `npm run check`, resumen y pull request contra `develop` con Agustín como revisor.
- Decisiones:
  - Una sola puerta: todas las llamadas a Binance salen por `binanceRequest` (ADR 0001, `docs/adr/0001-una-sola-puerta-binance.md`).
  - Un archivo por persona (`logs/binance-calls-<caller>.jsonl`), subido al repo.
  - Sin dependencias nuevas: `fetch` de Node y `node:fs/promises`.
- Bloqueos:
  - (ninguno para esta tarea)
- Último resumen: `binanceRequest` (`lib/binance/request.ts`) es la única salida a Binance: llama con `fetch`, anota una línea JSON en `logs/binance-calls-<caller>.jsonl` y devuelve la `Response` original; si la red falla, anota y relanza el mismo error. El registro (`lib/binance/call-log.ts`) oculta en `params` todo campo cuyo nombre contenga key, secret, signature, token o password, no guarda headers, recorta el cuerpo a 20 KB y nunca lanza. `response` se guarda como `{ body, truncated }` (o `null` si falló la red). `durationMs` mide hasta que vuelve la respuesta, sin contar la lectura del cuerpo. Hoy ningún otro archivo de `app/` ni `lib/` llama a Binance (buscado con grep: no hay `fetch` ni hosts de Binance fuera de la puerta). `npm run check` en verde: lint, typecheck, 24 unitarios (11 nuevos) y el e2e. Los tests escriben en una carpeta temporal; no crean `logs/`.

## Revisión

- (pendiente: Agustín)
