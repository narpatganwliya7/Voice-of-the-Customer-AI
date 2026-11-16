// Render a few frames of a composition as JPEGs, bundling once.
// node stills.mjs <comp> <scale> <out-dir> frame1 frame2 ...
import { bundle } from "@remotion/bundler";
import { renderStill, selectComposition } from "@remotion/renderer";
import path from "node:path";

const [comp = "Ecoute", scale = "1", outDir = "out/stills", ...frames] = process.argv.slice(2);
const browserExecutable = process.env.CHROME;
const serveUrl = await bundle({ entryPoint: path.resolve("src/index.jsx") });
const chromiumOptions = { gl: "swangle" };
const composition = await selectComposition({ serveUrl, id: comp, browserExecutable, chromiumOptions });
for (const f of frames) {
  const t = Date.now();
  await renderStill({ serveUrl, composition, frame: +f, output: `${outDir}/${comp}_${f}.jpg`, imageFormat: "jpeg", jpegQuality: 90,
    scale: +scale, browserExecutable, chromiumOptions });
  console.log(f, ((Date.now() - t) / 1000).toFixed(1) + "s");
}
