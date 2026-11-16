// Render the film one scene per file (same size, frame rate and encoder settings), bundling once.
// Finished scenes are skipped, so a stopped render resumes where it left off.
// node render_scenes.mjs <scale> <out-dir>
import { bundle } from "@remotion/bundler";
import { renderMedia, selectComposition } from "@remotion/renderer";
import fs from "node:fs";
import path from "node:path";

const [scale = "2", outDir = "out/chunks"] = process.argv.slice(2);
const data = JSON.parse(fs.readFileSync("src/data.json", "utf8"));
const browserExecutable = process.env.CHROME;
const chromiumOptions = { gl: "swangle" };
fs.mkdirSync(outDir, { recursive: true });
const serveUrl = await bundle({ entryPoint: path.resolve("src/index.jsx") });
const composition = await selectComposition({ serveUrl, id: "Ecoute", browserExecutable, chromiumOptions });
const ranges = data.scenes.map((s, i) => [s.id, s.start, i === data.scenes.length - 1 ? data.frames - 1 : data.scenes[i + 1].start - 1]);
for (const [id, a, b] of ranges) {
  const done = `${outDir}/${String(a).padStart(5, "0")}_${id}.mp4`;
  if (fs.existsSync(done)) { console.log("skip", id); continue; }
  const tmp = `${outDir}/tmp_${id}.mp4`;
  const t = Date.now();
  await renderMedia({ serveUrl, composition, codec: "h264", crf: 17, frameRange: [a, b], scale: +scale, muted: true, concurrency: 1,
    outputLocation: tmp, browserExecutable, chromiumOptions, overwrite: true });
  fs.renameSync(tmp, done);
  console.log(id, b - a + 1, "frames", ((Date.now() - t) / 1000).toFixed(0) + "s");
}
console.log("all scenes rendered");
