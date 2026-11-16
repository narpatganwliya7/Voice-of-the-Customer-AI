// Write the sound-effect cue sheet (seconds) from the same timing the picture uses.
import fs from "node:fs";
import { cues } from "./src/timeline.js";
const data = JSON.parse(fs.readFileSync("src/data.json", "utf8"));
const out = { duration: data.frames / data.fps, cues: cues(data) };
fs.writeFileSync(process.argv[2] || "public/cues.json", JSON.stringify(out, null, 1));
console.log(out.cues.length, "cues,", out.duration.toFixed(2), "s");
