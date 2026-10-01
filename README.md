code lifted from fruitbox12 RIP

# Green 3D Globe

A static Three.js globe with the original dotted map, rotation, click ripple, coordinate popups and glow. No build step is required.

## Run

Serve this folder over HTTP, for example `python -m http.server 4201`, then open `http://localhost:4201`. Do not open the HTML as a `file://` URL: browsers restrict module loading there.

Use the **Theme** selector for Green, Autheo or White. Your choice is saved when browser storage is available; a `?theme=white` (or `green` / `autheo`) URL takes priority. The original theme HTML URLs forward to the corresponding theme. Green and Autheo intentionally retain their shared turquoise palette; Autheo includes the original scanline overlay. White uses its original gray mesh and black pointer/connector on a light background.

Dragging rotates the globe; clicking selects coordinates. Switching themes keeps the same renderer and selection. Runtime libraries and the original map image are local; see [provenance](vendor/README.md).

The original incomplete Polkadot telemetry experiment remains in the source and is opt-in with `?telemetry=1`. It is not required for globe display, and this repair does not claim to implement a live validator map.

## Browser regression check

With a local HTTP server running, run `node tests/browser.cjs`. Provide `PLAYWRIGHT_MODULE` if Playwright is already installed elsewhere and `CHROMIUM_EXECUTABLE` if using an existing browser binary. `BASE_URL` defaults to `http://127.0.0.1:4201`. Screenshots and the report go to ignored `.work/artifacts/`. Keep any new test dependencies and caches on the chosen project drive.
