# Fixtures de RWA Data

**Sintéticos.** Armados el 28 sep 2026 con la forma de las respuestas de ejemplo de la documentación de RWA Data (`rwa/search` y `rwa/underlying-profile`), no con respuestas reales. Las direcciones son inventadas; la de Ondo (`0xa9ee…6f75`) es la del ejemplo de la documentación.

Se reemplazan por respuestas reales grabadas en la corrida de QQQB (paso 1 del plan de la issue #6), cuando haya key en `.env`. Ver `specs/pregunta-1-contrato-real.md`.

| Archivo | Qué representa |
| --- | --- |
| `search-qqq.json` | `rwa/search?keyword=QQQ`: QQQ con un bStock y un Ondo en BSC, un bStock en otra chain, y un ticker parecido (QQQM) |
| `search-empty.json` | `rwa/search` de un ticker que no existe |
| `profile-attested.json` | `rwa/underlying-profile` con reportes publicados |
| `profile-no-attestation.json` | `rwa/underlying-profile` sin ningún reporte en `supported: true` |
| `error-code.json` | Respuesta HTTP 200 con `code` distinto de 0 |
