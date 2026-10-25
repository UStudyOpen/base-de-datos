# Procedencia y autorización — 0.3.0 local

Autorización expresa del titular registrada el 25 de octubre de 2026 en el
encargo de implementación definitiva de licencias. El titular confirma derechos
sobre los componentes originales de los tres cursos y del sistema, incluidos
aportes mediante ChatGPT/Codex, y concede MIT adicional sobre sus componentes
extraídos. Atribución pública elegida: **ngulloa**. Año acreditado: **2026**.
No es una autorización sobre obras de terceros ni una cesión de sus derechos.

## Fuentes y cambios

| Archivos/bloques | Origen | Condición y modificaciones |
|---|---|---|
| `_extension.yml`, `assets/*`, `brand/*`, `scss/{uso,_base,_layout,_components,_callouts}.scss` | Prototipo 0.1/0.2; antecedentes de estilos BD/IA `styles/{base,layout,components}.css` | Código original/autorizado MIT; cascada, contraste, roles de color, navegación móvil, foco/teclado. No incorpora algoritmos académicos. |
| `filters/status.lua` | Consolidación 0.3 | MIT; estados y metadatos de revisión. |
| `scss/_academic.scss:2–59` | Piloto BD, `styles/compatibility.css` | MIT adicional para los aportes propios; extracción, adaptadores y tokens. |
| `scss/_academic.scss:61–121` | BD `styles/concepts.css`, commit `222e39b` | Antecedente CC BY-NC 4.0; MIT adicional autorizado para estos componentes; alias y contraste. |
| `scss/_academic.scss:134–414` | Precálculo `styles/custom.css`, commit `4d52b2b` | 276 líneas idénticas en seis bloques; antes sin licencia expresa; MIT adicional autorizado para extracción/adaptación de cajas y fichas. |
| `scss/_academic.scss:416–426`, integración y documentos | Consolidación 0.3 | MIT; tokens/estados y portada compartida. |

Los antecedentes de IA comparten familia de estilos con BD; no se deduce
prioridad de autoría por similitud. La autorización cubre los antecedentes
propios descritos y sus adaptaciones distribuidas; no convierte todos los
archivos de estilos ni las lecciones de los cursos en MIT. BD e IA mantienen
CC BY-NC 4.0; Precálculo adopta CC BY-NC 4.0 para su contenido académico original.

Hashes SHA-256 de las fuentes cotejadas en el inventario previo de 474 archivos:

- `pilot-compatibility`: `5f637c880cab9b363abf55706c6f693490e07565dab2232937da8921679049ca`.

- `bd-concepts`: `9ea9d70087543a76e04a20cc576d640f690b54f51c879aca323d76c35061b499`.

- `precalculo-custom`: `7b66efb8378486e590dd044ac14ae142bfcd4cab5eeb1a74b2709a87c5ce9f35`.

Los rangos fijan la trazabilidad técnica del archivo anterior a esta actualización;
no asignan derechos exclusivos sobre ideas, colores o algoritmos. El inventario
previo y los nueve commits aprobados se conservan sin reescritura.
`tooling/browser_client.mjs` deriva del cliente propio `tests/cdp.mjs` del
prototipo; la documentación y scaffolding autorizados siguen MIT.

## Terceros excluidos de MIT propio

Quarto 1.10.18 aporta el runtime y las formas nativas de callouts al CSS durante
compilación. Bootstrap y Bootstrap Icons conservan MIT de sus titulares. Fuse.js
conserva Apache-2.0; MathJax 4.1.3 es una referencia CDN Apache-2.0. Las demás
bibliotecas del output se enumeran por ruta en `THIRD-PARTY-NOTICES.md`.
Ningún recurso `site_libs/**` es presentado como software original propio.
Zenscroll (Unlicense) y Headroom (MIT) solo se incluyen en los avisos de los
repositorios con copias históricas; no se añaden al formato actual.
