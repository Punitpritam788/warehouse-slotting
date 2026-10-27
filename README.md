# Warehouse Slotting Lab

Place SKUs into warehouse locations using demand velocity, dimensions and compatibility, then measure pick-distance, throughput and replenishment impact. Synthetic data only. Pure JavaScript, no dependencies.

**Website:** open `index.html` (or enable GitHub Pages on this repo, branch `main`, folder `/`). It generates the data in the browser, shows validation and the baseline vs optimized comparison, and downloads CSV/SQL.

## Run

```bash
node gen.js                 # starter: 4 warehouses, 800 locations, 400 SKUs, 4,000 lines
node gen.js --full          # 20 warehouses, 10,000 locations, 5,000 SKUs, 100,000 lines (~6 s)
node gen.js --full --seed 7 --out /tmp/x --sql --json   # other seed / outputs
```

Needs Node 18+. Exit code is non-zero if any validation, anomaly-detection or reproducibility check fails. Output goes to `data/<scale>/`: one CSV per table, `ground_truth.csv`, `manifest.json` (command, seed, row counts, SHA-256 + FNV-1a checksums, validation results, metrics). `--sql` adds `seed.sql` (DDL + inserts), `--json` adds `all.json`.

Committed: `data/starter` (everything) and `data/full` (CSV + manifest).

## Design

- **Single source of truth:** `dict.js` holds the data dictionary (types, units, enums, rules) and foreign keys. It drives validation, `DATA_DICTIONARY.md` and the SQL DDL.
- **Generation order:** Warehouse > Zone > Location > SKU > Order/OrderLine > SKUProfile > SlotAssignment > PickEvent > Replenishment > AisleBlock. Everything uses one seeded PRNG (mulberry32, seed 20261022).
- **IDs:** `WH-001`, `LOC-<zone>-000001`, `SKU-000001`, `ORD-2026-000001`, `PICK-<order-id>-001`, `SLOT-2026-000001`. Extra tables: `REPL-2026-`, `BLK-2026-`.
- **Demand:** Zipf-like SKU popularity per warehouse; two peak windows (3x order volume, 10% seasonal SKUs 6x). Velocity class A/B/C is *derived* from realised order lines (80% / 95% cumulative share).
- **Compatibility:** oversized goods go to BULK zones, hazard goods to HAZMAT, cold goods to COLD, rest to AMBIENT. A SKU must also fit the location (length/width/height/weight, no rotation).
- **Slotting:** BASELINE = velocity-blind random compatible fit (Jan 1 to Jun 30). OPTIMIZED = hottest SKU takes the nearest compatible free location (from Jul 1). Both are kept as dated `SlotAssignment` rows; history is never overwritten (old rows become SUPERSEDED).
- **Derived, not random:** pick location = slot in force on `picked_at`; travel distance = 2 x dock distance; replenishment triggers at 25% of slot capacity, refills to capacity, labor = 5 + 0.1 x qty + 0.05 x dock m min; warehouse labor capacity = 115% of its busiest day.
- **Comparison:** `manifest.json > metrics` replays the *same* demand under both layouts (walk 1.2 m/s, 30 s per line), so distance, throughput and replenishment are like for like.

## Edge cases and ground truth

Edge cases are injected as **new labelled rows** after clean data is validated, so valid rows are never corrupted.

| issue_type | How injected | Detector rule |
|---|---|---|
| SKU_EXCEEDS_LOCATION_CAPACITY | extra slot in a free location the SKU does not fit | dimension/weight check |
| INCOMPATIBLE_COLOCATED | hazard/cold SKU slotted in the wrong zone type | SKU class vs zone type |
| DUPLICATE_ACTIVE_LOCATION | second SKU on a location already active | overlapping slot dates on one location |
| PICK_USES_BLOCKED_AISLE | an `AisleBlock` placed over a day with exactly one pick in that aisle | pick inside a block window |
| REPLEN_EXCEEDS_LABOR_CAPACITY | extra replen tasks until one warehouse-day passes capacity | daily labor sum > capacity |

`ground_truth.csv` is separate. The detector (`engine.js > detect`) reads only input tables, and the run compares its output to the ground truth (precision and recall must be 1.0; full run: 50 expected, 50 found, 0 false positives).

## How I know it works

- 40+ validation checks: PK uniqueness, FK integrity, enums/required/types, ID formats, date ordering, arithmetic reconciliation (volumes, order totals, picks_total, velocity class, distances, labor minutes), lifecycle (ACTIVE <=> no end date), pick location matches slot in force. Zero failures on clean data and after injection.
- The detector flags 0 rows on clean data and exactly the injected rows afterwards.
- Reproducibility: `gen.js` generates twice in the same run and compares every table byte for byte (checksums in the manifest). Result: identical.
- `index.html` was loaded in headless Chromium: same counts and same result in the browser.

Full-scale result (seed 20261022): average pick distance -46.6%, lines per labor hour +15.1%, replenishment labor -7.4% (optimized vs baseline).

## Limitations

- Single-SKU slots; no multi-slot or forward/reserve pick faces. Orientation is fixed.
- Pick distance is Manhattan to a single dock, not a full pick-path/TSP simulation. "Blocked aisle" is checked on the aisle of the pick, not on a route.
- Re-slotting is one big-bang on Jul 1 with no move-labor cost.
- Replenishment is a simple refill-to-capacity rule; the optimizer ignores slot capacity and ergonomics (levels).
- Fully synthetic; no external data, so no licensing concerns.

## Files

`index.html` UI - `engine.js` generator, validator, detector - `dict.js` dictionary/FKs - `gen.js` CLI - `DATA_DICTIONARY.md` - `PROMPTS.md` AI disclosure - `data/` outputs
