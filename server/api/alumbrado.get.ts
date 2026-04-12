import { filterLightingRecords, getLightingDataset } from '../services/municipal-data';

export default defineEventHandler(async (event) => {
  const query = getQuery(event);
  const dataset = await getLightingDataset();
  const filtered = filterLightingRecords(dataset.records, {
    search: String(query.search ?? ''),
    locality: String(query.locality ?? ''),
    technology: String(query.technology ?? ''),
    encendido: String(query.encendido ?? ''),
    sector: String(query.sector ?? ''),
    supply: String(query.supply ?? ''),
    powerMin: String(query.powerMin ?? ''),
    powerMax: String(query.powerMax ?? '')
  });

  return {
    updatedAt: dataset.updatedAt,
    metrics: dataset.metrics,
    options: dataset.options,
    sectors: dataset.sectors.map((sector) => ({
      ...sector,
      displayLabel: sector.label.length > 38 ? `${sector.label.slice(0, 35).trimEnd()}…` : sector.label
    })),
    localities: dataset.localities,
    records: filtered,
    totalRecords: dataset.records.length
  };
});
