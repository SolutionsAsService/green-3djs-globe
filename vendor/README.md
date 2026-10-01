# Runtime dependencies and provenance

The same dependency versions used by the original globe are served locally so initial rendering does not depend on third-party CDNs.

- `three.module.js`: Three.js 0.133.1, fetched unchanged from https://cdn.jsdelivr.net/npm/three@0.133.1/build/three.module.js. MIT license in `THREE-LICENSE.txt`.
- `OrbitControls.js`: same release, https://cdn.jsdelivr.net/npm/three@0.133.1/examples/jsm/controls/OrbitControls.js. Only its `three` import is changed to `./three.module.js`. Same Three.js license.
- `gsap.min.js`: GSAP 3.12.5, fetched unchanged from https://cdn.jsdelivr.net/npm/gsap@3.12.5/dist/gsap.min.js. Its original copyright/license header is retained; see https://gsap.com/standard-license. The published package has no separate license file. No new license is asserted.
- `../assets/earth-map-colored.png`: the original globe's map image, copied unchanged from https://ksenia-k.com/img/earth-map-colored.png. Credit: Ksenia Kondrashova / ksenia-k.com. Original rights remain with the source; no new asset license is asserted.

Original repository attribution: “code lifted from fruitbox12 RIP”. Existing Poppr and source-video links remain in the page. The old theme JS/CSS files remain as source references; the active themes now use one renderer.
