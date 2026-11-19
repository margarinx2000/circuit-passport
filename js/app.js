/*
 * Circuit Passport — UI.
 * Everything displayed comes from live reads in js/chain.js.
 * Chain-derived strings are inserted with textContent (never innerHTML)
 * so a malicious contract name cannot inject markup.
 */
"use strict";

const CP = window.CircuitPassportChain;
const $ = (id) => document.getElementById(id);
const resultEl = $("result");

/* Examples verified against live X Layer reads on 2026-11-19.
 * The app re-reads everything live when you open one — labels below
 * describe what the verification found, the numbers always come fresh
 * from the chain. */
const EXAMPLES = [
  {
    cpu: 268,
    title: "XBOT — CPU 268",
    desc: "Community processor with its own project site. Transistors priced in OKB; only a handful minted so far.",
    circuit: 3,
    circuitLabel: "Circuit #3 (8 gates)",
  },
  {
    cpu: 265,
    title: "TAPELIQUID — CPU 265",
    desc: "The one X Layer processor flagged “certified” in TapeOut's official app. Its transistor supply is fully minted.",
    circuit: 3,
    circuitLabel: "Circuit #3 (1,204 gates, held by a non-creator owner)",
  },
  {
    cpu: 0,
    title: "OnlyTestXLayer — CPU 0",
    desc: "The first processor ever registered on X Layer. Free mint, fully minted.",
    circuit: 1,
    circuitLabel: "Circuit #1 (container opened & deployed)",
  },
];

/* ---------- small DOM helpers ---------- */

function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
}
function link(href, text) {
  const a = el("a", null, text);
  a.href = href;
  a.target = "_blank";
  a.rel = "noopener";
  return a;
}
function field(label, valueNode) {
  const d = el("div", "field");
  d.appendChild(el("div", "field-label", label));
  const v = el("div", "field-value");
  if (typeof valueNode === "string") v.textContent = valueNode;
  else if (valueNode) v.appendChild(valueNode);
  else v.textContent = "—";
  d.appendChild(v);
  return d;
}
function addrField(label, addr) {
  if (!addr) return field(label, "not exposed by the contract");
  const span = el("span", "addr");
  span.appendChild(el("span", "addr-text", addr));
  span.appendChild(link(CP.explorerAddr(addr), "OKLink ↗"));
  return field(label, span);
}
function scrollToResult() {
  resultEl.scrollIntoView({ behavior: "smooth", block: "start" });
}

/* ---------- URL state ---------- */

function setUrl(params) {
  const u = new URL(window.location.href);
  u.search = "";
  for (const [k, v] of Object.entries(params)) if (v != null && v !== "") u.searchParams.set(k, v);
  history.replaceState(null, "", u);
}
function shareUrl() {
  return window.location.href;
}

/* ---------- safety checks ---------- */
/* Each check is computed only from values actually read. Levels:
 * pass / info / warn / fail. */

function processorChecks(p) {
  const checks = [];
  if (p.registered === true)
    checks.push({ level: "pass", title: "Registered in the TapeOut factory",
      detail: "factory.isCPU() returned true for this circuits contract. This is the ground-truth test for a genuine TapeOut processor — look-alike contracts cannot pass it." });
  else if (p.registered === false)
    checks.push({ level: "fail", title: "NOT registered in the TapeOut factory",
      detail: "factory.isCPU() returned false. Whatever this contract claims to be, the TapeOut factory does not know it. Treat any “TapeOut” branding as imitation." });
  else
    checks.push({ level: "warn", title: "Registration could not be read",
      detail: "The factory read failed, so genuineness is unverified — do not rely on this passport until the read succeeds." });

  if (p.certified)
    checks.push({ level: "pass", title: "Certified in TapeOut's official app",
      detail: "This circuits contract is on the certified list shipped in TapeOut's own web app for X Layer." });
  else if (p.registered === true)
    checks.push({ level: "info", title: "Community processor",
      detail: "Not on the official app's certified list. That is normal — almost all of the hundreds of registered processors are community-created. Registration, not certification, is the genuineness test." });

  if (p.pairConsistent === true)
    checks.push({ level: "pass", title: "Circuit ↔ transistor pairing is consistent",
      detail: "The circuits contract names this transistor contract, and the transistor contract names the same circuits contract back. A mismatched pair is a classic imitation trick." });
  else if (p.pairConsistent === false)
    checks.push({ level: "fail", title: "Circuit ↔ transistor pairing is INCONSISTENT",
      detail: "The transistor contract points at a different circuits contract than the one that names it. Do not trust this pairing." });

  if (p.factory)
    checks.push(p.factory === CP.ADDR.factory
      ? { level: "pass", title: "Reports the official factory", detail: "circuits.factory() returns the known TapeOut factory address." }
      : { level: "fail", title: "Reports a DIFFERENT factory", detail: "circuits.factory() returned " + p.factory + " — not the TapeOut factory. Strong imitation signal." });

  if (p.supplyCap != null && p.minted != null) {
    if (p.minted > p.supplyCap)
      checks.push({ level: "fail", title: "Minted supply exceeds the cap",
        detail: `minted() reports ${CP.fmtInt(p.minted)} against a supplyCap() of ${CP.fmtInt(p.supplyCap)}. A genuine TapeOut transistor contract cannot do this.` });
    else if (p.minted === p.supplyCap)
      checks.push({ level: "info", title: "Transistor supply fully minted",
        detail: "minted() equals supplyCap(). No new transistors can be minted — secondary purchases are the only way in, which is exactly when verification matters." });
    else
      checks.push({ level: "pass", title: "Supply within cap",
        detail: `${CP.fmtInt(p.minted)} of ${CP.fmtInt(p.supplyCap)} transistors minted so far.` });
  }
  if (p.mintPrice === 0n)
    checks.push({ level: "info", title: "Free mint", detail: "mintPrice() is 0 — this processor's transistors mint for free (gas aside)." });
  return checks;
}

function circuitChecks(p, c) {
  const checks = processorChecks(p);
  if (c.listing) {
    if (c.listing.valid) {
      if (c.owner && c.listing.seller === c.owner)
        checks.push({ level: "pass", title: "Listed for sale by its owner",
          detail: `The TapeOut market shows this circuit listed at ${CP.fmtUnits(c.listing.price)} OKB by its current owner.` });
      else
        checks.push({ level: "fail", title: "Listed by a NON-OWNER",
          detail: `The market listing names seller ${c.listing.seller}, but ownerOf() says the circuit belongs to ${c.owner}. Do not buy through this listing.` });
    } else {
      checks.push({ level: "info", title: "No active market listing",
        detail: "The TapeOut market contract reports no valid listing for this circuit right now." });
    }
  }
  if (c.containerDeployed === true)
    checks.push({ level: "pass", title: "Container is live",
      detail: "This circuit's on-chain account (ERC-6551 container) has been opened and deployed — it can hold assets and host DeWEB content." });
  else if (c.containerOpened === true)
    checks.push({ level: "info", title: "Container opened, not deployed",
      detail: "The container account was opened but its code is not deployed yet." });
  else if (c.containerOpened === false)
    checks.push({ level: "info", title: "Container never opened",
      detail: "No on-chain account has been opened for this circuit yet — it exists as a pure circuit NFT, with no DeWEB site or held assets." });
  return checks;
}

/* ---------- rendering ---------- */

function renderChecks(checks) {
  const box = el("div", "checks");
  box.appendChild(el("h3", null, "Safety checks"));
  for (const ch of checks) {
    const row = el("div", "check check-" + ch.level);
    row.appendChild(el("span", "check-icon", { pass: "✓", fail: "✕", warn: "!", info: "i" }[ch.level]));
    const body = el("div");
    body.appendChild(el("div", "check-title", ch.title));
    body.appendChild(el("div", "check-detail", ch.detail));
    row.appendChild(body);
    box.appendChild(row);
  }
  return box;
}

function verdictBanner(p) {
  if (p.registered === false)
    return el("div", "verdict verdict-fail", "✕ Not a genuine TapeOut processor — the factory does not register this contract.");
  if (p.registered === true && p.pairConsistent === false)
    return el("div", "verdict verdict-fail", "✕ Registered, but its transistor pairing is inconsistent — treat as unsafe.");
  if (p.registered === true)
    return el("div", "verdict verdict-pass", "✓ Genuine TapeOut processor — registered in the factory on X Layer.");
  return el("div", "verdict verdict-warn", "! Genuineness unverified — the factory registration read failed.");
}

function renderProcessor(p, cpuIndex, circuit) {
  resultEl.textContent = "";
  const card = el("article", "passport");
  const head = el("div", "passport-head");
  head.appendChild(el("div", "passport-kicker", "Processor passport · X Layer (chain 196)"));
  head.appendChild(el("h2", null, p.name || p.cpuName || "Unnamed processor"));
  const sub = [];
  if (p.symbol || p.cpuSymbol) sub.push("symbol " + (p.cpuSymbol || p.symbol));
  if (cpuIndex != null) sub.push("CPU #" + cpuIndex);
  sub.push(p.certified ? "certified in the official app" : "community processor");
  head.appendChild(el("div", "passport-sub", sub.join(" · ")));
  card.appendChild(head);
  card.appendChild(verdictBanner(p));

  const grid = el("div", "grid");
  grid.appendChild(addrField("Circuits contract (ERC-721)", p.circuits));
  grid.appendChild(addrField("Transistors contract (ERC-1155)", p.transistors));
  grid.appendChild(addrField("Creator", p.creator));
  if (p.supplyCap != null) grid.appendChild(field("Transistor supply cap", CP.fmtInt(p.supplyCap)));
  if (p.minted != null) {
    let txt = CP.fmtInt(p.minted);
    if (p.supplyCap) txt += ` (${(Number((p.minted * 10000n) / p.supplyCap) / 100).toFixed(2)}% of cap)`;
    grid.appendChild(field("Transistors minted", txt));
  }
  if (p.mintPrice != null)
    grid.appendChild(field("Mint price per transistor", p.mintPrice === 0n ? "0 OKB (free)" : CP.fmtUnits(p.mintPrice) + " OKB"));
  card.appendChild(grid);

  if (circuit) card.appendChild(renderCircuitSection(p, circuit));

  card.appendChild(renderChecks(circuit ? circuitChecks(p, circuit) : processorChecks(p)));

  const share = el("div", "share-row");
  const btn = el("button", "copy-btn", "Copy shareable passport link");
  btn.type = "button";
  btn.addEventListener("click", async () => {
    try { await navigator.clipboard.writeText(shareUrl()); btn.textContent = "Link copied ✓"; }
    catch (e) { btn.textContent = shareUrl(); }
    setTimeout(() => (btn.textContent = "Copy shareable passport link"), 2500);
  });
  share.appendChild(btn);
  share.appendChild(el("span", "muted small", "Anyone opening the link re-reads the same live values from X Layer."));
  card.appendChild(share);

  resultEl.appendChild(card);
  scrollToResult();
}

function renderCircuitSection(p, c) {
  const sec = el("section", "circuit");
  sec.appendChild(el("h3", null, "Circuit #" + c.tokenId.toString()));
  if (!c.exists) {
    sec.appendChild(el("p", "error-text",
      "This circuit does not exist — ownerOf() reverted for this token ID on this processor. Check the number and try again."));
    return sec;
  }
  const grid = el("div", "grid");
  grid.appendChild(addrField("Current owner", c.owner));
  if (c.info) {
    grid.appendChild(field("Gates (transistors burned into this circuit)", CP.fmtInt(c.info.gateCount)));
    grid.appendChild(field("Inputs / outputs / state bits",
      `${c.info.nIn} in · ${c.info.nOut} out · ${c.info.nState} state`));
  } else {
    grid.appendChild(field("Circuit info", "not exposed by this contract"));
  }
  grid.appendChild(addrField("Container account (ERC-6551)", c.container));
  if (c.container) {
    const status = c.containerDeployed ? "opened & deployed"
      : c.containerOpened ? "opened, not deployed" : "never opened";
    let bal = "";
    if (c.containerBalance != null) bal = ` · holds ${CP.fmtUnits(c.containerBalance)} OKB`;
    grid.appendChild(field("Container status", status + bal));
  }
  if (c.listing && c.listing.valid)
    grid.appendChild(field("Market listing", `${CP.fmtUnits(c.listing.price)} OKB · seller ${CP.shortAddr(c.listing.seller)}`));
  else
    grid.appendChild(field("Market listing", "no active listing"));
  sec.appendChild(grid);
  return sec;
}

function renderMessage(title, body, cls) {
  resultEl.textContent = "";
  const card = el("article", "passport " + (cls || ""));
  card.appendChild(el("h2", null, title));
  card.appendChild(el("p", null, body));
  resultEl.appendChild(card);
  scrollToResult();
}

function renderCore(kind, addr) {
  const names = {
    factory: "TapeOut Factory — the registry of every genuine processor on X Layer. This page's genuineness checks read this contract.",
    bem: "BEM — TapeOut's ecosystem token on X Layer (the factory itself reports this address via bem()).",
    opener: "TapeOut Circuit Opener — opens the ERC-6551 container accounts that let circuits hold assets and host DeWEB content.",
    market: "TapeOut Market — the contract this page reads for circuit sale listings.",
  };
  renderMessage("Core TapeOut contract", names[kind] || "Core contract.");
  const card = resultEl.firstChild;
  const grid = el("div", "grid");
  grid.appendChild(addrField("Contract", addr));
  card.appendChild(grid);
}

/* ---------- lookup flow ---------- */

let busy = false;
async function runLookup(query, tokenIdRaw) {
  if (busy) return;
  busy = true;
  $("lookupBtn").disabled = true;
  resultEl.textContent = "";
  resultEl.appendChild(el("p", "muted", "Reading X Layer…"));
  try {
    query = (query || "").trim();
    const tokenId = (tokenIdRaw || "").trim();

    if (CP.isAddress(query)) {
      const cls = await CP.classifyAddress(query);
      if (cls.kind === "empty") {
        renderMessage("No contract there", "This address has no code on X Layer mainnet. It may be a wallet address, or the address may belong to another chain (TapeOut also runs on BNB Chain — this tool reads X Layer only).", "warn");
        setUrl({ addr: query }); return;
      }
      if (["factory", "bem", "opener", "market"].includes(cls.kind)) {
        renderCore(cls.kind, query.toLowerCase()); setUrl({ addr: query }); return;
      }
      if (cls.kind === "unknown") {
        renderMessage("Unrecognized contract — not a TapeOut processor",
          "This contract is not registered in the TapeOut factory and is not paired with a registered processor. If someone presented it as a TapeOut circuit or transistor contract, that claim fails verification.", "warn");
        setUrl({ addr: query }); return;
      }
      // circuits or transistors → full processor passport
      const p = await CP.getProcessor(cls.circuits);
      let circuit = null;
      if (tokenId !== "") circuit = await CP.getCircuit(cls.circuits, tokenId);
      renderProcessor(p, null, circuit);
      setUrl({ addr: cls.circuits, id: tokenId || null });
      // best-effort: fill in the CPU index in the background
      const stats = await CP.getChainStats().catch(() => null);
      if (stats && stats.cpuCount != null) {
        const idx = await CP.findCpuIndex(cls.circuits, stats.cpuCount);
        if (idx != null) {
          const sub = resultEl.querySelector(".passport-sub");
          if (sub && !sub.textContent.includes("CPU #")) sub.textContent = sub.textContent.replace(" · ", ` · CPU #${idx} · `);
          setUrl({ cpu: idx, id: tokenId || null });
        }
      }
      return;
    }

    const dotted = query.match(/^(\d+)\.(\d+)$/);
    if (/^\d+$/.test(query) || dotted) {
      const cpuIndex = dotted ? Number(dotted[2]) : Number(query);
      const circuitId = dotted ? dotted[1] : tokenId;
      const stats = await CP.getChainStats();
      if (stats.cpuCount != null && BigInt(cpuIndex) >= stats.cpuCount) {
        renderMessage("No such CPU", `The factory registers ${stats.cpuCount} processors (CPU 0 – ${Number(stats.cpuCount) - 1}). CPU ${cpuIndex} does not exist yet.`, "warn");
        return;
      }
      const addrRes = await CP.cpuAt(cpuIndex);
      if (!addrRes) {
        renderMessage("Read failed", "The factory did not answer cpuAt() for that index. Try again in a moment.", "warn");
        return;
      }
      const p = await CP.getProcessor(addrRes);
      let circuit = null;
      if (circuitId !== "") circuit = await CP.getCircuit(addrRes, circuitId);
      renderProcessor(p, cpuIndex, circuit);
      setUrl({ cpu: cpuIndex, id: circuitId || null });
      return;
    }

    renderMessage("Couldn't parse that input",
      "Paste a 0x contract address, a CPU index like 268, or a circuit.cpu pair like 3.268 — optionally with a circuit number.", "warn");
  } catch (e) {
    renderMessage("Read failed",
      "Circuit Passport could not reach a working public X Layer RPC endpoint from your browser, so no values are shown. Nothing here is cached or simulated — try again in a moment. (" + (e && e.message ? e.message : e) + ")", "warn");
  } finally {
    busy = false;
    $("lookupBtn").disabled = false;
  }
}

/* ---------- page init ---------- */

function renderExamples() {
  const wrap = $("exampleCards");
  for (const ex of EXAMPLES) {
    const card = el("div", "card");
    card.appendChild(el("h3", null, ex.title));
    card.appendChild(el("p", null, ex.desc));
    const row = el("div", "card-actions");
    const b1 = el("button", null, "Processor passport");
    b1.type = "button";
    b1.addEventListener("click", () => { $("query").value = String(ex.cpu); $("tokenId").value = ""; runLookup(String(ex.cpu), ""); });
    const b2 = el("button", "ghost", ex.circuitLabel);
    b2.type = "button";
    b2.addEventListener("click", () => { $("query").value = String(ex.cpu); $("tokenId").value = String(ex.circuit); runLookup(String(ex.cpu), String(ex.circuit)); });
    row.appendChild(b1); row.appendChild(b2);
    card.appendChild(row);
    wrap.appendChild(card);
  }
}

async function initStats() {
  try {
    const s = await CP.getChainStats();
    const host = s.endpoint ? new URL(s.endpoint).host : "public RPC";
    $("chainStatus").textContent = `X Layer mainnet · block ${CP.fmtInt(s.block)} · via ${host}`;
    const stats = $("protocolStats");
    stats.textContent = "";
    if (s.cpuCount != null) stats.appendChild(field("Processors registered in the factory", CP.fmtInt(s.cpuCount)));
    if (s.bemSupply) stats.appendChild(field(`${s.bemName || "BEM"} total supply`, `${s.bemSupply} ${s.bemSymbol || ""}`.trim()));
    stats.appendChild(field("Latest block", CP.fmtInt(s.block)));
    const fl = $("factoryLink"); fl.href = CP.explorerAddr(CP.ADDR.factory); fl.textContent = CP.shortAddr(CP.ADDR.factory);
    const ol = $("openerLink"); ol.href = CP.explorerAddr(CP.ADDR.opener); ol.textContent = CP.shortAddr(CP.ADDR.opener);
    const bl = $("bemLink"); bl.href = CP.explorerAddr(CP.ADDR.bem); bl.textContent = CP.shortAddr(CP.ADDR.bem);
  } catch (e) {
    $("chainStatus").textContent = "X Layer RPC unreachable from this browser";
    $("protocolStats").innerHTML = "";
    $("protocolStats").appendChild(el("p", "error-text",
      "Live protocol data could not be loaded — no public X Layer RPC endpoint answered. Values are never cached or faked; reload to retry."));
  }
}

document.addEventListener("DOMContentLoaded", () => {
  renderExamples();
  initStats();
  $("lookupForm").addEventListener("submit", (ev) => {
    ev.preventDefault();
    runLookup($("query").value, $("tokenId").value);
  });
  const params = new URLSearchParams(window.location.search);
  if (params.get("cpu")) {
    $("query").value = params.get("cpu");
    $("tokenId").value = params.get("id") || "";
    runLookup(params.get("cpu"), params.get("id") || "");
  } else if (params.get("addr")) {
    $("query").value = params.get("addr");
    $("tokenId").value = params.get("id") || "";
    runLookup(params.get("addr"), params.get("id") || "");
  }
});
