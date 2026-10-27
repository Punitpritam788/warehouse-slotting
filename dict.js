// Single source of truth: data dictionary, FKs, and enums. Drives validation, docs and SQL DDL.
(function (E) {
  const D = 'date', I = 'int', N = 'num', S = 'str';
  // field: [name, type, required, unit, allowed(array|null), rule]
  E.DICT = {
    Warehouse: { pk: 'warehouse_id', f: [
      ['warehouse_id', S, 1, '', null, 'WH-### ; unique'],
      ['name', S, 1, '', null, 'free text'],
      ['status', S, 1, '', ['ACTIVE'], ''],
      ['labor_capacity_min_per_day', I, 1, 'minutes', null, '> 0; replenishment labor budget per day'],
      ['opened_date', D, 1, 'ISO date', null, '<= 2026-01-01']] },
    Zone: { pk: 'zone_id', f: [
      ['zone_id', S, 1, '', null, 'Z### ; unique'],
      ['warehouse_id', S, 1, '', null, 'FK Warehouse'],
      ['zone_type', S, 1, '', ['AMBIENT', 'COLD', 'HAZMAT', 'BULK'], ''],
      ['temp_class', S, 1, '', ['AMBIENT', 'COLD'], 'COLD only for COLD zones'],
      ['hazard_allowed', S, 1, '', ['Y', 'N'], 'Y only for HAZMAT'],
      ['oversized_ok', S, 1, '', ['Y', 'N'], 'Y only for BULK']] },
    Location: { pk: 'location_id', f: [
      ['location_id', S, 1, '', null, 'LOC-<zone_id>-###### ; unique'],
      ['zone_id', S, 1, '', null, 'FK Zone'],
      ['warehouse_id', S, 1, '', null, 'FK Warehouse; equals Zone.warehouse_id'],
      ['aisle_no', I, 1, '', null, '>= 1; = floor(row_in_warehouse/60)+1 (60 locations per aisle)'],
      ['bay_no', I, 1, '', null, '1..20'],
      ['level_no', I, 1, '', null, '1..3'],
      ['x_m', N, 1, 'm', null, 'aisle_no * 3'],
      ['y_m', N, 1, 'm', null, 'bay_no * 1.2'],
      ['dock_distance_m', N, 1, 'm', null, 'x_m + y_m (Manhattan, dock at 0,0)'],
      ['width_cm', I, 1, 'cm', null, '> 0'], ['depth_cm', I, 1, 'cm', null, '> 0'], ['height_cm', I, 1, 'cm', null, '> 0'],
      ['volume_cm3', I, 1, 'cm3', null, 'derived = w*d*h'],
      ['max_weight_kg', N, 1, 'kg', null, '> 0'],
      ['status', S, 1, '', ['ACTIVE'], '']] },
    SKU: { pk: 'sku_id', f: [
      ['sku_id', S, 1, '', null, 'SKU-###### ; unique'],
      ['sku_name', S, 1, '', null, ''],
      ['category', S, 1, '', null, ''],
      ['home_warehouse_id', S, 1, '', null, 'FK Warehouse; where the SKU is slotted'],
      ['status', S, 1, '', ['ACTIVE'], ''],
      ['created_date', D, 1, 'ISO date', null, '']] },
    SKUProfile: { pk: 'sku_id', f: [
      ['sku_id', S, 1, '', null, 'PK + FK SKU (1:1)'],
      ['length_cm', N, 1, 'cm', null, '> 0'], ['width_cm', N, 1, 'cm', null, '> 0'], ['height_cm', N, 1, 'cm', null, '> 0'],
      ['weight_kg', N, 1, 'kg', null, '> 0'],
      ['volume_cm3', I, 1, 'cm3', null, 'derived = l*w*h'],
      ['oversized', S, 1, '', ['Y', 'N'], 'derived: longest side > 100 cm'],
      ['hazard_class', S, 1, '', ['NONE', 'FLAMMABLE', 'CORROSIVE'], ''],
      ['temp_class', S, 1, '', ['AMBIENT', 'COLD'], 'COLD never combined with a hazard'],
      ['picks_total', I, 1, 'order lines', null, 'derived = count(OrderLine)'],
      ['velocity_class', S, 1, '', ['A', 'B', 'C'], 'derived per warehouse: A while cumulative line share before this SKU < 80%, B < 95%, else C'],
      ['effective_from', D, 1, 'ISO date', null, '']] },
    Order: { pk: 'order_id', f: [
      ['order_id', S, 1, '', null, 'ORD-2026-###### ; unique'],
      ['warehouse_id', S, 1, '', null, 'FK Warehouse'],
      ['order_date', D, 1, 'ISO date', null, '2026-01-01..2026-10-25'],
      ['shipped_date', D, 1, 'ISO date', null, '>= order_date'],
      ['status', S, 1, '', ['SHIPPED'], ''],
      ['total_lines', I, 1, '', null, 'derived = count(OrderLine)'],
      ['total_units', I, 1, 'units', null, 'derived = sum(OrderLine.quantity)']] },
    OrderLine: { pk: 'order_line_id', f: [
      ['order_line_id', S, 1, '', null, '<order_id>-L## ; unique'],
      ['order_id', S, 1, '', null, 'FK Order'],
      ['line_no', I, 1, '', null, '>= 1'],
      ['sku_id', S, 1, '', null, 'FK SKU; SKU home warehouse = Order warehouse'],
      ['quantity', I, 1, 'units', null, '1..12']] },
    PickEvent: { pk: 'pick_id', f: [
      ['pick_id', S, 1, '', null, 'PICK-<order_id>-### ; unique'],
      ['order_line_id', S, 1, '', null, 'FK OrderLine; unique (1:1)'],
      ['order_id', S, 1, '', null, 'FK Order'],
      ['sku_id', S, 1, '', null, 'FK SKU'],
      ['warehouse_id', S, 1, '', null, 'FK Warehouse'],
      ['location_id', S, 1, '', null, 'FK Location; = SKU slot effective on picked_at'],
      ['aisle_no', I, 1, '', null, 'Location.aisle_no'],
      ['picked_at', D, 1, 'ISO date', null, 'order_date <= picked_at <= shipped_date'],
      ['quantity', I, 1, 'units', null, '= OrderLine.quantity'],
      ['travel_distance_m', N, 1, 'm', null, 'derived = 2 * Location.dock_distance_m'],
      ['layout', S, 1, '', ['BASELINE', 'OPTIMIZED'], 'strategy of the slot in force']] },
    Replenishment: { pk: 'replen_id', f: [
      ['replen_id', S, 1, '', null, 'REPL-2026-###### ; unique'],
      ['warehouse_id', S, 1, '', null, 'FK Warehouse'],
      ['sku_id', S, 1, '', null, 'FK SKU'],
      ['location_id', S, 1, '', null, 'FK Location'],
      ['replen_date', D, 1, 'ISO date', null, ''],
      ['quantity', I, 1, 'units', null, '> 0; refill to slot capacity'],
      ['labor_minutes', N, 1, 'minutes', null, 'derived = 5 + 0.1*qty + 0.05*dock_distance_m'],
      ['trigger', S, 1, '', ['LOW_STOCK'], ''],
      ['status', S, 1, '', ['COMPLETED'], '']] },
    SlotAssignment: { pk: 'slot_id', f: [
      ['slot_id', S, 1, '', null, 'SLOT-2026-###### ; unique'],
      ['sku_id', S, 1, '', null, 'FK SKU'],
      ['location_id', S, 1, '', null, 'FK Location'],
      ['warehouse_id', S, 1, '', null, 'FK Warehouse'],
      ['strategy', S, 1, '', ['BASELINE', 'OPTIMIZED'], 'BASELINE = velocity-blind first-fit; OPTIMIZED = velocity-ranked nearest-fit'],
      ['status', S, 1, '', ['ACTIVE', 'SUPERSEDED'], 'ACTIVE <=> effective_to empty'],
      ['effective_from', D, 1, 'ISO date', null, ''],
      ['effective_to', D, 0, 'ISO date', null, 'empty while ACTIVE; >= effective_from']] },
    AisleBlock: { pk: 'block_id', f: [
      ['block_id', S, 1, '', null, 'BLK-2026-###### ; unique'],
      ['warehouse_id', S, 1, '', null, 'FK Warehouse'],
      ['aisle_no', I, 1, '', null, ''],
      ['blocked_from', D, 1, 'ISO date', null, ''],
      ['blocked_to', D, 1, 'ISO date', null, '>= blocked_from'],
      ['reason', S, 1, '', ['MAINTENANCE', 'SPILL', 'RACK_DAMAGE'], '']] },
  };
  // [child, field, parent, optional]
  E.FKS = [
    ['Zone', 'warehouse_id', 'Warehouse'], ['Location', 'zone_id', 'Zone'], ['Location', 'warehouse_id', 'Warehouse'],
    ['SKU', 'home_warehouse_id', 'Warehouse'], ['SKUProfile', 'sku_id', 'SKU'],
    ['Order', 'warehouse_id', 'Warehouse'], ['OrderLine', 'order_id', 'Order'], ['OrderLine', 'sku_id', 'SKU'],
    ['PickEvent', 'order_line_id', 'OrderLine'], ['PickEvent', 'order_id', 'Order'], ['PickEvent', 'sku_id', 'SKU'],
    ['PickEvent', 'warehouse_id', 'Warehouse'], ['PickEvent', 'location_id', 'Location'],
    ['Replenishment', 'warehouse_id', 'Warehouse'], ['Replenishment', 'sku_id', 'SKU'], ['Replenishment', 'location_id', 'Location'],
    ['SlotAssignment', 'sku_id', 'SKU'], ['SlotAssignment', 'location_id', 'Location'], ['SlotAssignment', 'warehouse_id', 'Warehouse'],
    ['AisleBlock', 'warehouse_id', 'Warehouse'],
  ];
  E.ISSUES = ['SKU_EXCEEDS_LOCATION_CAPACITY', 'INCOMPATIBLE_COLOCATED', 'DUPLICATE_ACTIVE_LOCATION', 'PICK_USES_BLOCKED_AISLE', 'REPLEN_EXCEEDS_LABOR_CAPACITY'];
  E.ORDER = Object.keys(E.DICT);

  E.toMarkdown = () => '# Data dictionary\n\nDates are ISO `YYYY-MM-DD`. Every field is required unless marked optional. FKs: ' +
    E.FKS.map(([c, f, p]) => `${c}.${f}→${p}`).join(', ') + '.\n\n' +
    E.ORDER.map(t => `## ${t} (PK: ${E.DICT[t].pk})\n\n| field | type | req | unit | allowed | rule |\n|---|---|---|---|---|---|\n` +
      E.DICT[t].f.map(([n, ty, r, u, a, rule]) => `| ${n} | ${ty} | ${r ? 'yes' : 'no'} | ${u} | ${a ? a.join(', ') : ''} | ${rule} |`).join('\n')).join('\n\n') + '\n';

  E.toDDL = () => E.ORDER.map(t => {
    const ty = { str: 'TEXT', int: 'INTEGER', num: 'REAL', date: 'TEXT' };
    const fk = E.FKS.filter(x => x[0] === t).map(([, f, p]) => `  FOREIGN KEY (${f}) REFERENCES ${p}(${E.DICT[p].pk})`);
    const cols = E.DICT[t].f.map(([n, k, r]) => `  ${n} ${ty[k]}${r ? ' NOT NULL' : ''}${n === E.DICT[t].pk ? ' PRIMARY KEY' : ''}`);
    return `CREATE TABLE ${t} (\n${cols.concat(fk).join(',\n')}\n);`;
  }).join('\n\n') + '\n\nCREATE TABLE GroundTruth (issue_id TEXT PRIMARY KEY, issue_type TEXT, entity_type TEXT, entity_id TEXT, note TEXT);\n';
})(typeof module !== 'undefined' ? module.exports : (globalThis.WS = globalThis.WS || {}));
