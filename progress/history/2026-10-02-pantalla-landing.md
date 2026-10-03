# Tarea: Cara editorial de la pantalla

Archivada al empezar `feat/textos-y-frase` (2 oct 2026). La tarea ya está en `main` (`8c0860a`, pull request #43). La revisión escrita de este archivo seguía pendiente al mergear.

- Estado: mergeada en main
- Spec: specs/pantalla-landing.md (Estado: en implementación — Luciano aprobó el alcance el 2 oct 2026)
- Rama: `feat/pantalla-landing`, sobre `main` (`576c0e7`)
- Criterios de aceptación (de la spec):
  - [x] `/` muestra la `h1` «Ves la compra.» y el formulario (e2e).
  - [x] Los siete recorridos de `e2e/pantalla.spec.ts` siguen encontrando los mismos textos y `data-testid`.
  - [x] Un `quoteGap` se muestra con el emisor y una frase en castellano, nunca con el código crudo (unitario de `quoteGapText`).
  - [x] En 390 px la home no genera scroll horizontal (e2e).
  - [x] `npm run check` en verde (2 oct 2026: eslint, tsc, 173 unitarios, 9 e2e).
- Revisión: pendiente al momento del merge. No se inventa una aprobación.
- Plan: tokens y secciones editoriales → formulario en la frase de intención, sin tocar la decisión → resultado con prueba, preguntas, realidad y salida → huecos de cotización → e2e de la home y del ancho → `npm run check`.
- Decisiones:
  - No entra el fixture de `stockproof-landing` (`evaluateIllustration`).
  - Sin Tailwind ni Framer Motion.
  - Castellano en toda la home. Los textos de motivo no se reescriben.
  - La escena por defecto sigue siendo `pass`.
- Notas:
  - La tarea anterior (`cotizaciones-parciales`) quedó archivada en `progress/history/2026-09-29-cotizaciones-parciales.md`. Ya está en `main`.
  - El tope de costo salió de «fuera de alcance» de esa spec y pasó a `specs/textos-motivo-y-frase.md`.
