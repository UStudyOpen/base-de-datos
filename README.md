# Bases de Datos — sitio Quarto

Material académico autónomo de Bases de Datos, organizado por conceptos. Desarrolla el modelo relacional, lógica y álgebra de consultas, SQL, información incompleta y diseño relacional con ejemplos de un dominio universitario ficticio.

## Requisitos

- [Quarto CLI](https://quarto.org/) instalado.

## Uso local

Desde la raíz del proyecto:

```bash
quarto preview
```

Para generar el sitio completo:

```bash
quarto render
```

El render se escribe en `docs/`, según `_quarto.yml`. Esta carpeta forma parte del repositorio y debe actualizarse junto con las fuentes; incluye las páginas HTML, el índice de búsqueda y los recursos del sitio.

## Publicación

Para servir el resultado con GitHub Pages, configura la publicación desde la carpeta `docs/` de la rama elegida. La generación local mediante `quarto render` no publica cambios por sí sola.

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

Antes de entregar cambios, ejecuta `quarto render`, resuelve errores y advertencias relevantes, comprueba las citas y los enlaces internos, y verifica que `docs/` corresponda a las fuentes actuales. Mantén la exposición autocontenida y las convenciones explícitas; las citas deben respaldar el contenido sin atribuir a los libros decisiones editoriales propias.

## Diseño relacional y exploradores

La sección `diseno/` desarrolla llaves candidatas, clausura, proyección de DF, pérdida y preservación, BCNF y síntesis 3NF. Los ejemplos trabajan con conjuntos sin nulos. La proyección incluye el determinante vacío; BCNF corta por la clausura completa del determinante. La síntesis base añade siempre una llave candidata, y la simplificación de esquemas contenidos es una opción separada.

Los exploradores son módulos ES nativos bajo `assets/js/visualizaciones/`, sin bundler ni dependencias de ejecución adicionales. `_includes/visualizaciones.html` carga `index.js`; este importa solo el componente detectado en una raíz `data-db-viz`. Quarto convierte la ruta de inclusión en una ruta relativa para las páginas anidadas. La versión publicada puede servirse bajo `/open-study-base-de-datos/`.

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

Los recursos publicados se enumeran en `_quarto.yml`; no amplíes el manifiesto a todo el repositorio. El directorio generado `docs/` solo se modifica mediante `quarto render`. El render local no ejecuta publicación ni cambia la configuración remota de Pages.
