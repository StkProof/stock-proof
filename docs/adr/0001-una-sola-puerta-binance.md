# ADR 0001: todas las llamadas a Binance salen por una sola puerta

- **Estado**: propuesto (pasa a aceptado con la aprobación de Agustín)
- **Fecha**: 2026-09-28
- **Decidieron**: Lautaro y Agustín
- **Relacionado**: `specs/registro-llamadas.md`, `../vault-stockproof/Plan.md` (ola 0)

## Contexto

El Developer Experience Report vale el 25% del puntaje y tiene que salir de datos reales del build, no de un informe reconstruido al final. Para eso, cada llamada a las APIs de Binance tiene que quedar anotada desde la primera.

Los tres usamos la misma API key, así que las llamadas de pruebas, de desarrollo y de la demo se mezclan. Cada llamada tiene que decir quién la hizo.

El cliente de las APIs de Binance todavía no existe. Lo arma Agustín en la ola 0, y el repo no tiene ninguna librería HTTP instalada.

## Decisión

Todas las llamadas del servidor a las APIs de Binance pasan por una sola función, `binanceRequest`, en `lib/binance/request.ts`. Ningún otro archivo llama a Binance directamente.

Esa función hace la llamada, la anota en el registro y devuelve la respuesta sin modificarla. El cliente de Agustín se construye encima de ella.

## Alternativas descartadas

- **Que cada parte llame a Binance por su cuenta y anote por separado**: alguna llamada quedaría sin anotar, y no nos enteraríamos hasta el informe.
- **Interceptar el `fetch` global**: anotaría también llamadas que no son de Binance y no sabría para qué se hizo cada una (ticker, monto, wrapper).
- **Interceptores de axios**: obligan a sumar una dependencia que el repo no tiene, y atan el registro a una librería.
- **OpenTelemetry**: es el estándar de la industria, pero pide levantar un colector y un visor. Para una hackathon de dos semanas cuesta más de lo que aporta.

## Consecuencias

- El registro queda completo por diseño: si una llamada no pasa por la puerta, es un error de código visible en la revisión.
- Agustín puede usar `fetch` u otra cosa adentro de su cliente, siempre que salga por la puerta.
- La key se maneja en un solo lugar, y ese lugar es el que garantiza que no se anote.
- Una revisión de código tiene que rechazar cualquier llamada a Binance que no pase por `binanceRequest`.
- Si cambiamos la forma de hablar con Binance, el registro no se toca.
