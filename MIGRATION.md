# Migración de Bases de Datos a artefactos Pages

Estado verificado por API de solo lectura el 25 de octubre de 2026: sitio público https://ustudyopen.github.io/base-de-datos/, fuente `main/docs`, modo `legacy`, sin CNAME. Última compilación pública: `222e39b617c9cba161688f38cf29c1bb230e484c`, estado `built`. No se modifica ninguna configuración remota.

## Preparación local realizada

Se conserva `docs/` íntegro respecto del inicio de esta tarea, incluso los cambios previos del piloto cuando existen. `_site/` es la nueva salida ignorada por Git. Las URL de las páginas `.qmd` permanecen iguales. Los hashes de `tests/academic-integrity.json` y `tests/route-baseline.json` comprueban fuentes, bibliografía, scripts, rutas y anclas históricas. Los respaldos del workspace incluyen el árbol de trabajo original y un archivo Git de `docs/` del commit efectivamente publicado, junto a sus SHA-256; se extraen para revisar, no encima de modificaciones locales.

El workflow de despliegue solo ofrece `workflow_dispatch`. El job de compilación exige `USO_PAGES_ENABLED=true`, `refs/heads/main` y la entrada exacta `PUBLICAR`. El job de publicación depende del éxito de build y recibe únicamente Pages y OIDC. No se ha creado la variable, disparado el workflow ni modificado Pages. El sitio actual continúa dependiendo de `docs/`.

## Activación posterior: requiere autorización expresa

1. Revisar diferencias y pruebas; preservar los cambios locales anteriores. Integrar los cambios aprobados a `main` mediante el procedimiento humano del proyecto. Configurar protección de `main` con el check `Validate course / validate` y PR obligatorio; configurar las aprobaciones según el apartado de administrador único.
2. Crear/proteger el entorno `github-pages`: permitir solamente `main`, exigir como revisor al propietario autorizado y dejar **Prevent self-review** desmarcado mientras exista un único administrador. Desactivar el bypass de las reglas del entorno para administradores; el propietario debe aprobar explícitamente cada despliegue pendiente, incluso si lo inició. Confirmar restricciones de acciones de la organización y los SHA registrados en `tests/action-pins.json`.
3. En **Settings → Pages → Build and deployment**, seleccionar **GitHub Actions**. No borrar `docs/`.
4. Crear la variable de repositorio `USO_PAGES_ENABLED` con valor `true` solo cuando se autorice publicar. Disparar `Prepare approved Pages deployment` desde `main`, entrada `confirm: PUBLICAR`, y aprobar el entorno protegido. Build valida fuentes, compila, ejecuta pruebas y valida HTML antes de subir `artifact.tar`.
5. Verificar https://ustudyopen.github.io/base-de-datos/: inicio, búsquedas, enlaces antiguos, recursos, fórmulas, navegación móvil y todos los simuladores en ambos temas. Verificar el commit y los checks en GitHub; una prueba local no acredita una ejecución real de Actions.
6. Para habilitar despliegue automático después de merges aprobados, preparar primero una actualización aprobada en `ustudyopen-design/workflows/deploy.yml` (no editar una copia vendor directamente): añadir `push: { branches: [main] }` al bloque `on` de deploy.yml y, **en ambos jobs**, sustituir la condición actual por `vars.USO_PAGES_ENABLED == 'true' && github.ref == 'refs/heads/main' && (github.event_name == 'push' || (github.event_name == 'workflow_dispatch' && inputs.confirm == 'PUBLICAR'))`. Mantener `needs: build`, el entorno protegido y el check obligatorio. `validate.yml` seguirá validando PR sin publicar. Declarar además `"pages_automation_approved": true` en el objeto `course` de `course.yml`, solo con aprobación expresa. Desde el repositorio central, ejecutar `python3 tooling/sync_course.py ../base-de-datos` para instalar el workflow aprobado y recalcular sus manifiestos; revisar el diff y repetir render, pruebas y validador antes de integrar. Sin esos pasos fallarán deliberadamente los controles de integridad y autorización. Este cambio de activación es posterior y no está aplicado.
7. Retirar `docs/` del seguimiento únicamente cuando el nuevo sitio se haya verificado y exista respaldo revisado. Realizarlo en un cambio independiente aprobado, preservando cualquier documento fuente identificado. No retirar `ustudyopen-design/docs`, que contiene documentación original.

## Reversión

Antes del primer despliegue basta con no activar la variable y conservar la fuente `main/docs`. Si falla el primer artefacto, mantener intacto `docs/`; bajo autorización, devolver Source a `Deploy from a branch`, `main`, `/docs`, y comprobar el sitio anterior. Para una regresión de diseño, restaurar exclusivamente el paquete anterior y sus manifiestos desde un respaldo separado, recompilar y repetir pruebas. No usar reset destructivo ni sobrescribir contenido académico o cambios previos.

Los avisos de licencia y procedencia deben aclararse antes de aplicar una licencia diferente o redistribuir material sin permiso. La revisión académica permanece pendiente; publicar un curso etiquetado en desarrollo no lo convierte en listo.

## Aprobación con un único administrador

La aprobación del entorno es independiente de la revisión del PR. En `github-pages`, usar **Required reviewers** con el propietario autorizado, **Prevent self-review** desmarcado, bypass de administradores deshabilitado y ramas permitidas limitadas a `main`. Así el propietario puede iniciar y aprobar su despliegue mediante **Review deployments → Approve and deploy**; sigue siendo una acción manual registrada. GitHub documenta que impedir autoaprobación es opcional: https://docs.github.com/en/actions/how-tos/deploy/configure-and-manage-deployments/manage-environments.

Mantener `main` protegida: PR obligatorio, checks obligatorios exitosos, sin push directo, force push ni eliminación. Si el propietario es también el único autor, configurar temporalmente **cero aprobaciones de PR requeridas**: no puede aprobar su propio PR. Conservar la revisión humana del diff y los checks antes de integrar; al incorporar otro revisor, exigir una aprobación de PR. Esta excepción documentada no permite omitir checks ni el PR.

Conservar `workflow_dispatch`, `confirm: PUBLICAR`, `USO_PAGES_ENABLED` y `needs: build`. Esta documentación no configura el entorno, no crea la variable ni activa Pages. Comprobar en GitHub la disponibilidad de reglas según plan y visibilidad, el nombre real del check requerido, la espera y aprobación del entorno y sus restricciones de rama; no se acreditan mediante pruebas locales.
