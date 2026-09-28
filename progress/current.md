# Tarea: Congelar el formato de la evaluación

- Estado: en curso
- Spec: specs/formato-evaluacion.md (Estado: borrador; la aprueban los tres en el pull request — la issue #1 lo exige)
- Issue: #1 · Rama: `feat/formato-evaluacion`, sale de `feat/pregunta-1-contrato-real` (PR #36) para usar `q1-reasons.ts`
- Bloquea a todas las demás tareas del tablero.
- Criterios de aceptación: los de la spec. Estado:
  - [x] El tipo `Evaluation` del código coincide campo a campo con la spec (`lib/evaluate.ts`).
  - [x] `lib/evaluation-examples.ts` produce un ejemplo por `kind`, un `pass` con bloque de salida completo y un `pass` con capas en «sin dato» (seis estados, mapeados a las escenas del video).
  - [x] `npm run check` en verde (lint, typecheck, 72 unitarios — 15 del formato — y e2e).
  - [ ] Aprobación escrita de Agustín, Lautaro y Luciano en el pull request.
- Plan:
  1. Redactar la spec con la unión `Evaluation` completa.
  2. Implementar el tipo, `evaluate`, los ejemplos y los tests en el mismo cambio.
  3. Revisión de los tres en el PR (incluye las tres preguntas abiertas de la spec).
- Decisiones:
  - Se extiende la unión por `kind` (no se reestructura a `questions: {...}`): la pantalla y los tests ya hablan ese idioma.
  - La elegibilidad viaja como `authenticity: Q1Result` por cotización (no un flag aparte): la pregunta 1 se decide por contrato y xStocks cotiza pero no gana. Resuelve las dos pendientes del ADR 0002.
  - `target` opcional para la dirección que pega el usuario (escena 3).
  - `reference`, `regime` y `exit` son opcionales en la entrada: ausentes → «sin dato» en el resultado, y la ola 1 no se bloquea esperando las preguntas 3 y 4.
  - `constraints` queda reservado para los topes de la frase; `evaluate` informa violaciones, el agente decide (issue #22).
  - `reason` de la pregunta 1 está tipado con `Q1CutReason` (de `q1-reasons.ts`); el de las preguntas 2-4 es `string` hasta que sus specs fijen las listas.
- Bloqueos:
  - La aprobación de los tres (issue #1). Las pantallas ya pueden construirse contra `evaluationExamples`.
- Último resumen: `evaluate` congela el formato completo (4 preguntas con motivo, bloque de salida, «sin dato»). Cortes implementados: pregunta 1 por contrato objetivo o por cotizaciones sin elegibles, pregunta 2 por impacto. Las preguntas 3 y 4 pasan datos o «sin dato» hasta que sus specs definan reglas de corte.

## Revisión

- (pendiente: Agustín, Lautaro y Luciano)
