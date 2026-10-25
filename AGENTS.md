# Convenciones UStudyOpen

Preservar rutas, anclas, bibliografía, fórmulas y lógica académica. No marcar contenidos como revisados sin revisión humana. `course.yml` usa JSON válido como YAML, sin dependencias adicionales para su validación. Actualizar el registro al agregar páginas.

Los estilos comunes se editan en ustudyopen-design y se distribuyen con su herramienta de sincronización; no editar las copias vendor. La geometría y lógica de las actividades permanecen en el curso. Quarto 1.10.18; salida `_site/`. No generar ni eliminar `docs/`: mantiene el sitio publicado hasta la migración autorizada.

Validar con `python3 tests/render_clean.py`, `python3 tests/run_course.py` y `python3 tests/platform_validate.py`. Los manifiestos académicos detectan cambios; cualquier actualización exige revisar el contenido, no regenerarlos para ocultar fallos. No crear commits, push, tags, releases, cambios remotos ni despliegues sin autorización expresa.
