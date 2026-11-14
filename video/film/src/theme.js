import { staticFile, continueRender, delayRender } from "remotion";

export const C = {
  ink: "#0a0e1a", panel: "#111729", panel2: "#172037", line: "#263052",
  text: "#e8ecf6", muted: "#8f99b6", amber: "#ffb547", red: "#ff6166", green: "#3ddc97", violet: "#b9a7ff",
};
export const F = {
  display: "'Anybody', 'Arial Narrow', sans-serif",
  body: "'IBM Plex Sans', system-ui, sans-serif",
  mono: "'IBM Plex Mono', monospace",
};

const faces = [
  ["Anybody", "anybody-latin-wdth-normal.woff2", "normal", "100 900", "50% 150%"],
  ["Anybody", "anybody-latin-ext-wdth-normal.woff2", "normal", "100 900", "50% 150%"],
  ["IBM Plex Sans", "ibm-plex-sans-latin-400-normal.woff2", "normal", "400"],
  ["IBM Plex Sans", "ibm-plex-sans-latin-500-normal.woff2", "normal", "500"],
  ["IBM Plex Sans", "ibm-plex-sans-latin-600-normal.woff2", "normal", "600"],
  ["IBM Plex Sans", "ibm-plex-sans-latin-700-normal.woff2", "normal", "700"],
  ["IBM Plex Sans", "ibm-plex-sans-latin-ext-400-normal.woff2", "normal", "400"],
  ["IBM Plex Sans", "ibm-plex-sans-latin-ext-600-normal.woff2", "normal", "600"],
  ["IBM Plex Mono", "ibm-plex-mono-latin-400-normal.woff2", "normal", "400"],
  ["IBM Plex Mono", "ibm-plex-mono-latin-500-normal.woff2", "normal", "500"],
];

let loaded = false;
export function loadFonts() {
  if (loaded || typeof document === "undefined") return;
  loaded = true;
  const handle = delayRender("fonts");
  Promise.all(faces.map(([family, file, style, weight, stretch]) => {
    const f = new FontFace(family, `url(${staticFile("fonts/" + file)}) format("woff2")`, { style, weight, ...(stretch ? { stretch } : {}) });
    document.fonts.add(f);
    return f.load();
  })).then(() => continueRender(handle)).catch(() => continueRender(handle));
}
