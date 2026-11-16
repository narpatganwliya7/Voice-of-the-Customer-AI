import { staticFile, continueRender, delayRender } from "remotion";

/* Écoute design system.
   Colour is the star rating: 1★ red, 2★ orange, 3★ amber, 4★ lime, 5★ green.
   Cobalt is reserved for the agent and for actions. Everything else is white and ink. */
export const C = {
  paper: "#F5F6F8",
  card: "#FFFFFF",
  ink: "#14161C",
  ink2: "#5C6371",
  ink3: "#9AA0AC",
  line: "#E4E7ED",
  cobalt: "#2F4DF5",
  cobaltSoft: "#E8ECFF",
  r1: "#EE4136",
  r2: "#F5862F",
  r3: "#F2B92A",
  r4: "#8FC43A",
  r5: "#19A866",
};
export const RATING = [C.r1, C.r1, C.r2, C.r3, C.r4, C.r5];
export const F = {
  display: "'Bricolage Grotesque', 'Arial Black', sans-serif",
  body: "'Geist', 'Helvetica Neue', Arial, sans-serif",
};

const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const toHex = (rgb) => "#" + rgb.map((v) => Math.round(v).toString(16).padStart(2, "0")).join("");
export const mix = (a, b, t) => toHex(hex(a).map((v, i) => v + (hex(b)[i] - v) * Math.max(0, Math.min(1, t))));
/** mood 0 = 1★ red, 0.5 = 3★ amber, 1 = 5★ green */
export const moodColor = (m) => (m < 0.5 ? mix(C.r1, C.r3, m / 0.5) : mix(C.r3, C.r5, (m - 0.5) / 0.5));

const faces = [
  ["Bricolage Grotesque", "bricolage-grotesque-latin-standard-normal.woff2", { weight: "200 800", stretch: "75% 100%" }],
  ["Bricolage Grotesque", "bricolage-grotesque-latin-ext-standard-normal.woff2", { weight: "200 800", stretch: "75% 100%" }],
  ["Geist", "geist-latin-wght-normal.woff2", { weight: "100 900" }],
  ["Geist", "geist-latin-ext-wght-normal.woff2", { weight: "100 900" }],
];

let loaded = false;
export function loadFonts() {
  if (loaded || typeof document === "undefined") return;
  loaded = true;
  const handle = delayRender("fonts");
  Promise.all(faces.map(([family, file, desc]) => {
    const f = new FontFace(family, `url(${staticFile("fonts/" + file)}) format("woff2")`, desc);
    document.fonts.add(f);
    return f.load();
  })).then(() => continueRender(handle)).catch(() => continueRender(handle));
}
