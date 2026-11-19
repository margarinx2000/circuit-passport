# Circuit Passport

**Verify any TapeOut circuit or processor on X Layer — read-only, no wallet, no transactions.**

TapeOut turns transistor tokens (ERC-1155 NAND gates) into on-chain circuits
(ERC-721 NFTs) that actually execute on X Layer. Anyone can deploy a look-alike
contract and call it "TapeOut" — but only genuine processors are registered in
the TapeOut factory, and only genuine circuit/transistor contracts point at
each other consistently. Circuit Passport reads the chain directly in the
visitor's browser and issues a **passport** for a processor or a single
circuit: identity, owner, gate count, mint price, container status, market
listing, and plain-language safety checks for secondary buyers.

Built for the **X Layer TapeOut Accelerate** program. It qualifies as an entry
because it *uses TapeOut contracts and on-chain data on X Layer* — while
costing its users and its operator exactly nothing: no transactions, no OKB,
no accounts, no backend.

## Use it

Open `index.html` (or serve the folder statically, e.g. GitHub Pages):

```
python3 -m http.server 8000
```

Then paste any of:

| Input | Meaning |
|---|---|
| `0x…` (circuits contract) | Processor passport |
| `0x…` (transistors contract) | Passport of the processor it belongs to |
| `268` | Processor passport for CPU #268 (factory index) |
| `3.268` or CPU + circuit # | Circuit passport (circuit 3 of CPU 268) |

Passports are shareable: the URL updates to `?cpu=268&id=3` or
`?addr=0x…&id=3`, and anyone opening it re-reads the same live values.

## What a passport shows — and where every value comes from

All reads are `eth_call` / `eth_getCode` / `eth_getBalance` against public
X Layer RPC endpoints (`xlayerrpc.okx.com`, `xlayer.drpc.org`,
`rpc.xlayer.tech` — tried in order, all read-only). If no endpoint answers,
the page shows an error and **no values at all** — nothing is cached or
simulated.

### Core contracts (X Layer mainnet, chain 196)

Addresses come from the chain configuration shipped in TapeOut's official web
app (tapeout.net, read 2026-11-19) and are re-verified on-chain by the reads
below (e.g. the factory itself returns the BEM address via `bem()`; circuits
contracts return the factory via `factory()`).

| Contract | Address |
|---|---|
| Factory (processor registry) | `0x1f09daefa827f02cbb40967cc91b259763760761` |
| Circuit opener (ERC-6551 containers) | `0x536add8f30f03b69f6fbf29d425a816a0dc50106` |
| Container account implementation | `0xac4f791353ee9f06e2c50ae4c34680d28ea52a57` |
| BEM token | `0x60e62Efa9405d6873C5deaBD4E6CC91c25363952` |
| Market | `0xd89f358c48a7B632c9845af2a02A32eB90DD75DB` |

### Calls used

**Factory:** `cpuCount()` (processor census), `cpuAt(uint256)` (index →
circuits contract), `isCPU(address)` (the genuineness test), `bem()`.

**Circuits contract (ERC-721, one per processor):** `name()`, `symbol()`,
`transistors()` (paired transistor contract), `factory()`,
`ownerOf(uint256)` (circuit owner / existence), `circuitInfo(uint256)` →
`(nIn, nOut, nState, gateCount)` — inputs, outputs, state bits and the number
of gates burned into the circuit.

**Transistors contract (ERC-1155, one per processor):** `cpuName()`,
`cpuSymbol()`, `circuits()` (pairing check), `creator()`, `supplyCap()`,
`minted()`, `mintPrice()` (in OKB wei).

**Opener:** `accountOf(circuits, tokenId)` (the circuit's ERC-6551 container
address), `isOpened(...)`, `isDeployed(...)`, plus `eth_getBalance` on the
container.

**Market:** `listingFor(circuits, tokenId)` → `(id, seller, price, valid)` —
used for the "listed for sale" field and the non-owner-listing red flag.

**Multicall3** (`0xcA11bde05977b3631167028862bE2a173976CA11`): `aggregate3`
batches of `cpuAt()` to resolve a circuits address back to its CPU index.

### Safety checks (all computed from the reads above)

1. **Factory registration** — `isCPU()` is the ground truth; imitations fail.
2. **Official-app certification** — whether the circuits contract is on the
   certified list shipped in TapeOut's official app for X Layer (today that
   list contains exactly one processor, TAPELIQUID, CPU 265).
3. **Pair consistency** — circuits and transistors contracts must name each
   other.
4. **Factory pointer** — `circuits.factory()` must be the official factory.
5. **Supply consistency** — `minted()` must not exceed `supplyCap()`; a fully
   minted supply is flagged because secondary purchases are then the only
   way in.
6. **Listing consistency** — a market listing whose seller is not the
   circuit's current owner is flagged as a red alert.
7. **Container status** — opened/deployed (live on-chain account) vs never
   opened (pure circuit NFT, no DeWEB presence yet).

### What a passport does NOT claim

- **PoD / DeWEB status:** TapeOut's official app enables only the *containers*
  feature on X Layer (PoD mining and DeWEB are BNB Chain features in the app
  configuration), so there is no X Layer PoD/DeWEB registry to read. The
  passport reports the container state, which is the X Layer equivalent, and
  does not invent a PoD/DeWEB field.
- **Not an audit.** A passport verifies identity and consistency of what the
  contracts publicly expose. It says nothing about whether a circuit's logic
  is correct or safe to interact with.
- **RPC trust.** Reads come from public RPC endpoints. For high-value
  decisions, cross-check addresses on the OKLink explorer
  (https://www.oklink.com/xlayer).

## Files

- `index.html` — the whole app (static, no build step)
- `js/chain.js` — read-only chain layer (also loadable in Node for testing)
- `js/app.js` — UI
- `css/style.css` — styling (system fonts, no external assets)
- `VERIFICATION.md` — live values read while building this, with block numbers

## License

MIT — see `LICENSE`.
