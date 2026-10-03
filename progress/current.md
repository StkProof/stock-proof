# Tarea: Cableado de las preguntas 3 y 4 y Exit Now en `evaluate`

- Estado: en revisión
- Spec: specs/cableado-evaluate.md (Estado: borrador — se aprueba en el pull request; tiene dos preguntas abiertas para Agustín)
- Issue: N/A — sigue a #15, #16, #17 y #18, ya cerradas. Esas tareas dejaron las piezas sueltas; esta las conecta a `evaluate` y al orquestador.
- Rama: `feat/cableado-evaluate`, rebasada sobre `main` (`8c0860a`, después de #43)
- Criterios de aceptación (de la spec):
  - [x] Venta medida sobre el tope en todos los candidatos: `cut` de la pregunta 2 con `EXIT_OVER_LIMIT` y `exits` (unitario).
  - [x] Ninguna venta medida: `unavailable` de la pregunta 2 con `EXIT_NOW_UNAVAILABLE` (unitario).
  - [x] Gana el siguiente firmable y el empate solo cuenta entre firmables (unitario).
  - [x] Pregunta 3 sobre el ganador: corta con el candidato o queda «sin dato» (unitario).
  - [x] Pregunta 4: `POOLS_DISAGREE` corta; régimen ausente no corta (unitario).
  - [x] Venta con el `toTokenAmount` exacto y la wallet del agente; una falla no tumba al resto; `market/status` se lee una vez (unitario).
  - [x] `toTokenAmount` exacto por encima de 2^53 (unitario).
  - [x] Columna «Salida ahora» y corte por la venta en pantalla, sin firma (e2e).
  - [x] `npm run check` en verde (con Node 20, como CI).
- Plan: rebase sobre #43 → resolver la tabla de cotizaciones (huecos de #43 + columna de salida) → ajustar el e2e que contaba celdas con «US$» → e2e de la escena `cutExitNow` → spec propia → `check` → revisión → PR.
- Decisiones:
  - La salida viaja por wrapper (`exits`); el `exit` del `pass` es el del ganador. Motivo y alternativa en la spec.
  - Las preguntas 3 y 4 corren solo sobre el ganador de la 2: no se cambia de wrapper en silencio (regla del vault, 30 sep 2026).
  - Venta sin medir es `unavailable`, no `cut`: no se inventa el dato, y tampoco se firma.
- Notas:
  - Rebase: un solo conflicto, en `components/evaluation-result.tsx` (`QuotesTable` y `QuoteGaps`). Se quedaron los dos lados.
  - El e2e de la pregunta 2 de #43 contaba tres celdas con «US$»; con la columna de salida son cinco. Ahora cuenta filas y verifica la columna.
  - `tests/format.test.ts` falla en `main` con Node 24 (ICU pone un espacio no separable en «p. m.»). Con Node 20, que es el de CI, pasa. No es de esta tarea.
  - PR #44 (abierto) toca `lib/evaluation-input.ts`, la pantalla, `messages.ts` y `progress/`. El que se una segundo se rebasa. #44 ya archiva la tarea de la pantalla en `progress/history/2026-10-02-pantalla-landing.md`; acá no se duplica para no chocar.
  - Pregunta abierta 1 de la spec: fuera de rueda Binance manda el subyacente en `null`, así que en vivo un sábado no se firma nada (ni QQQB). Choca con la escena del vault.

## Revisión

Pendiente.
