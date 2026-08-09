# Third-party notices

The exact package versions, registry URLs, integrity values, provenance, and browser identity are frozen in `manifest.json` and `package-lock.json`.

- Playwright is Copyright Microsoft Corporation and is licensed under Apache-2.0. It contains code derived from Puppeteer, also under Apache-2.0. The installed package's complete `LICENSE`, `NOTICE`, and `ThirdPartyNotices.txt` are authoritative distribution inputs.
- Three.js, Ajv, gl-matrix, pngjs, fast-deep-equal, json-schema-traverse, and require-from-string are MIT licensed.
- fast-uri is BSD-3-Clause licensed.
- Google Chrome for Testing revision 1228, version 149.0.7827.55, is downloaded by the exact Playwright registry entry and distributed under the Google Chrome Terms of Service recorded in `manifest.json`; the bundle-local terms are available at `chrome://terms`. Chromium source portions are separately available from <https://chromium.googlesource.com/chromium/src/> under the top-level BSD-3-Clause license at <https://chromium.googlesource.com/chromium/src/+/main/LICENSE>. That source license is not asserted as the license for the Google Chrome for Testing binary as a whole.

`licenses/` contains the license texts shared by the frozen dependency set. This repository does not vendor dependency or browser source trees.
