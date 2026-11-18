/* Écoute website. Reads data/bundle.json (built by `python -m ecoute site`). */
"use strict";
const $ = (id) => document.getElementById(id);
const fmt = {
  pct: (v, d = 0) => (v == null ? "–" : (100 * v).toFixed(d) + "%"),
  n: (v) => (v == null ? "–" : Number(v).toLocaleString("en-GB")),
  s: (v, d = 2) => (v == null ? "–" : Number(v).toFixed(d)),
};
const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const COLOR = { r1: "#EE4136", r2: "#F5862F", r3: "#F2B92A", r4: "#8FC43A", r5: "#19A866", ink: "#14161C", ink2: "#5C6371", ink3: "#9AA0AC", line: "#E4E7ED", cobalt: "#2F4DF5" };
const RATING = [COLOR.r1, COLOR.r1, COLOR.r2, COLOR.r3, COLOR.r4, COLOR.r5];
const STAR = "M12 2.6l2.82 5.92 6.5.83-4.77 4.5 1.21 6.45L12 17.17 6.24 20.3l1.21-6.45-4.77-4.5 6.5-.83z";
const starSvg = (c) => `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="${STAR}" fill="${c}" stroke="${c}" stroke-width="1.6" stroke-linejoin="round"/></svg>`;
const stars = (r) => `<span class="st" role="img" aria-label="${r} out of 5 stars">${[0, 1, 2, 3, 4].map((i) => starSvg(i < r ? RATING[r] : "#DCDFE6")).join("")}</span>`;
const SECTOR = { banking: "Banking", insurance: "Insurance", telecom: "Telecom", retail: "Retail", mobility: "Mobility", delivery: "Delivery", energy: "Energy", health: "Health" };
const TEAM_IMG = (team) => {
  const t = (team || "").toLowerCase();
  if (/qa|test|quality/.test(t)) return "img/team-qa.webp";
  if (/support|service|care|cx/.test(t)) return "img/team-support.webp";
  if (/ops|operation|logist|deliver/.test(t)) return "img/team-ops.webp";
  return "img/team-mobile.webp";
};
let B, ASP, current;

fetch("data/bundle.json").then((r) => r.json()).then((b) => { B = b; ASP = b.overview.aspects || {}; init(); }).catch((e) => {
  $("liveStrip").innerHTML = `<span>Could not load the data (${esc(e.message)}). Reload the page to try again.</span>`;
});

const label = (k) => (ASP[k] ? ASP[k].en : k);

function init() {
  liveStrip(); hero(); why(); pipeline(); explorer(); heatmap(); switching(); radar(); agent(); method(); tabs();
  $("built").textContent = "Data built on " + new Date(B.built_at).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" });
}

const weakTopics = (c) => Object.entries(c.aspects || {}).filter(([, v]) => v.f1 != null).sort((a, b) => a[1].f1 - b[1].f1).slice(0, 3)
  .map(([k, v]) => `${esc(label(k))} (F1 ${fmt.s(v.f1)})`).join(", ");

/* ---------- status strip: honest about liveness ---------- */
function liveStrip() {
  const runs = B.runs || [];
  const last = runs[runs.length - 1];
  const inc = runs.filter((r) => r.mode === "incremental" && r.capture_lag_min);
  const lastInc = inc[inc.length - 1];
  const ageH = last ? (Date.now() - new Date(last.finished)) / 36e5 : Infinity;
  const live = ageH < 1;
  const parts = [`<span><span class="dot ${live ? "on" : ""}"></span>${live ? "Live: new reviews are collected every few minutes" : "Showcase mode: live collection is paused"}</span>`];
  if (last) parts.push(`<span class="wide">Last collection ${new Date(last.finished).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" })} UTC, ${fmt.n(last.total_reviews)} reviews stored</span>`);
  if (lastInc) parts.push(`<span>Measured capture delay in the last live run: ${lastInc.capture_lag_min.median} min (median)</span>`);
  if (!live && B.overview.last_review) parts.push(`<span>Snapshot: reviews up to ${new Date(B.overview.last_review).toLocaleDateString("en-GB", { dateStyle: "medium" })}</span>`);
  $("liveStrip").innerHTML = parts.join("");
}

/* ---------- the star ledger: five stars filled to the rating, then the stars each problem costs ---------- */
const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
const ALPHA = [1, 0.78, 0.6, 0.47, 0.37, 0.29, 0.23, 0.18, 0.15];
const red = (a) => `rgba(238,65,54,${a})`;
const hatchCss = (k) => `repeating-linear-gradient(45deg, ${red(ALPHA[k] ?? 0.15)} 0 3px, ${red((ALPHA[k] ?? 0.15) * 0.3)} 3px 7px)`;
const starIcon = (c) => `<svg class="star-i" viewBox="0 0 24 24" aria-hidden="true"><path d="${STAR}" fill="${c}"/></svg>`;
const ratingColor = (r) => RATING[Math.min(5, Math.max(1, Math.round(r || 1)))];
let meterSeq = 0;

function ledgerParts(b, limit = 8) {
  const shown = (b.drivers || []).slice(0, limit);
  const sum = d3.sum(shown, (d) => d.stars_lost);
  const other = Math.max(0, (b.potential || sum) - sum);
  return { shown, other, total: Math.min(5, (b.avg_rating || 0) + sum + other) };
}

function starMeter(b, limit) {
  const id = "m" + ++meterSeq, S = 100, g = 16, W = 5 * S + 4 * g, H = S + 26;
  const x = (v) => { v = Math.max(0, Math.min(5, v)); const i = Math.min(4, Math.floor(v)); return i * (S + g) + Math.min(1, v - i) * S; };
  const { shown, other } = ledgerParts(b, limit);
  const segs = []; let cum = b.avg_rating || 0;
  shown.forEach((d, k) => { segs.push({ from: cum, to: cum + d.stars_lost, k, tip: `${d.label}: −${fmt.s(d.stars_lost, 2)}★` }); cum += d.stars_lost; });
  if (other >= 0.005) segs.push({ from: cum, to: cum + other, k: shown.length, tip: `Other problems: −${fmt.s(other, 2)}★` });
  const starPaths = [0, 1, 2, 3, 4].map((i) => `<path d="${STAR}" transform="translate(${i * (S + g) - 0.5}, -2) scale(${(S + 1) / 24})"/>`).join("");
  const pats = segs.map((sg) => `<pattern id="${id}p${sg.k}" width="9" height="9" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
      <rect width="9" height="9" fill="${red((ALPHA[sg.k] ?? 0.15) * 0.3)}"/><rect width="3.6" height="9" fill="${red(ALPHA[sg.k] ?? 0.15)}"/></pattern>`).join("");
  // a segment that crosses a gap between stars is drawn as one rect from x(from) to x(to); the clip hides the gap
  const rect = (a, z, fill, tip) => `<rect class="seg" data-x="${x(a)}" data-w="${Math.max(0, x(z) - x(a))}" x="${x(a)}" y="0" width="${reduce ? Math.max(0, x(z) - x(a)) : 0}" height="${S}" fill="${fill}"><title>${esc(tip)}</title></rect>`;
  return `<svg class="meter" viewBox="0 -4 ${W} ${H}" role="img" aria-label="${esc(b.name)}: ${fmt.s(b.avg_rating, 2)} stars in recent written reviews, ${fmt.s(b.potential, 2)} stars at stake">
    <defs><clipPath id="${id}c">${starPaths}</clipPath>${pats}</defs>
    <g clip-path="url(#${id}c)">
      <rect x="0" y="0" width="${W}" height="${S}" fill="#E4E7ED"/>
      ${rect(0, b.avg_rating || 0, ratingColor(b.avg_rating), `Average: ${fmt.s(b.avg_rating, 2)}★`)}
      ${segs.map((sg) => rect(sg.from, sg.to, `url(#${id}p${sg.k})`, sg.tip)).join("")}
    </g>
    ${[1, 2, 3, 4, 5].map((n) => `<text x="${(n - 1) * (S + g) + S / 2}" y="${S + 22}" text-anchor="middle" font-size="15" fill="${COLOR.ink3}" font-family="Geist, sans-serif">${n}</text>`).join("")}
  </svg>`;
}
function animateMeter(root) {
  if (reduce) return;
  const segs = [...root.querySelectorAll("rect.seg")];
  segs.forEach((r, i) => d3.select(r).attr("width", 0).transition().delay(i === 0 ? 80 : 520 + i * 110).duration(i === 0 ? 900 : 420)
    .ease(d3.easeCubicOut).attr("width", +r.dataset.w));
}
function ledgerTable(b, limit, selectable) {
  const { shown, other, total } = ledgerParts(b, limit);
  const rows = [`<tr class="bal"><td class="sw"><i style="background:${ratingColor(b.avg_rating)}"></i></td><td class="lbl">Average rating, recent written reviews</td><td class="v">${fmt.s(b.avg_rating, 2)}${starIcon(ratingColor(b.avg_rating))}</td></tr>`];
  shown.forEach((d, k) => rows.push(`<tr class="${selectable ? "line" : ""}" ${selectable ? `data-i="${k}" tabindex="0" aria-selected="${k === 0}"` : ""}><td class="sw"><i style="background:${hatchCss(k)}"></i></td>
    <td class="lbl">${esc(d.label)}<small>${fmt.pct(d.prevalence, 0)} of reviews</small></td><td class="v debit">−${fmt.s(d.stars_lost, 2)}</td></tr>`));
  if (other >= 0.005) rows.push(`<tr><td class="sw"><i style="background:${hatchCss(shown.length)}"></i></td><td class="lbl">Other problems</td><td class="v debit">−${fmt.s(other, 2)}</td></tr>`);
  rows.push(`<tr class="total"><td></td><td class="lbl">If these problems stopped (estimate)</td><td class="v">${fmt.s(total, 2)}${starIcon(COLOR.r5)}</td></tr>`);
  return `<table class="ledger">${rows.join("")}</table>`;
}
function bookHtml(b, limit, selectable) {
  const small = b.reviews < 150 || !b.drivers.length;
  return `<div class="bh"><h2>${esc(b.name)}</h2><span>${SECTOR[b.sector] || b.sector}, ${fmt.n(b.reviews)} written reviews, last ${B.overview.window_days} days</span></div>
    ${starMeter(b, limit)}
    ${small ? `<p class="empty">Small sample: topic estimates need at least 150 reviews in the window, so only the rating is shown.</p>` : ledgerTable(b, limit, selectable)}
    ${b.store_rating ? `<p class="foot">Google Play store rating: ${fmt.s(b.store_rating, 1)}★. It counts every star rating, including the many left without a review, so it often reads higher than written reviews.</p>` : ""}`;
}

/* ---------- hero ---------- */
const reviewCard = (r, brand = true) => `<article class="rv"><header>${brand ? `<b>${esc(r.b)}</b>` : ""}${stars(r.r)}<span>${esc(r.src)}</span></header><p lang="fr">${esc(r.t)}</p></article>`;
function hero() {
  const o = B.overview, clf = o.classifier || {};
  $("lede").textContent = `Écoute reads what customers of ${o.brands} French brands write on Google Play and the App Store, works out how many stars each problem costs, and sends an AI agent to investigate when something breaks.`;
  $("facts").innerHTML = [
    [fmt.n(o.reviews), "real reviews"], [o.brands, "brands"], [Object.keys(ASP).length, "problem types"],
    [clf.heldout ? fmt.s(clf.heldout.aspect_micro_f1) : "–", "topic F1 on unseen reviews"],
  ].map(([b, s]) => `<span><b>${b}</b> ${s}</span>`).join("");
  const picks = ["Deliveroo", "BNP Paribas", "E.Leclerc", "SNCF Connect"].map((n) => B.brands.find((b) => b.name === n)).filter(Boolean);
  const show = (b) => {
    $("heroBook").innerHTML = `<div class="picks" role="group" aria-label="Brand">${picks.map((p) => `<button type="button" class="pill" data-id="${p.id}" aria-pressed="${p.id === b.id}">${esc(p.name)}</button>`).join("")}</div>${bookHtml(b, 3, false)}`;
    animateMeter($("heroBook"));
  };
  $("heroBook").addEventListener("click", (e) => { const id = e.target.closest("button")?.dataset.id; if (id) show(B.brands.find((b) => b.id === id)); });
  if (picks.length) show(picks[0]);
  const t = (B.ticker || []).filter((r) => r.t && r.t.length < 140);
  $("stream").innerHTML = `<div class="lane">${t.slice(0, 24).map((r) => reviewCard(r)).join("")}</div>`;
}

/* ---------- why it's different: the same complaints, counted and priced ---------- */
function why() {
  const eligible = B.brands.filter((b) => b.drivers.length >= 3 && b.reviews >= 150);
  const top = (b, key) => [...b.drivers].sort((x, y) => y[key] - x[key])[0];
  const differ = eligible.filter((b) => top(b, "prevalence").aspect !== top(b, "stars_lost").aspect)
    .sort((x, y) => (top(y, "stars_lost").stars_lost - top(y, "prevalence").stars_lost) - (top(x, "stars_lost").stars_lost - top(x, "prevalence").stars_lost));
  $("whyIntro").innerHTML = `Ranking problems by how often they come up is the usual starting point. Écoute also measures what each one does to the rating, and the two answers are not always the same: for <b>${differ.length} of the ${eligible.length} brands</b> with enough reviews, they disagree on the biggest problem.`;
  if (!differ.length) return;
  const draw = (b) => {
    const c = top(b, "prevalence"), p = top(b, "stars_lost");
    const list = (key, unit) => {
      const rows = [...b.drivers].sort((x, y) => y[key] - x[key]).slice(0, 5);
      const max = rows[0][key] || 1;
      return rows.map((d, i) => `<div class="r ${d.aspect === c.aspect || d.aspect === p.aspect ? "hl" : ""}"><span class="n">${i + 1}</span><span>${esc(d.label)}</span>
        <span class="tr"><span style="width:${(100 * d[key]) / max}%;background:${d.aspect === p.aspect ? COLOR.r1 : d.aspect === c.aspect ? COLOR.ink : "#C9CED8"}"></span></span>
        <span class="val">${unit === "pct" ? fmt.pct(d[key], 1) : "−" + fmt.s(d[key], 2) + "★"}</span></div>`).join("");
    };
    $("byCount").innerHTML = list("prevalence", "pct");
    $("byStars").innerHTML = list("stars_lost", "stars");
    $("verdict").innerHTML = `Counted, the biggest problem at ${esc(b.name)} is <strong>${esc(c.label.toLowerCase())}</strong> (${fmt.pct(c.prevalence, 1)} of reviews). Priced, it is <b>${esc(p.label.toLowerCase())}</b>: ${fmt.s(p.stars_lost, 2)}★ against ${fmt.s(c.stars_lost, 2)}★, from ${p.prevalence < c.prevalence ? "fewer" : "about as many"} mentions (${fmt.pct(p.prevalence, 1)}).`;
    for (const btn of $("whyPicks").children) btn.setAttribute("aria-pressed", String(btn.dataset.id === b.id));
  };
  $("whyPicks").innerHTML = differ.map((b) => `<button type="button" class="pill" data-id="${b.id}">${esc(b.name)}</button>`).join("");
  $("whyPicks").addEventListener("click", (e) => { const id = e.target.closest("button")?.dataset.id; if (id) draw(B.brands.find((b) => b.id === id)); });
  draw(differ[0]);
}

/* ---------- how it works ---------- */
function pipeline() {
  const o = B.overview, clf = o.classifier || {};
  const steps = [
    ["Capture", "Official apps verified on Google Play and the App Store; only new reviews are pulled. Names, avatars, emails and phone numbers are never kept.", `${fmt.n(o.reviews)} reviews, ${o.brands} brands`],
    ["Understand", "A free AI model labels a sample; a local classifier learns from it and scores every review: 15 topics, tone, intent to leave, severity.", clf.heldout ? `Topic F1 ${fmt.s(clf.heldout.aspect_micro_f1)} on unseen reviews` : "Local classifier"],
    ["Explain", "SQL models: stars lost per topic, release radar, complaint spikes, switching map, weekly trends.", `${(B.spikes || []).length} spikes, ${B.brands.reduce((a, b) => a + b.releases.length, 0)} releases tracked`],
    ["Act", "The AI agent investigates what the numbers flag and files a brief with owners, actions and checked evidence.", `${(B.agent || []).filter((a) => a.brief).length} briefs filed`],
  ];
  $("pipe").innerHTML = steps.map(([h, p, f]) => `<div><h4>${h}</h4><p>${p}</p><span class="fig">${f}</span></div>`).join("");
}

/* ---------- explorer ---------- */
function explorer() {
  const order = ["banking", "insurance", "telecom", "retail", "mobility", "delivery", "energy", "health"];
  const sectors = [...new Set(B.brands.map((b) => b.sector))].sort((a, b) => order.indexOf(a) - order.indexOf(b));
  const byPotential = (list) => [...list].sort((a, b) => (b.potential || 0) - (a.potential || 0));
  let sector = "all";

  const drawChips = () => {
    $("sectors").innerHTML = [["all", "All sectors"], ...sectors.map((s) => [s, SECTOR[s] || s])]
      .map(([k, v]) => `<button type="button" class="pill" data-k="${k}" aria-pressed="${k === sector}">${v}</button>`).join("");
    const list = B.brands.filter((b) => sector === "all" || b.sector === sector);
    $("chips").innerHTML = list.map((b) => `<button type="button" class="pill" data-id="${b.id}" aria-pressed="${current && b.id === current.id}">${esc(b.name)}</button>`).join("");
    sectorLine(false);
  };
  const sectorLine = (opened) => {
    if (sector === "all") { $("sectorLine").textContent = ""; return; }
    const list = B.brands.filter((b) => b.sector === sector);
    const reviews = d3.sum(list, (b) => b.reviews);
    const avg = d3.sum(list, (b) => (b.avg_rating || 0) * b.reviews) / (reviews || 1);
    $("sectorLine").textContent = `${SECTOR[sector]}: ${list.length} brands, ${fmt.n(reviews)} reviews in the last ${B.overview.window_days} days, average ${fmt.s(avg, 2)}★.` +
      (opened ? ` Opened ${current.name}, the brand with the most stars to win.` : "");
  };
  // choosing a sector opens that sector's brand with the most stars to win, so the figures always follow the choice
  $("sectors").addEventListener("click", (e) => {
    const k = e.target.closest("button")?.dataset.k;
    if (!k) return;
    sector = k;
    const switched = k !== "all" && current.sector !== k;
    if (switched) current = byPotential(B.brands.filter((b) => b.sector === k))[0];
    drawChips();
    select(current.id);
    sectorLine(switched);
  });
  $("chips").addEventListener("click", (e) => { const id = e.target.closest("button")?.dataset.id; if (id) select(id); });
  current = byPotential(B.brands)[0];
  drawChips(); select(current.id);
  window.selectBrand = (id) => {
    current = B.brands.find((b) => b.id === id);
    sector = current.sector; drawChips(); select(id);
    $("ledger").scrollIntoView({ behavior: reduce ? "auto" : "smooth" });
  };

  function select(id) {
    current = B.brands.find((b) => b.id === id);
    for (const btn of $("chips").children) btn.setAttribute("aria-pressed", String(btn.dataset.id === id));
    const b = current;
    $("exBook").innerHTML = bookHtml(b, 8, true);
    animateMeter($("exBook"));
    $("exRating").innerHTML = `${fmt.s(b.avg_rating, 2)}${starIcon(ratingColor(b.avg_rating))} <small>average, last ${B.overview.window_days} days</small>`;
    $("exWindow").textContent = `${fmt.n(b.reviews)} written reviews in the window${b.store_rating ? `; Google Play store rating ${fmt.s(b.store_rating, 1)}★` : ""}`
      + (b.reviews < 150 ? ". Small sample: shares are indicative" : "");
    $("exKv").innerHTML = [
      ["Negative reviews", fmt.pct(b.negative_share)], ["Say they are leaving", fmt.pct(b.leaving_share, 1)],
      ["Critical (money, access, fraud)", fmt.pct(b.critical_share, 1)], ["Problem after an app update", fmt.pct(b.after_update_share, 1)],
      ["Reviews answered by the brand", fmt.pct(b.reply_rate)],
    ].map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join("");
    spark(b.weekly);
    $("wiTopic").innerHTML = b.drivers.map((d, i) => `<option value="${i}">${esc(d.label)}</option>`).join("");
    whatIf();
    const q = b.quotes || [];
    $("exQuotes").innerHTML = q.length ? q.map((x) => `<article class="q">
      <span class="m"><b><i class="k" style="background:${x.kind === "pain" ? COLOR.r1 : COLOR.r5}"></i>${x.kind === "pain" ? "Pain" : "Praise"}: ${esc(label(x.aspect))}</b>${stars(x.rating)}</span>
      <p class="t" lang="fr">“${esc(x.text)}”</p>
      <span class="m"><span>${esc(x.source === "google_play" ? "Google Play" : "App Store")}</span><span>${esc(String(x.day).slice(0, 10))}</span></span></article>`).join("") : `<p class="empty">No quotes yet.</p>`;
    const rel = b.releases || [];
    $("exReleases").innerHTML = rel.length ? `<thead><tr><th>Version</th><th>First seen</th><th>Reviews</th><th>Average ★</th><th>Negative</th><th>vs previous</th></tr></thead><tbody>${rel.slice().reverse().map((r) => {
      const c = r.negative_change; const cls = c == null ? "" : c > 0.03 ? "bad" : c < -0.03 ? "good" : "";
      return `<tr><td>${esc(r.app_version)}</td><td>${esc(String(r.first_seen).slice(0, 10))}</td><td>${fmt.n(r.reviews)}</td><td>${fmt.s(r.avg_rating, 2)}</td><td>${fmt.pct(r.negative_share)}</td><td class="${cls}">${c == null ? "–" : (c > 0 ? "+" : "") + (100 * c).toFixed(0) + " pts"}</td></tr>`;
    }).join("")}</tbody>` : `<tr><td class="empty">Version data comes from Google Play reviews only.</td></tr>`;
    const sw = b.switching || [];
    const mx = d3.max(sw, (d) => d.mentions) || 1;
    $("exSwitch").innerHTML = sw.length ? `<div class="bars">${sw.map((s) => `<div class="bar" style="grid-template-columns:112px minmax(0,1fr) 34px"><span>${esc(s.to_company)}</span><span class="track"><span class="fill" style="width:${(100 * s.mentions) / mx}%;background:${COLOR.cobalt}"></span></span><span class="val">${s.mentions}</span></div>`).join("")}</div>` : `<p class="empty">No competitor is named often enough yet.</p>`;
  }
}

function whatIf() {
  const b = current; const d = b.drivers[+$("wiTopic").value || 0]; const pct = +$("wiPct").value;
  $("wiPctLabel").textContent = pct + "%";
  if (!d) { $("wiOut").textContent = "–"; return; }
  const lift = d.stars_lost * pct / 100;
  $("wiOut").innerHTML = `${fmt.s(b.avg_rating, 2)}★ → <span class="up">${fmt.s(b.avg_rating + lift, 2)}★</span> <small class="muted" style="font:500 16px var(--body)">+${fmt.s(lift, 2)}</small>`;
}
$("wiTopic").addEventListener("change", () => { markLine(+$("wiTopic").value); whatIf(); });
const markLine = (i) => { for (const tr of document.querySelectorAll("#exBook tr.line")) tr.setAttribute("aria-selected", String(+tr.dataset.i === i)); };
const pickLine = (e) => { const tr = e.target.closest("tr.line"); if (!tr) return; $("wiTopic").value = tr.dataset.i; markLine(+tr.dataset.i); whatIf(); };
$("exBook").addEventListener("click", pickLine);
$("exBook").addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); pickLine(e); } });
$("wiPct").addEventListener("input", whatIf);

function spark(weekly) {
  const svg = d3.select("#spark"); svg.selectAll("*").remove();
  const w = svg.node().clientWidth || 270, h = 96, p = 8;
  svg.attr("viewBox", `0 0 ${w} ${h}`);
  const data = weekly.filter((d) => d.n >= 5);
  if (data.length < 3) return;
  const x = d3.scaleLinear().domain([0, data.length - 1]).range([p, w - p]);
  const y = d3.scaleLinear().domain([d3.min(data, (d) => d.r) - 0.2, d3.max(data, (d) => d.r) + 0.2]).range([h - p, p + 14]);
  const grad = svg.append("defs").append("linearGradient").attr("id", "sg").attr("x1", 0).attr("x2", 0).attr("y1", 0).attr("y2", 1);
  grad.append("stop").attr("offset", 0).attr("stop-color", COLOR.cobalt).attr("stop-opacity", 0.18);
  grad.append("stop").attr("offset", 1).attr("stop-color", COLOR.cobalt).attr("stop-opacity", 0);
  svg.append("path").datum(data).attr("d", d3.area().x((d, i) => x(i)).y0(h).y1((d) => y(d.r)).curve(d3.curveMonotoneX)).attr("fill", "url(#sg)");
  svg.append("path").datum(data).attr("d", d3.line().x((d, i) => x(i)).y((d) => y(d.r)).curve(d3.curveMonotoneX)).attr("fill", "none").attr("stroke", COLOR.cobalt).attr("stroke-width", 2.5);
  const last = data[data.length - 1];
  svg.append("circle").attr("cx", x(data.length - 1)).attr("cy", y(last.r)).attr("r", 4.5).attr("fill", "#fff").attr("stroke", COLOR.cobalt).attr("stroke-width", 2.5);
  svg.append("text").attr("x", p).attr("y", 12).attr("fill", COLOR.ink3).attr("font-size", 12).text(`Weekly average, last ${data.length} weeks`);
}

/* ---------- heatmap ---------- */
function heatmap() {
  const keys = Object.keys(ASP);
  const cell = new Map(B.heatmap.map((d) => [d.brand + "|" + d.aspect, d.negative_share]));
  const max = d3.quantile(B.heatmap.map((d) => d.negative_share).sort(d3.ascending), 0.98) || 0.2;
  const color = d3.scaleLinear().domain([0, max * 0.33, max * 0.66, max]).range(["#F3F4F7", COLOR.r3, COLOR.r2, COLOR.r1]).clamp(true);
  const bySector = d3.groups(B.brands, (b) => b.sector);
  let html = `<thead><tr><th></th>${keys.map((k) => `<th class="col">${esc(label(k))}</th>`).join("")}</tr></thead><tbody>`;
  for (const [s, list] of bySector) {
    html += `<tr class="sector"><td class="rowh" colspan="${keys.length + 1}">${SECTOR[s] || s}</td></tr>`;
    for (const b of list) {
      html += `<tr><td class="rowh" tabindex="0" role="button" onclick="selectBrand('${b.id}')" onkeydown="if(event.key==='Enter')selectBrand('${b.id}')">${esc(b.name)}</td>${keys.map((k) => {
        const v = cell.get(b.name + "|" + k) || 0;
        return `<td class="${v > max * 0.55 ? "hot" : ""}" style="background:${color(v)}" data-tip="${esc(b.name)}, ${esc(label(k))}: ${fmt.pct(v, 1)} of reviews complain">${v >= 0.005 ? Math.round(v * 100) : ""}</td>`;
      }).join("")}</tr>`;
    }
  }
  $("hm").innerHTML = html + "</tbody>";
  $("hmMax").textContent = fmt.pct(max) + "+";
  tooltips($("hm"));
}

function tooltips(root) {
  const tip = $("tip");
  root.addEventListener("mousemove", (e) => { const t = e.target.closest("[data-tip]"); if (!t) { tip.hidden = true; return; } tip.hidden = false; tip.textContent = t.dataset.tip; tip.style.left = Math.min(e.clientX + 14, innerWidth - 300) + "px"; tip.style.top = e.clientY + 14 + "px"; });
  root.addEventListener("mouseleave", () => (tip.hidden = true));
}

/* ---------- switching sankey ---------- */
function switching() {
  const sectorOf = new Map(B.brands.map((b) => [b.name, b.sector]));
  const sectors = [...new Set(B.switching.map((s) => sectorOf.get(s.from_brand)).filter(Boolean))];
  let sector = sectors.includes("telecom") ? "telecom" : sectors[0];
  const draw = () => {
    $("swSectors").innerHTML = sectors.map((s) => `<button type="button" class="pill" data-k="${s}" aria-pressed="${s === sector}">${SECTOR[s] || s}</button>`).join("");
    const flows = B.switching.filter((s) => sectorOf.get(s.from_brand) === sector).slice(0, 24);
    const svg = d3.select("#sankey"); svg.selectAll("*").remove();
    const W = svg.node().clientWidth || 1000, H = 520;
    svg.attr("viewBox", `0 0 ${W} ${H}`);
    if (!flows.length || !d3.sankey) { svg.append("text").attr("x", 20).attr("y", 40).attr("fill", COLOR.ink2).text("Not enough competitor mentions in this sector yet."); return; }
    const names = [...new Set(flows.flatMap((f) => ["from:" + f.from_brand, "to:" + f.to_company]))];
    const graph = d3.sankey().nodeId((d) => d.id).nodeWidth(14).nodePadding(16).extent([[160, 10], [W - 180, H - 10]])({
      nodes: names.map((id) => ({ id })), links: flows.map((f) => ({ source: "from:" + f.from_brand, target: "to:" + f.to_company, value: f.mentions, f })),
    });
    svg.append("g").selectAll("path").data(graph.links).join("path").attr("d", d3.sankeyLinkHorizontal()).attr("fill", "none")
      .attr("stroke", (d) => (d.f.leaving_mentions > 0 ? COLOR.r1 : COLOR.r3)).attr("stroke-opacity", 0.38).attr("stroke-width", (d) => Math.max(2, d.width))
      .append("title").text((d) => `${d.f.from_brand} to ${d.f.to_company}: ${d.f.mentions} mentions, ${d.f.leaving_mentions} say they are leaving`);
    const n = svg.append("g").selectAll("g").data(graph.nodes).join("g");
    n.append("rect").attr("x", (d) => d.x0).attr("y", (d) => d.y0).attr("width", (d) => d.x1 - d.x0).attr("height", (d) => Math.max(3, d.y1 - d.y0))
      .attr("fill", (d) => (d.id.startsWith("from:") ? COLOR.ink : COLOR.cobalt)).attr("rx", 4);
    n.append("text").attr("x", (d) => (d.id.startsWith("from:") ? d.x0 - 10 : d.x1 + 10)).attr("y", (d) => (d.y0 + d.y1) / 2).attr("dy", "0.35em")
      .attr("text-anchor", (d) => (d.id.startsWith("from:") ? "end" : "start")).attr("fill", COLOR.ink).attr("font-size", 14).attr("font-weight", 500)
      .text((d) => `${d.id.split(":")[1]} (${d.value})`);
  };
  window.drawSankey = draw;
  $("swSectors").addEventListener("click", (e) => { const k = e.target.closest("button")?.dataset.k; if (k) { sector = k; draw(); } });
  draw();
  addEventListener("resize", () => { clearTimeout(window._sw); window._sw = setTimeout(draw, 200); });
}

/* ---------- radar ---------- */
function radar() {
  const items = [];
  for (const b of B.brands) for (const r of b.releases) if (r.negative_change != null && Math.abs(r.negative_change) >= 0.06 && r.reviews >= 40)
    items.push({ kind: r.negative_change > 0 ? "bad" : "good", id: b.id, title: `${b.name} ${r.app_version}`, line: `${r.negative_change > 0 ? "+" : ""}${(100 * r.negative_change).toFixed(0)} pts of negative reviews vs version ${r.previous_version}, ${fmt.n(r.reviews)} reviews`, date: String(r.first_seen).slice(0, 10), m: "New version" });
  for (const s of B.spikes || []) items.push({ kind: "bad", id: (B.brands.find((b) => b.name === s.brand) || {}).id, title: `${s.brand}: ${s.negative} complaints in one day`, line: `Usually ${fmt.s(s.baseline, 0)} a day, ${fmt.s(s.z, 1)} standard deviations above normal`, date: String(s.day).slice(0, 10), m: "Spike" });
  items.sort((a, b) => d3.descending(a.date, b.date));
  $("radarList").innerHTML = items.slice(0, 12).map((i) => `<div class="alert ${i.kind === "good" ? "good" : ""}"><span class="m"><i></i>${i.m}, ${esc(i.date)}</span><b>${esc(i.title)}</b><span class="l">${esc(i.line)}</span>${i.id ? `<a href="#ledger" onclick="selectBrand('${i.id}');return false">Open its ledger</a>` : ""}</div>`).join("") || `<p class="empty">No alerts in the current data.</p>`;
}

/* ---------- agent console ---------- */
function agent() {
  const runs = (B.agent || []).filter((a) => a.steps && a.steps.length);
  if (!runs.length) { $("term").innerHTML = `<p class="empty">The analyst has not run on this data yet.</p>`; $("brief").innerHTML = ""; return; }
  $("cases").innerHTML = runs.map((r, i) => `<button type="button" class="pill" data-i="${i}" aria-pressed="${i === 0}">${esc(r.case.brand)}: ${esc(r.case.type.replace(/_/g, " "))}</button>`).join("");
  $("cases").addEventListener("click", (e) => { const i = e.target.closest("button")?.dataset.i; if (i != null) { for (const b of $("cases").children) b.setAttribute("aria-pressed", String(b.dataset.i === i)); play(runs[+i]); } });
  let timer;
  const io = new IntersectionObserver((es) => { if (es[0].isIntersecting) { play(runs[0]); io.disconnect(); } }, { threshold: 0.3 });
  io.observe($("term"));
  render(runs[0]);

  function play(run) {
    clearInterval(timer); render(run);
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const steps = [...$("term").querySelectorAll(".s")]; steps.forEach((s) => (s.hidden = true));
    let i = 0;
    timer = setInterval(() => { if (i >= steps.length) return clearInterval(timer); steps[i].hidden = false; $("term").scrollTop = $("term").scrollHeight; i++; }, 380);
  }
  function render(run) {
    $("term").innerHTML = `<div class="head"><i></i>Écoute agent, ${esc(run.case.brand)}</div>` + run.steps.map((s) => {
      if (s.type === "note") return `<p class="s th">${esc(s.text)}</p>`;
      const args = s.tool === "run_sql" ? s.args.query : Object.entries(s.args || {}).map(([k, v]) => `${k}: ${v}`).join(", ");
      return `<p class="s">${s.thought ? `<span class="th">${esc(s.thought)}</span>\n` : ""}<span class="tool">${esc(s.tool)}</span> <span class="arg">${esc(String(args).slice(0, 600))}</span>\n<span class="res">${esc(String(s.result_preview).slice(0, 300))}</span></p>`;
    }).join("");
    const b = run.brief;
    if (!b) { $("brief").innerHTML = `<p class="empty">This investigation did not finish (free quota or step limit reached).</p>`; return; }
    $("brief").innerHTML = `<div class="file"><span>Brief filed by the agent, ${esc(String(run.finished || "").slice(0, 10))}</span><span class="conf">Confidence: ${esc(b.confidence)}</span></div><h4>${esc(b.headline)}</h4>
      <dl><div><dt>What happened</dt><dd>${esc(b.what_happened)}</dd></div><div><dt>Likely root cause</dt><dd>${esc(b.root_cause)}</dd></div><div><dt>Impact</dt><dd>${esc(b.impact)}</dd></div></dl>
      <h3>Recommended actions</h3>${(b.actions || []).map((a) => `<div class="act"><img src="${TEAM_IMG(a.team)}" alt="" width="46" height="46"><div><b>${esc(a.action)}</b><small>${esc(a.team)}${a.expected_effect ? `: ${esc(a.expected_effect)} (agent's estimate)` : ""}</small></div></div>`).join("")}
      <h3 style="margin-top:18px">Evidence ${run.evidence_verified ? `<span class="ok">every cited review was read by the agent</span>` : ""}</h3>
      <p class="note">These reviews support the finding; on their own they do not prove its cause.</p>
      ${(run.evidence || []).map((e) => `<p class="ev" lang="fr">“${esc(e.text.slice(0, 260))}”</p>`).join("") || `<p class="empty">No checked evidence.</p>`}`;
  }
}

/* ---------- method ---------- */
function method() {
  const o = B.overview, c = o.classifier;
  $("mData").innerHTML = [
    `${fmt.n(o.reviews)} public reviews from Google Play and the App Store (France), ${o.first_review} to ${o.last_review}.`,
    `Comparisons between brands use the last ${o.window_days} days (${fmt.n(o.reviews_in_window)} reviews).`,
    `Only official apps, checked by developer name. Usernames, avatars and platform ids are never stored; emails, phone numbers and account numbers are masked.`,
    `${fmt.n((o.label_sources || {}).llm)} reviews labelled by a free AI model; every other review is scored by a local classifier trained on them.`,
  ].map((x) => `<li>${esc(x)}</li>`).join("");
  if (!c) { $("mModel").innerHTML = `<p class="empty">The model report appears after the first training run.</p>`; return; }
  const h = c.heldout || {};
  $("mModel").innerHTML = `<table><thead><tr><th>Check</th><th>Cross-val.</th><th>Unseen</th></tr></thead><tbody>
    <tr><td>Topic detection, micro F1</td><td>${fmt.s(c.aspect_micro_f1)}</td><td>${fmt.s(h.aspect_micro_f1)}</td></tr>
    <tr><td>Topic detection, macro F1</td><td>${fmt.s(c.aspect_macro_f1)}</td><td>${fmt.s(h.aspect_macro_f1)}</td></tr>
    <tr><td>Overall tone, accuracy</td><td>${fmt.s((c.sentiment || {}).accuracy)}</td><td>${fmt.s(h.sentiment_accuracy)}</td></tr>
    <tr><td>Overall tone, macro F1</td><td>${fmt.s((c.sentiment || {}).macro_f1)}</td><td>${h.sentiment_macro_f1 != null ? fmt.s(h.sentiment_macro_f1) : "–"}</td></tr>
    <tr><td>Leaving the company, F1</td><td>${fmt.s((c.churn || {}).leaving_company_f1)}</td><td>–</td></tr>
    <tr><td>Topic polarity, accuracy</td><td>${fmt.s((c.aspect_polarity || {}).accuracy)}</td><td>–</td></tr>
    </tbody></table><p class="note">Trained on ${fmt.n(c.n_train)} AI-labelled reviews; ${fmt.n(c.n_heldout)} unseen reviews were never used for training or tuning. The figures measure agreement with the AI labels, not with human judgement. Accuracy flatters tone because most reviews are clearly negative or positive; macro F1 weighs the rare neutral and mixed ones equally. Weakest topics: ${weakTopics(c)}.</p>`;
}

/* ---------- market view tabs ---------- */
function tabs() {
  const ids = [["tMap", "pMap"], ["tSwitch", "pSwitch"], ["tRadar", "pRadar"]];
  const open = (t) => {
    for (const [ti, pi] of ids) { const on = ti === t; $(ti).setAttribute("aria-selected", String(on)); $(ti).setAttribute("aria-pressed", String(on)); $(pi).hidden = !on; }
    if (t === "tSwitch" && window.drawSankey) window.drawSankey();
  };
  for (const [ti] of ids) $(ti).addEventListener("click", () => open(ti));
}
