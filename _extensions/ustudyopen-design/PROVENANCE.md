# Procedencia y estado de licencia

UStudyOpen Design 0.2.0 es una evolución del prototipo 0.1, basado en la auditoría de los sitios UStudyOpen. No se ha aprobado una licencia nueva para este paquete. Este archivo registra procedencia; no sustituye ni modifica licencias previas.

Referencias revisadas el 25 de octubre de 2026:

- [UStudyOpen/base-de-datos](https://github.com/UStudyOpen/base-de-datos): estilos `styles/base.css`, `layout.css` y `components.css`; su `LICENSE` local declara **CC BY-NC 4.0**.
- [UStudyOpen/inteligencia-artificial](https://github.com/UStudyOpen/inteligencia-artificial): misma familia de estilos y `LICENSE` local **CC BY-NC 4.0**.
- [UStudyOpen/precalculo](https://github.com/UStudyOpen/precalculo): referencia de componentes en `styles/custom.css`; no se localizó un archivo LICENSE propio. Su ausencia no concede permiso de reutilización.

La revisión de esos archivos acredita la relación visual y estructural; no acredita autoría exclusiva ni una trazabilidad completa línea por línea. Antes de publicar, identificar titulares y fragmentos derivados, preservar atribuciones y condiciones aplicables y obtener autorización para cualquier relicenciamiento. Si se distribuyen fragmentos bajo CC BY-NC 4.0, acompañarlos de su aviso original, enlace a <https://creativecommons.org/licenses/by-nc/4.0/> y declaración de modificaciones; no presentarlos como MIT.

Modificaciones de 0.2 respecto de 0.1: corrección de cascada y contraste de callouts, nuevos roles de color semántico, acentos académicos discretos y extracción de los comportamientos demostrativos fuera de la extensión. Se conserva la identidad general. No se han incorporado modelos académicos ni simuladores de los cursos.

La extensión consume Quarto 1.10.18 y sus recursos Bootstrap. Las formas de iconos se obtienen del mapa SCSS nativo de Quarto durante la compilación; no hay un paquete de iconos descargado ni rutas SVG copiadas para esos cinco iconos. Mantener los avisos de terceros incluidos por el generador. La dependencia del mapa interno se describe en la documentación técnica.

Propuesta, pendiente de aprobación y revisión de derechos: **MIT para el código original o expresamente autorizado** del paquete compartido. La propuesta no altera CC BY-NC 4.0 ni subsana la falta de licencia en Precálculo. Detalles y fuentes en `docs/LICENCIAS.md` del repositorio fuente.

## Modificaciones locales 0.3.0 (sin etiqueta ni release)

Se trasladan a `_academic.scss` los adaptadores y etiquetas del piloto de Bases de Datos, y los bloques pedagógicos y fichas de fórmulas de Precálculo, conservando su procedencia y las condiciones previas. Se añaden estados desde metadatos y la portada común. No se incluyen algoritmos académicos. Esta consolidación no concede una licencia adicional: la publicación y cualquier relicenciamiento requieren aclarar también la procedencia de Precálculo. MathJax se fija en 4.1.3 por URL explícita.
