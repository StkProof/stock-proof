# Tarea: Base de evaluate (preguntas 1 y 2)

- Estado: terminado
- Spec: specs/preguntas-1-y-2.md (Estado: aprobada)
- Criterios de aceptación:
  - [x] `evaluate` corta en la pregunta 1 si el contrato no es oficial, aunque la orden entraría (unitario `tests/evaluate.test.ts`).
  - [x] `evaluate` elige el wrapper de menor impacto ≤ 1%, acepta el 1% exacto y desempata bStocks → Ondo → xStocks (unitario).
  - [x] `evaluate` corta en la pregunta 2 con los tres costos cuando todos superan el 1% (unitario).
  - [x] Entrada inválida y datos que no se pudieron obtener no inventan un precio (unitario).
  - [x] `lib/evaluation-examples.ts` expone los cinco estados para la pantalla.
  - [x] `npm run check` en verde.
- Plan:
  1. Aprobar la spec para esta base.
  2. Implementar `evaluate` y los ejemplos.
  3. Verificar con `npm run check` y revisión.
- Decisiones:
  - La base es la función pura, no la pantalla ni las APIs: el resto del equipo trabaja encima de ese resultado.
  - El texto en castellano lo escribe frontend. `evaluate` devuelve datos (`kind`, pregunta, wrapper, costos), no frases.
  - Las cotizaciones salen siempre en orden bStocks, Ondo, xStocks, para que la pantalla no dependa del orden de la API.
- Bloqueos:
  - (ninguno para esta tarea)
- Último resumen: `lib/evaluate.ts` decide las preguntas 1 y 2. La pantalla sigue siendo la de la plantilla. Frontend puede arrancar por `lib/evaluation-examples.ts`. La key de Binance del portal ya está: el siguiente trabajo de lógica es llamarla desde el servidor (pregunta 1, después la simulación). La key va en `.env` y no se commitea. Verificar esta base con `npm test` o `npm run check`.

## Revisión

- **Aprobado** (2026-09-27).
- Verifiqué `npm run check`: lint, typecheck, 13 unitarios y el e2e de la home de la plantilla, en verde.
- Los unitarios cubren entrada inválida, corte de la pregunta 1 (lista, attestation y estándar) aunque haya una cotización que entraría, corte de la pregunta 2 con los tres costos, umbral exacto de 1%, desempate y datos incompletos.
- Fuera de esta tarea, y no se exige acá: la pantalla (criterios e2e de la spec) y el adaptador a las APIs reales.
