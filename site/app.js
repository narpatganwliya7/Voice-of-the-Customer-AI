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
  liveStrip(); hero(); pipeline(); explorer(); heatmap(); switching(); radar(); agent(); method();
  $("built").textContent = "Data built on " + new Date(B.built_at).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" });
}

/* ---------- status strip: honest about liveness ---------- */
function liveStrip() {
  const runs = B.runs || [];
  const last = runs[runs.length - 1];
  const inc = runs.filter((r) => r.mode === "incremental" && r.capture_lag_min);
  const lastInc = inc[inc.length - 1];
  const ageH = last ? (Date.now() - new Date(last.finished)) / 36e5 : Infinity;
  const live = ageH < 1;
  const parts = [`<span><span class="dot ${live ? "on" : ""}"></span>${live ? "Live: new reviews are collected every few minutes" : "Showcase mode: live collection is paused"}</span>`];
  if (last) parts.push(`<span>Last collection ${new Date(last.finished).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" })} UTC, ${fmt.n(last.total_reviews)} reviews stored</span>`);
  if (lastInc) parts.push(`<span>Measured capture delay in the last live run: ${lastInc.capture_lag_min.median} min (median)</span>`);
  $("liveStrip").innerHTML = parts.join("");
}

/* ---------- hero ---------- */
const reviewCard = (r, brand = true) => `<article class="rv"><header>${brand ? `<b>${esc(r.b)}</b>` : ""}${stars(r.r)}<span>${esc(r.src)}</span></header><p lang="fr">${esc(r.t)}</p></article>`;
function hero() {
  const o = B.overview, clf = o.classifier || {};
  $("lede").textContent = `Écoute is an AI agent that reads what customers of ${o.brands} French brands write on Google Play and the App Store, finds what costs each brand its stars, and tells the right team what to fix first.`;
  const facts = [
    [fmt.n(o.reviews), "real reviews"], [o.brands, "brands"], [Object.keys(ASP).length, "pain points"],
    [fmt.n((o.label_sources || {}).llm), "labelled by free AI"],
    [clf.heldout ? fmt.s(clf.heldout.aspect_micro_f1) : "–", "topic F1 on unseen reviews"],
  ];
  $("facts").innerHTML = facts.map(([b, s]) => `<div><b class="num">${b}</b>${s}</div>`).join("");

  const t = (B.ticker || []).filter((r) => r.t && r.t.length < 140);
  const neg = t.filter((r) => r.r <= 2 && r.s === "negative"), pos = t.filter((r) => r.r === 5 && r.s === "positive");
  const floats = [neg[0], pos[0], neg[1]].filter(Boolean);
  $("scene").insertAdjacentHTML("afterbegin", floats.map((r, i) => `<div class="float f${i + 1}">${reviewCard(r)}</div>`).join(""));
  $("scene").insertAdjacentHTML("beforeend", `<div class="arrow" aria-hidden="true"><span>1★ angry</span><span>5★ happy</span></div>`);
  const lane = t.slice(0, 30).map((r) => reviewCard(r)).join("");
  $("stream").innerHTML = `<div class="lane">${lane}${lane}</div>`;
}

/* ---------- how it works ---------- */
function pipeline() {
  const o = B.overview, clf = o.classifier || {};
  const steps = [
    ["Capture", "Official apps verified on Google Play and the App Store; only new reviews are pulled. Names, avatars, emails and phone numbers are never kept.", `${fmt.n(o.reviews)} reviews, ${o.brands} brands`],
    ["Understand", "A free AI model labels a sample; a local classifier learns from it and scores every review: 15 topics, tone, intent to leave, severity.", clf.heldout ? `Topic F1 ${fmt.s(clf.heldout.aspect_micro_f1)} on unseen reviews` : "Local classifier"],
    ["Explain", "SQL models: stars lost per topic, release radar, complaint spikes, switching map, weekly trends.", `${(B.spikes || []).length} spikes, ${B.brands.reduce((a, b) => a + b.releases.length, 0)} releases tracked`],
    ["Act", "The AI analyst investigates what the numbers flag and files a brief with owners, actions and checked evidence.", `${(B.agent || []).filter((a) => a.brief).length} briefs filed`],
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
      .map(([k, v]) => `<button type="button" data-k="${k}" aria-pressed="${k === sector}">${v}</button>`).join("");
    const list = B.brands.filter((b) => sector === "all" || b.sector === sector);
    $("chips").innerHTML = list.map((b) => `<button type="button" data-id="${b.id}" aria-pressed="${current && b.id === current.id}">${esc(b.name)}</button>`).join("");
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
    $("explorer").scrollIntoView({ behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
  };

  function select(id) {
    current = B.brands.find((b) => b.id === id);
    for (const btn of $("chips").children) btn.setAttribute("aria-pressed", String(btn.dataset.id === id));
    const b = current;
    $("exName").textContent = b.name;
    $("exSector").textContent = SECTOR[b.sector] || b.sector;
    $("exRating").innerHTML = `${fmt.s(b.avg_rating, 2)}<span style="color:${RATING[Math.max(1, Math.round(b.avg_rating || 1))]}">★</span> <small>average, last ${B.overview.window_days} days</small>`;
    $("exWindow").textContent = `${fmt.n(b.reviews)} reviews in the window${b.store_rating ? `; Google Play store rating ${fmt.s(b.store_rating, 1)}★` : ""}`;
    $("exKv").innerHTML = [
      ["Negative reviews", fmt.pct(b.negative_share)], ["Say they are leaving", fmt.pct(b.leaving_share, 1)],
      ["Critical (money, access, fraud)", fmt.pct(b.critical_share, 1)], ["Problem after an app update", fmt.pct(b.after_update_share, 1)],
      ["Reviews answered by the brand", fmt.pct(b.reply_rate)],
    ].map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join("");
    spark(b.weekly);
    const maxLost = d3.max(b.drivers, (d) => d.stars_lost) || 1;
    const ramp = [COLOR.r1, COLOR.r2, COLOR.r2, COLOR.r3, COLOR.r3, COLOR.r3, COLOR.r3];
    $("exBars").innerHTML = b.drivers.length ? b.drivers.slice(0, 7).map((d, i) => `
      <div class="bar"><span>${esc(d.label)}<small>${fmt.pct(d.prevalence, 1)} of reviews, −${fmt.s(d.impact, 1)}★ each</small></span>
      <span class="track"><span class="fill" style="width:${(100 * d.stars_lost) / maxLost}%;background:${ramp[i]}"></span></span>
      <span class="val" style="color:${i ? COLOR.ink2 : COLOR.r1}">−${fmt.s(d.stars_lost, 2)}★</span></div>`).join("") : `<p class="empty">Not enough recent reviews.</p>`;
    $("wiTopic").innerHTML = b.drivers.map((d, i) => `<option value="${i}">${esc(d.label)}</option>`).join("");
    whatIf();
    const q = b.quotes || [];
    $("exQuotes").innerHTML = q.length ? q.map((x) => `<article class="q"><img src="img/${x.kind === "pain" ? "pain" : "praise"}.webp" alt="" width="52" height="52">
      <span class="m"><b>${x.kind === "pain" ? "Pain" : "Praise"}: ${esc(label(x.aspect))}</b>${stars(x.rating)}</span>
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
$("wiTopic").addEventListener("change", whatIf);
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
    $("swSectors").innerHTML = sectors.map((s) => `<button type="button" data-k="${s}" aria-pressed="${s === sector}">${SECTOR[s] || s}</button>`).join("");
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
  $("radarList").innerHTML = items.slice(0, 12).map((i) => `<div class="alert ${i.kind === "good" ? "good" : ""}"><span class="m"><i></i>${i.m}, ${esc(i.date)}</span><b>${esc(i.title)}</b><span class="l">${esc(i.line)}</span>${i.id ? `<a href="#explorer" onclick="selectBrand('${i.id}');return false">Open the brand</a>` : ""}</div>`).join("") || `<p class="empty">No alerts in the current data.</p>`;
}

/* ---------- agent console ---------- */
function agent() {
  const runs = (B.agent || []).filter((a) => a.steps && a.steps.length);
  if (!runs.length) { $("term").innerHTML = `<p class="empty">The analyst has not run on this data yet.</p>`; $("brief").innerHTML = ""; return; }
  $("cases").innerHTML = runs.map((r, i) => `<button type="button" data-i="${i}" aria-pressed="${i === 0}">${esc(r.case.brand)}: ${esc(r.case.type.replace(/_/g, " "))}</button>`).join("");
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
      return `<p class="s">${s.thought ? `<span class="th">${esc(s.thought)}</span>\n` : ""}<span class="tool">${esc(s.tool)}</span> <span class="arg">${esc(args).slice(0, 600)}</span>\n<span class="res">${esc(s.result_preview).slice(0, 300)}</span></p>`;
    }).join("");
    const b = run.brief;
    if (!b) { $("brief").innerHTML = `<p class="empty">This investigation did not finish (free quota or step limit reached).</p>`; return; }
    $("brief").innerHTML = `<span class="conf">Confidence: ${esc(b.confidence)}</span><h4>${esc(b.headline)}</h4>
      <dl><div><dt>What happened</dt><dd>${esc(b.what_happened)}</dd></div><div><dt>Likely root cause</dt><dd>${esc(b.root_cause)}</dd></div><div><dt>Impact</dt><dd>${esc(b.impact)}</dd></div></dl>
      <h3>Recommended actions</h3>${(b.actions || []).map((a) => `<div class="act"><img src="${TEAM_IMG(a.team)}" alt="" width="46" height="46"><div><b>${esc(a.action)}</b><small>${esc(a.team)}${a.expected_effect ? `: ${esc(a.expected_effect)}` : ""}</small></div></div>`).join("")}
      <h3 style="margin-top:18px">Evidence ${run.evidence_verified ? `<span class="ok">every cited review was read by the agent</span>` : ""}</h3>
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
    <tr><td>Leaving the company, F1</td><td>${fmt.s((c.churn || {}).leaving_company_f1)}</td><td>–</td></tr>
    <tr><td>Topic polarity, accuracy</td><td>${fmt.s((c.aspect_polarity || {}).accuracy)}</td><td>–</td></tr>
    </tbody></table><p class="note">Trained on ${fmt.n(c.n_train)} AI-labelled reviews; ${fmt.n(c.n_heldout)} unseen reviews were never used for training or tuning. The figures measure agreement with the AI labels.</p>`;
}
