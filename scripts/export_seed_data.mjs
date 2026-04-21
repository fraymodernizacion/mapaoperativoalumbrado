import fs from 'node:fs/promises';
import path from 'node:path';
import ExcelJS from 'exceljs';

function getNonEmptyRange(worksheet) {
  for (let rowNumber = 1; rowNumber <= worksheet.rowCount; rowNumber += 1) {
    const row = worksheet.getRow(rowNumber);
    const cells = [];
    let first = null;
    let last = null;
    const maxColumns = Math.max(worksheet.columnCount, row.cellCount, Math.max(0, row.values.length - 1));

    for (let index = 1; index <= maxColumns; index += 1) {
      const text = String(row.getCell(index).text ?? row.getCell(index).value ?? '').trim();
      cells.push(text);
      if (text !== '') {
        if (first === null) first = index;
        last = index;
      }
    }

    if (first !== null && last !== null) {
      return { rowNumber, first, last };
    }
  }

  throw new Error('No se encontraron encabezados válidos en la hoja.');
}

async function exportWorkbook(fileName) {
  const workbook = new ExcelJS.Workbook();
  const filePath = path.join(process.cwd(), 'data', fileName);
  await workbook.xlsx.readFile(filePath);
  const worksheet = workbook.worksheets[0];

  if (!worksheet) {
    throw new Error(`No se encontró una hoja en ${fileName}`);
  }

  const range = getNonEmptyRange(worksheet);
  const headers = [];
  for (let index = range.first; index <= range.last; index += 1) {
    headers.push(String(worksheet.getRow(range.rowNumber).getCell(index).text ?? worksheet.getRow(range.rowNumber).getCell(index).value ?? '').trim());
  }

  const rows = [];
  for (let rowNumber = range.rowNumber + 1; rowNumber <= worksheet.rowCount; rowNumber += 1) {
    const row = worksheet.getRow(rowNumber);
    const values = [];
    let hasValue = false;

    for (let index = range.first; index <= range.last; index += 1) {
      const text = String(row.getCell(index).text ?? row.getCell(index).value ?? '').trim();
      values.push(text);
      if (text !== '') hasValue = true;
    }

    if (!hasValue) continue;

    const record = {};
    headers.forEach((header, index) => {
      record[header] = values[index] ?? '';
    });
    rows.push(record);
  }

  return {
    sourceFile: fileName,
    exportedAt: new Date().toISOString(),
    headers,
    rows
  };
}

async function main() {
  const outputDir = path.join(process.cwd(), 'database');
  await fs.mkdir(outputDir, { recursive: true });

  const lighting = await exportWorkbook('alumbrado.xlsx');
  const meters = await exportWorkbook('medidores.xlsx');

  await fs.writeFile(path.join(outputDir, 'alumbrado_seed.json'), `${JSON.stringify(lighting, null, 2)}\n`, 'utf8');
  await fs.writeFile(path.join(outputDir, 'medidores_seed.json'), `${JSON.stringify(meters, null, 2)}\n`, 'utf8');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
