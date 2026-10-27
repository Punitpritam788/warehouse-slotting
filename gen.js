#!/usr/bin/env node
// Usage: node gen.js [--full|--large|--starter] [--seed N] [--out dir] [--sql] [--json]
const fs = require('fs'), path = require('path'), crypto = require('crypto');
const W = require('./engine.js'), D = require('./dict.js');
const a = process.argv.slice(2), flag = f => a.includes(f), val = (f, d) => a.includes(f) ? a[a.indexOf(f) + 1] : d;
const scale = flag('--full') ? 'full' : flag('--large') ? 'large' : 'starter', p = { ...W.PRESETS[scale] };
for (const k of ['seed', 'warehouses', 'locations', 'skus', 'lines', 'inject']) if (val('--' + k)) p[k] = +val('--' + k);
const out = val('--out', path.join('data', scale));

const run = () => { const r = W.gen(p), csv = {}; W.TABLES.forEach(t => csv[t] = W.toCSV(r.db, t)); return { ...r, csv }; };
const t0 = Date.now(), A = run(), B = run();
const sums = t => ({ rows: A.db[t].length, fnv1a: W.checksum(A.csv[t]), sha256: crypto.createHash('sha256').update(A.csv[t]).digest('hex') });
const manifest = {
  command: 'node gen.js ' + a.join(' '), scale, params: p, generated_with: process.version, source: 'Fully synthetic; no external data used.',
  tables: Object.fromEntries(W.TABLES.map(t => [t, sums(t)])),
  reproducibility: { regenerated_twice_same_seed: W.TABLES.every(t => A.csv[t] === B.csv[t]), checksums_equal: W.TABLES.every(t => W.checksum(A.csv[t]) === W.checksum(B.csv[t])) },
  validation: { clean_before_injection: A.report.validation_clean, detections_before_injection: A.report.detections_clean, after_injection: A.report.validation },
  anomaly_detection_vs_ground_truth: A.report.detection, metrics: A.metrics,
};
fs.mkdirSync(out, { recursive: true });
W.TABLES.forEach(t => fs.writeFileSync(path.join(out, (t === 'GroundTruth' ? 'ground_truth' : t) + '.csv'), A.csv[t]));
fs.writeFileSync(path.join(out, 'manifest.json'), JSON.stringify(manifest, null, 2));
if (flag('--sql')) fs.writeFileSync(path.join(out, 'seed.sql'), W.toSQL(A.db));
if (flag('--json')) fs.writeFileSync(path.join(out, 'all.json'), JSON.stringify(A.db));
const bad = [...A.report.validation_clean, ...A.report.validation].filter(c => !c.ok), d = A.report.detection;
console.log(`${scale}: ${W.TABLES.map(t => t + '=' + A.db[t].length).join(' ')}\n` +
  `validation failures: ${bad.length}${bad.length ? '\n' + bad.map(c => '  ' + c.name + ' ' + c.example).join('\n') : ''}\n` +
  `clean-data detections: ${A.report.detections_clean} (expect 0)\n` +
  `anomalies: expected ${d.expected}, found ${d.found}, TP ${d.true_positive}, FP ${d.false_positive}, FN ${d.false_negative}\n` +
  `reproducible: ${manifest.reproducibility.regenerated_twice_same_seed}\n` +
  `distance ${A.metrics.delta_pct.distance}% | throughput ${A.metrics.delta_pct.throughput}% | replen labor ${A.metrics.delta_pct.replen_labor}%\n` +
  `written to ${out} in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
process.exit(bad.length || d.false_positive || d.false_negative || A.report.detections_clean || !manifest.reproducibility.regenerated_twice_same_seed ? 1 : 0);
