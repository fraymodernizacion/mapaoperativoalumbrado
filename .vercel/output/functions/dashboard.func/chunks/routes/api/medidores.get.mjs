import { d as defineEventHandler, a as getQuery } from '../../_/nitro.mjs';
import { b as getMeterDataset, c as filterMeterRecords } from '../../_/municipal-data.mjs';
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

const medidores_get = defineEventHandler(async (event) => {
  var _a, _b, _c, _d;
  const query = getQuery(event);
  const dataset = await getMeterDataset();
  const filtered = filterMeterRecords(dataset.records, {
    search: String((_a = query.search) != null ? _a : ""),
    consumptionType: String((_b = query.consumptionType) != null ? _b : ""),
    userType: String((_c = query.userType) != null ? _c : ""),
    connectionType: String((_d = query.connectionType) != null ? _d : "")
  });
  return {
    updatedAt: dataset.updatedAt,
    metrics: dataset.metrics,
    options: dataset.options,
    records: filtered,
    totalRecords: dataset.records.length
  };
});

export { medidores_get as default };
//# sourceMappingURL=medidores.get.mjs.map
