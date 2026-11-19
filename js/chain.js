/*
 * Circuit Passport — chain layer.
 * Read-only access to TapeOut contracts on X Layer mainnet (chain ID 196).
 * Only eth_call / eth_getCode / eth_getBalance / eth_blockNumber are used.
 * No wallet, no signing, no transactions — ever.
 *
 * Contract addresses come from TapeOut's official web app bundle
 * (tapeout.net chain config for chain 196, read 2026-11-19) and are
 * cross-checked on-chain at runtime (factory.isCPU, pair pointers).
 * The market address is the TapeOut market contract reported by an
 * independent public read-only case study (dev.to, Oct 2026) and is
 * only ever read, never trusted for identity.
 */
"use strict";

/* ---------------- config ---------------- */

const CHAIN_ID = 196;
const EXPLORER = "https://www.oklink.com/xlayer";

const ADDR = {
  factory: "0x1f09daefa827f02cbb40967cc91b259763760761",
  opener: "0x536add8f30f03b69f6fbf29d425a816a0dc50106",
  accountImpl: "0xac4f791353ee9f06e2c50ae4c34680d28ea52a57",
  bem: "0x60e62Efa9405d6873C5deaBD4E6CC91c25363952",
  market: "0xd89f358c48a7B632c9845af2a02A32eB90DD75DB",
  multicall3: "0xcA11bde05977b3631167028862bE2a173976CA11",
};

/* Circuits contracts flagged "certified" in TapeOut's official app (chain 196). */
const CERTIFIED = new Set(["0x69f663931209096037474d7c20402232e5c762ca"]);

/* Public RPC endpoints, tried in order. All answered with
 * Access-Control-Allow-Origin: * when checked on 2026-11-19. */
const RPC_ENDPOINTS = [
  "https://xlayerrpc.okx.com",
  "https://xlayer.drpc.org",
  "https://rpc.xlayer.tech",
];

/* Function selectors (keccak256 of the canonical signature, first 4 bytes). */
const SEL = {
  cpuCount: "0xa94da8a7", // cpuCount()
  cpuAt: "0x4bc7cbbd", //    cpuAt(uint256)
  isCPU: "0x5f5a364f", //    isCPU(address)
  bem: "0x8765cf7b", //      bem()
  name: "0x06fdde03", //     name()
  symbol: "0x95d89b41", //   symbol()
  decimals: "0x313ce567", // decimals()
  totalSupply: "0x18160ddd", // totalSupply()
  transistors: "0x6fbd1719", // transistors()
  circuits: "0x5f48772d", //   circuits()
  factory: "0xc45a0155", //    factory()
  cpuName: "0x700ed104", //    cpuName()
  cpuSymbol: "0x91254d67", //  cpuSymbol()
  supplyCap: "0x8f770ad0", //  supplyCap()
  minted: "0x4f02c420", //     minted()
  mintPrice: "0x6817c76c", //  mintPrice()
  creator: "0x02d05d3f", //    creator()
  circuitInfo: "0x084d60f1", // circuitInfo(uint256) -> (uint32 nIn, uint32 nOut, uint32 nState, uint32 gateCount)
  ownerOf: "0x6352211e", //     ownerOf(uint256)
  accountOf: "0x0c1905e5", //   accountOf(address,uint256)
  isOpened: "0x8b508494", //    isOpened(address,uint256)
  isDeployed: "0xf13906b8", //  isDeployed(address,uint256)
  listingFor: "0x6816b596", //  listingFor(address,uint256) -> (uint256 id, address seller, uint96 price, bool valid)
  aggregate3: "0x82ad56cb", //  Multicall3 aggregate3((address,bool,bytes)[])
};

/* ---------------- low-level RPC ---------------- */

let _endpoint = null; // first endpoint that answered, reused afterwards

async function rpcRequest(method, params) {
  const order = _endpoint
    ? [_endpoint, ...RPC_ENDPOINTS.filter((e) => e !== _endpoint)]
    : RPC_ENDPOINTS;
  let lastErr = null;
  for (const url of order) {
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 15000);
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
        signal: ctrl.signal,
      });
      clearTimeout(timer);
      if (!res.ok) throw new Error("HTTP " + res.status);
      const json = await res.json();
      if (json.error) {
        const err = new Error(json.error.message || "RPC error");
        err.rpcError = json.error;
        throw err;
      }
      _endpoint = url;
      return json.result;
    } catch (e) {
      // A JSON-RPC "execution reverted" is a real answer from the chain:
      // surface it immediately instead of trying other endpoints.
      if (e.rpcError && (e.rpcError.code === 3 || /revert/i.test(e.message))) throw e;
      lastErr = e;
    }
  }
  throw lastErr || new Error("All X Layer RPC endpoints unreachable");
}

const ethCall = (to, data) => rpcRequest("eth_call", [{ to, data }, "latest"]);
const ethGetCode = (addr) => rpcRequest("eth_getCode", [addr, "latest"]);
const ethGetBalance = (addr) => rpcRequest("eth_getBalance", [addr, "latest"]);
const ethBlockNumber = () => rpcRequest("eth_blockNumber", []);
const ethChainId = () => rpcRequest("eth_chainId", []);

/* ---------------- ABI helpers (only what we use) ---------------- */

const encUint = (n) => BigInt(n).toString(16).padStart(64, "0");
const encAddr = (a) => a.toLowerCase().replace(/^0x/, "").padStart(64, "0");

function word(hex, i) {
  const h = hex.replace(/^0x/, "");
  return h.slice(i * 64, i * 64 + 64);
}
const decUint = (hex, i = 0) => BigInt("0x" + (word(hex, i) || "0"));
const decAddr = (hex, i = 0) => "0x" + word(hex, i).slice(24).toLowerCase();
const decBool = (hex, i = 0) => decUint(hex, i) !== 0n;
function decString(hex) {
  const h = hex.replace(/^0x/, "");
  const off = Number(BigInt("0x" + h.slice(0, 64)));
  const len = Number(BigInt("0x" + h.slice(off * 2, off * 2 + 64)));
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = parseInt(h.slice(off * 2 + 64 + i * 2, off * 2 + 66 + i * 2), 16);
  }
  return new TextDecoder().decode(bytes);
}

/* A call that may legitimately revert on contracts that don't expose it.
 * Returns { ok: true, value } or { ok: false } — never throws for reverts. */
async function tryCall(to, data, decode) {
  try {
    const out = await ethCall(to, data);
    if (!out || out === "0x") return { ok: false };
    return { ok: true, value: decode(out) };
  } catch (e) {
    return { ok: false };
  }
}

const callUint = (to, sel, args = "") => tryCall(to, sel + args, (h) => decUint(h));
const callAddr = (to, sel, args = "") => tryCall(to, sel + args, (h) => decAddr(h));
const callBool = (to, sel, args = "") => tryCall(to, sel + args, (h) => decBool(h));
const callString = (to, sel, args = "") => tryCall(to, sel + args, (h) => decString(h));

/* ---------------- formatting ---------------- */

/* wei (18 decimals) -> human string, trailing zeros trimmed */
function fmtUnits(v, decimals = 18) {
  v = BigInt(v);
  const base = 10n ** BigInt(decimals);
  const whole = v / base;
  let frac = (v % base).toString().padStart(decimals, "0").replace(/0+$/, "");
  return frac ? `${whole}.${frac}` : `${whole}`;
}
const fmtInt = (v) => BigInt(v).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
const shortAddr = (a) => (a ? a.slice(0, 6) + "…" + a.slice(-4) : "—");
const explorerAddr = (a) => `${EXPLORER}/address/${a}`;
const isAddress = (s) => /^0x[0-9a-fA-F]{40}$/.test(s || "");

/* ---------------- protocol-level reads ---------------- */

async function getChainStats() {
  const [chainIdHex, blockHex] = await Promise.all([ethChainId(), ethBlockNumber()]);
  const stats = {
    chainId: Number(BigInt(chainIdHex)),
    block: Number(BigInt(blockHex)),
    endpoint: _endpoint,
  };
  const count = await callUint(ADDR.factory, SEL.cpuCount);
  if (count.ok) stats.cpuCount = count.value;
  const bemAddr = await callAddr(ADDR.factory, SEL.bem);
  if (bemAddr.ok) stats.bemAddress = bemAddr.value;
  const bemName = await callString(ADDR.bem, SEL.name);
  const bemSym = await callString(ADDR.bem, SEL.symbol);
  const bemDec = await callUint(ADDR.bem, SEL.decimals);
  const bemSup = await callUint(ADDR.bem, SEL.totalSupply);
  if (bemName.ok) stats.bemName = bemName.value;
  if (bemSym.ok) stats.bemSymbol = bemSym.value;
  if (bemDec.ok && bemSup.ok)
    stats.bemSupply = fmtUnits(bemSup.value, Number(bemDec.value));
  return stats;
}

/* ---------------- processor passport ---------------- */

/*
 * Fetch everything publicly readable about one processor.
 * `circuitsAddr` must be the circuits (ERC-721) contract.
 * Every field is a live read; fields the contract does not expose
 * come back as null and are rendered as "not exposed", never invented.
 */
async function getProcessor(circuitsAddr) {
  circuitsAddr = circuitsAddr.toLowerCase();
  const p = { circuits: circuitsAddr };

  const [registered, name, symbol, transistorsR, factoryR] = await Promise.all([
    callBool(ADDR.factory, SEL.isCPU, encAddr(circuitsAddr)),
    callString(circuitsAddr, SEL.name),
    callString(circuitsAddr, SEL.symbol),
    callAddr(circuitsAddr, SEL.transistors),
    callAddr(circuitsAddr, SEL.factory),
  ]);
  p.registered = registered.ok ? registered.value : null;
  p.name = name.ok ? name.value : null;
  p.symbol = symbol.ok ? symbol.value : null;
  p.transistors = transistorsR.ok ? transistorsR.value : null;
  p.factory = factoryR.ok ? factoryR.value : null;
  p.certified = CERTIFIED.has(circuitsAddr);

  if (p.transistors) {
    const t = p.transistors;
    const [cpuName, cpuSymbol, pairBack, cap, minted, price, creator] =
      await Promise.all([
        callString(t, SEL.cpuName),
        callString(t, SEL.cpuSymbol),
        callAddr(t, SEL.circuits),
        callUint(t, SEL.supplyCap),
        callUint(t, SEL.minted),
        callUint(t, SEL.mintPrice),
        callAddr(t, SEL.creator),
      ]);
    p.cpuName = cpuName.ok ? cpuName.value : null;
    p.cpuSymbol = cpuSymbol.ok ? cpuSymbol.value : null;
    p.pairConsistent = pairBack.ok ? pairBack.value === circuitsAddr : null;
    p.supplyCap = cap.ok ? cap.value : null;
    p.minted = minted.ok ? minted.value : null;
    p.mintPrice = price.ok ? price.value : null;
    p.creator = creator.ok ? creator.value : null;
  }
  return p;
}

/* Resolve a factory index to its circuits contract address. */
async function cpuAt(index) {
  const r = await callAddr(ADDR.factory, SEL.cpuAt, encUint(index));
  return r.ok ? r.value : null;
}

/* Resolve a circuits address back to its factory index via Multicall3
 * batches of cpuAt(). Returns the index or null. Best-effort. */
async function findCpuIndex(circuitsAddr, cpuCount) {
  const target = circuitsAddr.toLowerCase();
  const BATCH = 100;
  const total = Number(cpuCount);
  for (let start = 0; start < total; start += BATCH) {
    const idxs = [];
    for (let i = start; i < Math.min(start + BATCH, total); i++) idxs.push(i);
    const tuples = [];
    for (const i of idxs) {
      const db = SEL.cpuAt.replace(/^0x/, "") + encUint(i);
      const pad = (64 - (db.length % 64)) % 64;
      tuples.push(
        encAddr(ADDR.factory) +
          encUint(1) +
          encUint(96) +
          encUint(db.length / 2) +
          db +
          "0".repeat(pad)
      );
    }
    let offsets = "";
    let off = 32 * tuples.length;
    for (const t of tuples) {
      offsets += encUint(off);
      off += t.length / 2;
    }
    const data =
      SEL.aggregate3 + encUint(32) + encUint(tuples.length) + offsets + tuples.join("");
    let out;
    try {
      out = await ethCall(ADDR.multicall3, data);
    } catch (e) {
      return null;
    }
    const raw = out.replace(/^0x/, "");
    const w = (o) => BigInt("0x" + raw.slice(o * 2, o * 2 + 64));
    const n = Number(w(32));
    for (let k = 0; k < n; k++) {
      const eo = 64 + Number(w(64 + 32 * k));
      const success = w(eo) !== 0n;
      const doff = eo + Number(w(eo + 32));
      const ln = Number(w(doff));
      if (success && ln >= 32) {
        const addr = "0x" + raw.slice((doff + 32) * 2, (doff + 32 + ln) * 2).slice(-40);
        if (addr === target) return idxs[k];
      }
    }
  }
  return null;
}

/* ---------------- circuit passport ---------------- */

async function getCircuit(circuitsAddr, tokenId) {
  circuitsAddr = circuitsAddr.toLowerCase();
  const c = { circuits: circuitsAddr, tokenId: BigInt(tokenId) };
  const idArg = encUint(c.tokenId);

  const [owner, info] = await Promise.all([
    callAddr(circuitsAddr, SEL.ownerOf, idArg),
    tryCall(circuitsAddr, SEL.circuitInfo + idArg, (h) => ({
      nIn: Number(decUint(h, 0)),
      nOut: Number(decUint(h, 1)),
      nState: Number(decUint(h, 2)),
      gateCount: Number(decUint(h, 3)),
    })),
  ]);
  c.exists = owner.ok;
  c.owner = owner.ok ? owner.value : null;
  c.info = info.ok ? info.value : null;

  if (c.exists) {
    const pair = encAddr(circuitsAddr) + idArg;
    const [account, opened, deployed, listing] = await Promise.all([
      callAddr(ADDR.opener, SEL.accountOf, pair),
      callBool(ADDR.opener, SEL.isOpened, pair),
      callBool(ADDR.opener, SEL.isDeployed, pair),
      tryCall(ADDR.market, SEL.listingFor + pair, (h) => ({
        id: decUint(h, 0),
        seller: decAddr(h, 1),
        price: decUint(h, 2),
        valid: decBool(h, 3),
      })),
    ]);
    c.container = account.ok ? account.value : null;
    c.containerOpened = opened.ok ? opened.value : null;
    c.containerDeployed = deployed.ok ? deployed.value : null;
    if (c.container) {
      try {
        c.containerBalance = BigInt(await ethGetBalance(c.container));
      } catch (e) {
        c.containerBalance = null;
      }
    }
    c.listing = listing.ok ? listing.value : null;
  }
  return c;
}

/* What kind of contract is this address? Drives the generic passport. */
async function classifyAddress(addr) {
  addr = addr.toLowerCase();
  const code = await ethGetCode(addr);
  if (!code || code === "0x") return { kind: "empty" };
  const lower = addr;
  if (lower === ADDR.factory) return { kind: "factory" };
  if (lower === ADDR.bem) return { kind: "bem" };
  if (lower === ADDR.opener) return { kind: "opener" };
  if (lower === ADDR.market) return { kind: "market" };
  const isCpu = await callBool(ADDR.factory, SEL.isCPU, encAddr(addr));
  if (isCpu.ok && isCpu.value) return { kind: "circuits", circuits: addr };
  const pair = await callAddr(addr, SEL.circuits);
  if (pair.ok) {
    const pairIsCpu = await callBool(ADDR.factory, SEL.isCPU, encAddr(pair.value));
    if (pairIsCpu.ok && pairIsCpu.value)
      return { kind: "transistors", circuits: pair.value, transistors: addr };
  }
  return { kind: "unknown" };
}

/* Export for node-based verification as well as the browser. */
const CircuitPassportChain = {
  ADDR, CERTIFIED, RPC_ENDPOINTS, CHAIN_ID, EXPLORER,
  getChainStats, getProcessor, getCircuit, classifyAddress, findCpuIndex, cpuAt,
  fmtUnits, fmtInt, shortAddr, explorerAddr, isAddress,
};
if (typeof module !== "undefined" && module.exports) module.exports = CircuitPassportChain;

if (typeof window !== "undefined") window.CircuitPassportChain = CircuitPassportChain;
