# Validación de Bases de Datos

Ejecutar con Quarto 1.10.18, Python y Node 24.21.0:

```sh
python3 tests/render_clean.py
python3 tests/run_course.py
python3 tests/platform_validate.py --release
```

`run_course.py` ejecuta sintaxis, suites académicas de Node, SQL, validación
del sitio y la selección fija `browser-course.mjs`. El navegador es obligatorio:
su ausencia o un fallo hace fallar el comando. Tiene un límite de 180 segundos.
No se instalan paquetes npm. `browser_course.py` utiliza Chrome/Chromium con
sandbox habilitado, perfil temporal y servidor HTTP/CDP limitados a loopback.
Puede seleccionarse el binario mediante `BROWSER_EXECUTABLE`.

La selección compara cada estado de los siguientes casos con los modelos
académicos existentes y comprueba su representación y controles reales:

- B+: `split`, inserción, búsqueda y eliminación; bloqueo de estados transitorios.
- Hashing extensible: `alternancia`, crecimiento y reducción; claves visibles.
- Planes: `valido` y `atributos`, multiplicidades y rechazo de proyección inválida.
- Buffer: `belady`, tres frames con FIFO y LRU; frames, pins, dirty, I/O e independencia de instancias.

También comprueba anterior/siguiente/reinicio, persistencia al cambiar entre
temas y ausencia de excepciones o recursos fallidos. Guarda los resultados en
`artifacts/platform/course-browser.json` y el arranque en `browser.log`; el
workflow conserva ese directorio incluso si falla la validación.

`Validate course / validate` y el build manual de Pages ya llaman a
`run_course.py`: esta cobertura se ejecuta en ambos. La [imagen Ubuntu 24.04 de GitHub Actions](https://github.com/actions/runner-images/blob/main/images/ubuntu/Ubuntu2404-Readme.md) incluye Google Chrome; el lanzador lo detecta con `google-chrome`.
Solo requiere `contents: read`, sin secretos, credenciales persistidas ni
permisos Pages/OIDC en validación. El navegador del runner puede actualizarse;
los casos son fijos. Queda pendiente acreditar la ejecución en un runner real,
incluida la disponibilidad del sandbox y el tiempo total (job: 20 minutos).

Las suites exhaustivas `bplus-browser.mjs`, `hashing-browser.mjs`,
`query-plan-browser.mjs` y `buffer-browser.mjs` se conservan para ejecución
adicional con Playwright y las variables de URL documentadas en sus cabeceras;
no forman parte de la selección rápida ni se declara que se ejecuten en CI.

Para preparar artefactos usar siempre `render_clean.py`. Un `quarto render`
directo en un árbol que conserva `docs/` puede copiar sus recursos a
`_site/docs/`; `.quartoignore` no garantiza excluir recursos descubiertos.
La exclusión explícita `project.resources: ['!docs/**', …]` evita esa copia
también en un render directo. La compilación aislada omite `docs/` desde el origen, valida y reemplaza
completamente `_site/`, sin modificar el sitio histórico. Validar con
`--release` antes de empaquetar la salida.
