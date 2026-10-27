// Runs generation off the UI thread. Same code serves a Web Worker and the main-thread fallback.
(function (E) {
  E.makeSession = function (post) {
    let cur = null;
    const rows = (t, off, lim) => ({ fields: E.fields(t), rows: cur.db[t].slice(off, off + lim), total: cur.db[t].length });
    return function handle(m) {
      try {
        if (m.type === 'run') {
          const t0 = Date.now(), stages = 8; let n = 0, p = m.params;
          const A = E.gen(p, name => post({ type: 'stage', name, i: ++n, of: stages }));
          cur = A; let same = null; const sums = {};
          post({ type: 'stage', name: m.verify ? 'Verifying reproducibility' : 'Checksums', i: stages, of: stages });
          const B = m.verify ? E.gen(p) : null;
          E.TABLES.forEach(t => { const a = E.toCSV(A.db, t); sums[t] = E.checksum(a); if (B) same = (same !== false) && a === E.toCSV(B.db, t); });
          const db = A.db, wid = db.Warehouse[0].warehouse_id, picks = new Map(db.SKUProfile.map(x => [x.sku_id, x.picks_total])), slot = { BASELINE: new Map(), OPTIMIZED: new Map() };
          db.SlotAssignment.forEach(s => { if (s.warehouse_id === wid && (s.strategy === 'BASELINE' || s.effective_from === '2026-07-01')) slot[s.strategy].set(s.location_id, picks.get(s.sku_id)); });
          const heat = db.Location.filter(l => l.warehouse_id === wid).map(l => [l.aisle_no, l.bay_no, l.level_no, slot.BASELINE.has(l.location_id) ? slot.BASELINE.get(l.location_id) : -1, slot.OPTIMIZED.has(l.location_id) ? slot.OPTIMIZED.get(l.location_id) : -1]);
          const mix = { AMBIENT: 0, COLD: 0, HAZMAT: 0, BULK: 0 }; db.SKUProfile.forEach(s => mix[s.oversized === 'Y' ? 'BULK' : s.hazard_class !== 'NONE' ? 'HAZMAT' : s.temp_class === 'COLD' ? 'COLD' : 'AMBIENT']++);
          const byType = {}; E.detect(db).forEach(x => byType[x.issue_type] = (byType[x.issue_type] || 0) + 1);
          const counts = {}; E.TABLES.forEach(t => counts[t] = db[t].length);
          post({ type: 'done', ms: Date.now() - t0, params: p, same, sums, counts, metrics: A.metrics, report: A.report, gt: db.GroundTruth, byType, heat, wid, mix, firstWh: wid });
        } else if (m.type === 'rows') post({ type: 'rows', id: m.id, table: m.table, offset: m.offset, ...rows(m.table, m.offset, m.limit) });
        else if (m.type === 'csv') post({ type: 'file', id: m.id, name: (m.table === 'GroundTruth' ? 'ground_truth' : m.table) + '.csv', text: E.toCSV(cur.db, m.table), mime: 'text/csv' });
        else if (m.type === 'sql') post({ type: 'file', id: m.id, name: 'seed.sql', text: E.toSQL(cur.db), mime: 'text/plain' });
      } catch (err) { post({ type: 'error', message: err.message }); }
    };
  };
})(globalThis.WS = globalThis.WS || {});
