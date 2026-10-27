# Data dictionary

Dates are ISO `YYYY-MM-DD`. Every field is required unless marked optional. FKs: Zone.warehouse_id→Warehouse, Location.zone_id→Zone, Location.warehouse_id→Warehouse, SKU.home_warehouse_id→Warehouse, SKUProfile.sku_id→SKU, Order.warehouse_id→Warehouse, OrderLine.order_id→Order, OrderLine.sku_id→SKU, PickEvent.order_line_id→OrderLine, PickEvent.order_id→Order, PickEvent.sku_id→SKU, PickEvent.warehouse_id→Warehouse, PickEvent.location_id→Location, Replenishment.warehouse_id→Warehouse, Replenishment.sku_id→SKU, Replenishment.location_id→Location, SlotAssignment.sku_id→SKU, SlotAssignment.location_id→Location, SlotAssignment.warehouse_id→Warehouse, AisleBlock.warehouse_id→Warehouse.

## Warehouse (PK: warehouse_id)

| field | type | req | unit | allowed | rule |
|---|---|---|---|---|---|
| warehouse_id | str | yes |  |  | WH-### ; unique |
| name | str | yes |  |  | free text |
| status | str | yes |  | ACTIVE |  |
| labor_capacity_min_per_day | int | yes | minutes |  | > 0; replenishment labor budget per day |
| opened_date | date | yes | ISO date |  | <= 2026-01-01 |

## Zone (PK: zone_id)

| field | type | req | unit | allowed | rule |
|---|---|---|---|---|---|
| zone_id | str | yes |  |  | Z### ; unique |
| warehouse_id | str | yes |  |  | FK Warehouse |
| zone_type | str | yes |  | AMBIENT, COLD, HAZMAT, BULK |  |
| temp_class | str | yes |  | AMBIENT, COLD | COLD only for COLD zones |
| hazard_allowed | str | yes |  | Y, N | Y only for HAZMAT |
| oversized_ok | str | yes |  | Y, N | Y only for BULK |

## Location (PK: location_id)

| field | type | req | unit | allowed | rule |
|---|---|---|---|---|---|
| location_id | str | yes |  |  | LOC-<zone_id>-###### ; unique |
| zone_id | str | yes |  |  | FK Zone |
| warehouse_id | str | yes |  |  | FK Warehouse; equals Zone.warehouse_id |
| aisle_no | int | yes |  |  | >= 1; = floor(row_in_warehouse/60)+1 (60 locations per aisle) |
| bay_no | int | yes |  |  | 1..20 |
| level_no | int | yes |  |  | 1..3 |
| x_m | num | yes | m |  | aisle_no * 3 |
| y_m | num | yes | m |  | bay_no * 1.2 |
| dock_distance_m | num | yes | m |  | x_m + y_m (Manhattan, dock at 0,0) |
| width_cm | int | yes | cm |  | > 0 |
| depth_cm | int | yes | cm |  | > 0 |
| height_cm | int | yes | cm |  | > 0 |
| volume_cm3 | int | yes | cm3 |  | derived = w*d*h |
| max_weight_kg | num | yes | kg |  | > 0 |
| status | str | yes |  | ACTIVE |  |

## SKU (PK: sku_id)

| field | type | req | unit | allowed | rule |
|---|---|---|---|---|---|
| sku_id | str | yes |  |  | SKU-###### ; unique |
| sku_name | str | yes |  |  |  |
| category | str | yes |  |  |  |
| home_warehouse_id | str | yes |  |  | FK Warehouse; where the SKU is slotted |
| status | str | yes |  | ACTIVE |  |
| created_date | date | yes | ISO date |  |  |

## SKUProfile (PK: sku_id)

| field | type | req | unit | allowed | rule |
|---|---|---|---|---|---|
| sku_id | str | yes |  |  | PK + FK SKU (1:1) |
| length_cm | num | yes | cm |  | > 0 |
| width_cm | num | yes | cm |  | > 0 |
| height_cm | num | yes | cm |  | > 0 |
| weight_kg | num | yes | kg |  | > 0 |
| volume_cm3 | int | yes | cm3 |  | derived = l*w*h |
| oversized | str | yes |  | Y, N | derived: longest side > 100 cm |
| hazard_class | str | yes |  | NONE, FLAMMABLE, CORROSIVE |  |
| temp_class | str | yes |  | AMBIENT, COLD | COLD never combined with a hazard |
| picks_total | int | yes | order lines |  | derived = count(OrderLine) |
| velocity_class | str | yes |  | A, B, C | derived per warehouse: A while cumulative line share before this SKU < 80%, B < 95%, else C |
| effective_from | date | yes | ISO date |  |  |

## Order (PK: order_id)

| field | type | req | unit | allowed | rule |
|---|---|---|---|---|---|
| order_id | str | yes |  |  | ORD-2026-###### ; unique |
| warehouse_id | str | yes |  |  | FK Warehouse |
| order_date | date | yes | ISO date |  | 2026-01-01..2026-10-25 |
| shipped_date | date | yes | ISO date |  | >= order_date |
| status | str | yes |  | SHIPPED |  |
| total_lines | int | yes |  |  | derived = count(OrderLine) |
| total_units | int | yes | units |  | derived = sum(OrderLine.quantity) |

## OrderLine (PK: order_line_id)

| field | type | req | unit | allowed | rule |
|---|---|---|---|---|---|
| order_line_id | str | yes |  |  | <order_id>-L## ; unique |
| order_id | str | yes |  |  | FK Order |
| line_no | int | yes |  |  | >= 1 |
| sku_id | str | yes |  |  | FK SKU; SKU home warehouse = Order warehouse |
| quantity | int | yes | units |  | 1..12 |

## PickEvent (PK: pick_id)

| field | type | req | unit | allowed | rule |
|---|---|---|---|---|---|
| pick_id | str | yes |  |  | PICK-<order_id>-### ; unique |
| order_line_id | str | yes |  |  | FK OrderLine; unique (1:1) |
| order_id | str | yes |  |  | FK Order |
| sku_id | str | yes |  |  | FK SKU |
| warehouse_id | str | yes |  |  | FK Warehouse |
| location_id | str | yes |  |  | FK Location; = SKU slot effective on picked_at |
| aisle_no | int | yes |  |  | Location.aisle_no |
| picked_at | date | yes | ISO date |  | order_date <= picked_at <= shipped_date |
| quantity | int | yes | units |  | = OrderLine.quantity |
| travel_distance_m | num | yes | m |  | derived = 2 * Location.dock_distance_m |
| layout | str | yes |  | BASELINE, OPTIMIZED | strategy of the slot in force |

## Replenishment (PK: replen_id)

| field | type | req | unit | allowed | rule |
|---|---|---|---|---|---|
| replen_id | str | yes |  |  | REPL-2026-###### ; unique |
| warehouse_id | str | yes |  |  | FK Warehouse |
| sku_id | str | yes |  |  | FK SKU |
| location_id | str | yes |  |  | FK Location |
| replen_date | date | yes | ISO date |  |  |
| quantity | int | yes | units |  | > 0; refill to slot capacity |
| labor_minutes | num | yes | minutes |  | derived = 5 + 0.1*qty + 0.05*dock_distance_m |
| trigger | str | yes |  | LOW_STOCK |  |
| status | str | yes |  | COMPLETED |  |

## SlotAssignment (PK: slot_id)

| field | type | req | unit | allowed | rule |
|---|---|---|---|---|---|
| slot_id | str | yes |  |  | SLOT-2026-###### ; unique |
| sku_id | str | yes |  |  | FK SKU |
| location_id | str | yes |  |  | FK Location |
| warehouse_id | str | yes |  |  | FK Warehouse |
| strategy | str | yes |  | BASELINE, OPTIMIZED | BASELINE = velocity-blind first-fit; OPTIMIZED = velocity-ranked nearest-fit |
| status | str | yes |  | ACTIVE, SUPERSEDED | ACTIVE <=> effective_to empty |
| effective_from | date | yes | ISO date |  |  |
| effective_to | date | no | ISO date |  | empty while ACTIVE; >= effective_from |

## AisleBlock (PK: block_id)

| field | type | req | unit | allowed | rule |
|---|---|---|---|---|---|
| block_id | str | yes |  |  | BLK-2026-###### ; unique |
| warehouse_id | str | yes |  |  | FK Warehouse |
| aisle_no | int | yes |  |  |  |
| blocked_from | date | yes | ISO date |  |  |
| blocked_to | date | yes | ISO date |  | >= blocked_from |
| reason | str | yes |  | MAINTENANCE, SPILL, RACK_DAMAGE |  |
