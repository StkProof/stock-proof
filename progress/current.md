# Tarea: Pregunta 1, ¿este contrato es el real?

- Estado: en curso
- Spec: specs/pregunta-1-contrato-real.md (Estado: borrador; la aprueba Agustín en el pull request, junto con el ADR 0002)
- ADR: docs/adr/0002-pregunta-1-codigo-de-motivo.md
- Issue: #6 · Rama: `feat/pregunta-1-contrato-real`, que sale de `feat/registro-llamadas` (PR #31) hasta que esa entre a `main`
- Tarea anterior: registro de llamadas (#4), en revisión en el PR #31. Pasó a `progress/history/2026-09-28-registro-llamadas.md`
- Criterios de aceptación: los de la spec. Estado:
  - [x] Decisión pura `decideAuthenticity` con los siete códigos y el orden de corte (`tests/q1-authenticity.test.ts`).
  - [x] `supportsInterface` por `eth_call`: true, false, revert, vacío y no disponible (`tests/q1-adapters.test.ts`).
  - [x] `searchRwa` y `getUnderlyingProfile` sobre `binanceRequest`, con fixtures y con la llamada anotada con `purpose: "q1"`, sin la firma (`tests/q1-adapters.test.ts`).
  - [x] `checkContract` consulta en orden y deja de consultar en el primer corte; xStocks no llama a nadie (`tests/q1-adapters.test.ts`).
  - [x] `.env.example` documenta `BSC_RPC_URL`.
  - [x] `npm run check` en verde (lint, typecheck, 63 unitarios, e2e).
  - [ ] Corrida real para QQQB y para un impostor, y fixtures reemplazados por respuestas reales.
- Decisiones:
  - xStocks: su pregunta 1 devuelve `LIST_UNAVAILABLE` sin llamar a Binance (ADR 0002, «Decisiones tomadas», 28 sep 2026).
  - La firma `X-OC-SIGN` entra como dependencia (`sign`) del adaptador RWA: la implementa el cliente de Agustín (#2).
  - La lista oficial sale de `rwa/search`. `rwa/tokens` no se llama.
  - Registro de llamadas: `redactParams` ocultaba `keyword` y `tokenContractAddress` porque contienen «key» y «token». Ahora mira el final del nombre. Cambio de la tarea #4, hecho acá porque lo encontró un test de esta; va en un commit aparte y hay que llevarlo al PR #31.
- Bloqueos:
  - Corrida real: falta la key de Binance y `BSC_RPC_URL` en `.env`, y la firma del cliente (#2) o una firma armada a mano en un script local.
  - `evaluate` no recibe todavía el motivo ni acepta un wrapper no elegible: PR aparte de Agustín.
- Último resumen: (se completa al cerrar)

## Revisión

- (pendiente: Agustín)
