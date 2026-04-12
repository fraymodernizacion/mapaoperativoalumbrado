import { filterMeterRecords, getMeterDataset } from '../services/municipal-data';

export default defineEventHandler(async (event) => {
  const query = getQuery(event);
  const dataset = await getMeterDataset();
  const filtered = filterMeterRecords(dataset.records, {
    search: String(query.search ?? ''),
    consumptionType: String(query.consumptionType ?? ''),
    userType: String(query.userType ?? ''),
    connectionType: String(query.connectionType ?? '')
  });

  return {
    updatedAt: dataset.updatedAt,
    metrics: dataset.metrics,
    options: dataset.options,
    records: filtered,
    totalRecords: dataset.records.length
  };
});
