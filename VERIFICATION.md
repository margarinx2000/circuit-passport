# Verification — live reads performed while building Circuit Passport

Date: **2026-11-19**. All values below were read from X Layer mainnet
(chain ID **196**) with read-only calls (`eth_call`, `eth_getCode`,
`eth_getBalance`, `eth_blockNumber`) — no transactions, no wallet.
Tools: `cast` (Foundry) for the discovery probes, then this repo's own
`js/chain.js` running under Node for the end-to-end pass. Every number is a
value the chain actually returned; nothing is estimated or invented.

## RPC reachability from the build VM

| Endpoint | Result |
|---|---|
| `https://rpc.xlayer.tech` (official) | **Timed out** from this VM (empty reply after ~60 s) |
| `https://xlayerrpc.okx.com` (OKX mirror) | ✅ Works — `Access-Control-Allow-Origin: *` |
| `https://xlayer.drpc.org` (dRPC) | ✅ Works — `Access-Control-Allow-Origin: *` |
| `https://endpoints.omniatech.io/v1/xlayer/mainnet/public` | No response |
| `https://xlayer-mainnet.public.blastapi.io` | No response |

The app therefore tries OKX → dRPC → official in the visitor's browser, and
shows an honest error (and no values) if none answer.

## How the contract addresses were verified

1. TapeOut's official web app bundle (tapeout.net, JS bundle read
   2026-11-19) ships a per-chain config. For chain 196 it lists: factory
   `0x1f09daefa827f02cbb40967cc91b259763760761`, opener
   `0x536add8f30f03b69f6fbf29d425a816a0dc50106`, account implementation
   `0xac4f791353ee9f06e2c50ae4c34680d28ea52a57`, BEM
   `0x60e62Efa9405d6873C5deaBD4E6CC91c25363952`, plus a "certified" list for
   chain 196 containing exactly one circuits contract:
   `0x69f663931209096037474d7c20402232e5c762ca`.
2. The same bundle contains the human-readable ABI signatures used here
   (`cpuCount`, `cpuAt`, `isCPU`, `circuitInfo`, `listingFor`, …).
3. The factory address and the market address
   `0xd89f358c48a7B632c9845af2a02A32eB90DD75DB` are independently reported by
   a public read-only case study of TapeOut on X Layer (dev.to, Oct 2026).
4. On-chain cross-checks all agree: `factory.bem()` returns the BEM address
   above; `circuits.factory()` returns the factory; the ERC-6551 proxy
   bytecode of a deployed container embeds the account-implementation
   address above; XBOT's own project site publishes the same processor and
   transistor addresses the factory registry resolves (and the same
   0.009 OKB mint price and 1,000,000,000 supply cap the contracts return).

## Values read — discovery probes (cast, block 76,314,418)

- Factory `cpuCount()` = **430** processors.
- Factory is an upgradeable proxy: EIP-1967 implementation slot =
  `0x336e9f0f4c3fee7c8c803377e4dea00293f4ae2a`.
- BEM: name `BEM`, symbol `BEM`, decimals **8**, totalSupply raw
  1,548,660,944,200 (= 15,486.609442 BEM).
- Market `nextListingId()` = 4, but `listingView(0..3)` are all empty/invalid
  and `listingFor()` reports `valid=false` for every circuit probed — the
  market currently shows no live circuit listings; the app reports exactly
  that instead of inventing a price.
- A Multicall3 `aggregate3` scan of all 430 `cpuAt()` entries located:
  CPU **0** = OnlyTestXLayer circuits `0x839bdD6fa7A66416A609A735e11DE5411B98574e`,
  CPU **265** = TAPELIQUID circuits `0x69f663931209096037474d7c20402232e5c762ca`,
  CPU **268** = XBOT circuits `0xa5fc69Ca2D3d462CCa204D894D85ac8071c4F0f0`.

## Values read — end-to-end pass (this repo's js/chain.js under Node, block 76,314,942)

### CPU 268 — XBOT
- Processor: registered ✅, name/symbol `XBOT`, pair-consistent ✅,
  transistors `0x7bE7280e31984d18f62218519985EC5DcCa751De`,
  creator `0x456b2071C82c9C7ae84E0f5202E3DA3d15FE42cC`,
  supply cap **1,000,000,000**, minted **40**, mint price **0.009 OKB**.
- Circuit #3: owner = creator, `circuitInfo` = 3 in / 1 out / 0 state /
  **8 gates**; container `0xb9df97ef2bbebc60d3867758ac6226c27ac75225`
  opened & deployed, holding **0.008334027835652971 OKB**; no market listing.
  (Circuit #1, probed separately, has 3 gates and its container was never
  opened — the app shows the contrast correctly.)

### CPU 265 — TAPELIQUID (certified in the official app)
- Processor: registered ✅, certified ✅, name `TAPELIQUID` / symbol `TAPE`,
  transistors `0x3FA393d3081AcCff9E7989619B688235F6d3EE3F`,
  creator `0x585d2DF4B8fDDA783B074555e6F3787e3fCB39D7`,
  supply cap **2,100,000**, minted **2,100,000 (fully minted)**,
  mint price **0.00066 OKB**.
- Circuit #3: owner `0x08BD11220b6A87F1D16B54b5521d4e90BB0d1B1b`
  (a non-creator, secondary holder), `circuitInfo` = 16 in / 16 out /
  0 state / **1,204 gates**; container never opened; no market listing.

### CPU 0 — OnlyTestXLayer (first processor on X Layer)
- Processor: registered ✅, name/symbol `OnlyTestXLayer`,
  transistors `0xbe0eeE424C49d44592e4D498740F5B031Ef8e26D`,
  creator `0x571d447f4f24688eC35Ccf07f1D6993655F6aF15`,
  supply cap **100,000**, minted **100,000 (fully minted)**, mint price **0**.
- Circuit #1: owner = creator, `circuitInfo` = 2 in / 1 out / 0 state /
  **4 gates**; container `0xE2E5FfD861C8a0b50Ce21A7bcbDD6Bb5aaC250aB`
  opened & deployed (its bytecode is the ERC-6551 proxy to the official
  account implementation), balance 0 OKB; no market listing.

### Classification checks
- XBOT transistors contract → correctly classified as *transistors* and
  resolved to the XBOT processor.
- A plain wallet address → correctly reported as *no contract code*.
- The factory address → correctly reported as a core contract.
- `findCpuIndex()` (Multicall3 scan) returned 268 / 265 / 0 for the three
  example circuits contracts — matching the discovery scan.

### Static serving
`python3 -m http.server` served `/`, `/css/style.css`, `/js/chain.js`,
`/js/app.js` with HTTP 200; `node --check` passes on both JS files.

## Known limits (stated honestly in the app)

- The circuits (ERC-721) contracts do not expose `totalSupply()`, so a
  processor's total circuit count is not shown — only per-circuit lookups.
- The transistors contracts do not expose per-type (NAND/LATCH) supply, so
  only the contracts' own `minted()` / `supplyCap()` counters are shown.
- PoD mining and DeWEB are not part of TapeOut's X Layer feature set in the
  official app configuration (X Layer enables *containers*), so the passport
  reports container status and does not fabricate a PoD/DeWEB field.
