# Avisos de terceros

El permiso MIT de ngulloa excluye estos componentes. Los textos completos y
copyright upstream se conservan en `LICENSES/`; los banners de los bundles se
mantienen con sus años originales. El generador instalado es Quarto 1.10.18;
no se distribuye su CLI. En la extensión son dependencias del resultado, no
bibliotecas JS vendorizadas dentro de sus fuentes.

| Componente | Versión | Licencia | Rutas/canal | Texto y referencia upstream |
|---|---|---|---|---|
| Quarto | 1.10.18 | MIT | `site_libs/quarto-{html,nav,search}/**` | [texto](LICENSES/quarto-copyright.txt), [origen](https://raw.githubusercontent.com/quarto-dev/quarto-cli/v1.10.18/COPYRIGHT) |
| Bootstrap | 5.3.1 | MIT | `site_libs/bootstrap/bootstrap*.{css,js}` | [texto](LICENSES/bootstrap-5.3.1.txt), [origen](https://raw.githubusercontent.com/twbs/bootstrap/v5.3.1/LICENSE) |
| Bootstrap Icons | 1.13.1 | MIT | `site_libs/bootstrap/bootstrap-icons.{css,woff}` | [texto](LICENSES/bootstrap-icons-1.13.1.txt), [origen](https://raw.githubusercontent.com/twbs/icons/v1.13.1/LICENSE) |
| clipboard.js | 2.0.11 | MIT | `site_libs/clipboard/clipboard.min.js` | [texto](LICENSES/clipboard-2.0.11.txt), [origen](https://raw.githubusercontent.com/zenorocha/clipboard.js/v2.0.11/LICENSE) |
| AnchorJS | 5.0.0 | MIT | `site_libs/quarto-html/anchor.min.js` | [texto](LICENSES/anchor-5.0.0-exact.txt), [origen](https://raw.githubusercontent.com/bryanbraun/anchorjs/5.0.0/LICENSE) |
| Popper | 2.11.7 | MIT | `site_libs/quarto-html/popper.min.js` | [texto](LICENSES/popper-2.11.7.txt), [origen](https://raw.githubusercontent.com/floating-ui/floating-ui/v2.11.7/LICENSE.md) |
| Tippy.js | 6.3.7 | MIT | `site_libs/quarto-html/tippy*` | [texto](LICENSES/tippy-6.3.7.txt), [origen](https://cdn.jsdelivr.net/npm/tippy.js@6.3.7/LICENSE) |
| Algolia Autocomplete | 1.19.1 | MIT | `site_libs/quarto-search/autocomplete.umd.js` | [texto](LICENSES/autocomplete-1.19.1.txt), [origen](https://raw.githubusercontent.com/algolia/autocomplete/v1.19.1/LICENSE) |
| Fuse.js | 6.6.2 | Apache-2.0 | `site_libs/quarto-search/fuse.min.js` | [texto](LICENSES/fuse-6.6.2.txt), [origen](https://raw.githubusercontent.com/krisk/Fuse/v6.6.2/LICENSE) |
| RFS | referencia 10.0.0 | MIT | `CSS Bootstrap/Quarto; fragmentos _rfs.scss` | [texto](LICENSES/rfs-10.0.0.txt), [origen](https://raw.githubusercontent.com/twbs/rfs/v10.0.0/LICENSE) |
| Normalize | referencia 8.0.1 | MIT | `CSS Bootstrap/Quarto; fragmentos _reboot.scss` | [texto](LICENSES/normalize-8.0.1.txt), [origen](https://raw.githubusercontent.com/necolas/normalize.css/8.0.1/LICENSE.md) |
| MathJax | 4.1.3 | Apache-2.0 | `CDN: mathjax@4.1.3/tex-chtml.js (no vendorizado)` | [texto](LICENSES/mathjax-4.1.3.txt), [origen](https://raw.githubusercontent.com/mathjax/MathJax/4.1.3/LICENSE) |

Los titulares y avisos exactos están en los textos: Posit Software, PBC
(Quarto, 2020–2024); The Bootstrap Authors (Bootstrap, 2011–2023; Icons,
2019–2024); Zeno Rocha (clipboard); Bryan Braun (AnchorJS); Federico Zivolo
(Popper); atomiks (Tippy); Algolia, Inc. y colaboradores (Autocomplete);
Kiro Risk (Fuse); Martijn Cuppens (RFS); Nicolas Gallagher y Jonathan Neal
(Normalize); The MathJax Consortium (MathJax). No se homogeneizan sus años:
AnchorJS conserva además el banner 2023 y Headroom, donde existe, el banner
2020 frente al texto upstream 2013. Zenscroll identifica a Gabor Lenard en su
package.json y conserva Unlicense.

Tippy conserva la modificación de empaquetado observada: retirada de la
referencia a source map. Los fragmentos RFS/Normalize están incorporados en
Bootstrap/Quarto: las versiones indicadas son referencias de los textos
verificados, no una certificación de versión exacta de cada fragmento.
Fuse conserva su banner Copyright (c) 2022 Kiro Risk y Apache-2.0 íntegra;
MathJax conserva Apache-2.0. No se encontró NOTICE adicional en las consultas
versionadas de la auditoría; no se inventa un NOTICE upstream.

MathJax se carga desde CDN; no se distribuyen sus fuentes NewCM localmente.
Su resolución remota puede cambiar dentro del rango del paquete. El texto
MathJax se incluye como referencia del canal de ejecución; antes de autoalojar
fuentes debe verificarse versión y cadena completa de avisos. Las fuentes de
texto del diseño son las del sistema; Bootstrap Icons WOFF sí se distribuye
bajo MIT. Los binarios de herramientas externas y acciones GitHub remotas no
se copian al proyecto.
