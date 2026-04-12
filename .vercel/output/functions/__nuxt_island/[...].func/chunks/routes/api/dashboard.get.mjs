import { d as defineEventHandler } from '../../_/nitro.mjs';
import { a as getDashboardDataset } from '../../_/municipal-data.mjs';
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

const dashboard_get = defineEventHandler(() => getDashboardDataset());

export { dashboard_get as default };
//# sourceMappingURL=dashboard.get.mjs.map
