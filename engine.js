// Seeded generator + validator + anomaly detector. Runs unchanged in Node (gen.js) and the browser (index.html).
(function (E) {
  const W = typeof module !== 'undefined' ? require('./dict.js') : globalThis.WS;
  const { DICT, FKS, ORDER } = W;
  const pad = (n, w) => String(n).padStart(w, '0');
  const r1 = x => Math.round(x * 10) / 10, r2 = x => Math.round(x * 100) / 100;
  const D0 = Date.UTC(2026, 0, 1);
  const iso = d => new Date(D0 + d * 864e5).toISOString().slice(0, 10);
  const RESLOT = 181, LAST_DAY = 294;           // 2026-07-01 re-slot; last order 2026-10-22 (ships by 10-25)
  const isPeak = d => (d >= 59 && d <= 73) || (d >= 257 && d <= 283);
  const rng = seed => { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ t >>> 15, t | 1); t ^= t + Math.imul(t ^ t >>> 7, t | 61); return ((t ^ t >>> 14) >>> 0) / 4294967296; }; };
  const bis = (c, x) => { let lo = 0, hi = c.length - 1; while (lo < hi) { const m = (lo + hi) >> 1; c[m] >= x ? hi = m : lo = m + 1; } return lo; };
  const fits = (p, l) => p.length_cm <= l.depth_cm && p.width_cm <= l.width_cm && p.height_cm <= l.height_cm && p.weight_kg <= l.max_weight_kg;
  const zoneOf = p => p.oversized === 'Y' ? 'BULK' : p.hazard_class !== 'NONE' ? 'HAZMAT' : p.temp_class === 'COLD' ? 'COLD' : 'AMBIENT';
  const replenMin = (q, dock) => r2(5 + 0.1 * q + 0.05 * dock);
  const capOf = (s, l) => Math.max(2, Math.min(200, Math.floor(0.6 * l.volume_cm3 / s.volume_cm3)));
  const GT_FIELDS = ['issue_id', 'issue_type', 'entity_type', 'entity_id', 'note'];

  E.PRESETS = {
    full: { seed: 20261022, warehouses: 20, locations: 10000, skus: 5000, lines: 100000, inject: 10 },
    large: { seed: 20261022, warehouses: 40, locations: 20000, skus: 10000, lines: 400000, inject: 10 },
    starter: { seed: 20261022, warehouses: 4, locations: 800, skus: 400, lines: 4000, inject: 2 },
  };

  // velocity class per warehouse from pick counts: [{id,n}] -> Map id->class
  function velocity(list) {
    const m = new Map(), tot = list.reduce((a, x) => a + x.n, 0); let cum = 0;
    [...list].sort((a, b) => b.n - a.n || (a.id < b.id ? -1 : 1)).forEach(x => { m.set(x.id, !tot || cum / tot >= 0.95 ? 'C' : cum / tot >= 0.8 ? 'B' : 'A'); cum += x.n; });
    return m;
  }

  E.gen = function (p, stage) {
    stage = stage || function () {};
    const R = rng(p.seed), ri = (a, b) => a + Math.floor(R() * (b - a + 1)), rf = (a, b) => a + R() * (b - a), pick = a => a[Math.floor(R() * a.length)];
    const shuffle = a => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(R() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
    const nW = p.warehouses, split = (t, i) => Math.floor(t / nW) + (i < t % nW ? 1 : 0);
    const db = {}; ORDER.forEach(t => db[t] = []); db.GroundTruth = [];

    // 1. Warehouse -> Zone -> Location (parents first)
    stage('Warehouses, zones, locations');
    const wh = []; let zc = 0, lc = 0;
    for (let i = 0; i < nW; i++) {
      const w = { id: 'WH-' + pad(i + 1, 3), wi: i, locs: { AMBIENT: [], COLD: [], HAZMAT: [], BULK: [] }, skus: [], by: { AMBIENT: [], COLD: [], HAZMAT: [], BULK: [] } };
      wh.push(w);
      db.Warehouse.push({ warehouse_id: w.id, name: 'Fulfilment Centre ' + (i + 1), status: 'ACTIVE', labor_capacity_min_per_day: 0, opened_date: `20${ri(15, 24)}-${pad(ri(1, 12), 2)}-01` });
      const n = split(p.locations, i), c = [Math.round(n * .6), Math.round(n * .12), Math.round(n * .1)]; c.push(n - c[0] - c[1] - c[2]);
      let idx = 0;
      ['AMBIENT', 'COLD', 'HAZMAT', 'BULK'].forEach((zt, k) => {
        const zid = 'Z' + pad(++zc, 3);
        db.Zone.push({ zone_id: zid, warehouse_id: w.id, zone_type: zt, temp_class: zt === 'COLD' ? 'COLD' : 'AMBIENT', hazard_allowed: zt === 'HAZMAT' ? 'Y' : 'N', oversized_ok: zt === 'BULK' ? 'Y' : 'N' });
        for (let j = 0; j < c[k]; j++, idx++) {
          const aisle = Math.floor(idx / 60) + 1, bay = Math.floor(idx % 60 / 3) + 1, level = idx % 3 + 1, bulk = zt === 'BULK';
          const width = bulk ? 100 : pick([40, 50, 60]), depth = bulk ? 200 : 60, height = bulk ? 100 : pick([40, 50, 60]), x = aisle * 3, y = Math.round(bay * 12) / 10;
          const L = { location_id: `LOC-${zid}-${pad(++lc, 6)}`, zone_id: zid, warehouse_id: w.id, aisle_no: aisle, bay_no: bay, level_no: level, x_m: x, y_m: y, dock_distance_m: r1(x + y), width_cm: width, depth_cm: depth, height_cm: height, volume_cm3: width * depth * height, max_weight_kg: (bulk ? [600, 400, 300] : [60, 40, 30])[level - 1], status: 'ACTIVE' };
          db.Location.push(L); w.locs[zt].push(L);
        }
      });
    }

    // 2. SKU (+ demand weight, seasonal flag; both internal, not exported)
    stage('SKUs');
    let sc = 0; const CATS = { AMBIENT: ['Tools', 'Stationery', 'Toys', 'Kitchen', 'Apparel'], COLD: ['Dairy', 'Pharma', 'Frozen'], HAZMAT: ['Aerosols', 'Solvents', 'Batteries'], BULK: ['Furniture', 'Appliances', 'Pallet goods'] };
    wh.forEach((w, i) => {
      const n = split(p.skus, i), ranks = shuffle(Array.from({ length: n }, (_, k) => k + 1));
      for (let j = 0; j < n; j++) {
        const u = R(), zt = u < .05 ? 'BULK' : u < .13 ? 'HAZMAT' : u < .23 ? 'COLD' : 'AMBIENT';
        let l, wd, h, wt, haz = 'NONE', tmp = 'AMBIENT';
        if (zt === 'BULK') { l = rf(101, 180); wd = rf(40, 90); h = rf(30, 90); wt = rf(40, 280); }
        else if (zt === 'AMBIENT') { const b = R() < .1; l = rf(5, b ? 58 : 45); wd = b ? rf(41, 58) : rf(5, 38); h = b ? rf(41, 58) : rf(3, 38); wt = R() < .05 ? rf(30, 55) : rf(.1, 25); }
        else { l = rf(5, 40); wd = rf(5, 35); h = rf(3, 35); wt = rf(.1, 25); if (zt === 'HAZMAT') haz = pick(['FLAMMABLE', 'CORROSIVE']); else tmp = 'COLD'; }
        l = r1(l); wd = r1(wd); h = r1(h);
        const cat = pick(CATS[zt]), id = 'SKU-' + pad(++sc, 6);
        const s = { id, wi: i, zt, seasonal: R() < .1, dw: 1 / Math.pow(ranks[j], .9), length_cm: l, width_cm: wd, height_cm: h, weight_kg: r2(wt), volume_cm3: Math.round(l * wd * h), oversized: Math.max(l, wd, h) > 100 ? 'Y' : 'N', hazard_class: haz, temp_class: tmp, picks: 0 };
        s.row = { sku_id: id, sku_name: `${cat} item ${sc}`, category: cat, home_warehouse_id: w.id, status: 'ACTIVE', created_date: `2025-${pad(ri(1, 12), 2)}-${pad(ri(1, 28), 2)}` };
        db.SKU.push(s.row); w.skus.push(s); w.by[zt].push(s);
      }
    });

    // 3. Orders / lines: Zipf demand per SKU, peak windows (3x volume, seasonal SKUs 6x)
    stage('Orders and demand');
    const cumD = []; for (let d = 0, c = 0; d <= LAST_DAY; d++) cumD.push(c += isPeak(d) ? 3 : 1);
    const raw = [];
    wh.forEach((w, wi) => {
      const mk = f => { let c = 0; return w.skus.map(s => c += f(s)); }, cN = mk(s => s.dw), cP = mk(s => s.dw * (s.seasonal ? 6 : 1));
      for (let rem = split(p.lines, wi); rem > 0;) {
        const day = bis(cumD, R() * cumD[cumD.length - 1]), c = isPeak(day) ? cP : cN, k = Math.min(ri(1, 5), rem), seen = new Set(), lines = [];
        for (let a = 0; a < k; a++) { let s; for (let t = 0; t < 5; t++) { s = w.skus[bis(c, R() * c[c.length - 1])]; if (!seen.has(s)) break; } seen.add(s); lines.push({ sku: s, qty: 1 + Math.floor(R() * R() * 12) }); }
        raw.push({ wi, day, ship: day + ri(1, 3), lines }); rem -= k;
      }
    });
    raw.sort((a, b) => a.day - b.day || a.wi - b.wi);
    const recs = [];                                   // one per order line
    raw.forEach((o, i) => {
      const oid = `ORD-2026-${pad(i + 1, 6)}`;
      db.Order.push({ order_id: oid, warehouse_id: wh[o.wi].id, order_date: iso(o.day), shipped_date: iso(o.ship), status: 'SHIPPED', total_lines: o.lines.length, total_units: o.lines.reduce((a, l) => a + l.qty, 0) });
      o.lines.forEach((l, k) => {
        const olid = `${oid}-L${pad(k + 1, 2)}`; l.sku.picks++;
        db.OrderLine.push({ order_line_id: olid, order_id: oid, line_no: k + 1, sku_id: l.sku.id, quantity: l.qty });
        recs.push({ oid, olid, ln: k + 1, sku: l.sku, qty: l.qty, wi: o.wi, od: o.day, pd: o.day + (R() < .5 ? 0 : 1) });
      });
    });

    // 4. SKUProfile: velocity derived from realised picks
    wh.forEach(w => {
      const v = velocity(w.skus.map(s => ({ id: s.id, n: s.picks })));
      w.skus.forEach(s => { s.vel = v.get(s.id); db.SKUProfile.push({ sku_id: s.id, length_cm: s.length_cm, width_cm: s.width_cm, height_cm: s.height_cm, weight_kg: s.weight_kg, volume_cm3: s.volume_cm3, oversized: s.oversized, hazard_class: s.hazard_class, temp_class: s.temp_class, picks_total: s.picks, velocity_class: s.vel, effective_from: '2026-01-01' }); });
    });

    // 5. Slotting. BASELINE = velocity-blind random compatible fit; OPTIMIZED = hottest SKU -> nearest compatible fit.
    stage('Slotting both layouts');
    const place = (w, order, scan) => {
      const used = new Set();
      for (const s of order) {
        const pool = scan(w.locs[s.zt]); let hit = null;
        for (const l of pool) if (!used.has(l.location_id) && fits(s, l)) { hit = l; break; }
        if (!hit) throw new Error(`No compatible free location for ${s.id} in ${w.id}; raise locations or lower skus`);
        used.add(hit.location_id); s.cur = hit;
      }
    };
    wh.forEach(w => {
      place(w, shuffle([...w.skus]), pool => { const st = Math.floor(R() * pool.length); return pool.slice(st).concat(pool.slice(0, st)); });
      w.skus.forEach(s => s.base = s.cur);
      place(w, [...w.skus].sort((a, b) => b.picks - a.picks || (a.id < b.id ? -1 : 1)), pool => [...pool].sort((a, b) => a.dock_distance_m - b.dock_distance_m || (a.location_id < b.location_id ? -1 : 1)));
      w.skus.forEach(s => s.opt = s.cur);
    });
    let slotN = 0;
    const addSlot = (s, l, strategy, from, to) => { const r = { slot_id: `SLOT-2026-${pad(++slotN, 6)}`, sku_id: s.id, location_id: l.location_id, warehouse_id: l.warehouse_id, strategy, status: to ? 'SUPERSEDED' : 'ACTIVE', effective_from: from, effective_to: to || '' }; db.SlotAssignment.push(r); return r; };
    const allSkus = wh.flatMap(w => w.skus);
    allSkus.forEach(s => addSlot(s, s.base, 'BASELINE', '2026-01-01', iso(RESLOT - 1)));
    allSkus.forEach(s => addSlot(s, s.opt, 'OPTIMIZED', iso(RESLOT), ''));
    const actual = (s, d) => d < RESLOT ? s.base : s.opt;

    // 6. PickEvent: location = slot in force on picked_at
    stage('Pick events');
    recs.forEach(r => {
      const l = actual(r.sku, r.pd);
      r.pick = { pick_id: `PICK-${r.oid}-${pad(r.ln, 3)}`, order_line_id: r.olid, order_id: r.oid, sku_id: r.sku.id, warehouse_id: wh[r.wi].id, location_id: l.location_id, aisle_no: l.aisle_no, picked_at: iso(r.pd), quantity: r.qty, travel_distance_m: r1(2 * l.dock_distance_m), layout: r.pd < RESLOT ? 'BASELINE' : 'OPTIMIZED' };
      db.PickEvent.push(r.pick);
    });

    // 7. Replenishment: refill-to-capacity when stock <= 25% of slot capacity (generic over any layout)
    stage('Replenishment');
    const byDay = [...recs].sort((a, b) => a.pd - b.pd);
    const sim = locOf => {
      const st = new Map(), out = [];
      for (const r of byDay) {
        const l = locOf(r.sku, r.pd); let s = st.get(r.sku);
        if (!s || s.key !== l.location_id) { const cap = capOf(r.sku, l); s = { key: l.location_id, cap, stock: cap }; st.set(r.sku, s); }
        s.stock = Math.max(0, s.stock - r.qty);
        if (s.stock <= Math.floor(s.cap * .25)) { const q = s.cap - s.stock; out.push({ sku: r.sku, loc: l, day: r.pd, qty: q, min: replenMin(q, l.dock_distance_m), wi: r.wi }); s.stock = s.cap; }
      }
      return out;
    };
    const dayLoad = new Map(), addLoad = (wi, d, m) => dayLoad.set(wi * 1000 + d, (dayLoad.get(wi * 1000 + d) || 0) + m);
    let rn = 0;
    const addRepl = x => { db.Replenishment.push({ replen_id: `REPL-2026-${pad(++rn, 6)}`, warehouse_id: wh[x.wi].id, sku_id: x.sku.id, location_id: x.loc.location_id, replen_date: iso(x.day), quantity: x.qty, labor_minutes: x.min, trigger: 'LOW_STOCK', status: 'COMPLETED' }); };
    sim(actual).forEach(x => { addRepl(x); addLoad(x.wi, x.day, x.min); });
    wh.forEach((w, i) => { let m = 0; for (let d = 0; d <= LAST_DAY + 3; d++) m = Math.max(m, dayLoad.get(i * 1000 + d) || 0); db.Warehouse[i].labor_capacity_min_per_day = Math.max(60, Math.ceil(m * 1.15)); });

    // 8. Valid aisle blocks: only windows with zero picks in that aisle
    const pk = new Map(); recs.forEach(r => { const l = actual(r.sku, r.pd), k = `${r.wi}|${l.aisle_no}|${r.pd}`; (pk.get(k) || pk.set(k, []).get(k)).push(r.pick); });
    let bn = 0;
    const addBlock = (wi, aisle, f, t, reason) => { const r = { block_id: `BLK-2026-${pad(++bn, 6)}`, warehouse_id: wh[wi].id, aisle_no: aisle, blocked_from: iso(f), blocked_to: iso(t), reason }; db.AisleBlock.push(r); return r; };
    wh.forEach((w, wi) => {
      for (let n = 0, t = 0; n < 3 && t < 500; t++) {
        const a = ri(1, Math.ceil(db.Location.length / nW / 60)), f = ri(0, LAST_DAY - 3), len = ri(0, 2);
        let free = true; for (let d = f; d <= f + len; d++) if (pk.has(`${wi}|${a}|${d}`)) free = false;
        if (free) { addBlock(wi, a, f, f + len, pick(['MAINTENANCE', 'SPILL', 'RACK_DAMAGE'])); n++; }
      }
    });

    // 9. Metrics (counterfactual: identical demand under each layout) -- computed before anomaly injection
    stage('Metrics on both layouts');
    const metric = locOf => {
      const rep = sim(locOf); let dist = 0, distA = 0, nA = 0; const dl = new Map();
      recs.forEach(r => { const d = 2 * locOf(r.sku, r.pd).dock_distance_m; dist += d; if (r.sku.vel === 'A') { distA += d; nA++; } });
      rep.forEach(x => dl.set(x.wi * 1000 + x.day, (dl.get(x.wi * 1000 + x.day) || 0) + x.min));
      let peakUtil = 0; dl.forEach((m, k) => peakUtil = Math.max(peakUtil, m / db.Warehouse[Math.floor(k / 1000)].labor_capacity_min_per_day));
      const repMin = rep.reduce((a, x) => a + x.min, 0), laborH = (dist / 1.2 + recs.length * 30) / 3600 + repMin / 60;
      return { pick_lines: recs.length, total_pick_distance_m: Math.round(dist), avg_distance_per_line_m: r2(dist / recs.length), avg_distance_class_A_m: r2(distA / (nA || 1)), replen_tasks: rep.length, replen_labor_min: Math.round(repMin), peak_day_labor_utilisation: r2(peakUtil), labor_hours: r2(laborH), lines_per_labor_hour: r2(recs.length / laborH) };
    };
    const metrics = { baseline: metric((s) => s.base), optimized: metric((s) => s.opt), assumptions: 'walk 1.2 m/s, 30 s handling per line, round trip to dock, replen = 5 + 0.1*qty + 0.05*dock_m min' };
    const b = metrics.baseline, o = metrics.optimized, pc = (x, y) => r2((y - x) / x * 100);
    metrics.delta_pct = { distance: pc(b.total_pick_distance_m, o.total_pick_distance_m), class_A_distance: pc(b.avg_distance_class_A_m, o.avg_distance_class_A_m), replen_tasks: pc(b.replen_tasks, o.replen_tasks), replen_labor: pc(b.replen_labor_min, o.replen_labor_min), throughput: pc(b.lines_per_labor_hour, o.lines_per_labor_hour) };
    metrics.monthly_lines = Array(12).fill(0); db.Order.forEach(x => metrics.monthly_lines[+x.order_date.slice(5, 7) - 1] += x.total_lines);
    metrics.velocity_mix = { A: 0, B: 0, C: 0 }; allSkus.forEach(s => metrics.velocity_mix[s.vel]++);

    const validation_clean = E.validate(db), detections_clean = E.detect(db);

    // 10. Labelled anomaly injection: always NEW rows, never edits to valid rows
    stage('Edge cases and validation');
    const gt = (type, et, id, note) => db.GroundTruth.push({ issue_id: 'ISS-' + pad(db.GroundTruth.length + 1, 4), issue_type: type, entity_type: et, entity_id: id, note });
    const used = new Set(db.SlotAssignment.map(r => r.location_id)), K = p.inject, locById = new Map(db.Location.map(l => [l.location_id, l]));
    const inj = (s, l) => { used.add(l.location_id); return addSlot(s, l, 'OPTIMIZED', '2026-10-01', ''); };
    for (let k = 0, t = 0; k < K && t < 9000; t++) {            // 1: does not fit
      const w = pick(wh), s = pick(w.by.AMBIENT), l = pick(w.locs.AMBIENT);
      if (!s || used.has(l.location_id) || fits(s, l)) continue;
      const r = inj(s, l); k++; gt('SKU_EXCEEDS_LOCATION_CAPACITY', 'SlotAssignment', r.slot_id, `${s.id} ${s.length_cm}x${s.width_cm}x${s.height_cm}cm ${s.weight_kg}kg exceeds ${l.location_id} ${l.depth_cm}x${l.width_cm}x${l.height_cm}cm/${l.max_weight_kg}kg. Expected: reject slot`);
    }
    const dang = allSkus.filter(s => s.zt === 'HAZMAT' || s.zt === 'COLD');
    for (let k = 0, t = 0; k < K && t < 9000 && dang.length; t++) { // 2: wrong zone type
      const s = pick(dang), w = wh[s.wi], zt = pick(['AMBIENT', 'COLD', 'HAZMAT'].filter(z => z !== s.zt)), l = pick(w.locs[zt]);
      if (!l || used.has(l.location_id) || !fits(s, l)) continue;
      const r = inj(s, l); k++; gt('INCOMPATIBLE_COLOCATED', 'SlotAssignment', r.slot_id, `${s.id} (${s.zt} goods) placed in ${zt} zone location ${l.location_id}. Expected: reject slot`);
    }
    const optSlots = db.SlotAssignment.filter(r => r.strategy === 'OPTIMIZED' && r.effective_from === iso(RESLOT)), skuById = new Map(allSkus.map(s => [s.id, s])), dupDone = new Set();
    for (let k = 0, t = 0; k < K && t < 9000; t++) {            // 3: second SKU on an occupied location
      const o2 = pick(optSlots), l = locById.get(o2.location_id), a = skuById.get(o2.sku_id), s = pick(wh[a.wi].by[a.zt]);
      if (s === a || !fits(s, l) || dupDone.has(l.location_id)) continue;
      dupDone.add(l.location_id); const r = addSlot(s, l, 'OPTIMIZED', '2026-10-01', ''); k++;
      gt('DUPLICATE_ACTIVE_LOCATION', 'SlotAssignment', r.slot_id, `${l.location_id} already ACTIVE for ${a.id} (${o2.slot_id}); ${s.id} also assigned. Expected: reject later slot`);
    }
    const singles = shuffle([...pk].filter(([, v]) => v.length === 1));
    for (let k = 0; k < K && k < singles.length; k++) {         // 4: block a day on which exactly one pick used the aisle
      const [key, [pe]] = singles[k], [wi, aisle, day] = key.split('|').map(Number);
      const blk = addBlock(wi, aisle, day, day, 'RACK_DAMAGE');
      gt('PICK_USES_BLOCKED_AISLE', 'PickEvent', pe.pick_id, `Aisle ${aisle} of ${wh[wi].id} blocked on ${iso(day)} (${blk.block_id}) but pick routed through it. Expected: re-route`);
    }
    const doneWD = new Set();
    for (let k = 0, t = 0; k < K && t < 9000; t++) {            // 5: extra replen tasks push one day over capacity
      const wi = ri(0, nW - 1), d = ri(0, LAST_DAY), key = wi * 1000 + d; if (doneWD.has(key)) continue; doneWD.add(key); k++;
      const cap = db.Warehouse[wi].labor_capacity_min_per_day; let tot = dayLoad.get(key) || 0, first = rn + 1, n = 0;
      while (tot <= cap) { const s = pick(wh[wi].skus), l = actual(s, d), q = capOf(s, l), m = replenMin(q, l.dock_distance_m); addRepl({ wi, sku: s, loc: l, day: d, qty: q, min: m }); tot += m; n++; }
      gt('REPLEN_EXCEEDS_LABOR_CAPACITY', 'WarehouseDay', `${wh[wi].id}|${iso(d)}`, `${n} extra replen tasks (REPL-2026-${pad(first, 6)}..${pad(rn, 6)}) bring day to ${r2(tot)} min vs capacity ${cap}. Expected: defer/rebalance`);
    }
    const validation = E.validate(db), detections = E.detect(db), key = x => `${x.issue_type}|${x.entity_type}|${x.entity_id}`;
    const exp = new Set(db.GroundTruth.map(key)), got = new Set(detections.map(key));
    const tp = [...exp].filter(x => got.has(x)).length;
    return { db, metrics, report: { params: p, validation_clean, detections_clean: detections_clean.length, validation, detection: { expected: exp.size, found: got.size, true_positive: tp, false_positive: got.size - tp, false_negative: exp.size - tp } } };
  };

  // Business-rule detector. Reads ONLY input tables (never GroundTruth).
  E.detect = function (db) {
    const out = [], add = (issue_type, entity_type, entity_id) => out.push({ issue_type, entity_type, entity_id });
    const loc = new Map(db.Location.map(l => [l.location_id, l])), zone = new Map(db.Zone.map(z => [z.zone_id, z])), prof = new Map(db.SKUProfile.map(p => [p.sku_id, p]));
    const byLoc = new Map();
    db.SlotAssignment.forEach(s => {
      const l = loc.get(s.location_id), p = prof.get(s.sku_id);
      if (zone.get(l.zone_id).zone_type !== zoneOf(p)) add('INCOMPATIBLE_COLOCATED', 'SlotAssignment', s.slot_id);
      else if (!fits(p, l)) add('SKU_EXCEEDS_LOCATION_CAPACITY', 'SlotAssignment', s.slot_id);
      (byLoc.get(s.location_id) || byLoc.set(s.location_id, []).get(s.location_id)).push(s);
    });
    byLoc.forEach(a => {
      a.sort((x, y) => x.effective_from < y.effective_from ? -1 : x.effective_from > y.effective_from ? 1 : x.slot_id < y.slot_id ? -1 : 1);
      a.forEach((s, i) => { if (a.slice(0, i).some(e => (e.effective_to || '9999') >= s.effective_from && (s.effective_to || '9999') >= e.effective_from)) add('DUPLICATE_ACTIVE_LOCATION', 'SlotAssignment', s.slot_id); });
    });
    const blk = new Map(); db.AisleBlock.forEach(b => { const k = b.warehouse_id + '|' + b.aisle_no; (blk.get(k) || blk.set(k, []).get(k)).push(b); });
    db.PickEvent.forEach(pe => { if ((blk.get(pe.warehouse_id + '|' + pe.aisle_no) || []).some(b => pe.picked_at >= b.blocked_from && pe.picked_at <= b.blocked_to)) add('PICK_USES_BLOCKED_AISLE', 'PickEvent', pe.pick_id); });
    const day = new Map(); db.Replenishment.forEach(r => { const k = r.warehouse_id + '|' + r.replen_date; day.set(k, (day.get(k) || 0) + r.labor_minutes); });
    const cap = new Map(db.Warehouse.map(w => [w.warehouse_id, w.labor_capacity_min_per_day]));
    day.forEach((m, k) => { if (m > cap.get(k.split('|')[0]) + 1e-6) add('REPLEN_EXCEEDS_LABOR_CAPACITY', 'WarehouseDay', k); });
    return out;
  };

  // Structural + arithmetic + lifecycle validation. Returns [{name, bad, ok, example}]
  E.validate = function (db) {
    const res = [], add = (name, bad, ex) => res.push({ name, bad, ok: bad === 0, example: ex || '' });
    const idx = {}, map = {};
    ORDER.forEach(t => { const pk = DICT[t].pk, seen = new Set(); let bad = 0, ex; db[t].forEach(r => { seen.has(r[pk]) ? (bad++, ex = ex || r[pk]) : seen.add(r[pk]); }); idx[t] = seen; map[t] = new Map(db[t].map(r => [r[pk], r])); add('PK unique: ' + t, bad, ex); });
    const dateRe = /^\d{4}-\d\d-\d\d$/;
    ORDER.forEach(t => { let bad = 0, ex; db[t].forEach(r => DICT[t].f.forEach(([n, ty, req, , allowed]) => { const v = r[n]; const empty = v === '' || v == null; let ok = req ? !empty : true; if (ok && !empty) ok = ty === 'int' ? Number.isInteger(v) : ty === 'num' ? Number.isFinite(v) : ty === 'date' ? dateRe.test(v) : typeof v === 'string'; if (ok && !empty && allowed) ok = allowed.includes(v); if (!ok) { bad++; ex = ex || `${r[DICT[t].pk]}.${n}=${v}`; } })); add('Schema/enum/required: ' + t, bad, ex); });
    FKS.forEach(([c, f, p]) => { let bad = 0, ex; db[c].forEach(r => { if (!idx[p].has(r[f])) { bad++; ex = ex || `${r[DICT[c].pk]}.${f}=${r[f]}`; } }); add(`FK ${c}.${f} -> ${p}`, bad, ex); });
    const chk = (name, rows, pred) => { let bad = 0, ex; rows.forEach(r => { if (!pred(r)) { bad++; ex = ex || r[DICT[Object.keys(DICT).find(t => db[t] === rows)].pk]; } }); add(name, bad, ex); };
    const idRe = { Warehouse: /^WH-\d{3}$/, Zone: /^Z\d{3}$/, Location: /^LOC-Z\d{3}-\d{6}$/, SKU: /^SKU-\d{6}$/, Order: /^ORD-2026-\d{6}$/, PickEvent: /^PICK-ORD-2026-\d{6}-\d{3}$/, SlotAssignment: /^SLOT-2026-\d{6}$/, Replenishment: /^REPL-2026-\d{6}$/, AisleBlock: /^BLK-2026-\d{6}$/ };
    Object.entries(idRe).forEach(([t, re]) => chk('ID format: ' + t, db[t], r => re.test(r[DICT[t].pk])));
    chk('Location: warehouse matches zone; volume & dock derived', db.Location, l => map.Zone.get(l.zone_id).warehouse_id === l.warehouse_id && l.volume_cm3 === l.width_cm * l.depth_cm * l.height_cm && Math.abs(l.dock_distance_m - (l.x_m + l.y_m)) < .051);
    const cnt = new Map(); db.OrderLine.forEach(l => cnt.set(l.sku_id, (cnt.get(l.sku_id) || 0) + 1));
    chk('SKUProfile: volume, oversized, picks_total derived', db.SKUProfile, p => p.volume_cm3 === Math.round(p.length_cm * p.width_cm * p.height_cm) && p.oversized === (Math.max(p.length_cm, p.width_cm, p.height_cm) > 100 ? 'Y' : 'N') && p.picks_total === (cnt.get(p.sku_id) || 0));
    const vel = new Map(), g = new Map(); db.SKUProfile.forEach(p => { const w = map.SKU.get(p.sku_id).home_warehouse_id; (g.get(w) || g.set(w, []).get(w)).push({ id: p.sku_id, n: p.picks_total }); }); g.forEach(l => velocity(l).forEach((c, k) => vel.set(k, c)));
    chk('SKUProfile: velocity_class recomputes', db.SKUProfile, p => vel.get(p.sku_id) === p.velocity_class);
    chk('SKUProfile: no cold+hazard mix', db.SKUProfile, p => !(p.temp_class === 'COLD' && p.hazard_class !== 'NONE'));
    const ol = new Map(); db.OrderLine.forEach(l => { const o = ol.get(l.order_id) || ol.set(l.order_id, { n: 0, u: 0 }).get(l.order_id); o.n++; o.u += l.quantity; });
    chk('Order: totals reconcile with lines; ship >= order date', db.Order, o => { const x = ol.get(o.order_id) || { n: 0, u: 0 }; return x.n === o.total_lines && x.u === o.total_units && o.shipped_date >= o.order_date; });
    chk('OrderLine: SKU home warehouse = order warehouse', db.OrderLine, l => map.SKU.get(l.sku_id).home_warehouse_id === map.Order.get(l.order_id).warehouse_id);
    const slots = new Map(); db.SlotAssignment.forEach(s => (slots.get(s.sku_id) || slots.set(s.sku_id, []).get(s.sku_id)).push(s));
    const inForce = (sku, loc, d) => (slots.get(sku) || []).filter(s => s.location_id === loc && s.effective_from <= d && (s.effective_to || '9999') >= d);
    chk('SlotAssignment: lifecycle (ACTIVE <=> no end date; end >= start); warehouse = location warehouse', db.SlotAssignment, s => (s.status === 'ACTIVE') === (s.effective_to === '') && (s.effective_to === '' || s.effective_to >= s.effective_from) && map.Location.get(s.location_id).warehouse_id === s.warehouse_id);
    chk('PickEvent: matches order line, warehouse, aisle, distance', db.PickEvent, e => { const l = map.OrderLine.get(e.order_line_id), o = map.Order.get(e.order_id), lc = map.Location.get(e.location_id); return l.order_id === e.order_id && l.sku_id === e.sku_id && l.quantity === e.quantity && o.warehouse_id === e.warehouse_id && lc.warehouse_id === e.warehouse_id && lc.aisle_no === e.aisle_no && Math.abs(e.travel_distance_m - 2 * lc.dock_distance_m) < .051; });
    chk('PickEvent: order_date <= picked_at <= shipped_date', db.PickEvent, e => { const o = map.Order.get(e.order_id); return e.picked_at >= o.order_date && e.picked_at <= o.shipped_date; });
    chk('PickEvent: location/layout = a slot in force on picked_at', db.PickEvent, e => inForce(e.sku_id, e.location_id, e.picked_at).some(s => s.strategy === e.layout));
    chk('Replenishment: labor_minutes derived; location = slot in force', db.Replenishment, r => Math.abs(r.labor_minutes - replenMin(r.quantity, map.Location.get(r.location_id).dock_distance_m)) < .011 && inForce(r.sku_id, r.location_id, r.replen_date).length > 0);
    chk('AisleBlock: end >= start', db.AisleBlock, b => b.blocked_to >= b.blocked_from);
    return res;
  };

  const q = v => { v = v == null ? '' : String(v); return /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; };
  E.fields = t => t === 'GroundTruth' ? GT_FIELDS : DICT[t].f.map(f => f[0]);
  E.toCSV = (db, t) => [E.fields(t).join(',')].concat(db[t].map(r => E.fields(t).map(f => q(r[f])).join(','))).join('\n') + '\n';
  E.toSQL = db => W.toDDL() + '\n' + [...ORDER, 'GroundTruth'].map(t => { const rows = db[t], f = E.fields(t), lit = v => typeof v === 'number' ? v : `'${String(v).replace(/'/g, "''")}'`; let s = ''; for (let i = 0; i < rows.length; i += 500) s += `INSERT INTO ${t} (${f.join(',')}) VALUES\n` + rows.slice(i, i + 500).map(r => '(' + f.map(k => lit(r[k])).join(',') + ')').join(',\n') + ';\n'; return s; }).join('\n');
  E.checksum = s => { let h = 0x811c9dc5; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0).toString(16).padStart(8, '0'); };
  E.TABLES = [...ORDER, 'GroundTruth'];
})(typeof module !== 'undefined' ? module.exports : (globalThis.WS = globalThis.WS || {}));
