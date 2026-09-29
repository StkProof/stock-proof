# Spec: formato congelado de la evaluación

- **Estado**: borrador (la aprueban los tres: Agustín, Lautaro y Luciano)
- **Fecha**: 2026-09-28
- **Aprobación**: pendiente. La issue #1 dice «los tres juntos»: este documento se aprueba en el pull request con la aprobación de los tres, y bloquea al resto del tablero hasta entonces.
- **Autor**: Agustín (coordinación), a partir de `../vault-stockproof/Idea.md`, `../vault-stockproof/MVP.md`, `../vault-stockproof/Diferenciador.md`, `../vault-stockproof/Plan.md` (propuestas de «El punto de encuentro»), `specs/preguntas-1-y-2.md` y el ADR 0002 (`docs/adr/0002-pregunta-1-codigo-de-motivo.md`)
- **Issue**: #1

## Contexto y problema

Pantalla y lógica trabajan en paralelo y se encuentran en el resultado de `evaluate`. Hoy ese resultado solo alcanza para las preguntas 1 y 2; las preguntas 3 y 4, el bloque de salida (Exit Now, Exit Availability, Exit Risk) y el valor «sin dato» todavía no tienen forma. Si cada uno inventa su parte, el día que se conecten hay que tocar pantalla y lógica a la vez (`Plan.md`, «El punto de encuentro»).

Esta spec congela **la forma** del resultado: qué variantes tiene, qué campos lleva cada una y qué valores reservados existen. No implementa las preguntas 3 y 4 ni el bloque de salida: fija el lugar donde van a vivir para que las issues #7 a #21 se construyan sobre un contrato estable.

## Qué se congela y qué no

Se congela (cambiarlo exige pull request que actualice esta spec, `lib/evaluation-examples.ts` y los textos de la issue #21 en el mismo cambio):

- La unión `Evaluation`: sus `kind`, la pregunta en la que corta y los campos de cada variante.
- Los tipos compartidos: `Quote`, `Source`, `RiskSignal`, el bloque `exit` y sus capas.
- Los valores reservados: `"unavailable"` (no se pudo obtener) y su lectura en pantalla, «sin dato».
- Las invariantes de siempre: orden estable de cotizaciones, ratios como fracción, fechas ISO 8601 en UTC, montos en USD.

No se congela (lo define la spec de cada pregunta cuando le toque):

- La lista de códigos de motivo de las preguntas 2, 3 y 4 (la de la 1 ya existe en `lib/questions/q1-reasons.ts`, ADR 0002).
- Umbrales y reglas de decisión (viven en un solo archivo, issue #3).
- Cómo los adaptadores de Binance producen la entrada (issue #2 y siguientes).
- El resultado de la ejecución de la firma (ola 4, issue #22): es otro tipo, la evaluación no cambia después de firmar.

## Entrada

`evaluate` sigue siendo una función pura: recibe datos ya traídos (o la marca de que no se pudieron traer) y no hace fetch.

La parte de la entrada que ve el usuario y la frase en castellano:

- `ticker`: texto.
- `amountUsd`: número positivo.
- `target` (opcional): `{ address, check }` — una dirección en BSC que el usuario pegó para revisar, con el resultado de su pregunta 1 (`checkContract`, ADR 0002) o `"unavailable"`. Si está, la pregunta 1 se corre sobre ella antes de mirar cotizaciones (escena 3 del video: el impostor). Si no está, la pregunta 1 se decide con el `authenticity` que trae cada cotización.
- `constraints` (opcional): topes que salen de la frase (`maxImpactRatio`, `maxDeviationRatio`). Se miran **después** de las cuatro preguntas (`Idea.md`): no las reemplazan ni las apagan.
- `quotes`: una cotización por wrapper (ver `Quote` abajo) o `"unavailable"`. Cada cotización trae su `address` y el resultado de la pregunta 1 sobre ese contrato.
- `reference`, `regime`, `exit` (opcionales): datos ya traídos de las preguntas 3 y 4 y de la simulación de salida, o `"unavailable"`. **Mientras las preguntas 3 y 4 no estén implementadas**, llegan ausentes y el resultado las devuelve en «sin dato»: la ola 1 no se bloquea esperándolas, y cuando se conecten pueden producir cortes sin tocar el formato.

## Resultado

Una sola variante. `question` es `1 | 2 | 3 | 4`. Las preguntas se evalúan en orden: una `cut` o `unavailable` en la pregunta N implica que las anteriores pasaron y las siguientes no se consultaron.

| `kind` | Campos | Cuándo | Qué muestra la pantalla |
| --- | --- | --- | --- |
| `invalid` | — | Ticker vacío o monto que no es un número positivo | Pide corregir la entrada. Sin costos ni firma |
| `unavailable` | `question`, `reason` | Un dato necesario de esa pregunta no se pudo obtener (p.ej. `LIST_UNAVAILABLE`, `ATTESTATION_UNAVAILABLE`, `CHAIN_UNAVAILABLE` de la 1; `QUOTES_UNAVAILABLE` de la 2) | Dice que no se pudo evaluar esa pregunta, con el motivo. No inventa precios ni arma la transacción (fail closed) |
| `cut` | `question: 1`, `reason`, `address` | El contrato revisado no es el oficial (o el pegado no figura en la lista) | Explica el corte con el motivo y la dirección. Sin costos ni firma |
| `cut` | `question: 2`, `reason`, `quotes` | Ningún wrapper elegible llena el monto a ≤ 1% de impacto | Muestra los tres costos/impactos y el corte. Sin firma |
| `cut` | `question: 3`, `reason`, `reference` | El número no se puede explicar como la acción (desvío sin explicación conocida) | Muestra referencia, pool, desvío y el motivo. Sin firma |
| `cut` | `question: 4`, `reason`, `regime` | El régimen del ticker no permite operar (mercado cerrado con libro clavado, pools que no coinciden, según la spec de la 4) | Muestra el régimen medido y el motivo. Sin firma |
| `pass` | `wrapper`, `address`, `impactRatio`, `simulatedCostUsd`, `tied`, `quotes`, `reference`, `regime`, `exit`, `constraints` | Las cuatro preguntas pasaron | Las cuatro respuestas en verde, el wrapper elegido con su costo, el bloque de salida, los topes de la frase si los hay, y el botón de firma |

Notas:

- `reason` es siempre un código en mayúsculas con guion bajo. La lógica devuelve el código; el texto en castellano lo escribe la pantalla (issue #21). Un código que la pantalla no conozca se muestra con un texto genérico, nunca crudo.
- `cut` de la pregunta 1 usa los códigos de corte del ADR 0002 (`TICKER_NOT_FOUND`, `CONTRACT_NOT_LISTED`, `ATTESTATION_MISSING`, `STANDARD_NOT_BEP8056`). `unavailable` de la pregunta 1 usa los de «no se pudo evaluar» (`LIST_UNAVAILABLE`, `ATTESTATION_UNAVAILABLE`, `CHAIN_UNAVAILABLE`). Las preguntas 2, 3 y 4 fijan las suyas en sus specs.
- En `pass`, `wrapper` y `address` son el wrapper y el contrato de la ruta ganadora: la firma ejecuta exactamente esa ruta.

## Tipos compartidos

```ts
type Side = "buy" | "sell";

type Quote = {
  wrapper: WrapperId;              // "bstocks" | "ondo" | "xstocks"
  address: string;                 // contrato que usaría esta ruta
  side: Side;                      // la entrada es "buy"; Exit Now es "sell"
  impactRatio: number;             // 0.01 = 1%
  simulatedCostUsd: number;
  authenticity: Q1Result;          // pregunta 1 sobre `address`; solo `ok` es elegible
};

type Source = { name: string; url?: string };

type Reference = {                 // datos de la pregunta 3
  referenceUsd: number | "unavailable";
  poolUsd: number | "unavailable";
  deviationRatio: number | "unavailable";
  multiplierNote: "none" | "multiplier" | "total-return" | "unavailable";
};

type Regime = {                    // datos de la pregunta 4
  marketStatus: "open" | "closed" | "unavailable";
  nextOpenAt: string | "unavailable";        // ISO 8601 UTC
  poolsAgree: boolean | "unavailable";       // los pools del ticker coinciden entre sí
  bookFrozen: boolean | "unavailable";       // libro clavado
  suggestSplit: boolean;                     // la pregunta 4 puede proponer partir la orden
};

type RiskSignal = {
  code: string;                    // p.ej. "POOL_DISPERSION"; la lista la fija la spec del bloque
  value: number | string;
  source: Source;
  observedAt: string;              // ISO 8601 UTC, la fecha del dato
};

type ExitBlock = {
  now: {                           // vender el mismo monto ahora, mismo wrapper, este instante
    recoveredUsd: number;
    costRatio: number;             // comparable con IMPACT_LIMIT; si lo supera, el agente puede negarse
    simulatedAt: string;           // ISO 8601 UTC; la pantalla muestra la edad («hace 5 s»)
  } | "unavailable";
  availability: {                  // solo reglas publicadas; informa, no decide
    marketStatus: "open" | "closed";
    nextOpenAt: string | "unavailable";
    mintRedeemHours: string | "unavailable";   // horario de mint/redeem publicado por el emisor
    redemptionVenue: string | "unavailable";   // p.ej. «en Binance, no en el pool»
    source: Source | "unavailable";
  } | "unavailable";
  risk: RiskSignal[] | "unavailable";          // señales medidas hoy; informa, no predice
};
```

Reglas del bloque de salida (`Diferenciador.md`):

- `exit` existe **solo en `pass`** (el bloque se muestra cuando las cuatro preguntas pasan). Cada capa puede ser `"unavailable"` de forma independiente: la pantalla muestra «sin dato» en esa capa y nunca completa con otro valor.
- `exit.now` vale para este instante: no proyecta precio ni liquidez futura. Su `costRatio` puede hacer que el agente se niegue, igual que la entrada.
- `exit.availability` y `exit.risk` informan; no cambian el `kind`. Cada dato lleva su fuente y la fecha en que se midió.

## Invariantes

- `quotes` sale siempre en orden `bstocks`, `ondo`, `xstocks`, una por wrapper. La pantalla no depende del orden de la API.
- Un wrapper cuya pregunta 1 no pasó cotiza igual pero con `authenticity.ok = false` y no puede ganar (caso xStocks sin lista oficial: `ADR 0002`, decisión pendiente de Agustín — esta spec lo resuelve con `authenticity` por cotización).
- Si **ninguna** cotización pasó su pregunta 1: con al menos un motivo «no se pudo evaluar» el resultado es `unavailable` de la pregunta 1 (fail closed, no impostor); si todas son motivos de corte, es `cut` de la pregunta 1 con el motivo de la cotización de menor impacto (la que hubiera ganado) y las `quotes` completas para que la pantalla muestre el detalle.
- Si el usuario pegó una dirección (`target`), su resultado decide la pregunta 1 antes que cualquier cotización.
- Los ratios son fracciones (`0.01` = 1%), los montos son USD y las fechas son ISO 8601 UTC.
- `"unavailable"` en la entrada o en un campo del resultado significa «no se pudo obtener / no se pudo medir». En pantalla se lee «sin dato». Nunca se completa con un valor inventado ni interpolado.
- `evaluate` devuelve datos, no frases: todo texto en castellano es de la pantalla.

## Criterios de aceptación

- [ ] El tipo `Evaluation` del código coincide campo a campo con esta spec, y `lib/evaluation-examples.ts` produce al menos un ejemplo por `kind` más un `pass` con alguna capa de `exit` en `"unavailable"` (cómo se comprueba: typecheck + unitario que fija el shape de cada ejemplo).
- [ ] Los estados que ve la pantalla (los cinco de hoy más el bloque de salida y «sin dato») se pueden construir todos desde el tipo, sin datos fuera de él (cómo se comprueba: unitario sobre `evaluation-examples` y revisión de Luciano).
- [ ] La lista de códigos de la pregunta 1 de la spec coincide con `lib/questions/q1-reasons.ts` (cómo se comprueba: unitario que itera `Q1_CUT_REASONS` y `Q1_UNAVAILABLE_REASONS` contra la tabla, o revisión cruzada en el PR).
- [ ] `npm run check` sigue en verde.
- [ ] Aprobación escrita de Agustín, Lautaro y Luciano en el pull request (la issue #1 lo exige).

## Casos borde

- Un wrapper cotiza pero no pasó la pregunta 1 (xStocks hoy): `authenticity.ok = false`; aparece en `quotes` con sus números pero nunca gana. Si ninguno pasó, el resultado es `cut` o `unavailable` de la pregunta 1, no `cut` de la 2.
- Solo una capa del bloque de salida se pudo medir: las otras dos van en `"unavailable"` y se leen «sin dato».
- El usuario pega una dirección que no es del ticker pedido: `cut` de la pregunta 1 con `CONTRACT_NOT_LISTED` y esa dirección.
- La frase en castellano no pide umbral: las cuatro preguntas corren igual con el 1% fijo.
- La frase pide un tope que las cuatro preguntas pasaron pero él no: `pass.constraints.violated` lista los códigos (`MAX_IMPACT_RATIO`, `MAX_DEVIATION_RATIO`); la decisión de firmar o negarse es del agente (issue #22), no de `evaluate`.
- Segunda evaluación del mismo ticker minutos después: `simulatedAt`/`observedAt` distinguen el dato viejo del nuevo; el formato no guarda historial.

## Fuera de alcance

- Implementar las preguntas 3 y 4, el bloque de salida o el agente (issues #13 a #22).
- La lista final de códigos de las preguntas 2, 3 y 4, y los `code` de `RiskSignal` (sus specs; los textos son la issue #21).
- Cómo la pantalla dibuja cada estado (issues #8, #11, #20).
- La firma `X-OC-SIGN` y el cliente de Binance (issue #2).
- El resultado de la ejecución (`txHash`, rechazo firmado): tipo aparte en la ola 4.
- Un `formatCurrency` en USD para la pantalla real (la plantilla trae ARS, `specs/example.md` lo deja fuera).

## Decisiones técnicas

- **Se extiende la unión por `kind`, no se reestructura.** La pantalla y los tests ya hablan ese idioma; `question: N` basta para saber qué pasó y qué no se consultó. Una estructura por pregunta (`questions: { q1, q2, q3, q4 }`) duplicaría información que la unión ya da.
- **`reason` va en `cut` y `unavailable`, con `question`.** Es lo que el ADR 0002 ya dejó como consecuencia pendiente y lo que la escena 3 necesita para explicarse.
- **`Quote` suma `side` y `address` desde el principio** (propuestas de `Plan.md` que esta spec hace formales): Exit Now es la misma simulación hacia el otro lado, y la pregunta 1 se decide por contrato.
- **`authenticity` por cotización** (en vez de un flag `eligible` o un veredicto global) resuelve las dos pendientes del ADR 0002 de una vez: la pregunta 1 se decide por contrato (`quote.address`) y un wrapper sin lista oficial cotiza pero no gana, sin romper el invariante de tres cotizaciones.
- **El bloque `exit` existe solo en `pass` y cada capa puede ser «sin dato»**: el MVP lo muestra con las cuatro en verde, y `Diferenciador.md` prohíbe completar lo que no se midió.
- **`constraints` se informa pero `evaluate` no decide con él**: los topes del usuario se miran después de las cuatro preguntas y la negación es del agente (issue #22). El campo está reservado para que la ola 4 no toque el formato.
- **Códigos en inglés, textos en castellano**: el reparto ya está hecho (la lógica da códigos, Luciano escribe las frases).

## Preguntas abiertas (se responden en la revisión de esta spec)

1. ¿`unavailable` de una pregunta debe permitir reintentar sin rehacer las anteriores? El formato lo permite (`question` + `reason` identifican qué faltó); falta decidir si la pantalla ofrece reintento parcial.
2. El `code` de cada `RiskSignal` y su `value` tipado: ¿lista cerrada en la spec del bloque de salida (issue #19) o abierta con fallback genérico?
3. ¿`exit.now` en `"unavailable"` cuando el mercado está cerrado, o simulación con la mejor información disponible y `simulatedAt` honesto? (El video lo quiere un sábado con SPCXB: conviene definirlo.)

## Checklist de la skill write-spec

- [x] Problema y contexto claros para alguien que no conoce la feature.
- [x] Cada criterio de aceptación tiene su forma de verificación.
- [x] Casos borde listados (no solo el camino feliz).
- [x] Fuera de alcance explícito (qué NO incluye).
- [x] Decisiones técnicas con su motivo.
