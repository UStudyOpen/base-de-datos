# Estado de implementación — OpenStudy Bases de Datos

Actualizado: 19 de octubre de 2026. Archivo de continuidad técnica y académica del sitio; no sustituye la validación local previa a publicar.

## P4 — Hashing: implementación actual

### Estado recibido y alcance

- HEAD al iniciar P4: `a4db761` (`B+ tree`); `git status --short` vacío. Se trabajó sobre esta copia sin reemplazar archivos por un ZIP. No se encontró `open-study-base-de-datos(3).zip` en el espacio de trabajo.
- Se conservan las 22 páginas anteriores y se añade `indices/hashing.qmd`: 23 páginas académicas. Hashing aparece inmediatamente después de B+trees en la categoría Índices existente. No se cambia la arquitectura ni la identidad visual.
- No se modifican los algoritmos de B+trees, clausuras, BCNF ni 3NF. El único cambio editorial en B+ es un enlace relacionado. `references.bib` conserva sus cinco entradas y claves sin modificaciones.

### Fuentes verificadas (registro técnico no publicado)

- Consultados los PDFs locales de introducción a índices y hashing, y el contenido de B+trees para contraste. La guía disponible en `/home/nicolas/Descargas/guia_repaso_i2.pdf` se extrajo y se consultaron los ejercicios 24–27 y 35. Ningún PDF ni atribución docente se incorpora al sitio.
- Verificados los pasajes de Ramakrishnan–Gehrke, tercera edición, secciones **11.1–11.2** (páginas impresas 371–379): overflow, directorio por bits inferiores, profundidades, división, doubling y contracción opcional.
- Verificados los pasajes de Silberschatz–Korth–Sudarshan, séptima edición, secciones **24.5.1–24.5.2**, especialmente 24.5.2.1–24.5.2.2: índices estáticos y dinámicos, alias, repetición de splits y límites de hashes completos. Este libro usa prefijos; el sitio declara explícitamente su convención por sufijos. No se añaden citas a libros cuyos pasajes no se consultaron en P4.
- La guía cuantitativa usa «4 KB». El ejemplo público fija inequívocamente **4 KiB = 4096 bytes**, ignora cabeceras y presenta cotas inferiores, no predicciones de ocupación. Se distingue escribir un directorio completo nuevo de ampliar su segunda mitad reutilizando la primera.

### Archivos y convenciones

- Nuevos: `indices/hashing.qmd`, `assets/js/visualizaciones/hashing-model.js`, `assets/js/visualizaciones/hashing.js`, `tests/hashing.test.js`, `tests/hashing-browser.mjs`.
- Integración mínima: `_quarto.yml`, `index.qmd`, `indices/bplus.qmd`, `assets/js/visualizaciones/index.js`, `assets/css/visualizaciones.css`, `tests/integracion-visual.test.js` y este registro. `docs/` se regenera exclusivamente con Quarto, incluidos recursos y búsqueda.
- Motor puro, sin `document` ni `window`; estados de entrada y snapshots congelados. Las operaciones fallidas descartan todas las transformaciones tentativas; no se publica un estado parcial tras exceder el límite.
- Estático: páginas principales y overflow de capacidad B; conserva orden de inserción. La búsqueda cuenta cada página examinada, incluida la principal vacía. El simulador permite N=4 y N=5 y búsquedas 28,17,10,33.
- Extensible: inicio g=l=0; últimos bits, directorio en orden numérico ascendente. Split por bit de peso 2^l; doubling solo con l=g. Eliminación: como máximo un merge, solo al vaciar y con hermano de igual l; después, contracción repetida si todas las profundidades son menores que g. No se implementa merge por mera suma de ocupaciones.
- Operaciones propias: B=2, claves 0–65535, hasta 60 entradas, g máximo 8. El motor admite B entre 1 y 16 y profundidad máxima entre 0 y 8. Los límites son pedagógicos, visibles en la página.
- El visualizador no reimplementa operaciones. Distingue estados transitorios de doubling, split y merge; deshabilita nuevas operaciones hasta completar la pendiente. Anterior, siguiente y reinicio recorren snapshots deterministas.
- SVG con directorio, punteros compartidos y un único dibujo por bucket físico; etiquetas y bordes complementan el color. Regiones desplazables conservan texto legible, teclado y foco visible; descripciones textuales, aria-live y fallbacks completos para impresión o fallo de JavaScript.
- Siete presets extensibles: inserción, eliminación, alternancia, colisiones, reducción repetida desde un estado redundante explícitamente preparado, búsquedas y vacío. El estado redundante es estructuralmente válido pero no se presenta como alcanzable solo mediante inserciones desde el inicio mínimo.

### Resultados algorítmicos y validación

- Estático N=4: distribución 7,5,0,2, tres overflow y siete páginas totales. N=5: 2,2,3,4,3, un overflow y seis páginas. Costos de buscar 28,17,10,33: 3,2,1,2 frente a 2,1,1,2. Promedio exitoso uniforme: 21/14 y 15/14 páginas.
- Caso A extensible: cinco splits (3,6,29,10,20), tres doublings (3,6,10), g=3, seis buckets y ocho entradas de directorio. Certificados manuales por sufijo contrastados con el motor, incluida cada inserción.
- Caso B: merges al eliminar 16 y 18; solo el segundo reduce g de 3 a 2. Tras eliminar 20 queda vacío el sufijo 00 de l=2 y su lado hermano está subdividido en buckets de l=3; no hay merge. Final: 00:[], 01:[29], 10:[6], 11:[27], todos l=2.
- Casos C/D: crecimiento y contracción repetidos; tres claves 0,8,16 requieren cuatro splits/doublings; 0,16,32 fuerzan g=5. Un estado redundante válido comprueba tres reducciones tras un único merge. Duplicados, ausentes y exceso de profundidad conservan el estado previo.
- `node --test tests/*.test.js`, con el Node 24.21.0 disponible en `/usr/lib/chatgpt/resources/cua_node/bin/node`: **34 pruebas aprobadas, 0 fallidas**. Incluye diez pruebas nuevas de hashing y una de integración; se ejecutó después de completar el render. Una ejecución anticipada durante el render falló porque Quarto aún no había repuesto el HTML; no se atribuyó ese fallo al contenido y se repitió la suite tras terminar el render.
- El oráculo independiente reconstruye clases de sufijos mediante máscaras, compara con conjuntos y comprueba certificados exactos, todos los pasos y las condiciones de split/doubling/merge/contracción. Cuatro capacidades, secuencias deterministas y 1000 operaciones mixtas reproducibles con semilla fija; P1/P2 se verifican solo en estados estables de inserción. El texto aporta los argumentos universales.
- `python3 tests/sql_examples.py`: aprobado en SQLite 3.51.2; no se declara ejecución de dialectos ajenos.
- `quarto render`: **23 páginas**, sin errores ni warnings relevantes. `python3 tests/check_site.py`: aprobado, 19 rutas originales conservadas, enlaces y fragmentos correctos, cinco claves bibliográficas, recursos publicados idénticos y sin PDFs privados.
- `git diff --check` sobre fuentes: aprobado. La salida HTML de Quarto añade espacios finales en su plantilla de navegación; no se edita HTML generado para retirarlos.
- `tests/hashing-browser.mjs` en Brave/Chromium con Playwright: **326 snapshots comprobados**, siete presets extensibles y diez configuraciones estáticas. Comparación de claves dibujadas, directorio y número de buckets con cada snapshot; bloqueo en transitorios, operaciones propias, rechazo de duplicados/entradas inválidas/exceso de profundidad, navegación y cambio de ejemplo, instancias independientes e inicialización idempotente.
- Hashing verificado a **320, 390, 768, 1024 y 1440 px** sin desbordamiento horizontal del documento y con texto SVG de 15 px. Foco, teclado, desplazamiento local, impresión, MathJax, JavaScript desactivado y módulo bloqueado comprobados. Carga real bajo **`/open-study-base-de-datos/indices/hashing.html`** con un servidor temporal que mapea ese prefijo a `docs/`; sin errores propios ni recursos fallidos. Capturas inspeccionadas en escritorio y móvil, incluidas cadenas de overflow y punteros compartidos.
- Comprobación adicional de controles estáticos: avanzar dos pasos y retroceder restituye el SVG anterior; reiniciar restituye exactamente el SVG inicial. Foco y scroll horizontal a 320 px comprobados.
- Regresión `tests/bplus-browser.mjs`: **508 snapshots**, nueve presets y ambas políticas, más operaciones propias, rangos, responsive, foco, reflujo equivalente al 200 %, impresión, instancias múltiples, sin JavaScript, fallo del módulo y MathJax: aprobada. El primer servidor de prefijo devolvía «Not Found» para el favicon implícito y el filtro histórico del test esperaba «File not found»; se repitió con el servidor estándar documentado, sin cambiar el test ni el producto. El único error de consola registrado es ese 404 conocido de `/favicon.ico`, ajeno a los componentes; todos los recursos propios cargan.
- Smoke de navegador sobre clausuras, BCNF y 3NF: inicialización, avance y retroceso correctos, sin errores de JavaScript ni alertas de componente. Sus pruebas algorítmicas anteriores también pasan en la suite de 34 pruebas.

Para reproducir el navegador, servir el directorio padre con `python3 -m http.server 8765 --bind 127.0.0.1 --directory ..` y ejecutar `node tests/hashing-browser.mjs` y `node tests/bplus-browser.mjs`. Ambas pruebas admiten `PLAYWRIGHT_MODULE` y `BROWSER_EXECUTABLE`; hashing admite además `HASHING_TEST_URL` para un servidor con prefijo exacto. En esta sesión se usó `/usr/lib/chatgpt/resources/cua_node/lib/node_modules/playwright-core/index.mjs` y `/usr/bin/brave-browser`, en instancias nuevas sin perfiles personales. No se añaden dependencias de ejecución al sitio.

### Límites y continuación

La estructura materializa snapshots completos y valida globalmente cada paso: no constituye una medición de rendimiento de un índice. No simula concurrencia, recuperación, caché ni asignación física. La variante ternaria es una profundización conceptual, sin segundo motor. Quedan como revisiones humanas complementarias la lectura editorial académica, lectores de pantalla, zoom nativo y Firefox/Safari; no se declara auditoría WCAG completa.

**P4 implementada y validada dentro del alcance solicitado.** P5–P8 permanecen sin iniciar. No se realizaron commits, pushes, despliegues ni modificaciones remotas.

## P3 — B+trees: implementación actual

### Estado recibido y conservación

- HEAD real al iniciar P3: `6982673` (`main`). Las fuentes y pruebas de P1/P2 ya estaban presentes como archivos no rastreados; se conservaron sin sobrescribirlas.
- No se encontró `open-study-base-de-datos(2).zip`. El archivo disponible, `../open-study-base-de-datos.zip`, coincide byte por byte con las 93 fuentes y recursos comparables del directorio (excluyendo Git, salida generada y PDFs privados). No se atribuye esa comparación al ZIP ausente.
- Se conservaron las 21 páginas académicas anteriores. Ahora hay 22 páginas `.qmd` y sus 22 HTML. La salida inicial contenía además `IMPLEMENTATION_STATUS.html`: se excluyó del render público mediante `project.render: ["**/*.qmd"]`. Este archivo técnico permanece solo en las fuentes.
- Se consultaron los PDFs privados disponibles de B+trees y la guía de repaso, incluidos sus ejercicios 18–23 y 33–34. No se incorporaron al sitio ni se publicaron atribuciones a ellos.
- Se verificaron en los libros locales las secciones citadas: Ramakrishnan–Gehrke 10.3–10.7 y 10.8.3; Silberschatz–Korth–Sudarshan 14.3.2, 14.3.3.1, 14.3.4 y 14.3.5. `references.bib` conserva exactamente sus cinco entradas y claves originales.

### Entregables y archivos

- `indices/bplus.qmd`: material autónomo con estructura e intervalos, altura en aristas, cotas con redondeos y condiciones, algoritmos, corrección, ejemplos completos, ejercicio resuelto, resumen, bibliografía y enlaces existentes. Incluye ejemplo estático completo para fallo del módulo, ausencia de JavaScript e impresión.
- `assets/js/visualizaciones/bplus-model.js`: motor puro sin navegador, operaciones por valor/rango, inserción ordinaria o con redistribución, eliminación con prioridad de hermanos, rotaciones internas, splits, fusiones, contracción, validación y snapshots inmutables. Los separadores válidos no se recalculan al eliminar sin rebalancear.
- `assets/js/visualizaciones/bplus.js`: explorador SVG, nueve presets calculados, dos políticas visibles, operaciones propias, navegación exacta, anuncios breves, estructura textual y controles para centrar páginas. El simulador usa orden 2 y hasta 60 enteros seguros distintos; el motor se prueba también con órdenes 1 y 3.
- `tests/bplus.test.js`: oráculo independiente por recorrido, restricciones heredadas y doble lista enlazada, comparación con conjuntos, certificados estructurales manuales del Caso B, Caso A exacto, estados transitorios, prioridades de hermanos, casos límite y secuencias con semilla fija.
- `tests/bplus-browser.mjs`: regresión opcional de navegador con Playwright; no añade dependencias al sitio ni a `npm test`. Compara cada dibujo con su snapshot y comprueba interacción, reflujo, teclado, fallbacks e instancias múltiples. Guarda capturas en un directorio temporal.
- Integración mínima: `_quarto.yml`, `index.qmd`, cargador `assets/js/visualizaciones/index.js`, estilos específicos al final de `assets/css/visualizaciones.css`, `tests/integracion-visual.test.js` y este registro. `docs/` se obtiene exclusivamente con Quarto.
- No se modificaron las fuentes de BCNF, 3NF ni las otras páginas de P1/P2, los componentes compartidos, el tema o la bibliografía. El HTML previo solo cambia por el render de la navegación; la última página de diseño incorpora el enlace a la nueva página siguiente.

### Validaciones de P3

- `corepack npm test` (Node 24.21.0): **23 pruebas aprobadas, 0 fallidas**. Se usó Corepack porque npm no estaba directamente en el PATH; ejecuta el script `npm test` original sin modificar `package.json`.
- `python3 tests/sql_examples.py`: **aprobado** en SQLite. Los ejemplos exclusivos de otros dialectos conservan su alcance de validación previo.
- `quarto render` (Quarto 1.10.18): **22 páginas generadas**, sin errores ni warnings relevantes. Recursos JS/CSS publicados idénticos a sus fuentes.
- `python3 tests/check_site.py`: **aprobado**: páginas, 19 rutas originales, citas, cinco claves bibliográficas, recursos, IDs, fragmentos, delimitadores matemáticos y ausencia de recursos privados. Las pruebas de integración comprueban también B+ en navegación y búsqueda.
- Navegador local Brave/Chromium sin sesión del usuario: **508 snapshots comprobados**, correspondientes a nueve presets con ambas políticas. Búsqueda, rango, inserción, eliminación, rechazo de entradas, retroceso, reinicio, estados transitorios y cambio de ejemplo/política verificados.
- Interfaz comprobada a 320, 390, 768, 1024 y 1440 px, sin desbordamiento horizontal del documento; claves de 15 px dentro de su región desplazable y raíz visible tras centrarla. Foco por teclado, scroll, impresión, MathJax, dos instancias independientes, ausencia de JavaScript y fallo deliberado del módulo comprobados. Carga adicional verificada bajo la ruta exacta `/open-study-base-de-datos/`, con importaciones relativas.
- Reflujo equivalente al zoom de escritorio del 200 % comprobado con superficie de 1280 px representada por viewport de 640 CSS px y DPR 2. No se presenta la ampliación CSS como una prueba del zoom nativo del navegador.
- Sin errores de ejecución JavaScript ni fallos de recursos propios. El servidor de pruebas devuelve un 404 por la petición implícita de `/favicon.ico`, también ajena al componente; no se añadió un favicon para ampliar el alcance de P3.
- Caso A: raíz `[21]`, directorios `[7,12,15] / [27,33]`, siete hojas, seis splits de hoja y uno interno, altura 2. Caso B: la eliminación de `3` fusiona directorios y contrae la raíz a `[10,21,27,33]`, con cinco hojas y altura 1. Resultados contrastados con certificados manuales e invariantes independientes, sin suponer una respuesta oficial.

### Reproducción de la prueba de navegador y límites

Servir el directorio padre con `python3 -m http.server 8765 --bind 127.0.0.1 --directory ..` y ejecutar `node tests/bplus-browser.mjs` con Playwright disponible. Se puede cambiar la URL con `BPLUS_TEST_URL`, el módulo instalado con `PLAYWRIGHT_MODULE` y el ejecutable con `BROWSER_EXECUTABLE`. Estas herramientas son solo de validación; no se publican.

El navegador integrado de la aplicación no tenía instancias conectadas; se utilizó una instancia local nueva sin perfiles personales. Quedan como revisión humana complementaria el zoom nativo desde los controles del navegador, lectores de pantalla y comparación entre Firefox/Safari. No se declara una auditoría WCAG completa. El motor materializa snapshots y valida todo el árbol por paso: su costo adicional se explica en la página y no representa el rendimiento de un índice real.

P3 está implementada dentro de su alcance. La categoría Índices y la página B+ están expresamente autorizadas por esta tarea; las etapas P4–P8 no se han iniciado. No se realizaron commits, pushes, publicaciones ni cambios remotos.

## Registro histórico previo a P3 — punto de partida y alcance

- Estado original de Git en la copia recibida: `080d07d78d46fe118d07e5fb51ee65374652b278` (`main`), con modificaciones locales previas no confirmadas.
- La copia recibida ya incorporaba cinco páginas de diseño revisadas (tres ampliadas y dos nuevas) y módulos interactivos de clausura/normalización. **Esos cambios previos se preservaron.**
- Se mantienen las 19 rutas originales y las 21 páginas HTML presentes en `docs/`.
- En esta continuación se han corregido y probado únicamente aspectos puntuales de interacción y recursos; no se han creado nuevas categorías ni cambios de arquitectura.

## Estado por área

| Área | Estado comprobado | Pendiente |
|---|---|---|
| Estilo visual y componentes | Implementación previa disponible; CSS de exploradores ajustado | Inspección visual en navegadores reales y diferentes resoluciones |
| P1: DF, clausuras y llaves | Páginas y explorador existentes; pruebas académicas aprobadas | Revisión visual y pruebas de teclado/foco en navegador |
| P2: descomposiciones, BCNF, 3NF | Tres páginas ampliadas/nuevas, motor y ejemplos presentes; pruebas académicas aprobadas | Revisión visual y de casos interactivos en navegador |
| P3: B+trees | Implementado y validado en esta etapa; véase el registro actual anterior | Revisiones humanas complementarias de accesibilidad y navegadores |
| P4: hashing | Página, motores y exploradores implementados; validación registrada arriba | Revisiones humanas complementarias |
| P5: procesamiento y reescritura | No implementado | Páginas, AST/visualización y pruebas |
| P6: almacenamiento y buffer | No implementado | Páginas, simulador y pruebas |
| P7: índices y costos | No implementado | Página y ejemplos con costos verificados |
| P8: modelo E/R | No implementado | Páginas y ejemplos de conversión |

La tarea P3 autorizó incorporar Índices con B+trees. No se han creado categorías ni páginas de etapas posteriores.

## Cambios de la continuación anterior a P3

1. `assets/css/visualizaciones.css`: oculta el ejemplo estático cuando se inicializa correctamente el explorador; conserva el ejemplo si JavaScript falla o está desactivado, y lo muestra al imprimir. Mejora estados de foco.
2. `assets/js/visualizaciones/clausuras.js`: cada paso informa qué regla se aplicó en ese instante, diferenciándola de reglas usadas previamente. Al ingresar datos inválidos elimina resultados obsoletos.
3. `assets/js/visualizaciones/normalizacion.js`: no valida el determinante BCNF cuando se utiliza un modo independiente (cubierta minimal o síntesis 3NF). Los datos inválidos no dejan resultados obsoletos.
4. Los recursos estáticos correspondientes dentro de `docs/assets/` se sincronizaron byte por byte. **No se editaron páginas HTML generadas.**
5. `tests/dependencias.test.js`: caso adicional de traza de clausuras.
6. `tests/integracion-visual.test.js`: pruebas nuevas de recursos publicados, cargadores relativos y alternativa sin JavaScript.

## Validaciones históricas anteriores a P3

- `node --test tests/*.test.js`: **11 aprobadas, 0 fallidas**.
- `python3 tests/sql_examples.py`: **aprobada** en SQLite; pruebas dependientes de otro dialecto no ejecutadas.
- `python3 tests/check_site.py`: **aprobada** para los 21 HTML existentes, 19 rutas originales, citas, recursos, fragmentos y duplicación de IDs.
- Escaneo de terminología editorial específica en fuentes públicas: sin coincidencias en los patrones comprobados.

## Limitaciones del entorno anterior a P3

Las limitaciones de Quarto y conexión a localhost que siguen corresponden al entorno anterior. En el entorno de P3 se ejecutaron render y pruebas de navegador local según el registro actual.

- `quarto render` **no se pudo ejecutar en este entorno** porque Quarto CLI no está disponible. La copia recibida ya incluía 21 HTML generados; no se modificaron archivos `.qmd` en esta continuación, por lo que el HTML no necesita actualización por cambios de contenido. Se recomienda ejecutar `quarto render` localmente antes de publicar.
- El navegador automatizado de este entorno bloqueó el servidor localhost (`ERR_BLOCKED_BY_ADMINISTRATOR`). No se han certificado interacciones reales, diseño responsive, MathJax en navegador o conformidad WCAG. Las pruebas de HTML y recursos son estáticas.
- No se han realizado commits, pushes, despliegues ni cambios remotos.

## Continuación recomendada tras P3

1. Completar las revisiones humanas complementarias indicadas para P3.
2. Ejecutar las validaciones tras futuras modificaciones y conservar `docs/` generado por Quarto.
3. P4 se desarrolló posteriormente con alcance propio; su registro actual aparece al inicio. P5–P8 requieren tareas independientes.
4. Mantener estas convenciones y las pruebas sin refactorizaciones innecesarias.
