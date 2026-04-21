import ExcelJS from 'exceljs';
import { setHeader } from 'h3';
import { getLightingDataset } from '../../services/municipal-data';
import type { LightingChangeHistoryEntry, LightingRecord } from '~/types/municipal';

function formatTimestamp(value?: string | null) {
  if (!value) return '';
  return new Date(value).toLocaleString('es-AR');
}

function formatHistoryChanges(entry: LightingChangeHistoryEntry) {
  const parts: string[] = [];
  if (entry.changes.technology) {
    parts.push(`Tecnologia: ${entry.changes.technology.before ?? '-'} -> ${entry.changes.technology.after ?? '-'}`);
  }
  if (entry.changes.powerW) {
    parts.push(`Potencia: ${entry.changes.powerW.before ?? '-'} -> ${entry.changes.powerW.after ?? '-'}`);
  }
  if (entry.changes.encendido) {
    parts.push(`Encendido: ${entry.changes.encendido.before ?? '-'} -> ${entry.changes.encendido.after ?? '-'}`);
  }
  return parts.join(' | ');
}

export default defineEventHandler(async (event) => {
  const dataset = await getLightingDataset();
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Visor de Alumbrado';
  workbook.created = new Date();
  workbook.modified = new Date();

  const summarySheet = workbook.addWorksheet('Datos actualizados');
  summarySheet.columns = [
    { header: 'Record ID', key: 'recordId', width: 24 },
    { header: 'Punto', key: 'point', width: 14 },
    { header: 'Tecnologia', key: 'technology', width: 18 },
    { header: 'Potencia W', key: 'powerW', width: 12 },
    { header: 'Encendido', key: 'encendido', width: 18 },
    { header: 'Localidad', key: 'locality', width: 20 },
    { header: 'Direccion', key: 'address', width: 28 },
    { header: 'Suministro', key: 'supply', width: 18 },
    { header: 'Observaciones', key: 'observations', width: 28 },
    { header: 'Cantidad', key: 'quantity', width: 10 },
    { header: 'Lat', key: 'lat', width: 12 },
    { header: 'Lng', key: 'lng', width: 12 },
    { header: 'Posicion', key: 'position', width: 20 },
    { header: 'Origen', key: 'source', width: 12 },
    { header: 'Creado', key: 'createdAt', width: 22 },
    { header: 'Actualizado', key: 'updatedAt', width: 22 }
  ];

  summarySheet.addRows(
    dataset.records.map((record: LightingRecord) => ({
      recordId: record.recordId,
      point: record.point,
      technology: record.technology,
      powerW: record.powerW ?? '',
      encendido: record.encendido,
      locality: record.locality,
      address: record.address,
      supply: record.supply,
      observations: record.observations,
      quantity: record.quantity,
      lat: record.lat ?? '',
      lng: record.lng ?? '',
      position: record.position,
      source: record.source ?? '',
      createdAt: formatTimestamp(record.createdAt),
      updatedAt: formatTimestamp(record.updatedAt)
    }))
  );

  const historySheet = workbook.addWorksheet('Historial');
  historySheet.columns = [
    { header: 'Record ID', key: 'recordId', width: 24 },
    { header: 'Punto', key: 'point', width: 14 },
    { header: 'Fecha y hora', key: 'timestamp', width: 22 },
    { header: 'Cambios', key: 'changes', width: 90 }
  ];

  dataset.records.forEach((record) => {
    if (!record.history.length) return;

    record.history.forEach((entry) => {
      historySheet.addRow({
        recordId: record.recordId,
        point: record.point,
        timestamp: formatTimestamp(entry.timestamp),
        changes: formatHistoryChanges(entry)
      });
    });
  });

  [summarySheet, historySheet].forEach((sheet) => {
    sheet.getRow(1).font = { bold: true };
    sheet.getRow(1).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFEFF4FA' }
    };
    sheet.views = [{ state: 'frozen', ySplit: 1 }];
  });

  const buffer = await workbook.xlsx.writeBuffer();
  setHeader(event, 'Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  setHeader(event, 'Content-Disposition', 'attachment; filename="alumbrado_actualizado.xlsx"');
  return Buffer.from(buffer);
});
