# Prompts that reproduce this repo

These three prompts, given to an AI coding assistant in order, should produce a repo with the same behavior and structure as this one. They were written **after** the project was built, from what the final code does. They are not the prompts I actually used; those are in [`PROMPTS.md`](PROMPTS.md).

Attach the project brief (`attachment.txt`) and the two YottaFlex PDFs to prompt 1. Run `node gen.js --full` after each prompt and do not move on while it exits non-zero.

Expected results with the exact numbers below: 0 validation failures, 50 of 50 injected issues found, two runs identical. Row counts will match; metric values depend on the random stream, so small drift in the pick-distance, throughput and replenishment percentages is normal if the assistant orders its random calls differently.

---

## Prompt 1: data generator, rules, validation (Node, no dependencies)

```
Build a dependency-free Node 18+ project in a new folder `warehouse-slotting` that generates synthetic warehouse slotting data per the attached brief. Use plain JavaScript files that also run in a browser (no `require` without a `typeof module` guard, use `globalThis.WS` for the browser namespace).

FILES
- dict.js: the single source of truth. Export DICT (per table: pk, and fields as [name, type, required, unit, allowed, rule]), FKS (child, field, parent), ORDER (table order), ISSUES, toMarkdown() and toDDL() (SQLite-style CREATE TABLE with FKs plus a GroundTruth table).
- engine.js: gen(params, stageCallback), validate(db), detect(db), toCSV, toSQL, checksum (FNV-1a 32-bit), fields(table), PRESETS, TABLES.
- gen.js: CLI. Flags --starter (default), --full, --large, --seed, --warehouses, --locations, --skus, --lines, --inject, --out, --sql, --json. It generates twice and compares every table byte for byte, writes one CSV per table plus ground_truth.csv and manifest.json (command, scale, params, node version, source statement "Fully synthetic", per-table rows + fnv1a + sha256, reproducibility result, validation results before and after injection, detector-vs-ground-truth result, metrics). Exit code is non-zero if any validation, detection or reproducibility check fails.
- DATA_DICTIONARY.md generated from dict.js.

PRESETS: full = seed 20261022, 20 warehouses, 10,000 locations, 5,000 SKUs, 100,000 order lines, 10 injected cases per type. starter = same seed, 4 warehouses, 800 locations, 400 SKUs, 4,000 lines, 2 per type. large = 40 warehouses, 20,000 locations, 10,000 SKUs, 400,000 lines, 10 per type.

PRNG: mulberry32 only. No Math.random, no wall clock. Dates are day offsets from 2026-01-01 converted to ISO strings.

TABLES (11): Warehouse, Zone, Location, SKU, SKUProfile, Order, OrderLine, PickEvent, Replenishment, SlotAssignment, AisleBlock (AisleBlock models blocked aisles). IDs: WH-001; zone Z001; LOC-<zone-id>-000001 (global counter); SKU-000001; ORD-2026-000001 (assigned after sorting orders by date then warehouse); ORD-line id <order-id>-L01; PICK-<order-id>-001; SLOT-2026-000001; REPL-2026-000001; BLK-2026-000001. Every field gets type, required flag, unit, allowed values and a rule in DICT.

GENERATION ORDER AND RULES
1. Warehouses, then 4 zones each (60% AMBIENT, 12% COLD, 10% HAZMAT, rest BULK). Locations: 60 per aisle (20 bays x 3 levels), aisle = floor(i/60)+1, x = aisle*3 m, y = bay*1.2 m, dock_distance = x+y. AMBIENT/COLD/HAZMAT size: width and height each random from 40/50/60 cm, depth 60; max weight by level 60/40/30 kg. BULK: 100x200x100 cm, max weight 600/400/300 kg. Volume derived.
2. SKUs split evenly per warehouse. Class draw: 5% oversized (L 101-180, W 40-90, H 30-90, 40-280 kg), 8% hazard (flammable or corrosive), 10% cold chain, rest ambient. Hazard and cold: L 5-40, W 5-35, H 3-35, 0.1-25 kg. Ambient: 10% bulky (L 5-58, W and H 41-58), otherwise L 5-45, W 5-38, H 3-38; 5% heavy (30-55 kg) else 0.1-25 kg. 10% of SKUs are "seasonal" (internal only).
3. Demand: Zipf-like weight 1/rank^0.9 per warehouse with a random rank permutation. Peak windows (day offsets) 59-73 and 257-283 have 3x order volume; seasonal SKUs get 6x weight during peaks. Orders: 1-5 lines (random), quantity 1+floor(r*r*12), shipped 1-3 days after order date, last order day = 294. A SKU never repeats within an order. Exactly lines/warehouse count per warehouse.
4. SKUProfile derived from realised lines: picks_total, velocity class A/B/C by cumulative line share before the SKU (<80% A, <95% B, else C), oversized = longest side > 100 cm.
5. Zone compatibility: oversized -> BULK, hazard -> HAZMAT, cold -> COLD, else AMBIENT. A SKU must also fit the location (length<=depth, width<=width, height<=height, weight<=max weight, no rotation). Baseline slotting: random compatible free fitting location. Optimized: SKUs sorted by picks descending, each takes the nearest-to-dock free fitting location. Persist both as SlotAssignment rows: BASELINE from 2026-01-01 to 2026-06-30 (SUPERSEDED), OPTIMIZED from 2026-07-01 (ACTIVE, empty end date). Never overwrite history.
6. PickEvent per order line: picked_at = order date or +1 day (never after shipped), location = slot in force on that date, aisle from the location, distance = 2 x dock distance, layout label BASELINE/OPTIMIZED.
7. Replenishment by simulation over picks in date order: slot capacity = clamp(floor(0.6 x location volume / SKU volume), 2, 200); start full; when stock <= floor(25% of capacity) refill to capacity; labor minutes = 5 + 0.1 x qty + 0.05 x dock metres. Warehouse labor capacity per day = ceil(115% of its busiest simulated day), at least 60.
8. Valid AisleBlocks: 3 per warehouse, 1-3 days, only on aisle/day windows with zero picks.
9. Metrics replay the same demand under both layouts (counterfactual, whole year): total and average pick distance, class-A distance, replenishment tasks and labor, peak-day labor / capacity, lines per labor hour (walk 1.2 m/s, 30 s handling per line, round trip to dock, plus replenishment minutes), delta percentages, monthly line counts, velocity mix. Compute before injecting edge cases.
10. Validate clean data (expect 0 failures and 0 detector hits), then inject labelled edge cases as NEW rows only (never edit valid rows), K per type: SKU_EXCEEDS_LOCATION_CAPACITY (extra slot on a free ambient location the ambient SKU does not fit), INCOMPATIBLE_COLOCATED (hazard/cold SKU slotted in a wrong zone type, still fitting), DUPLICATE_ACTIVE_LOCATION (second SKU on an already active optimized location), PICK_USES_BLOCKED_AISLE (one-day AisleBlock on a day with exactly one pick in that aisle), REPLEN_EXCEEDS_LABOR_CAPACITY (add replenishment tasks until one warehouse-day passes capacity). Injected slots get a random October start date and injected blocks a random reason, so injected rows carry no tell. Write ground truth rows: issue_id ISS-0001, issue_type, entity_type, entity_id, note with the expected decision. Ground truth must live in its own table/file and never be read by detect().
11. detect(db) implements each rule from the input tables only. The run reports expected vs found, TP, FP, FN; all must be perfect.

VALIDATION (60+ checks, each reporting violations and an example id): PK uniqueness per table, FK integrity for every relationship, required/type/enum per table, ID format per table, date ordering, arithmetic reconciliation (location volume and dock distance, SKU volume and oversized flag, order totals vs lines, picks_total, velocity class recomputed, pick distance, replenishment labor), no SKU repeated within an order, warehouse consistency across SKU/order/location/pick/slot, lifecycle (ACTIVE iff no end date, end >= start), pick and replenishment location equals a slot in force on that date.

Also write the SQL exporter (DDL then multi-row INSERTs, 500 rows each) and stage callbacks: 'Warehouses, zones, locations', 'SKUs', 'Orders and demand', 'Slotting both layouts', 'Pick events', 'Replenishment', 'Metrics on both layouts', 'Edge cases and validation'.

Done when: `node gen.js` and `node gen.js --full --out data/full` exit 0, with row counts Location 10000, SKU 5000, OrderLine 100000, ground truth 50, and the second run identical to the first.
```

---

## Prompt 2: web UI (GitHub Pages ready, modern and classic layouts)

```
Add a static `index.html` that loads dict.js and engine.js, works on GitHub Pages and by opening the file, and needs no build step. Keep the generator code unchanged except for what is listed.

BIG DATA
- worker.js (importScripts dict.js, engine.js, session.js) and session.js (makeSession(post) used by both the worker and a main-thread fallback when `new Worker` fails, for example on file://). The worker keeps the generated database and posts only a summary: params, ms, reproducibility result (or null), per-table row counts and FNV checksums, metrics, validation report, ground-truth rows, detector counts by issue type, heatmap cells for the first warehouse (aisle, bay, level, picks under baseline, picks under optimized, -1 if empty), SKU mix. Support messages: run (with a verify flag that generates twice and compares every table's CSV), rows (paged slice), csv, sql. CSV and SQL are built only on request.
- UI: scale select (starter/full/large with a one-line hint each), seed, a "Verify reproducibility" tick box (off by default for large), progress bar driven by the 8 stage callbacks, Cancel (terminates the worker), a paged data explorer (20 rows per page) with Prev/Next and table tabs. Render all generated text with textContent, never innerHTML.

MODERN LAYOUT (default)
- Concept: a warehouse-floor control room. Dark first with a light variant via prefers-color-scheme, tokens on :root. Fonts: Bricolage Grotesque (display), Instrument Sans (body), JetBrains Mono (data), loaded from Google Fonts with system fallbacks. Amber floor-marking accent, hazard-tape divider, scrolling ticker, sticky frosted nav with a Modern/Classic switch.
- Hero: headline "Fast movers near the dock." with a word-by-word rise, and a canvas floor (22x12 slots, 168 SKUs coloured by velocity class A/B/C). A picker dot walks dock -> slot -> dock paths. Items morph between a random layout and a velocity-ranked layout (Auto / Baseline / Optimized buttons) while an "average round trip per pick" readout recomputes live from item positions and demand weights. Pause when off screen, static optimized layout under prefers-reduced-motion.
- Sections: How it works (4 steps), Results (count-up KPI tiles for distance, throughput, replenishment labor, issues detected, validation failures; baseline vs optimized bars; monthly demand chart with the two peak windows highlighted; before/after slot heatmaps for the first warehouse), Edge cases (a bento card per issue type with detected-of-expected pill and an example note), Run it (controls, data explorer, table checksums, compatibility rules, collapsible validation list). Scroll reveal that never leaves content hidden. No cursor-following glow or hover glow effects on cards or buttons.

CLASSIC LAYOUT (same page, switch in the nav, remembered in localStorage and `?view=classic`)
- Reproduce the original plain page: title and sub line, one controls card (scale, seed, verify, Generate, Cancel, status), then stacked cards: Reproducibility, Tables (rows and checksums plus CSV/SQL chips), Baseline vs optimized table (7 rows with a Change column), Order lines per month bars, Validation (OK/FAIL list), Injected edge cases vs detector with the ground-truth table. System font, light #f6f5f1 / dark #161614 palette, blue accent. Both layouts' controls stay in sync.

Test in headless Chromium: starter run completes, repro text appears, paging works, full run finishes while the page stays responsive, CSV download works, cancel works, file:// fallback works, no horizontal scroll at 400 px, no console errors.
```

---

## Prompt 3: documentation, honesty checks and publishing

```
Write the documentation and verify the repo against the brief and the YottaFlex guidelines.

1. README.md: centered hero with an SVG banner (assets/banner.svg: dark gradient, a rack-grid heatmap where slots near a vertical DOCK bar are amber and far ones are blue/grey, title "Warehouse Slotting Lab"), static shields.io badges (node, dependencies 0, seed, reproducible, validation, anomaly detection, AI disclosure), a highlights row, quick start with every CLI flag, results table (copy the numbers from data/full/manifest.json, do not invent), Mermaid architecture and ER diagrams, data model notes (cardinalities, bridge table SlotAssignment, IDs, lifecycle), generation logic table, edge-case table with injection and detector rule, collapsible validation / assumptions / limitations, reproducibility, a section "Handling big data in the browser", an AI-use section pointing to PROMPTS.md, repo layout. State the weak spots honestly (for example peak-day capacity ratio is unstable across seeds; no deliberate exact-fit boundary case; single-SKU slots; Manhattan distance to one dock).
2. PROMPTS.md: every prompt actually sent, verbatim, in order, plus where AI was used and how it was verified. Do not hide or remove any AI traces; the guidelines require disclosure. Leave a clearly marked place for the author to describe what they personally reviewed and changed.
3. Cross-check: confirm DATA_DICTIONARY.md is regenerated from dict.js, committed data/full matches a fresh `node gen.js --full` (compare sha256 in manifest.json), README numbers match the manifest, and no tell separates injected rows from valid rows (dates, reasons, patterns).
4. Commit with meaningful messages on main, push to the public GitHub repo, then tell the user how to enable Pages (Settings, Pages, Deploy from a branch, main, /) and to paste the About description and topics (the assistant cannot set them).
```

---

## How to check the result

| Check | Command | Expect |
|---|---|---|
| Starter run | `node gen.js` | exit 0, 0 failures, 10/10 found |
| Full run | `node gen.js --full` | exit 0, 50/50 found, reproducible true |
| Large run | `node gen.js --large` | exit 0 (about 35 s for the two runs) |
| UI | open `index.html` | starter results appear at once, Modern/Classic switch works |
