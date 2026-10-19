const modules = {clausuras: './clausuras.js', normalizacion: './normalizacion.js', bplus: './bplus.js', hashing: './hashing.js', 'query-plan': './query-plan.js', buffer: './buffer.js', paginas: './paginas.js'};
export async function initialize(scope = document) {
  for (const root of scope.querySelectorAll('[data-db-viz]')) {
    if (root.dataset.dbReady || root.dataset.dbLoading) continue;
    const file = modules[root.dataset.dbViz];
    if (!file) continue;
    root.dataset.dbLoading = 'true';
    try {
      const module = await import(new URL(file, import.meta.url));
      module.init(root);
    } catch (error) {
      // A failed enhancement never removes the complete static example.
      console.warn('No se pudo activar la visualización; el ejemplo estático sigue disponible.', error);
    } finally { delete root.dataset.dbLoading; }
  }
}
if (typeof document !== 'undefined') initialize();
