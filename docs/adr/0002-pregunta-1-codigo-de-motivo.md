# ADR 0002: la pregunta 1 se decide por contrato, con tres fuentes, y devuelve un código de motivo

- **Estado**: propuesto (pasa a aceptado con la aprobación de Agustín y el visto bueno de Luciano sobre los códigos)
- **Fecha**: 2026-09-28
- **Decide**: Lautaro (responsable de la issue #6)
- **Relacionado**: issue #6, `specs/preguntas-1-y-2.md`, ADR 0001 (una sola puerta a Binance), `../vault-stockproof/Plan.md` (ola 1 y «Dónde nos podemos pisar»), `../vault-stockproof/Dolores.md` §1

## Contexto

La pregunta 1 («¿este contrato es el real?») hoy vive en `evaluate` como tres booleanos ya resueltos: `{ listed, attested, standardOk }`. Si alguno es falso, `evaluate` devuelve `{ kind: "cut", question: 1 }`, sin decir por qué. Nadie todavía produce esos booleanos a partir de datos reales.

Lo que medimos en el vault: 1.307 contratos impostores bajo símbolos de bStocks, dos de ellos con la dirección que copia el principio y el final de la real. Lo único que los separa de forma limpia es que los genuinos son BEP-8056 y los falsos son BEP-20 comunes.

Lo que ofrece Binance (RWA Data API, documentación consultada el 28 sep 2026):

| Necesidad | Fuente | Qué da |
| --- | --- | --- |
| Buscar por ticker | `GET /api/v1/dex/market/rwa/search?keyword=` | `ticker`, `assets[]` con `platformId`, `binanceChainId`, `tokenContractAddress`, `tokenSymbol` |
| Lista oficial | `GET /api/v1/dex/market/rwa/tokens?binanceChainId=56` | Los tokens RWA que Binance reconoce, con `platformId` |
| Attestation | `GET /api/v1/dex/market/rwa/underlying-profile?binanceChainId=56&tokenContractAddress=` | `protections.dailyAttestationReport` / `monthlyAttestationReport` / `collateralReport`, cada uno `{ supported, url }` |
| Estándar BEP-8056 | **No está en la API.** | — |

Dos huecos:

1. **El estándar no viene en la API.** BEP-8056 es el nombre que BscScan le da a los tokens que implementan BEP-677 (EIP-8056, Scaled UI Amount). El propio BEP-677 dice que se detecta con ERC-165: `supportsInterface(0xa60bf13d)`. Es una lectura on-chain, no una llamada a Binance.
2. **`platformId` solo acepta `ondo` y `bstock`.** xStocks no aparece en la lista oficial de Binance.

Además, el Plan fija que la lógica devuelve un **código de motivo** y que Luciano escribe el texto en castellano. Hoy el corte de la pregunta 1 no trae motivo, así que la pantalla no puede explicar el corte, que es justamente la escena 3 del video.

## Decisión

1. **La pregunta 1 se responde por contrato, no por ticker.** El resultado dice, para una dirección en BSC (chainId 56), si es la oficial y, si no, por qué.
2. **Tres fuentes, en este orden, y la primera que falla corta:**
   1. Lista oficial: la dirección tiene que aparecer en la respuesta de RWA Data para ese ticker en `binanceChainId = "56"`.
   2. Attestation: `underlying-profile` de esa dirección tiene que traer al menos un `protections.*` con `supported: true`.
   3. Estándar: si `platformId` es `bstock`, el contrato tiene que responder `true` a `supportsInterface(0xa60bf13d)` por `eth_call` en BSC. Para Ondo no se exige (la spec solo lo pide en bStocks).
3. **Devuelve un código de motivo, no texto.** Formato en mayúsculas con guion bajo, como el modelo de errores del README (§28):

   | Código | Cuándo | Resultado |
   | --- | --- | --- |
   | `TICKER_NOT_FOUND` | La búsqueda no devuelve ningún token para ese ticker en BSC | corte, pregunta 1 |
   | `CONTRACT_NOT_LISTED` | La dirección pedida no es ninguna de las oficiales de ese ticker (el impostor de la escena 3) | corte, pregunta 1 |
   | `ATTESTATION_MISSING` | La dirección es oficial pero ninguna `protection` tiene `supported: true` | corte, pregunta 1 |
   | `STANDARD_NOT_BEP8056` | bStock que no responde a `supportsInterface(0xa60bf13d)` (un BEP-20 común) | corte, pregunta 1 |
   | `LIST_UNAVAILABLE` | RWA Data no respondió o respondió error en la búsqueda o la lista | no se pudo evaluar |
   | `ATTESTATION_UNAVAILABLE` | `underlying-profile` no respondió | no se pudo evaluar |
   | `CHAIN_UNAVAILABLE` | El `eth_call` a BSC no respondió | no se pudo evaluar |

   Si no se pudo verificar, se bloquea (fail closed, README §27). Nunca «probablemente está bien».
4. **Las llamadas a Binance salen por `binanceRequest`** (ADR 0001) con `context.purpose = "q1"` y `context.ticker`. El `eth_call` a BSC no es Binance: sale por una función propia (`lib/chain/supports-interface.ts`) y no se anota en el registro de Binance.
5. **La decisión es una función pura** (`decideAuthenticity`) que recibe lo ya traído. El adaptador que hace las llamadas es otro archivo. Igual que `evaluate`: se testea sin red.

## Alternativas descartadas

- **Seguir con tres booleanos sin motivo.** La pantalla no puede explicar el corte y el Plan ya pidió códigos. Además los booleanos mezclan «no es» con «no pude verificar».
- **Devolver el texto en castellano desde la lógica.** Choca con el reparto (Luciano escribe los textos) y obliga a tocar lógica para cambiar una frase.
- **Tomar el estándar de BscScan** (la etiqueta «BEP-8056»). Suma una API y una key más, y la etiqueta es la interpretación de un explorer. `supportsInterface` es lo que el mismo BEP-677 dice que tienen que usar wallets e integradores.
- **Comparar la dirección por prefijo y sufijo.** Es exactamente lo que los impostores ya copiaron.
- **Resolver la pregunta 1 por ticker, una sola vez.** Un ticker tiene un contrato por wrapper. La pregunta 2 cotiza tres contratos distintos; cada uno tiene que ser el real.

## Consecuencias

- **Cambia el formato de la evaluación**: `cut` de la pregunta 1 pasa a ser `{ kind: "cut", question: 1, reason }` y `unavailable` suma `reason`. Por la regla del Plan, va en su propio pull request, lo aprueba alguien del otro lado, y quien lo cambia actualiza `lib/evaluation-examples.ts` y `specs/preguntas-1-y-2.md` en el mismo cambio. `evaluate.ts` lo toca Agustín.
- Luciano necesita un texto por código. Eso ya está en el tablero (ola 3, «Textos en castellano para cada código de motivo»); con esta lista puede adelantarlo.
- Se suma una lectura on-chain a BSC. Hace falta una URL de RPC en `.env` (`BSC_RPC_URL`) y no hay librería nueva: `eth_call` es un POST JSON con `fetch`.
- La attestation se interpreta como «hay al menos un reporte publicado» (`supported: true`). No se lee el contenido del reporte ni su fecha. Si más adelante importa la fecha, es otra decisión.
- La firma de las llamadas (`X-OC-SIGN`) es del cliente de Agustín (issue #2), que todavía no existe. El adaptador RWA recibe la firma como dependencia (`sign(method, requestPath, body) → headers`) y no la implementa: cuando el cliente entre, se le pasa su firma sin tocar la pregunta 1.
- La lista oficial se lee de `rwa/search` (trae ticker, plataforma, chain y dirección en una sola llamada). `rwa/tokens` no suma nada para esta decisión y no se llama.

## Decisiones tomadas

1. **xStocks** (28 sep 2026, Lautaro): opción (c). La pregunta 1 de xStocks devuelve `LIST_UNAVAILABLE` sin llamar a Binance, y ese wrapper no es elegible. No rompe bStocks ni Ondo. Descartadas: (a) sacar xStocks de la pregunta 2 hasta tener fuente, y (b) una lista fija sacada del emisor, que es una fuente fuera de Binance sin mantenimiento. **Pendiente para Agustín**: hoy `evaluate` devuelve `unavailable` si faltan cotizaciones de los tres wrappers; con esta decisión tiene que aceptar un wrapper no elegible.

## Preguntas abiertas (decidir antes de aceptar)

1. **Qué dirección evalúa la pregunta 1.** Con solo el ticker, las direcciones salen de la lista y la pregunta 1 casi nunca corta. Para la escena 3 hace falta una dirección que venga de afuera: la que el usuario pega, o la que devuelve la cotización de la Trading API. Propuesta: la pregunta 1 se corre sobre la dirección que la ruta de la pregunta 2 va a usar, y opcionalmente sobre una que pegue el usuario.
2. **Ondo y el estándar.** Se asume que Ondo no se exige BEP-8056 (la spec lo pide solo en bStocks). Confirmar mirando un token de Ondo en BSC.
