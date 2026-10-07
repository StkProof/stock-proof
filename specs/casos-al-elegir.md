# Spec: la app abre con un caso y lo aplica al elegirlo

- **Estado**: aprobada (Agustín, 7 oct 2026: «si, hacelo asi», sobre el plan de mergear #47 y rescatar de #46 el comportamiento de la pantalla, adaptado a `/app`)
- **Fecha**: 2026-10-07
- **Autor**: Luciano (comportamiento, en `specs/presentacion.md` del #46), adaptado por agente (Cursor)
- **Sigue a**: `specs/landing-y-app.md` (#47). Reemplaza a `specs/presentacion.md`, que no entró: su separación de portada y operación ya la hizo #47 con `/app`.

## Contexto y problema

`/app` abre con un formulario vacío, un selector de rótulos largos y la dirección del contrato a la vista. Para ver una evaluación hay que elegir una escena y apretar Evaluar, y la frase no coincide con el ejemplo que se muestra. Esta spec cambia solo la pantalla de `/app`. No cambia `evaluate`, los textos de motivo, la firma ni la landing.

## Comportamiento esperado

Al abrir `/app`, sin otro clic, está el caso que pasa: ticker `QQQB`, monto `200`, tope `1`, veredicto «Se puede firmar», las cuatro preguntas en «Pasó» y el bloque de salida. El cartel dice que es un ejemplo guardado y que no consulta el mercado. «Firmar swap» se ve y está deshabilitado.

El selector se rotula «Caso». Elegir otro caso de ejemplo aplica ese resultado al toque y alinea la frase: ticker, monto, tope y, en el contrato impostor, la dirección `0x000000000000000000000000000000000000dead`. El tope del caso «El tope de la frase no se cumple» queda en `0,3`, que es el 0,3 % con el que se armó el ejemplo.

«En vivo» queda al final del selector. No llama a `/api/evaluate` al elegirlo: borra el resultado y espera el botón Evaluar. Recién ahí manda `maxImpactPercent` si el tope es un porcentaje válido.

La dirección del contrato no se ve al entrar. Aparece en el caso del impostor, o si se aprieta «Revisar un contrato».

La pantalla sigue sin decidir el corte.

## Criterios de aceptación

- [x] `/app` muestra, sin clic, `QQQB`, `200`, tope `1`, «Se puede firmar», las cuatro preguntas en «Pasó», «sin dato» en las señales y «Firmar swap» deshabilitado. No muestra `POOL_DISPERSION` ni el campo de dirección (e2e).
- [x] Elegir cada caso guardado completa ticker, monto y tope y muestra su resultado sin apretar Evaluar (e2e, un recorrido por caso).
- [x] El contrato impostor muestra la dirección `0x…dead`; «Corta: el monto no entra» no la muestra (e2e).
- [x] «Revisar un contrato» muestra la dirección sin borrar el resultado (e2e).
- [x] Elegir «En vivo» no llama a `/api/evaluate` hasta apretar Evaluar (e2e).
- [x] Apretar Evaluar en un caso guardado no llama a `/api/evaluate` (e2e).
- [x] Un tope `0` pide corrección y no deja `resultado` (e2e).
- [x] Siguen en pie los criterios de `/app` de `specs/landing-y-app.md`: encabezado mínimo, sin three.js, logo a `/`, 390 px sin scroll horizontal (e2e).
- [x] `npm run check` en verde (7 oct 2026, Node 20: eslint, tsc, 219 unitarios, 25 e2e).

## Casos borde

- Escribir en la frase borra el resultado hasta la próxima evaluación.
- Un tope inválido no evalúa, tampoco en un caso de ejemplo.
- Ticker vacío o monto que no es un número positivo: `invalid`, sin costos ni firma.
- Un caso de ejemplo no llama a `/api/evaluate`, aunque después se apriete Evaluar.
- «En vivo» con la red caída: `unavailable` de la pregunta 1, motivo `LIST_UNAVAILABLE`.

## Fuera de alcance

- La landing (`/`) y su muestra con pestañas: siguen como las dejó #47.
- La ruta `/operar` y el cambio de encabezado de `specs/presentacion.md`: #47 ya resolvió las dos pantallas con `/app` y `AppHeader`.
- Habilitar la firma.
- Cambiar `evaluate` o hacer que el caso inicial consulte Binance.

## Decisiones técnicas

- El control sigue siendo `select[name="escena"]`, para no romper los e2e. El rótulo visible es «Caso».
- El caso inicial es `pass`, el mismo que usan la landing y los e2e.
- `0,3` en la frase del tope incumplido es presentación: el ejemplo ya está calculado con `maxImpactRatio: 0.003`. La pantalla no recalcula.
- El título de la pantalla sigue siendo `h2`: en `/app` la `h1` es «Evaluá la operación.».
