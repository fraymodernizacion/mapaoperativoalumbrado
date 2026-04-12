import { d as defineEventHandler, a as getQuery } from '../../_/nitro.mjs';
import { g as getLightingDataset, f as filterLightingRecords } from '../../_/municipal-data.mjs';
import 'node:http';
import 'node:https';
import 'node:events';
import 'node:buffer';
import '@iconify/utils';
import 'node:crypto';
import 'consola';
import 'node:fs';
import 'node:path';
import 'exceljs';

const alumbrado_get = defineEventHandler(async (event) => {
  var _a, _b, _c, _d, _e, _f, _g, _h;
  const query = getQuery(event);
  const dataset = await getLightingDataset();
  const filtered = filterLightingRecords(dataset.records, {
    search: String((_a = query.search) != null ? _a : ""),
    locality: String((_b = query.locality) != null ? _b : ""),
    technology: String((_c = query.technology) != null ? _c : ""),
    encendido: String((_d = query.encendido) != null ? _d : ""),
    sector: String((_e = query.sector) != null ? _e : ""),
    supply: String((_f = query.supply) != null ? _f : ""),
    powerMin: String((_g = query.powerMin) != null ? _g : ""),
    powerMax: String((_h = query.powerMax) != null ? _h : "")
  });
  return {
    updatedAt: dataset.updatedAt,
    metrics: dataset.metrics,
    options: dataset.options,
    sectors: dataset.sectors.map((sector) => ({
      ...sector,
      displayLabel: sector.label.length > 38 ? `${sector.label.slice(0, 35).trimEnd()}\u2026` : sector.label
    })),
    localities: dataset.localities,
    records: filtered,
    totalRecords: dataset.records.length
  };
});

export { alumbrado_get as default };
//# sourceMappingURL=alumbrado.get.mjs.map
