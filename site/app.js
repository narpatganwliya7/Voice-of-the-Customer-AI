/* Écoute website. Reads data/bundle.json (built by `python -m ecoute site`). */
"use strict";
const $ = (id) => document.getElementById(id);
const fmt = { pct: (v, d = 0) => (v == null ? "–" : (100 * v).toFixed(d) + "%"), n: (v) => (v == null ? "–" : Number(v).toLocaleString("en-GB")), s: (v, d = 2) => (v == null ? "–" : Number(v).toFixed(d)) };
const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const stars = (r) => "★".repeat(r) + "☆".repeat(5 - r);
const SECTOR = { banking: "Banking", insurance: "Insurance", telecom: "Telecom", retail: "Retail", mobility: "Mobility", delivery: "Delivery", energy: "Energy", health: "Health" };
let B, ASP, current;

fetch("data/bundle.json").then((r) => r.json()).then((b) => { B = b; ASP = b.overview.aspects || {}; init(); }).catch((e) => {
  $("liveStrip").innerHTML = `<span>Could not load data (${esc(e.message)}).</span>`;
});

const label = (k) => (ASP[k] ? ASP[k].en : k);

function init() {
  liveStrip(); hero(); pipeline(); explorer(); heatmap(); switching(); radar(); agent(); method();
  $("built").textContent = "Data built " + new Date(B.built_at).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" });
}

/* ---------- live strip: honest about liveness ---------- */
function liveStrip() {
  const runs = B.runs || [];
  const last = runs[runs.length - 1];
  const inc = runs.filter((r) => r.mode === "incremental" && r.capture_lag_min);
  const lastInc = inc[inc.length - 1];
  const ageH = last ? (Date.now() - new Date(last.finished)) / 36e5 : Infinity;
  const live = ageH < 1;
  const parts = [`<span><span class="dot ${live ? "on" : ""}"></span>${live ? "Live mode on" : "Showcase mode: live collection paused"}</span>`];
  if (last) parts.push(`<span>Last collection run ${new Date(last.finished).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" })} UTC · ${fmt.n(last.total_reviews)} reviews stored</span>`);
  if (lastInc) parts.push(`<span>Measured capture lag (last live run): median ${lastInc.capture_lag_min.median} min</span>`);
  $("liveStrip").innerHTML = parts.join("");
}

/* ---------- hero ---------- */
function hero() {
  const o = B.overview;
  const clf = o.classifier || {};
  const stats = [
    [fmt.n(o.reviews), "real customer reviews analysed"],
    [o.brands, "French brands across 8 sectors"],
    [Object.keys(ASP).length, "customer-experience topics"],
    [clf.heldout ? fmt.s(clf.heldout.aspect_micro_f1) : clf.aspect_micro_f1 ? fmt.s(clf.aspect_micro_f1) : "–", "topic F1 on reviews the model never saw"],
    [fmt.n(o.label_sources ? o.label_sources.llm : 0), "reviews annotated by a free AI model"],
  ];
  $("stats").innerHTML = stats.map(([b, s]) => `<div class="stat"><b>${b}</b><small>${s}</small></div>`).join("");
  $("eyebrow").textContent = `Always-on Voice of the Customer · ${o.brands} French brands`;

  // two lanes of real reviews, duplicated for a seamless loop
  const t = B.ticker || [];
  const card = (r) => `<article class="rv ${r.s}"><header><b>${esc(r.b)}</b><span class="stars">${stars(r.r)}</span><span>${esc(r.src)}</span></header><p lang="fr">${esc(r.t)}</p></article>`;
  const half = Math.ceil(t.length / 2);
  const lanes = [t.slice(0, half), t.slice(half)];
  $("stream").innerHTML = lanes.map((l, i) => `<div class="lane" style="animation-duration:${110 + i * 25}s">${l.map(card).join("")}${l.map(card).join("")}</div>`).join("");

  // waveform of real daily review volume across all brands
  const daily = d3.rollups(B.brands.flatMap((b) => b.weekly), (v) => d3.sum(v, (d) => d.n), (d) => d.w).sort((a, b) => d3.ascending(a[0], b[0]));
  const svg = d3.select("#wave"); const W = 1200, H = 300;
  svg.attr("viewBox", `0 0 ${W} ${H}`);
  if (daily.length > 2) {
    const x = d3.scaleLinear().domain([0, daily.length - 1]).range([0, W]);
    const y = d3.scaleLinear().domain([0, d3.max(daily, (d) => d[1])]).range([0, H * 0.45]);
    const area = d3.area().x((d, i) => x(i)).y0((d) => H / 2 + y(d[1])).y1((d) => H / 2 - y(d[1])).curve(d3.curveCatmullRom);
    svg.append("path").datum(daily).attr("d", area).attr("fill", "url(#wg)");
    const g = svg.append("defs").append("linearGradient").attr("id", "wg").attr("x1", 0).attr("x2", 1);
    g.append("stop").attr("offset", 0).attr("stop-color", "#ffb547").attr("stop-opacity", 0.05);
    g.append("stop").attr("offset", 1).attr("stop-color", "#ffb547").attr("stop-opacity", 0.35);
  }

  // the wordmark breathes: each letter's width follows recent review volume; a new review lights one up
  const letters = [...$("word").children];
  const vols = daily.slice(-letters.length).map((d) => d[1]);
  const vmax = d3.max(vols) || 1;
  const settle = () => letters.forEach((s, i) => (s.style.fontVariationSettings = `"wdth" ${70 + 70 * ((vols[i] || 0) / vmax)}`));
  requestAnimationFrame(() => { letters.forEach((s) => (s.style.fontVariationSettings = `"wdth" 50`)); setTimeout(settle, 120); });
  if (!matchMedia("(prefers-reduced-motion: reduce)").matches) {
    setInterval(() => {
      const s = letters[Math.floor(Math.random() * letters.length)];
      s.classList.add("hit"); s.style.fontVariationSettings = `"wdth" 150`;
      setTimeout(() => { s.classList.remove("hit"); settle(); }, 700);
    }, 1800);
  }
}

/* ---------- pipeline ---------- */
function pipeline() {
  const o = B.overview, clf = o.classifier || {};
  const lastRun = (B.runs || []).slice(-1)[0];
  const steps = [
    ["01", "Capture", "Official apps verified on Google Play and the App Store; only new reviews are pulled each run. Names, avatars, emails and phone numbers never stored.", `${fmt.n(o.reviews)} reviews · ${o.brands} brands`],
    ["02", "Understand", "A free AI model annotates a stratified sample; a local classifier learns from it and scores every review: 15 topics, tone, churn intent, severity.", clf.aspect_micro_f1 ? `topic F1 ${fmt.s(clf.aspect_micro_f1)} (cross-validated)` : "classifier"],
    ["03", "Explain", "DuckDB SQL models: stars lost per topic, release radar, complaint spikes, switching map, weekly trends.", `${(B.spikes || []).length} spikes · ${B.brands.reduce((a, b) => a + b.releases.length, 0)} releases tracked`],
    ["04", "Act", "The AI analyst investigates what the numbers flag and files a brief with owners, actions and verified evidence.", `${(B.agent || []).filter((a) => a.status === "filed").length} briefs filed`],
  ];
  $("pipe").innerHTML = steps.map(([n, h, p, f]) => `<div><span class="n">${n}</span><h4>${h}</h4><p>${p}</p><span class="fig">${f}</span></div>`).join("");
  if (lastRun) $("pipe").insertAdjacentHTML("afterend", "");
}

/* ---------- explorer ---------- */
function explorer() {
  const sectors = [...new Set(B.brands.map((b) => b.sector))];
  let sector = "all";
  const drawChips = () => {
    $("sectors").innerHTML = [["all", "All sectors"], ...sectors.map((s) => [s, SECTOR[s] || s])].map(([k, v]) => `<button type="button" data-k="${k}" aria-pressed="${k === sector}">${v}</button>`).join("");
    const list = B.brands.filter((b) => sector === "all" || b.sector === sector);
    $("chips").innerHTML = list.map((b) => `<button type="button" data-id="${b.id}" aria-pressed="${current && b.id === current.id}">${esc(b.name)}</button>`).join("");
  };
  $("sectors").addEventListener("click", (e) => { const k = e.target.closest("button")?.dataset.k; if (k) { sector = k; drawChips(); } });
  $("chips").addEventListener("click", (e) => { const id = e.target.closest("button")?.dataset.id; if (id) select(id); });
  const start = [...B.brands].sort((a, b) => (b.potential || 0) - (a.potential || 0))[0];
  current = start; drawChips(); select(start.id);
  window.selectBrand = (id) => { sector = "all"; select(id); drawChips(); $("explorer").scrollIntoView({ behavior: "smooth" }); };

  function select(id) {
    current = B.brands.find((b) => b.id === id);
    for (const btn of $("chips").children) btn.setAttribute("aria-pressed", String(btn.dataset.id === id));
    const b = current;
    $("exName").textContent = `${b.name} · ${SECTOR[b.sector] || b.sector}`;
    $("exRating").innerHTML = `${fmt.s(b.avg_rating, 2)}<small> ★ avg · ${B.overview.window_days} days</small>`;
    $("exWindow").textContent = `${fmt.n(b.reviews)} reviews in the window${b.store_rating ? ` · store rating ${fmt.s(b.store_rating, 1)}★ (all-time)` : ""}`;
    $("exKv").innerHTML = [
      ["Negative reviews", fmt.pct(b.negative_share)], ["Say they are leaving", fmt.pct(b.leaving_share, 1)],
      ["Critical (money, access, fraud)", fmt.pct(b.critical_share, 1)], ["Problem after an app update", fmt.pct(b.after_update_share, 1)],
      ["Reviews answered by the brand", fmt.pct(b.reply_rate)],
    ].map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join("");
    spark(b.weekly);
    const maxLost = d3.max(b.drivers, (d) => d.stars_lost) || 1;
    $("exBars").innerHTML = b.drivers.length ? b.drivers.slice(0, 7).map((d) => `
      <div class="bar"><span>${esc(d.label)}<small>${fmt.pct(d.prevalence, 1)} of reviews · −${fmt.s(d.impact, 1)}★ each</small></span>
      <span class="track"><span class="fill" style="width:${(100 * d.stars_lost) / maxLost}%"></span></span>
      <span class="val">−${fmt.s(d.stars_lost, 2)}★</span></div>`).join("") : `<p class="empty">Not enough recent reviews.</p>`;
    $("wiTopic").innerHTML = b.drivers.map((d, i) => `<option value="${i}">${esc(d.label)}</option>`).join("");
    whatIf();
    const q = b.quotes || [];
    $("exQuotes").innerHTML = q.length ? q.map((x) => `<article class="q ${x.kind}"><span class="m"><span>${x.kind === "pain" ? "Pain" : "Praise"} · ${esc(label(x.aspect))}</span><span>${stars(x.rating)}</span></span><p class="t" lang="fr">“${esc(x.text)}”</p>${x.gist ? `<p class="g">${esc(x.gist)}</p>` : ""}<span class="m"><span>${esc(x.source === "google_play" ? "Google Play" : "App Store")}</span><span>${esc(String(x.day).slice(0, 10))}</span></span></article>`).join("") : `<p class="empty">No quotes yet.</p>`;
    const rel = b.releases || [];
    $("exReleases").innerHTML = rel.length ? `<thead><tr><th>Version</th><th>First seen</th><th>Reviews</th><th>Avg ★</th><th>Negative</th><th>vs previous</th></tr></thead><tbody>${rel.slice().reverse().map((r) => {
      const c = r.negative_change; const cls = c == null ? "" : c > 0.03 ? "up-bad" : c < -0.03 ? "down-good" : "";
      return `<tr><td class="mono">${esc(r.app_version)}</td><td>${esc(String(r.first_seen).slice(0, 10))}</td><td>${fmt.n(r.reviews)}</td><td>${fmt.s(r.avg_rating, 2)}</td><td>${fmt.pct(r.negative_share)}</td><td class="${cls}">${c == null ? "–" : (c > 0 ? "+" : "") + (100 * c).toFixed(0) + " pts"}</td></tr>`;
    }).join("")}</tbody>` : `<tr><td class="empty">Version data is available for Google Play reviews only.</td></tr>`;
    const sw = b.switching || [];
    const mx = d3.max(sw, (d) => d.mentions) || 1;
    $("exSwitch").innerHTML = sw.length ? `<div class="bars">${sw.map((s) => `<div class="bar" style="grid-template-columns:110px minmax(0,1fr) 34px"><span>${esc(s.to_company)}</span><span class="track"><span class="fill" style="width:${(100 * s.mentions) / mx}%;background:var(--signal)"></span></span><span class="val" style="color:var(--text)">${s.mentions}</span></div>`).join("")}</div>` : `<p class="empty">No competitor named often enough.</p>`;
  }
}

function whatIf() {
  const b = current; const d = b.drivers[+$("wiTopic").value || 0]; const pct = +$("wiPct").value;
  $("wiPctLabel").textContent = pct + "%";
  if (!d) { $("wiOut").textContent = "–"; return; }
  const lift = d.stars_lost * pct / 100;
  $("wiOut").innerHTML = `${fmt.s(b.avg_rating, 2)}★ → <span class="up">${fmt.s(b.avg_rating + lift, 2)}★</span> <small class="muted" style="font:400 15px var(--body)">(+${fmt.s(lift, 2)})</small>`;
}
$("wiTopic").addEventListener("change", whatIf);
$("wiPct").addEventListener("input", whatIf);

function spark(weekly) {
  const svg = d3.select("#spark"); svg.selectAll("*").remove();
  const w = svg.node().clientWidth || 260, h = 90, p = 6;
  svg.attr("viewBox", `0 0 ${w} ${h}`);
  const data = weekly.filter((d) => d.n >= 5);
  if (data.length < 3) return;
  const x = d3.scaleLinear().domain([0, data.length - 1]).range([p, w - p]);
  const y = d3.scaleLinear().domain([d3.min(data, (d) => d.r) - 0.2, d3.max(data, (d) => d.r) + 0.2]).range([h - p, p]);
  svg.append("path").datum(data).attr("d", d3.area().x((d, i) => x(i)).y0(h).y1((d) => y(d.r)).curve(d3.curveMonotoneX)).attr("fill", "rgba(255,181,71,.12)");
  svg.append("path").datum(data).attr("d", d3.line().x((d, i) => x(i)).y((d) => y(d.r)).curve(d3.curveMonotoneX)).attr("fill", "none").attr("stroke", "#ffb547").attr("stroke-width", 2);
  const last = data[data.length - 1];
  svg.append("circle").attr("cx", x(data.length - 1)).attr("cy", y(last.r)).attr("r", 3.5).attr("fill", "#ffb547");
  svg.append("text").attr("x", p).attr("y", 12).attr("fill", "#8f99b6").attr("font-size", 11).text(`Weekly avg ★ · last ${data.length} weeks`);
}

/* ---------- heatmap ---------- */
function heatmap() {
  const keys = Object.keys(ASP);
  const cell = new Map(B.heatmap.map((d) => [d.brand + "|" + d.aspect, d.negative_share]));
  const max = d3.quantile(B.heatmap.map((d) => d.negative_share).sort(d3.ascending), 0.98) || 0.2;
  const color = d3.scaleLinear().domain([0, max / 2, max]).range(["#172037", "#7a2430", "#ff6166"]).clamp(true);
  const bySector = d3.groups(B.brands, (b) => b.sector);
  let html = `<thead><tr><th></th>${keys.map((k) => `<th class="col">${esc(label(k))}</th>`).join("")}</tr></thead><tbody>`;
  for (const [s, list] of bySector) {
    html += `<tr class="sector"><td class="rowh" colspan="${keys.length + 1}">${SECTOR[s] || s}</td></tr>`;
    for (const b of list) {
      html += `<tr><td class="rowh" onclick="selectBrand('${b.id}')">${esc(b.name)}</td>${keys.map((k) => { const v = cell.get(b.name + "|" + k) || 0; return `<td style="background:${color(v)}" data-tip="${esc(b.name)} · ${esc(label(k))}: ${fmt.pct(v, 1)} of reviews complain">${v >= 0.005 ? Math.round(v * 100) : ""}</td>`; }).join("")}</tr>`;
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
    if (!flows.length || !d3.sankey) { svg.append("text").attr("x", 20).attr("y", 40).attr("fill", "#8f99b6").text("Not enough competitor mentions in this sector yet."); return; }
    const names = [...new Set(flows.flatMap((f) => ["from:" + f.from_brand, "to:" + f.to_company]))];
    const graph = d3.sankey().nodeId((d) => d.id).nodeWidth(12).nodePadding(14).extent([[150, 10], [W - 170, H - 10]])({
      nodes: names.map((id) => ({ id })), links: flows.map((f) => ({ source: "from:" + f.from_brand, target: "to:" + f.to_company, value: f.mentions, f })),
    });
    svg.append("g").selectAll("path").data(graph.links).join("path").attr("d", d3.sankeyLinkHorizontal()).attr("fill", "none")
      .attr("stroke", (d) => (d.f.leaving_mentions > 0 ? "#ff6166" : "#ffb547")).attr("stroke-opacity", 0.35).attr("stroke-width", (d) => Math.max(1.5, d.width))
      .append("title").text((d) => `${d.f.from_brand} → ${d.f.to_company}: ${d.f.mentions} mentions (${d.f.leaving_mentions} say they are leaving)`);
    const n = svg.append("g").selectAll("g").data(graph.nodes).join("g");
    n.append("rect").attr("x", (d) => d.x0).attr("y", (d) => d.y0).attr("width", (d) => d.x1 - d.x0).attr("height", (d) => Math.max(2, d.y1 - d.y0)).attr("fill", (d) => (d.id.startsWith("from:") ? "#e8ecf6" : "#ffb547")).attr("rx", 2);
    n.append("text").attr("x", (d) => (d.id.startsWith("from:") ? d.x0 - 8 : d.x1 + 8)).attr("y", (d) => (d.y0 + d.y1) / 2).attr("dy", "0.35em")
      .attr("text-anchor", (d) => (d.id.startsWith("from:") ? "end" : "start")).attr("fill", "#e8ecf6").attr("font-size", 13)
      .text((d) => `${d.id.split(":")[1]} · ${d.value}`);
  };
  $("swSectors").addEventListener("click", (e) => { const k = e.target.closest("button")?.dataset.k; if (k) { sector = k; draw(); } });
  draw();
  addEventListener("resize", () => clearTimeout(window._sw) || (window._sw = setTimeout(draw, 200)));
}

/* ---------- radar ---------- */
function radar() {
  const items = [];
  for (const b of B.brands) for (const r of b.releases) if (r.negative_change != null && Math.abs(r.negative_change) >= 0.06 && r.reviews >= 40)
    items.push({ kind: r.negative_change > 0 ? "bad" : "good", brand: b.name, id: b.id, title: `${b.name} ${r.app_version}`, line: `${r.negative_change > 0 ? "+" : ""}${(100 * r.negative_change).toFixed(0)} pts negative reviews vs ${r.previous_version} · ${fmt.n(r.reviews)} reviews · first seen ${String(r.first_seen).slice(0, 10)}`, date: String(r.first_seen).slice(0, 10), m: "Release" });
  for (const s of B.spikes || []) items.push({ kind: "bad", brand: s.brand, id: (B.brands.find((b) => b.name === s.brand) || {}).id, title: `${s.brand}: ${s.negative} complaints in one day`, line: `usually ${fmt.s(s.baseline, 0)} a day · ${fmt.s(s.z, 1)} standard deviations above normal`, date: String(s.day).slice(0, 10), m: "Spike" });
  items.sort((a, b) => d3.descending(a.date, b.date));
  $("radarList").innerHTML = items.slice(0, 12).map((i) => `<div class="alert ${i.kind === "good" ? "good" : ""}"><span class="m">${i.m} · ${esc(i.date)}</span><b>${esc(i.title)}</b><span class="muted">${esc(i.line)}</span>${i.id ? ` <a href="#explorer" onclick="selectBrand('${i.id}');return false">Open brand →</a>` : ""}</div>`).join("") || `<p class="empty">No alerts in the current data.</p>`;
}

/* ---------- agent console ---------- */
function agent() {
  const runs = (B.agent || []).filter((a) => a.steps && a.steps.length);
  if (!runs.length) { $("term").innerHTML = `<p class="empty">The analyst has not run on this data yet.</p>`; $("brief").innerHTML = ""; return; }
  $("cases").innerHTML = runs.map((r, i) => `<button type="button" data-i="${i}" aria-pressed="${i === 0}">${esc(r.case.brand)} · ${esc(r.case.type.replace(/_/g, " "))}</button>`).join("");
  $("cases").addEventListener("click", (e) => { const i = e.target.closest("button")?.dataset.i; if (i != null) { for (const b of $("cases").children) b.setAttribute("aria-pressed", String(b.dataset.i === i)); play(runs[+i]); } });
  let timer;
  const io = new IntersectionObserver((es) => { if (es[0].isIntersecting) { play(runs[0]); io.disconnect(); } }, { threshold: 0.3 });
  io.observe($("term"));
  render(runs[0], true);

  function play(run) { clearInterval(timer); render(run, false); const steps = [...$("term").children]; steps.forEach((s) => (s.hidden = true)); let i = 0; timer = setInterval(() => { if (i >= steps.length) return clearInterval(timer); steps[i].hidden = false; $("term").scrollTop = $("term").scrollHeight; i++; }, 650); }
  function render(run, all) {
    $("term").innerHTML = `<p class="st th">$ ecoute agent --case ${esc(run.case.type)} --brand "${esc(run.case.brand)}"  # model: ${esc(run.model)}</p>` + run.steps.map((s) => {
      if (s.type === "note") return `<p class="st th">${esc(s.text)}</p>`;
      const args = s.tool === "run_sql" ? s.args.query : JSON.stringify(s.args);
      return `<p class="st">${s.thought ? `<span class="th">${esc(s.thought)}</span>\n` : ""}<span class="tool">→ ${esc(s.tool)}</span> <span class="arg">${esc(args).slice(0, 600)}</span>\n<span class="res">${esc(s.result_preview).slice(0, 300)}</span></p>`;
    }).join("");
    const b = run.brief;
    if (!b) { $("brief").innerHTML = `<p class="empty">This investigation did not finish (free quota or step limit).</p>`; return; }
    $("brief").innerHTML = `<h3>Brief · ${esc(run.case.brand)} · confidence ${esc(b.confidence)}</h3><h4>${esc(b.headline)}</h4>
      <dl><div><dt>What happened</dt><dd>${esc(b.what_happened)}</dd></div><div><dt>Likely root cause</dt><dd>${esc(b.root_cause)}</dd></div><div><dt>Impact</dt><dd>${esc(b.impact)}</dd></div></dl>
      <table><thead><tr><th>Action</th><th>Team</th><th>Expected effect</th></tr></thead><tbody>${(b.actions || []).map((a) => `<tr><td>${esc(a.action)}</td><td>${esc(a.team)}</td><td>${esc(a.expected_effect)}</td></tr>`).join("")}</tbody></table>
      <h3 style="margin-top:16px">Evidence ${run.evidence_verified ? `<span class="ok">✓ every cited review was read by the agent</span>` : ""}</h3>
      ${(run.evidence || []).map((e) => `<p class="ev" lang="fr">“${esc(e.text.slice(0, 260))}”</p>`).join("") || `<p class="empty">No verified evidence.</p>`}`;
  }
}

/* ---------- method ---------- */
function method() {
  const o = B.overview, c = o.classifier;
  $("mData").innerHTML = [
    `${fmt.n(o.reviews)} public reviews from Google Play and the App Store (France), ${o.first_review} to ${o.last_review}.`,
    `Cross-brand comparisons use the last ${o.window_days} days (${fmt.n(o.reviews_in_window)} reviews).`,
    `Only official apps, verified by developer name. Usernames, avatars and platform ids are never stored; emails, phone numbers and account numbers are masked.`,
    `${fmt.n((o.label_sources || {}).llm)} reviews annotated by a free AI model; the rest scored by a local classifier trained on them.`,
  ].map((x) => `<li>${esc(x)}</li>`).join("");
  if (!c) { $("mModel").innerHTML = `<p class="empty">Model report appears after the first training run.</p>`; return; }
  const h = c.heldout || {};
  $("mModel").innerHTML = `<table><thead><tr><th>Check</th><th>Cross-val.</th><th>Held-out</th></tr></thead><tbody>
    <tr><td>Topic detection, micro F1</td><td>${fmt.s(c.aspect_micro_f1)}</td><td>${fmt.s(h.aspect_micro_f1)}</td></tr>
    <tr><td>Topic detection, macro F1</td><td>${fmt.s(c.aspect_macro_f1)}</td><td>${fmt.s(h.aspect_macro_f1)}</td></tr>
    <tr><td>Overall tone, accuracy</td><td>${fmt.s((c.sentiment || {}).accuracy)}</td><td>${fmt.s(h.sentiment_accuracy)}</td></tr>
    <tr><td>Leaving the company, F1</td><td>${fmt.s((c.churn || {}).leaving_company_f1)}</td><td>–</td></tr>
    <tr><td>Topic polarity, accuracy</td><td>${fmt.s((c.aspect_polarity || {}).accuracy)}</td><td>–</td></tr>
    </tbody></table><p class="note" style="margin-top:10px">Trained on ${fmt.n(c.n_train)} AI-annotated reviews; held-out set of ${fmt.n(c.n_heldout)} reviews never used for training or tuning. Figures measure agreement with the AI annotator.</p>`;
}
