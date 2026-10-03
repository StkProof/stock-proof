# Spec: separar la landing de la app

- **Estado**: aprobada (Agustín, 3 oct 2026: «Aprobada. Usa librerías como three.js para el dinamismo»)
- **Fecha**: 2026-10-03
- **Autor**: Agustín, con agente (Cursor). Esta vez la pantalla la manejamos nosotros (decisión de Agustín, 3 oct 2026).
- **Issue**: N/A — sigue a la cara editorial (`specs/pantalla-landing.md`, #43). No cambia `evaluate` ni el formato de `Evaluation`.

## Contexto y problema

`/` mezcla dos cosas: la landing que cuenta el producto (hero, manifiesto, pruebas de entrada y salida, cómo funciona, desarrolladores) y, metido en el medio, el formulario de evaluación (`StockProofScreen`, ancla `#demo`). Todos los botones bajan a ese ancla. Quien llega a contar la idea tiene que cruzar un formulario, y quien quiere evaluar tiene que scrollear por una landing.

Esta spec separa las dos pantallas: `/` cuenta, `/app` evalúa.

## Comportamiento esperado

### Landing (`/`)

1. Mantiene el encabezado con sus links a secciones (`#producto`, `#como-funciona`, `#desarrolladores`), el hero, las secciones de `SiteStory` y el pie.
2. No tiene formulario: no hay campos de ticker, monto, tope ni dirección, y no llama a `/api/evaluate`.
3. **Muestra de producto dinámica**, en el lugar donde hoy está el formulario: pestañas con resultados de ejemplo ya calculados por `evaluate` (`lib/evaluation-examples.ts`), dibujados con el mismo `EvaluationResult` de la app. Pestañas: «Pasa» (`pass`), «Corta en la salida» (`cutExitNow`), «Contrato impostor» (`cutQuestion1`) y «Nombre fino un sábado» (`passThinNameSinDato`). La primera es `pass`. Cambiar de pestaña cambia el resultado sin recargar. Es dinámica porque sale de `evaluate`, no de un número escrito en la landing.
4. **Escena 3D del recorrido** (three.js), al lado del resultado: cinco paradas en fila (las preguntas 1 a 4 y la firma) unidas por un trazo de tinta. Un pulso violeta recorre el trazo y se detiene en la primera parada que no pasó. Pasó: violeta; cortó: rojo (`--stop`); sin dato: gris; no se evaluó: apagado. En `pass` el pulso llega a la firma. Los estados salen de `questionStatuses`, la misma función que pinta la lista de preguntas del resultado, así que la escena no decide nada. La cámara orbita despacio.
5. La muestra dice que es un ejemplo guardado y no consulta el mercado, y ofrece un link a `/app` para probar con un ticker y un monto propios.
6. Los botones «Probar», «Ver la operación» y «Probar una evaluación» llevan a `/app` (hoy bajan a `#demo`).

### App (`/app`)

1. Encabezado mínimo: el logo, que lleva a `/`. Sin links a secciones ni botón «Probar».
2. El contenido es la pantalla de evaluación actual (`StockProofScreen`), sin cambios de comportamiento: formulario con la frase y el tope, selector de escenas, escena «En vivo», resultado.
3. Pie con la advertencia que hoy está en la landing (la escena en vivo consulta Binance, no es consejo de inversión, sin afiliación con los emisores).
4. Título propio de la pestaña del navegador: «StockProof — Evaluá la operación».

### Logo

El logo deja de apuntar a `#top`: lleva a `/` desde las dos pantallas (en la landing, `/` vuelve arriba igual).

## Criterios de aceptación

- [x] `/` muestra la `h1` «Ves la compra.» y no tiene los campos «Ticker», «Monto en USD» ni «Tope de costo» (e2e).
- [x] En `/`, la muestra arranca en «Pasa» con «Se puede firmar»; al tocar «Corta en la salida» muestra el corte por la venta, y al tocar «Contrato impostor» el corte de la pregunta 1; ninguna pestaña muestra un botón de firma activo (e2e).
- [x] La escena refleja la pestaña: el recorrido expone sus estados (`data-recorrido`) y cambia al cambiar de pestaña, por ejemplo `passed,passed,passed,passed,passed` en «Pasa» y `passed,cut,skipped,skipped,skipped` en «Corta en la salida» (e2e). La función que arma esos estados es pura y tiene unitario.
- [x] Con `prefers-reduced-motion: reduce` la escena no anima: dibuja un cuadro fijo con el pulso en su parada (e2e con `reducedMotion`).
- [x] La app (`/app`) no carga three.js: la escena vive solo en la landing y se importa de forma diferida (e2e: `/app` no tiene un `canvas` y no pide ningún script de three).
- [x] En `/`, «Probar» del encabezado y «Ver la operación» del hero llevan a `/app` (e2e).
- [x] `/app` muestra el formulario, y los recorridos que hoy prueba `e2e/pantalla.spec.ts` siguen pasando contra `/app` (e2e).
- [x] `/app` no muestra los links de secciones de la landing, y el logo lleva a `/` (e2e).
- [x] En 390 px ni `/` ni `/app` generan scroll horizontal (e2e).
- [x] `npm run check` en verde (3 oct 2026, Node 20: eslint, tsc, 219 unitarios, 20 e2e).

## Casos borde

- Entrar directo a `/app` (link compartido): funciona solo, sin pasar por la landing.
- Links viejos a `/#demo`: caen en la landing (el ancla ya no existe, el navegador queda arriba). No se agrega redirección.
- Una pestaña de la muestra con un ejemplo que cambie de forma en `evaluation-examples.ts`: la muestra lo sigue porque dibuja `EvaluationResult`, no copia sus textos.
- Sin JavaScript: la landing muestra la primera pestaña; cambiar de pestaña necesita JS (igual que el formulario hoy).
- Sin WebGL (navegador viejo, GPU bloqueada): la escena no se dibuja y no rompe la página; el resultado escrito sigue al lado. La escena es decorativa (`aria-hidden`): toda la información está en el texto.
- `prefers-reduced-motion`: cuadro fijo, sin órbita ni pulso en movimiento.
- Pestaña oculta o escena fuera de pantalla: la animación se pausa para no gastar batería.

## Fuera de alcance

- Cambiar `evaluate`, `Evaluation`, los textos de motivo o el formulario.
- Rediseñar las secciones de la landing o sus textos.
- Autenticación, wallet o firma en `/app`.
- Redirigir `/#demo` a `/app`.

## Decisiones técnicas

- **Ruta `/app`** (Agustín): corta y estándar para «la aplicación». Alternativas descartadas: `/evaluar`, `/probar`.
- **Encabezado mínimo en la app** (Agustín): la app se enfoca en la operación; la navegación de marketing distrae.
- **La muestra reutiliza `EvaluationResult` y `evaluationExamples`**: la landing no puede inventar números (`specs/pantalla-landing.md` ya descartó el fixture de la landing externa). Alternativa descartada: una captura o un bloque estático, que se desactualiza.
- **Solo cuatro pestañas**: cuentan el producto (pasa, corta por la salida, impostor, sábado con «sin dato»). Las ocho escenas completas quedan en la app.
- **Componentes**: se suma `AppHeader` (mínimo); `Wordmark` apunta a `/`.
- **three.js para la escena** (Agustín): da el movimiento que pide la landing. Se importa con `import()` dentro del componente cliente, así no pesa en `/app` ni en el primer render. Sin `@react-three/fiber`: una sola escena chica no justifica otra capa. Alternativa descartada: animación CSS o SVG, que no da la profundidad que se pidió.

## Dependencias

- `StockProofScreen`, `EvaluationResult` y `evaluationExamples` ya en `main` (#43, #44, #45).
- Dependencia nueva: `three` (y `@types/three` en desarrollo). No tiene dependencias propias.

## Estimación y slices

Unas 450 líneas: una ruta nueva, la muestra con pestañas, la escena 3D, ajustes de links y el reparto de los e2e. Un solo slice: la escena sin la muestra no tiene dónde vivir.
