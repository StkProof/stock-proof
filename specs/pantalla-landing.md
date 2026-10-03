# Spec: cara editorial de la pantalla

- **Estado**: en implementación (Luciano aprobó el alcance el 2 oct 2026: «perfecto, comencemos»)
- **Fecha**: 2026-10-02
- **Autor**: Luciano
- **Issue**: la pantalla de producto (sigue la de la issue #8; no cambia el formato congelado)
- **Referencia visual**: repo privado `StkProof/stockproof-landing` (papel, tinta, violeta, recorrido intención → realidad → salida → prueba)

## Contexto y problema

`/` ya evalúa de verdad y dibuja los estados de `Evaluation`, con un formulario plano. La landing editorial de StockProof vive en otro repo y su demo usa un fixture fijo (0,78 % de costo, 97,24 % de salida). Esa cuenta no puede entrar a esta app: la decisión la sigue tomando `evaluate`.

Esta spec cambia la cara. No cambia la unión `Evaluation`, los códigos de motivo ni las reglas de corte.

## Comportamiento esperado

Al abrir `/` se ve la portada editorial en castellano: una sola `h1` («Ves la compra.») y el relato. El formulario no está en esta ruta. Los llamados «Probar», «Ver la operación» y «Probar una evaluación» van a `/operar`. Esa pantalla está en `specs/presentacion.md`.

En `/operar`, el resultado se lee de `Evaluation` y queda visible de una vez (no hay pasos que oculten un estado):

- Prueba: el veredicto (`Se puede firmar`, `No hay transacción`, `No se pudo evaluar`, `Revisá la entrada`).
- Las cuatro preguntas, en el orden 1–4, con `Pasó`, `No pasó`, `Sin dato` o `No se evaluó`.
- La realidad: emisor, costo, impacto, cotizaciones, referencia, régimen, motivos y, si vinieron, los huecos de cotización (`quoteGaps`).
- La salida: Salida ahora, Disponibilidad y Señales de riesgo. Cada `"unavailable"` se lee «sin dato».
- En `pass`, el botón «Firmar swap» se ve y está deshabilitado. No envía la transacción.

La pantalla no vuelve a decidir el corte ni recalcula costos.

## Criterios de aceptación

- [x] `/` muestra la `h1` «Ves la compra.» y no el formulario. «Probar» va a `/operar` (e2e).
- [x] Los recorridos de `e2e/pantalla.spec.ts` siguen encontrando los mismos textos y `data-testid` en `/operar` (`resultado`, `pregunta-1`…`pregunta-4`, `ruta-ganadora`, `cotizaciones`, `bloque-salida`, `salida-ahora`, `salida-disponibilidad`, `regimen`).
- [x] Un `quoteGap` se muestra con el emisor y una frase en castellano, nunca con el código crudo (unitario de `quoteGapText`).
- [x] En un viewport de 390 px de ancho, la home no genera scroll horizontal (e2e).
- [x] `npm run check` en verde.

## Casos borde

- Ticker vacío o monto no positivo: `invalid`, sin costos ni firma.
- Escena de ejemplo: no llama a `/api/evaluate`.
- Escena en vivo con la red caída: el mismo `unavailable` de la pregunta 1 que ya usa la pantalla (`LIST_UNAVAILABLE`).
- `quoteGaps` ausente o vacío: no se muestra la lista.
- Código de hueco desconocido: frase genérica, nunca el código.

## Fuera de alcance

- Portar `evaluateIllustration` o sus porcentajes fijos.
- Tailwind, Framer Motion o Next distinto del de esta app.
- Cambiar `lib/evaluate.ts`, el formato congelado o los textos de motivo que ya existen.
- Habilitar la firma. El botón sigue visible y deshabilitado.
- Pedir un tope de costo en la frase. Eso lo cubre `specs/textos-motivo-y-frase.md`. Acá los `constraints` se muestran si el resultado ya los trae.

## Decisiones técnicas

- Los tokens (papel `#f4f2eb`, tinta `#20211f`, violeta `#603be4`) viven en `app/globals.css`. El resultado sigue en `components/stock-proof.module.css`, usando esas variables.
- El castellano de la evaluación sigue en `components/messages.ts`. La home habla castellano, con voseo, como el resto de la pantalla.
- El formulario salió de la portada. Vive en `/operar`, como fija `specs/presentacion.md`.
- Los cuatro momentos del relato son títulos de la portada. No son pestañas que oculten el resultado.
