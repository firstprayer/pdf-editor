import { cp, mkdir } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";

const require = createRequire(import.meta.url);
const library = dirname(require.resolve("pdfjs-dist/package.json"));
const destination = resolve(import.meta.dirname, "../public/pdf-assets");
await mkdir(destination, { recursive: true });
for (const folder of ["cmaps", "standard_fonts", "wasm"]) {
  await cp(resolve(library, folder), resolve(destination, folder), { recursive: true });
}
