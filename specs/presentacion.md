# Spec: portada y operación

- **Estado**: en implementación (Luciano aprobó el plan el 3 oct 2026)
- **Fecha**: 2026-10-03
- **Autor**: Luciano
- **Sigue a**: `specs/pantalla-landing.md` y `specs/textos-motivo-y-frase.md`

## Contexto y problema

La portada y el banco de pruebas estaban en la misma página. El jurado veía un formulario vacío, un selector de rótulos largos y la dirección del contrato, antes de ver una evaluación. Esta spec separa las dos pantallas. No cambia `evaluate`, los textos de motivo ni la firma.

## Comportamiento esperado

`/` es la portada. Muestra la `h1` «Ves la compra.» y el relato. No muestra ticker, monto, tope, selector ni resultado. «Probar», «Ver la operación» y «Probar una evaluación» van a `/operar`.

`/operar` es la demo. Al abrirla, sin otro clic, está el caso que pasa: ticker `QQQB`, monto `200`, tope `1`, veredicto «Se puede firmar», las cuatro preguntas en «Pasó» y el bloque de salida. El cartel dice que es un ejemplo guardado y que no consulta el mercado. «Firmar swap» se ve y está deshabilitado.

Elegir otro caso de ejemplo aplica ese resultado al toque y alinea la frase: ticker, monto, tope y, en el contrato impostor, la dirección `0x000000000000000000000000000000000000dead`. El tope del caso «El tope de la frase no se cumple» queda en `0,3`, que es el 0,3 % con el que se armó el ejemplo.

«En vivo» no llama a `/api/evaluate` al elegirlo. Deja la previa y espera el botón Evaluar. Recién ahí manda `maxImpactPercent` si el tope es un porcentaje válido.

La dirección del contrato no se ve al entrar. Aparece en el caso del impostor, o si se abre «Revisar un contrato».

El wordmark de `/operar` vuelve a `/`. El header de esa ruta no repite el menú de la portada: ofrece «La historia».

La pantalla sigue sin decidir el corte.

## Criterios de aceptación

- [x] `/` muestra «Ves la compra.» y no el campo Ticker. «Probar», «Ver la operación» y «Probar una evaluación» apuntan a `/operar` (e2e).
- [x] `/operar` muestra, sin clic, «Se puede firmar», las cuatro preguntas en «Pasó», «sin dato» en las señales y «Firmar swap» deshabilitado. No muestra `POOL_DISPERSION` ni el campo de dirección (e2e). Las señales siguen en «sin dato» hasta la issue #19.
- [x] Elegir «Corta: el monto no entra» muestra los tres emisores sin un segundo clic (e2e).
- [x] Elegir «En vivo» no llama a `/api/evaluate` hasta apretar Evaluar (e2e).
- [x] Un tope `0` pide corrección y no deja `resultado` (e2e).
- [x] El caso del tope incumplido muestra «tope de impacto» y «Se puede firmar» (e2e).
- [x] En 390 px, `/` y `/operar` no generan scroll horizontal (e2e).
- [x] `npm run check` en verde (3 oct 2026: eslint, tsc, 214 unitarios, 18 e2e).

## Casos borde

- Escribir en la frase borra el resultado hasta la próxima evaluación.
- Un tope inválido no evalúa, tampoco en un caso de ejemplo.
- Ticker vacío o monto que no es un número positivo: `invalid`, sin costos ni firma.
- Un caso de ejemplo no llama a `/api/evaluate`, aunque después se apriete Evaluar.
- «En vivo» con la red caída: `unavailable` de la pregunta 1, motivo `LIST_UNAVAILABLE`.

## Fuera de alcance

- Una cuenta, un login o un botón «Ingresar».
- Habilitar la firma.
- Cambiar `evaluate` o hacer que la escena por defecto consulte Binance.
- Portar porcentajes fijos de la landing.

## Decisiones técnicas

- El control sigue siendo `select[name="escena"]`. El rótulo visible es «Caso».
- El caso inicial es `pass`, el mismo que el video y los e2e ya usaban.
- `0,3` en la frase del tope incumplido es presentación: el ejemplo ya está calculado con `maxImpactRatio: 0.003`. La pantalla no recalcula.
