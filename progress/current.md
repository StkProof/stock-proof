# Tarea: Pantalla única de StockProof (los seis estados)

- Estado: en curso
- Spec: specs/preguntas-1-y-2.md (Estado: aprobada) + contrato congelado en specs/formato-evaluacion.md (no se edita, es de otra tarea)
- Issue: #8 · Rama: `feat/pantalla-estados`, sale de `feat/formato-evaluacion` para usar el tipo `Evaluation` y los seis ejemplos
- Criterios de aceptación (de la spec de preguntas 1 y 2, más el alcance de la issue):
  - [x] Formulario con ticker, monto en USD y dirección opcional de contrato a revisar; un selector de escena elige qué ejemplo de `lib/evaluation-examples.ts` muestra «Evaluar» (todavía no hay backend).
  - [x] Las cuatro preguntas como filas con estado: verde pasó, rojo cortó, gris «sin dato» o no evaluada (e2e `e2e/pantalla.spec.ts`).
  - [x] `cut` de la pregunta 1 muestra el motivo en castellano y la dirección si está; `cut` de la 2 muestra las tres cotizaciones con impacto y costo; `pass` muestra emisor ganador, costo, impacto, empate, bloque de salida en tres capas y botón de firma visible sin acción (e2e).
  - [x] `invalid` pide corregir la entrada; `unavailable` dice qué pregunta no se pudo evaluar y por qué (e2e).
  - [x] Todo `"unavailable"` del resultado se lee «sin dato»; ningún código crudo llega a la pantalla (unitario `tests/messages.test.ts` + e2e de la escena con «sin dato»).
  - [x] `npm run check` en verde (lint, typecheck, 86 unitarios — 17 nuevos — y 7 e2e).
- Plan:
  1. Helpers de formato USD/porcentaje/fecha en `lib/format.ts` (funciones nuevas; `formatCurrency` ARS no se toca).
  2. Textos de la pantalla en `components/messages.ts` (los códigos llegan de la lógica; el castellano es provisional hasta la issue #21).
  3. `components/evaluation-result.tsx` renderiza `Evaluation` por `kind`; `components/stock-proof-screen.tsx` tiene el formulario y el selector de escena.
  4. e2e nuevo `e2e/pantalla.spec.ts`; la spec `specs/example.md` queda marcada como reemplazada.
  5. `npm run check`, resumen y pull request.
- Decisiones:
  - La pantalla consume `Evaluation` y no decide: el selector de escena elige qué resultado ya computado mostrar; la validación de entrada (`invalid` con ticker vacío o monto no positivo) es local, como pide la spec («no llama a las APIs»).
  - El monto acepta coma decimal es-AR («200,50») normalizando a punto antes de validar.
  - Componentes en `components/` (convención Next cuando `app/` solo tiene rutas); estilos con CSS module `stock-proof.module.css` (la plantilla no trae Tailwind).
  - «Emisor» en la UI en vez de «wrapper» (menos jerga); los nombres bStocks/Ondo/xStocks se muestran tal cual.
  - El botón de firma existe y está deshabilitado con nota: se ve y no envía, como fija la spec.
  - `formatUsd`, `formatPercent`, `formatUtcDateTime` y `timeSince` van en `lib/format.ts` con unitario (la spec de formato deja `formatCurrency` en USD explícitamente fuera, así que el helper es propio y ARS queda igual).
- Bloqueos:
  - Las APIs de Binance no están: la pantalla trabaja contra `evaluationExamples`. El campo de dirección y el selector de escena son puentes del demo hasta la integración.
- Último resumen: `/` es la pantalla de StockProof. `components/stock-proof-screen.tsx` tiene el formulario (ticker, monto USD, dirección opcional) y un selector de escena que elige qué ejemplo de `lib/evaluation-examples.ts` muestra «Evaluar»; la entrada inválida se pide corregir en local sin llamar a nada. `components/evaluation-result.tsx` dibuja cada `kind` de `Evaluation`: las cuatro preguntas con estado, los motivos en castellano (`components/messages.ts`, provisionales hasta la issue #21), la tabla de cotizaciones, el detalle de referencia/régimen y el bloque de salida en tres capas con «sin dato» donde el dato no llegó. `lib/format.ts` suma `formatUsd`, `formatPercent`, `formatUtcDateTime` y `timeSince` (ARS intacto). `e2e/pantalla.spec.ts` reemplaza al de la plantilla y recorre los seis estados; `specs/example.md` quedó marcada como reemplazada. Además esta rama incorporó el merge de `feat/registro-llamadas` (`28c6baa`): la puerta conserva la lectura acotada del cuerpo y la redacción por nombre en `context` de esta rama, y suma la lista de hosts permitidos (`assertBinanceHost`) y el tapado de secretos por valor en la respuesta (`scrubSecrets`). `npm run check` en verde.

## Revisión

- (pendiente)
