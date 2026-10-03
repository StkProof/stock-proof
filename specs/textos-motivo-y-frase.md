# Spec: textos de motivo y frase de tope

- **Estado**: en implementación (Luciano aprobó el alcance el 2 oct 2026: «vamos con todo eso»)
- **Fecha**: 2026-10-02
- **Autor**: Luciano
- **Issues**: #21 (textos de los códigos), #23 (la frase y su tope de costo)
- **No reabre**: la pantalla ya dibuja las preguntas 3 y 4 y el bloque de salida (#20) y ya consulta en vivo (#11). Esta spec no los rehace.

## Contexto y problema

La lógica devuelve códigos. La pantalla escribe el castellano. Las preguntas 1 y 2 ya tienen frase. Estos códigos caen en «Motivo no reconocido.»:

- `DEVIATION_UNEXPLAINED`
- `TOKEN_PRICE_UNAVAILABLE`
- `REFERENCE_PRICE_UNAVAILABLE`
- `POOLS_DISAGREE`

En la salida, `POOL_DISPERSION` y `OFF_HOURS_WEEKEND` se ven como código crudo.

La issue #23 pide la oración «comprame $200 de NVIDIA si el contrato es el real y el costo es menor al 1%». La oración es de la pantalla. El tope solo llega a la decisión si la ruta reenvía `constraints`. `evaluate` ya los mira después de las cuatro preguntas y no las reemplaza. Viola cuando `impactRatio > maxImpactRatio` (igual al tope no viola), la misma frontera que la pregunta 2 (`<= 1 %`). Esta spec no cambia esa comparación.

## Comportamiento esperado

### Textos

`reasonText` tiene frase para los códigos de pase, corte y «sin dato» de la pregunta 3, y para el corte de la pregunta 4. Un código desconocido sigue en «Motivo no reconocido.», nunca crudo.

Los códigos de pase de la pregunta 3 no viajan en `Evaluation`. La frase existe para que, si el código llega a `reasonText`, no caiga en el genérico. No se agrega un campo al resultado.

`signalText` traduce las dos señales que los ejemplos mostraban antes del cableado (`specs/cableado-evaluate.md`):

- `POOL_DISPERSION` → «Dispersión entre pools»
- `OFF_HOURS_WEEKEND` → «Fuera del horario del emisor»

Una señal desconocida se lee «Señal sin nombre reconocido.». Nunca el código.

Desde el cableado, `evaluate` deja `exit.risk` en `"unavailable"` hasta la issue #19, así que ninguna escena muestra señales: la capa dice «sin dato». La frase queda lista para cuando lleguen.

### Frase

La oración de la home es: «Comprame US$ [monto] de [ticker] si el contrato es el real y el costo no supera el [tope] %.»

«no supera el» es la oración que coincide con `>`. No es un cambio de `evaluate`.

El tope se escribe en por ciento: «1» es 1 %, «0,5» es 0,5 %. Vacío: la frase no pide tope. Inválido (cero, negativo, mayor a 100 o no numérico): la pantalla no evalúa, enfoca el campo y muestra «El tope tiene que ser un porcentaje mayor a cero y como máximo 100.». No reutiliza el mensaje de ticker o monto.

El ticker o el monto inválidos se miran antes que el tope.

Solo la escena «En vivo» envía `maxImpactPercent`: el texto escrito, con punto decimal. La ruta lo convierte a fracción y lo reenvía como `constraints.maxImpactRatio`. Un tope inválido en el cuerpo se omite y las cuatro preguntas igual corren. No responde 400.

Las escenas de ejemplo ignoran el valor de un tope válido y muestran el resultado ya calculado; un tope inválido frena igual, en cualquier escena, porque la pantalla no evalúa con la frase mal escrita. `passTopeFrase` es ese caso: las cuatro preguntas pasan y `constraints.violated` incluye `MAX_IMPACT_RATIO`, porque el ganador impacta 0,4 % y el tope guardado es 0,3 %. Un tope de exactamente 1 % no produce ese estado: un impacto peor ya corta en la pregunta 2.

La escena por defecto sigue siendo `pass`. El botón «Firmar swap» se ve y queda deshabilitado. Negarse a firmar es del agente (issue #22).

## Criterios de aceptación

- [x] `reasonText` tiene frase para los códigos de las preguntas 3 y 4 que ya devuelve la lógica, y esa frase no contiene el código (unitario).
- [x] `signalText` traduce `POOL_DISPERSION` y `OFF_HOURS_WEEKEND`. Un código desconocido no se muestra crudo (unitario). En las escenas que pasan, `salida-riesgo` dice «sin dato» y no muestra el código (e2e).
- [x] La home muestra la oración con el tope y el valor inicial «1». Un tope inválido pide corrección y no muestra `resultado` (e2e).
- [x] La escena `passTopeFrase` muestra «Se puede firmar» y «tope de impacto», con «Firmar swap» deshabilitado (e2e). El ejemplo sale de `evaluate` con `violated: ["MAX_IMPACT_RATIO"]` (unitario).
- [x] `buildEvaluateInput` reenvía `maxImpactRatio` solo si vino un número finito mayor a cero, y no lo inventa si no vino (unitario).
- [x] `POST /api/evaluate` convierte `maxImpactPercent` (texto o número) a fracción y omite el inválido (`"0"`, `"150"`, `"abc"`, `true`, `null`) sin responder 400 (unitario `tests/evaluate-route.test.ts`).
- [x] Un tope igual al impacto ganador no figura como violado, con las dos puntas dividiendo el porcentaje por 100 (unitario).
- [x] En vivo, «0,5» viaja como `maxImpactPercent: "0.5"` y el tope vacío no manda la clave (e2e con la ruta interceptada).
- [x] En 390 px la home no genera scroll horizontal (el e2e que ya cubre la home).
- [x] `npm run check` en verde (3 oct 2026, Node 20: eslint, tsc, 214 unitarios, 15 e2e).

## Casos borde

- Tope vacío en vivo: no se manda `maxImpactPercent`.
- Tope igual al impacto del ganador: puede pasar la pregunta 2 y el tope no figura como violado.
- Tope de 1 % con un ganador peor que 1 %: corta la pregunta 2. No llega a `pass` con violación.
- Escena de ejemplo con un tope válido distinto del ejemplo: se muestra el ejemplo. No se recalcula.
- Tope inválido en el POST: se omite. Las cuatro preguntas corren con el 1 % fijo.
- `exit.risk` sigue en `"unavailable"` (issue #19). `exit.now` y `exit.availability` los arma el cableado, no esta spec.

## Fuera de alcance

- Cambiar la comparación de `evaluate` o el 1 % de la pregunta 2.
- Pedir `maxDeviationRatio` en la oración. El campo ya existe en `evaluate`; esta frase solo pide impacto.
- Habilitar la firma.
- Hacer que la escena por defecto sea en vivo.
- Inventar un campo en `Evaluation` para los códigos de pase de la pregunta 3.
- Reescribir las frases de las preguntas 1 y 2 que ya existían.

## Decisiones técnicas

- El cuerpo HTTP habla en por ciento (`maxImpactPercent`). `EvaluateRequest.maxImpactRatio` es la fracción. Las dos puntas usan `impactRatioFromPercent`.
- `passTopeFrase` existe para el video y el e2e, sin red y sin aplicar el número tipeado.
- El castellano de los motivos sigue en `components/messages.ts`, en tercera persona, como las frases que ya estaban.
