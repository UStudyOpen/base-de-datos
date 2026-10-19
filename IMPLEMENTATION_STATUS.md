# Estado de implementación — OpenStudy Bases de Datos

Actualizado: 19 de octubre de 2026. Archivo de continuidad técnica y académica del sitio; no sustituye la validación local previa a publicar.

## P6 — Almacenamiento y Buffer Manager

### Alcance y estado recibido

- Inicio en `main`, HEAD `b25c824`, con `git status --short` vacío. Se conserva el estado local de P1–P5. No se usan restauraciones, nuevas dependencias, cambios remotos, commits ni publicación.
- Se añaden `almacenamiento/paginas-registros.qmd` y `almacenamiento/buffer-manager.qmd`; el sitio pasa de 25 a 27 páginas. Navegación nueva en la categoría Almacenamiento y organización física y una tarjeta en portada. La única modificación de contenido anterior es un enlace relacionado desde B+trees; no cambia ningún motor previo.
- Se contrastaron directamente pasajes de Ramakrishnan–Gehrke (tercera edición, 9.1 y 9.4–9.7), Silberschatz–Korth–Sudarshan (séptima edición, 13.2.2–13.2.3 y 13.5.1–13.5.2) y Garcia-Molina–Ullman–Widom (segunda edición, 13.2.3 y 15.7.2). Las cinco entradas y claves bibliográficas existentes no cambian. Las páginas son autocontenidas y las convenciones del simulador se presentan como decisiones del sitio.

### Contenido, algoritmos y componentes

- Organización física: jerarquía, latencia/ancho de banda, persistencia, geometría HDD con SVG original, sector/bloque/página, costo por E/S y diferencias SSD. Registros fijos/variables, metadatos, nulos físicos frente a NULL lógico, RID frente a llaves y forwarding; archivos contiguos, listas y directorio de espacio libre.
- Slotted page de 128 bytes con encabezado de 12 B y slots de 4 B. Secuencia pequeña de ocho snapshots: inserciones t1–t3, eliminación diferida de t2, compactación, reutilización para t4 y rechazo de t5. Se muestran offsets, RIDs y libre total, central y máximo contiguo. No hay un segundo motor general de almacenamiento.
- `buffer-model.js` es un modelo puro e inmutable, independiente del navegador. Frames, page table, pins, dirty acumulativo, FIFO por carga y LRU por último pin exitoso; unpin no renueva recencia. Frames libres antes de víctimas, elegibles solo con pin cero, escritura de víctima dirty antes de lectura. Los rechazos preservan exactamente el estado operativo, incluidos reloj y contadores.
- Snapshots completos con operación, explicación, prioridad, candidatos previos, víctima, cambios y E/S; restauración validada sin deshacer parcialmente operaciones. PageIDs de 1–16 letras ASCII/dígitos/guiones bajos y 1–8 frames. Las claves especiales del objeto JavaScript no pueden alterar la page table por herencia.
- `buffer.js` usa el motor para seis presets: 18 operaciones, intercaladas, Belady, casos límite, alternancia B+ y ciclo de cinco hojas. Dos instancias independientes en la página. Navegación, selección de política/capacidad, comparación FIFO/LRU del mismo prefijo y comparación Belady con 3/4 frames. Operaciones manuales hasta 120 pasos, con ramificación desde el prefijo visible.
- Los frames muestran texto y símbolos además de color; se distinguen protección, dirty, página activa, prioridad, candidatos, víctima y E/S. Diagrama de repositorio en disco, contadores y dirty pendientes. No se implementa flush automático ni explícito, concurrencia, recuperación o fallos de dispositivo.
- Demostraciones autocontenidas de inclusión LRU (solo referencias usar sin pins retenidos), anomalía FIFO, adversario determinista y diferencia online/offline. Integración B+ con hipótesis de búsquedas exclusivas sobre ocho páginas: cotas de tres, siete y ocho frames y construcciones que las alcanzan. No se modifica el motor de B+trees.
- Fallbacks estáticos y trazas completas disponibles sin JavaScript, ante fallo del módulo y para impresión; SVG y tablas extensas con desplazamiento local accesible y texto legible. Se reutilizan `core.js`, el cargador, la tipografía y la paleta existentes.

### Resultados numéricos verificados

- 1000 bloques: 10 760 ms aleatorios frente a 140,63 ms contiguos, cociente 76,512835… bajo los parámetros históricos de ejercicio. La transferencia de 0,13 ms se fija como parámetro independiente del tamaño de página; no se anuncia como rendimiento universal de hardware.
- Registros fijos: 40 por página de 4096 B, 25 000 páginas para un millón, recorrido frío con 25 000 lecturas. Tiempos idealizados: 3260,63 ms contiguos y 269 000 ms dispersos. Directorio: 512 entradas de 8 B por página, dos páginas para 1000 entradas; se explicitan encabezados y residencia en RAM.
- Slotted page: libres totales 116,82,58,14,34,34,4,4 B. Tras eliminar t2 hay libre central de 14 B y hueco de 20 B. Compactar cambia el offset de t3 de 38 a 58 y conserva `(P,3)`; t4 reutiliza slot 2. t5 necesita 14 B y no cabe.
- 18 operaciones, sin flush: FIFO **7 lecturas/1 escritura**, LRU **6/1**, A dirty pendiente en ambos. D está protegida en paso 12. Pins intercalados: C expulsa A dirty y E se rechaza con los tres frames fijados (FIFO 7/2, LRU 6/2 en ese instante).
- Belady: FIFO 3/4 frames **9/10 lecturas**; LRU 3/4 **10/8**. FIFO rompe inclusión tras solicitud 7 con {1,2,5} frente a {2,3,4,5}.
- B+ alternando dos ramas: LRU con tres frames alcanza `2m+1`, FIFO alcanza `ceil(5m/2)`; para seis búsquedas son 13 y 15 lecturas. Ciclo L1,L4,L2,L5,L3 con LRU y siete frames alcanza `m+3` para m≥2; con ocho se leen como máximo ocho páginas. Al contar la distancia entre usos de un directorio se incluye la hoja inmediatamente posterior a su uso previo.

### Validación

- `npm test`: 67 pruebas aprobadas en la ejecución final completa, incluidas 11 pruebas P6 y toda la regresión previa. El oráculo independiente usa colas de PageIDs y un diccionario; contrasta frames, pins, dirty, orden, víctimas, reloj y E/S de cada paso. Se comprueban también las dos tablas públicas de 18 operaciones, restauración exacta, entradas ilegales y claves especiales.
- Secuencias reproducibles con 1,2,3,4,7,8 frames, recorridos cíclicos, cobertura byte a byte de la página y 625 secuencias exhaustivas de cuatro búsquedas para las cotas B+. Las pruebas finitas complementan las demostraciones. Se añade una carga de 500 búsquedas para verificar que R,D1,D2 permanecen con siete frames.
- `python3 tests/sql_examples.py`: aprobado con SQLite 3.51.2.
- `quarto render`: render final completo de 27 páginas sin errores ni warnings relevantes. `docs/` se genera exclusivamente con Quarto, incluidos búsqueda, navegación, CSS y módulos.
- `python3 tests/check_site.py`: 27 HTML, 19 rutas originales, cinco claves, citas y enlaces/fragmentos válidos, recursos publicados coincidentes y sin documentos no publicables. Una ejecución anticipada mientras Quarto todavía generaba búsqueda no fue válida; se repitió al terminar el render y pasó.
- Regresiones finales de navegador aprobadas: B+trees **508 snapshots**, hashing **326 snapshots** (siete presets y diez configuraciones estáticas), y planes de consulta **18 estados** en seis recorridos. Todas conservan sus controles, responsive, fallbacks y MathJax. B+ registra únicamente el 404 del favicon implícito ya conocido; no falla ningún recurso propio. Hashing y planes no registran errores ni recursos fallidos.
- `tests/buffer-browser.mjs`: **670 snapshots aprobados**, 18 combinaciones de presets/políticas/capacidades y ocho estados de página. Contrasta DOM con el modelo; verifica anterior/siguiente/reinicio, cambios de política/capacidad, comparación Belady, pins y dirty, errores, ramificación manual y dos instancias independientes. Sin errores de consola ni recursos propios fallidos.
- Ambas páginas se probaron a **320, 390, 768, 1024 y 1440 px**, sin overflow del documento, con foco visible, teclado, movimiento reducido, fallbacks sin JavaScript, fallo deliberado de módulo, impresión y MathJax sin errores. Se comprueba reflujo a 640 CSS px como geometría equivalente a 200 % sobre 1280 px; el zoom nativo queda como revisión humana complementaria.
- Capturas inspeccionadas de escritorio y móvil: `/tmp/openstudy-buffer-browser-HxT8Li`. La inspección detectó encabezados de tablas demasiado partidos en móvil: se establece ancho mínimo y scroll local únicamente en tablas P6. La corrección pasa una revisión focalizada posterior al render incremental Quarto: ambas páginas y los cinco anchos, impresión, JavaScript desactivado, MathJax y prefijo de publicación. Se vuelven a aprobar las siete pruebas de integración y `check_site.py`; las copias CSS/JS publicadas son idénticas a las fuentes.
- Carga y controles comprobados también bajo el prefijo exacto **`/open-study-base-de-datos/almacenamiento/`**, con importaciones relativas y sin fallos propios.
- Dos pasadas iniciales de navegador se interrumpieron por esperas de interacción/estabilidad. La ejecución final P6 se hizo aislada; la enumeración masiva activa clics DOM y reserva clics reales y teclado para comprobar controles. Los 670 estados y todas las interacciones restantes pasan en esa ejecución. No se contabilizan como aprobadas las pasadas interrumpidas.

**P6 implementada y validada dentro del alcance solicitado.**

### Archivos y continuidad

- Nuevos: las dos páginas `almacenamiento/*.qmd`, `assets/js/visualizaciones/buffer-model.js`, `buffer.js`, `paginas.js`, `tests/buffer.test.js` y `tests/buffer-browser.mjs`.
- Integración: `_quarto.yml`, `index.qmd`, `indices/bplus.qmd`, `assets/js/visualizaciones/index.js`, `assets/css/visualizaciones.css`, `tests/integracion-visual.test.js`, este registro y la salida `docs/` regenerada. Sin cambios en `references.bib`, estilos generales, `core.js` ni motores anteriores.
Para reproducir: usar el mismo Node/Corepack del entorno (`PATH=/usr/lib/chatgpt/resources/cua_node/bin:$PATH corepack npm test`). Servir el directorio padre con `python3 -m http.server 8766 --bind 127.0.0.1 --directory ..` y ejecutar `tests/buffer-browser.mjs` con `BUFFER_TEST_URL=http://127.0.0.1:8766/open-study-base-de-datos/docs/almacenamiento/buffer-manager.html`, `PLAYWRIGHT_MODULE=/usr/lib/chatgpt/resources/cua_node/lib/node_modules/playwright-core/index.mjs` y `BROWSER_EXECUTABLE=/usr/bin/brave-browser`. No se instala ninguna dependencia del sitio.

- Revisión humana complementaria: lectura editorial y matemática final, lectores de pantalla, zoom nativo y Firefox/Safari. No se afirma una auditoría WCAG completa ni corrección universal deducida solo de pruebas finitas.
- P7 y P8 permanecen **pendientes y fuera del alcance**; no se desarrollan optimización física general ni modelado E/R en esta etapa.

## P5 — Procesamiento y reescritura de consultas

### Estado recibido y alcance

- Inicio en `main`, HEAD `7e24ea9`, con `git status --short` vacío. Se trabaja sobre el repositorio real; hashing ya estaba implementado y se conserva. No se utilizan ZIPs ni restauraciones.
- Se añaden `procesamiento/planes-logicos.qmd` y `procesamiento/reescritura.qmd`: el sitio pasa de 23 a 25 páginas académicas. Nueva categoría Procesamiento de consultas, tarjeta de inicio y enlaces desde álgebra relacional y equivalencia de lenguajes.
- No se modifican los algoritmos, fuentes ni pruebas de B+trees, hashing, clausuras, BCNF o 3NF; su HTML cambia por la navegación generada. Tampoco se implementan almacenamiento, Buffer Manager, costos físicos ni E/R.

### Comprobación académica y fuentes privadas

- Consultados el PDF local de reescritura y los ejercicios 28–31 y 36 de la guía disponible en `/home/nicolas/Descargas/guia_repaso_i2.pdf`. Las extracciones de lectura quedan en `/tmp`; ningún documento, enunciado completo, atribución docente ni matriz de correspondencia se publica.
- Pasajes contrastados en los libros locales: Ramakrishnan–Gehrke, tercera edición, catálogo y evaluación en 12.1–12.4, traducción en 15.1.2 y equivalencias/enumeración en 15.3–15.4; Silberschatz–Korth–Sudarshan, séptima edición, 15.1 y 16.2; Garcia-Molina–Ullman–Widom, segunda edición, bolsas y operadores extendidos en 5.1–5.2 y leyes de reescritura en 16.2.1–16.2.7. Las citas públicas solo usan las tres obras pertinentes a estos contenidos y conservan las cinco entradas bibliográficas existentes.
- Comprobadas las páginas oficiales de SQLite sobre `sqlite_schema` y SELECT compuesto. Se corrige la grafía del catálogo respecto de la extracción privada y se declara expresamente que SQLite no implementa `INTERSECT ALL` ni `EXCEPT ALL`; esos operadores se prueban mediante el evaluador matemático.
- El texto separa parser, preprocesador, reescritura, optimizador, plan lógico/físico y ejecución. Define multiplicidades, proyección de bolsas, δ, γ y τ; explica las hipótesis de conjuntos, multiconjuntos y NULL, y aporta pruebas por multiplicidades y contraejemplos mínimos.
- El caso universitario usa tres estudiantes, dos cursos y cuatro inscripciones con llaves y referencias válidas. Dos personas llamadas Alex producen dos ocurrencias del mismo par de nombres. Los cinco planes conservan esa multiplicidad; DISTINCT exterior la reduce a uno. El ejemplo avanzado muestra por qué distribuir una disyunción solo conserva soporte si se mantiene la deduplicación final.

### Componentes, algoritmos y contratos

- `assets/js/visualizaciones/query-plan-model.js`: AST con identificadores estables, esquemas, atributos requeridos, predicados estructurados e hijos. Motor puro, datos y trazas congelados, sin navegador ni parser SQL.
- Evaluador por ocurrencias para selección, proyección, renombramiento, producto, θ/equijoin, natural join, unión/intersección/diferencia de bolsas o conjuntos, δ y agregación MIN/MAX/SUM/COUNT/AVG. Comparación de frecuencias independiente del orden y cardinalidades por nodo; no son estimaciones de costo.
- `applyRule` verifica esquemas, patrón, atributos y conservación de la salida antes de aceptar identificación de conjunciones, conversión producto→join, push-selection y push-projection. Conserva el árbol original y registra regla, precondiciones, antes/después, atributos preservados, justificación y clasificación. Las propuestas falsas se construyen aparte como diagnósticos; no se aceptan ni reparan silenciosamente mediante la API de reglas certificadas.
- `assets/js/visualizaciones/query-plan.js`: seis recorridos y 18 estados comparables. Árboles SVG anterior/propuesto con operadores, predicados, esquemas, requisitos, cardinalidades y cambios destacados; controles, explicación, estado, errores de atributos y tablas de multiplicidad. La comparación finita se distingue explícitamente de la prueba universal.
- Los recorridos estudian las cinco etapas válidas, disyunción solapada, proyección mal definida, eliminación indebida de DISTINCT, distributividad de bolsas y SUM frente a MIN/MAX. No se añade un segundo motor ni otra interfaz de conjuntos: la tabla de multiplicidades reutiliza el evaluador común.
- Regiones con desplazamiento interno, alineación automática de la raíz y controles para volver a ella; texto de 14/15 px sin reducción de escala, descripciones textuales de ambos árboles, foco y anuncios. Cada instancia conserva su estado. Los fallbacks completos permanecen para impresión, JavaScript desactivado y fallo del módulo; sus títulos no se incluyen como destinos ocultos en el índice lateral.
- Integración mínima en `_quarto.yml`, `index.qmd`, `assets/js/visualizaciones/index.js`, `assets/css/visualizaciones.css`, dos enlaces relacionados en cada página de teoría autorizada y `tests/integracion-visual.test.js`. No se modifica `core.js`, el tema, las hojas de estilo generales ni `references.bib`.

### Validaciones de P5

- `PATH=/usr/lib/chatgpt/resources/cua_node/bin:$PATH corepack npm test`: **55 pruebas aprobadas, 0 fallidas**, con Node 24.21.0. Incluye 20 pruebas P5, la ampliación de integración y todas las regresiones algorítmicas existentes. El oráculo cuenta tuplas posicionales sin usar las funciones de frecuencias del motor; cubre 256 pares de bolsas pequeñas para los operadores binarios, instancias con duplicados y vacíos, y 80 instancias adicionales comparadas con un evaluador independiente de tres bucles para las cinco etapas.
- `tests/query-plan.test.js` ejecuta mediante Python/SQLite **3.51.2** los bloques SQL identificados de las fuentes públicas: DDL y datos, consulta original y reescrita, variantes DISTINCT, caso avanzado con unión aditiva y agregados. Compara multiconjuntos y reproduce los contraejemplos de disyunción, atributos ausentes, llave perdida y deduplicación antes de SUM. La intersección y diferencia ALL se comprueban con el oráculo matemático, no se anuncian como SQL ejecutado.
- `python3 tests/sql_examples.py`: aprobado, conserva la regresión de DDL, vista, índice y operaciones de datos anteriores.
- `quarto render`: **25 páginas**, sin errores ni warnings relevantes. `docs/` se obtiene exclusivamente con este render; scripts, CSS, búsqueda y navegación coinciden con las fuentes. El registro técnico no se publica.
- `python3 tests/check_site.py`: aprobado, 25 HTML, 19 rutas originales, cinco claves bibliográficas, citas resueltas, enlaces y fragmentos válidos, delimitadores matemáticos de las fuentes correctos, recursos publicados idénticos e importaciones existentes. No hay PDFs, ZIPs ni carpetas privadas en `docs/`.
- Escaneo editorial adicional: 54 fuentes y salidas públicas revisadas, sin atribuciones o dependencias docentes. Las dos exclusiones de carpetas privadas de `_quarto.yml` son deliberadas; no son atribuciones. `git diff --check -- ':!docs'`: aprobado. No se alteran manualmente los espacios de plantilla del HTML generado.
- `tests/query-plan-browser.mjs`: aprobado en Brave/Chromium y Playwright, **18 estados en seis recorridos**, ambos árboles de cada estado y las frecuencias renderizadas contrastados con el modelo. Verifica anterior/siguiente/reinicio, selección de ejemplos, errores, nodos cambiados, dos instancias independientes, inicialización idempotente, foco, teclado, centrado de raíces y legibilidad sin etiquetas que excedan sus cajas.
- Las dos páginas se prueban a **320, 390, 768, 1024 y 1440 px**, sin desbordamiento horizontal del documento. SVG de 14/15 px, desplazamiento local y reflujo a 640 CSS px, equivalente en geometría al escritorio de 1280 px al 200 %. También se prueban `prefers-reduced-motion`, impresión, MathJax sin `mjx-merror`, JavaScript desactivado y fallo deliberado del módulo. El zoom nativo sigue siendo una revisión humana complementaria.
- Carga real del componente y sus importaciones bajo **`/open-study-base-de-datos/procesamiento/reescritura.html`**, sin errores de JavaScript, warnings ni recursos propios fallidos. Capturas finales inspeccionadas en escritorio y móvil: `/tmp/openstudy-query-browser-SsSXTb`.
- Regresión de navegador de hashing: **326 snapshots**, siete presets extensibles y diez configuraciones estáticas, aprobada, sin errores ni recursos fallidos. Regresión B+: **508 snapshots**, nueve presets y dos políticas, aprobada, incluidos reflujo, fallbacks y MathJax; solo registra el 404 histórico del favicon implícito, sin recursos propios fallidos.
- Problemas detectados y corregidos: etiquetas de identificadores largos que sobresalían de los nodos, un fragmento SQL inline que desbordaba a 320 px, raíces inicialmente fuera de la región visible y títulos estáticos ocultos que aparecían en el índice lateral. La prueba de integración admite clases adicionales de Quarto en el fallback y la prueba de foco establece primero modalidad de teclado. Dos regresiones anticipadas de navegador recargaron páginas mientras Quarto reemplazaba `docs/`; se descartaron esos resultados y se repitieron completas después de finalizar el render. Los resultados anteriores corresponden a esa salida estable.

Para reproducir el navegador, servir el directorio padre con `python3 -m http.server 8765 --bind 127.0.0.1 --directory ..` y ejecutar los tres scripts `tests/query-plan-browser.mjs`, `tests/hashing-browser.mjs` y `tests/bplus-browser.mjs`. El test P5 admite `QUERY_PLAN_TEST_URL`; los demás conservan sus variables anteriores. Se usó `PLAYWRIGHT_MODULE=/usr/lib/chatgpt/resources/cua_node/lib/node_modules/playwright-core/index.mjs` y `BROWSER_EXECUTABLE=/usr/bin/brave-browser`, sin perfiles personales ni nuevas dependencias del sitio. La comprobación del prefijo exacto usó un servidor temporal que mapea `/open-study-base-de-datos/` a `docs/`.

**P5 implementada y validada dentro del alcance solicitado.**

### Límites y revisión humana

El evaluador materializa bolsas pequeñas con valores primitivos no nulos y comparaciones bien tipadas, puras, deterministas y totales. Rechaza coerciones implícitas y predicados con NULL; no reproduce colaciones ni todos los tipos y errores de SQL. La agregación global vacía produce COUNT=0 y NULL para los otros agregados; esos marcadores no se someten a predicados clásicos. No ejecuta τ, outer joins, ventanas, límites, SQL arbitrario ni búsqueda de planes por costo. Esas restricciones se explican públicamente. El verificador de esquemas no es un sistema completo de inferencia de tipos SQL.

Quedan como revisión humana complementaria la lectura editorial y matemática final, lectores de pantalla, zoom nativo del navegador y Firefox/Safari. No se declara auditoría WCAG completa ni una demostración universal obtenida por pruebas finitas. La ampliación posterior de almacenamiento y buffer se registra en P6. No se realizan commits, pushes ni publicación.

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

**P4 implementada y validada dentro del alcance solicitado.** Al cerrar P4, P5–P8 permanecían sin iniciar; P5 se desarrolla posteriormente en el registro superior. No se realizaron commits, pushes, despliegues ni modificaciones remotas.

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
| P5: procesamiento y reescritura | Dos páginas, AST, evaluador y explorador implementados; véase el registro actual | Revisiones humanas complementarias |
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
3. P4 se desarrolló posteriormente con alcance propio; su registro actual aparece al inicio. P5 se desarrolló posteriormente; P6–P8 requieren tareas independientes.
4. Mantener estas convenciones y las pruebas sin refactorizaciones innecesarias.
