# Bases de Datos — sitio Quarto

Material académico autónomo de Bases de Datos, organizado por conceptos. Desarrolla el modelo relacional, lógica y álgebra de consultas, SQL, información incompleta y diseño relacional con ejemplos de un dominio universitario ficticio.

## Requisitos

- [Quarto CLI](https://quarto.org/) instalado.

La integración actual usa **UStudyOpen Design 0.3.0**, instantánea local sin etiqueta ni release, con **Quarto 1.10.18**. La extensión vive en `_extensions/ustudyopen-design/`; `design-vendor.json` fija sus 13 archivos por SHA-256 y `platform-vendor.json` fija las herramientas y workflows. No requiere descargar una extensión ni instalar paquetes del sitio.

El [informe del piloto 0.2](review/DESIGN_V0.2.md) conserva el antecedente de la rama `pilot/ustudyopen-design-v0.2`; la refactorización actual se revisa en `refactor/academic-platform-20261025`.

Para reconstruir la integración actual y verificarla:

```sh
python3 tests/render_clean.py
python3 tests/run_course.py
python3 tests/check_design.py
python3 tests/platform_validate.py
bash tests/run-design-browser.sh regression
```

La suite académica usa Node 24.21.0 y Python estándar. Las pruebas de navegador históricas utilizan Playwright Core y un Chromium con sandbox, configurables mediante `PLAYWRIGHT_MODULE` y `BROWSER_EXECUTABLE`; no se incorporan al sitio. `tests/build_review.py` conserva el generador del informe histórico v0.2 y no debe ejecutarse para acreditar la versión actual.

## Uso local

Desde la raíz del proyecto:

```bash
quarto preview
```

Para generar el sitio completo:

```bash
quarto render
```

El render actual se escribe en `_site/`, ignorado por Git. `docs/` conserva la publicación anterior y no debe regenerarse ni retirarse antes de completar la migración autorizada.

## Publicación

La publicación actual usa `main/docs`; la migración a artefactos está preparada y desactivada. No cambiar la configuración remota durante la revisión. Consultar [MIGRATION.md](MIGRATION.md).

## Estructura

- `fundamentos/`: modelo relacional y relaciones nombradas.
- `teoria-consultas/`: lógica de primer orden y álgebra relacional.
- `sql/`: DDL, DML, consultas, subconsultas y agregación.
- `nulos/`: `NULL`, información incompleta y outer joins.
- `diseno/`: dependencias funcionales, llaves, clausura y descomposiciones.
- `references.bib`: las cinco obras académicas de la bibliografía principal.
- `theme.scss`: paleta semántica, tipografía y variables compartidas de Bootstrap/Quarto.
- `styles/`: estilos globales organizados por base, layout, componentes, conceptos y comportamiento responsivo.

La interfaz aprovecha Bootstrap incluido en Quarto, sin dependencias adicionales ni fuentes externas. Conserva el menú colapsable de Quarto por debajo de 992 px, adapta los enlaces y recuadros a una columna en móvil y mantiene el desplazamiento de tablas y fórmulas dentro de sus contenedores. Respeta la preferencia de movimiento reducido y ofrece estados de foco para navegación con teclado.

## Edición y validación

Usa `$...$` para matemática inline y `$$` en líneas propias para bloques. Las fórmulas HTML se procesan con MathJax; revisa tanto la sintaxis como el resultado visual. La [documentación de Quarto sobre ecuaciones](https://quarto.org/docs/authoring/markdown-basics.html#equations) describe estos delimitadores.

Antes de entregar cambios, ejecuta `quarto render`, resuelve errores y advertencias relevantes, comprueba las citas y los enlaces internos, y valida `_site/` con `python3 tests/platform_validate.py`. Mantén la exposición autocontenida y las convenciones explícitas; las citas deben respaldar el contenido sin atribuir a los libros decisiones editoriales propias.

## Diseño relacional y exploradores

La sección `diseno/` desarrolla llaves candidatas, clausura, proyección de DF, pérdida y preservación, BCNF y síntesis 3NF. Los ejemplos trabajan con conjuntos sin nulos. La proyección incluye el determinante vacío; BCNF corta por la clausura completa del determinante. La síntesis base añade siempre una llave candidata, y la simplificación de esquemas contenidos es una opción separada.

Los exploradores son módulos ES nativos bajo `assets/js/visualizaciones/`, sin bundler ni dependencias de ejecución adicionales. `_includes/visualizaciones.html` carga `index.js`; este importa solo el componente detectado en una raíz `data-db-viz`. Quarto convierte la ruta de inclusión en una ruta relativa para las páginas anidadas. La versión publicada puede servirse bajo `/base-de-datos/`.

Cada raíz conserva un ejemplo estático completo, disponible si JavaScript falla y al imprimir. Los controles se construyen después de validar la primera traza. Las funciones de cálculo están separadas de los controles; anterior/siguiente recorren snapshots. Se admiten hasta ocho atributos para clausuras y seis para normalización: enumerar todas las llaves o todas las DF proyectadas puede requerir espacio y tiempo exponenciales.

## Comprobaciones reproducibles

Con Node.js moderno, sin instalar paquetes:

```bash
node --test tests/*.test.js
python3 tests/sql_examples.py
quarto render
python3 tests/check_site.py
```

También se pueden ejecutar las pruebas `node:test` con Deno 2:

```bash
deno test --allow-read tests/dependencias.test.js
```

Las pruebas académicas comparan clausuras con un oráculo que enumera conjuntos de coincidencia entre dos tuplas; comprueban la pérdida mediante un chase independiente. Cubren constantes, ciclos, DF redundantes, llaves de distintos tamaños, cubiertas minimales y las salidas de BCNF/3NF. Las pruebas finitas complementan las demostraciones de las páginas.

`check_site.py` verifica páginas, recursos propios, enlaces relativos y fragmentos, IDs duplicados, citas resueltas, las cinco claves bibliográficas, delimitadores matemáticos y las 19 rutas originales. Las revisiones de navegador deben comprobar además MathJax, teclado, fallbacks, impresión, zoom y anchos 320/390/768/1024/1440; los análisis estáticos no certifican accesibilidad completa.

Los recursos publicados se enumeran en `_quarto.yml`; no amplíes el manifiesto a todo el repositorio. El directorio generado es `_site/`; conservar `docs/` sin regenerarlo hasta terminar la migración. El render local no ejecuta publicación ni cambia la configuración remota de Pages.


## Arquitectura compartida y revisión local

Quarto **1.10.18**, Python **3.14.8** y Node **24.21.0** en CI. No se instalan paquetes npm ni Python para compilar. El diseño usa una instantánea local **0.3.0**, con correcciones visuales 0.2 preservadas y archivos fijados por SHA-256. Los manifiestos de diseño y plataforma permiten verificar exactamente qué se instala. Las instrucciones previas sobre el piloto son históricas; la integración actual genera exclusivamente `_site/`.

```sh
python3 tests/render_clean.py
python3 tests/run_course.py
python3 tests/platform_validate.py
quarto preview --host 127.0.0.1
```

`tests/run_course.py` ejecuta las pruebas particulares disponibles. En IA y Precálculo incluye actividades reales mediante Chrome/Chromium con sandbox y Node WebSocket, sin paquetes; puede configurarse `BROWSER_EXECUTABLE`. Se usa un perfil desechable y servidor exclusivo en loopback. El render aislado conserva el `_site/` anterior si falla. Para examinar exactamente el artefacto generado sin volver a compilar: `python3 -m http.server 8761 --bind 127.0.0.1 --directory _site` y abrir `http://127.0.0.1:8761/`.

Los estados `lista`, `en-desarrollo` y `proximamente` se declaran en metadatos de página y en `course.yml` (JSON válido como YAML). El temario registra todas las páginas actuales y los temas futuros que ya estaban anunciados, cuando existen. No se inventa un programa institucional. `reference_code: null` significa que no se verificó un código oficial. No se marca revisión académica automáticamente. Para agregar una página: conservar las rutas existentes, declarar sus metadatos, agregarla al registro, al render y a la navegación, y revisar sus recursos; no crear secciones vacías. Los manifiestos de integridad se actualizan únicamente con revisión humana del contenido.

Para actualizar el sistema compartido: desde `../ustudyopen-design`, ejecutar `python3 tooling/sync_course.py ../base-de-datos`, revisar ambos manifiestos y diferencias y repetir las pruebas y comparaciones visuales. No editar copias vendor. La plantilla solo inicia cursos nuevos; no migra los existentes.

Los workflows están preparados y no se activan por push. La publicación requiere autorización, protección de `main`, revisión del entorno `github-pages`, variable de activación y confirmación manual. [MIGRATION.md](MIGRATION.md) registra la situación remota verificada, los pasos exactos de activación posterior y la reversión. No se han realizado commits, pushes, tags, releases ni despliegues.
