import fs from 'node:fs';
import path from 'node:path';
import ExcelJS from 'exceljs';
import type {
  DashboardDataset,
  LightingChangeHistoryEntry,
  LightingDataset,
  LightingRecord,
  LocalitySummary,
  MeterDataset,
  MeterRecord,
  SectorSummary,
  TechnologyGroup
} from '~/types/municipal';

type RawRow = Record<string, string | number | undefined>;

const CACHE_TTL_MS = 1000 * 60 * 10;
let lightingCache: { value: Promise<LightingDataset>; expiresAt: number } | null = null;
let meterCache: { value: Promise<MeterDataset>; expiresAt: number } | null = null;

function getDataPath(fileName: string) {
  return path.join(process.cwd(), 'data', fileName);
}

interface LightingRecordInput {
  recordId: string;
  source: 'excel' | 'manual';
  point: string;
  position: string;
  coordinateStatus: 'ok' | 'invalid' | 'missing';
  technology: string;
  powerW: number | null;
  encendido: string;
  observations: string;
  quantity: number;
  supply: string;
  address: string;
  locality: string;
  lat: number | null;
  lng: number | null;
  createdAt?: string;
  updatedAt?: string;
}

function readJsonFile<T>(fileName: string, fallback: T): T {
  const filePath = getDataPath(fileName);
  if (!fs.existsSync(filePath)) {
    return fallback;
  }

  try {
    const raw = fs.readFileSync(filePath, 'utf8');
    if (!raw.trim()) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function writeJsonFile(fileName: string, content: unknown) {
  const filePath = getDataPath(fileName);
  fs.writeFileSync(filePath, `${JSON.stringify(content, null, 2)}\n`, 'utf8');
}

function buildLightingRecord(input: LightingRecordInput, history: LightingChangeHistoryEntry[] = []): LightingRecord {
  const technologyGroup = classifyTechnology(input.technology);
  const isLuminaire = isLuminaireType(technologyGroup);
  const coordinateStatus = input.coordinateStatus;
  const led = technologyGroup === 'led';
  const powerTotalW = isLuminaire && input.powerW ? input.powerW * input.quantity : 0;
  const sectorLabel = input.address || 'Sin dirección';
  const sectorKey = normalizeText(sectorLabel);
  const qualityFlags: string[] = [];

  if (coordinateStatus !== 'ok') qualityFlags.push('no_coordinate');
  if (isLuminaire && input.powerW === null) qualityFlags.push('no_power');
  if (!input.locality) qualityFlags.push('no_locality');
  if (!input.supply) qualityFlags.push('no_supply');
  if (!input.address) qualityFlags.push('no_address');

  return {
    recordId: input.recordId,
    source: input.source,
    createdAt: input.createdAt,
    updatedAt: input.updatedAt,
    point: input.point,
    position: input.position,
    technology: input.technology,
    technologyGroup,
    powerW: input.powerW,
    encendido: input.encendido,
    observations: input.observations,
    quantity: input.quantity,
    supply: input.supply,
    address: input.address,
    locality: input.locality,
    lat: input.lat,
    lng: input.lng,
    coordinateStatus,
    isLuminaire,
    isLed: led,
    powerTotalW,
    sectorKey,
    sectorLabel,
    qualityFlags,
    history
  };
}

export function invalidateMunicipalCaches() {
  lightingCache = null;
  meterCache = null;
}

async function readWorkbookRows(fileName: string) {
  const filePath = getDataPath(fileName);
  if (!fs.existsSync(filePath)) {
    throw new Error(`No se encontró el archivo ${fileName} en la carpeta data/`);
  }

  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(filePath);
  const worksheet = workbook.worksheets[0];
  if (!worksheet) {
    throw new Error(`El archivo ${fileName} no contiene hojas.`);
  }

  const rows: string[][] = [];
  worksheet.eachRow({ includeEmpty: false }, (row) => {
    const cells: string[] = [];
    for (let index = 1; index <= worksheet.columnCount; index += 1) {
      const cell = row.getCell(index);
      cells.push(String(cell.text ?? cell.value ?? '').trim());
    }
    rows.push(cells);
  });

  return rows;
}

function normalizeText(value: unknown) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/\s+/g, ' ')
    .replace(/[^\w\s°º\-./#&]/g, ' ')
    .replace(/\s*-\s*/g, ' - ')
    .trim()
    .toUpperCase();
}

function parseNumber(value: unknown) {
  const text = String(value ?? '').replace(',', '.').trim();
  if (!text || text === '-' || text === '—') return null;
  const parsed = Number(text);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseQuantity(value: unknown) {
  const quantity = parseNumber(value);
  if (quantity === null || quantity <= 0) return 1;
  return quantity;
}

function parseCoordinate(value: unknown) {
  const text = String(value ?? '').trim().toUpperCase();
  if (!text) return { lat: null as number | null, lng: null as number | null, status: 'missing' as const };

  const match = text.match(/^([NS])\s*(\d{1,2})\s+(\d{1,2}(?:[.,]\d+)?)\s+([EW])\s*(\d{1,3})\s+(\d{1,2}(?:[.,]\d+)?)$/);
  if (!match) {
    return { lat: null as number | null, lng: null as number | null, status: 'invalid' as const };
  }

  const latDegrees = Number(match[2]);
  const latMinutes = Number(match[3].replace(',', '.'));
  const lngDegrees = Number(match[5]);
  const lngMinutes = Number(match[6].replace(',', '.'));
  const lat = latDegrees + latMinutes / 60;
  const lng = lngDegrees + lngMinutes / 60;
  const signedLat = match[1] === 'S' ? -lat : lat;
  const signedLng = match[4] === 'W' ? -lng : lng;

  if (!Number.isFinite(signedLat) || !Number.isFinite(signedLng)) {
    return { lat: null as number | null, lng: null as number | null, status: 'invalid' as const };
  }

  return { lat: signedLat, lng: signedLng, status: 'ok' as const };
}

function classifyTechnology(technology: string): TechnologyGroup {
  const text = normalizeText(technology);
  if (text.includes('LED')) return 'led';
  if (text.includes('SODIO')) return 'sodio';
  if (text.includes('BAJO CONSUMO') || text.includes('FLUORESCENTE') || text.includes('FLUOR')) return 'bajo_consumo';
  if (text.includes('GABINETE') || text.includes('TABLERO') || text.includes('SIN MEDIDOR') || text.includes('SIN LUMINARIA')) {
    return 'gabinete';
  }
  return 'otros';
}

function isLuminaireType(group: TechnologyGroup) {
  return group !== 'gabinete';
}

function rowToObject(headers: string[], row: Array<string | number | undefined>): RawRow {
  return headers.reduce<RawRow>((acc, header, index) => {
    acc[header] = row[index];
    return acc;
  }, {});
}

async function buildLightingDataset(): Promise<LightingDataset> {
  if (lightingCache && lightingCache.expiresAt > Date.now()) {
    return lightingCache.value;
  }

  const promise = (async () => {
    const rows = await readWorkbookRows('alumbrado.xlsx');
    const headers = rows[0].map((header) => String(header).trim());

    const records = rows.slice(1).map((row, index) => {
      const data = rowToObject(headers, row);
      const recordId = `alumbrado:${index + 2}`;
      const baseTechnology = String(data['TIPO'] ?? '').trim();
      const basePowerW = parseNumber(data['POTENCIA (W)']);
      const baseEncendido = String(data['TIPO DE ENCENDIDO'] ?? '').trim();
      const position = String(data['POSICIÓN'] ?? '').trim();
      const coordinate = parseCoordinate(position);

      return buildLightingRecord(
        {
          recordId,
          source: 'excel',
          point: String(data['PUNTO'] ?? '').trim(),
          position,
          coordinateStatus: coordinate.status,
          technology: baseTechnology,
          powerW: basePowerW,
          encendido: baseEncendido,
          observations: String(data['OBSERVACIONES'] ?? '').trim(),
          quantity: parseQuantity(data['CANTIDAD POR PUNTO']),
          supply: String(data['SUMINISTRO'] ?? '').trim(),
          address: String(data['DIRECCIÓN'] ?? '').trim(),
          locality: String(data['LOCALIDAD'] ?? '').trim(),
          lat: coordinate.lat,
          lng: coordinate.lng
        }
      );
    });

    const duplicateCounter = new Map<string, number>();
    for (const record of records) {
      const key = `${record.point}|${record.address}|${record.supply}|${record.technology}|${record.powerW ?? ''}`;
      duplicateCounter.set(key, (duplicateCounter.get(key) ?? 0) + 1);
    }

    const comparablePoints = records.filter((record) => record.isLuminaire).length;
    const ledPoints = records.filter((record) => record.isLuminaire && record.isLed).length;
    const totalLuminaries = records.reduce((sum, record) => sum + record.quantity, 0);
    const ledLuminaries = records.reduce((sum, record) => sum + (record.isLed ? record.quantity : 0), 0);
    const totalPowerW = records.reduce((sum, record) => sum + record.powerTotalW, 0);
    const ledPowerW = records.reduce((sum, record) => sum + (record.isLed ? record.powerTotalW : 0), 0);

    const sectorsMap = new Map<string, { key: string; label: string; count: number; ledCount: number; powerTotalW: number }>();
    const localityMap = new Map<string, { name: string; count: number; ledCount: number; powerTotalW: number }>();

    records.forEach((record) => {
      const sectorEntry =
        sectorsMap.get(record.sectorKey) ?? { key: record.sectorKey, label: record.sectorLabel, count: 0, ledCount: 0, powerTotalW: 0 };
      sectorEntry.count += 1;
      if (record.isLed && record.isLuminaire) sectorEntry.ledCount += 1;
      sectorEntry.powerTotalW += record.powerTotalW;
      sectorsMap.set(record.sectorKey, sectorEntry);

      const localityName = record.locality || 'Sin localidad';
      const localityEntry = localityMap.get(localityName) ?? { name: localityName, count: 0, ledCount: 0, powerTotalW: 0 };
      localityEntry.count += 1;
      if (record.isLed && record.isLuminaire) localityEntry.ledCount += 1;
      localityEntry.powerTotalW += record.powerTotalW;
      localityMap.set(localityName, localityEntry);
    });

    const sectors: SectorSummary[] = Array.from(sectorsMap.values())
      .sort((a, b) => b.count - a.count)
      .slice(0, 40)
      .map((sector) => ({
        key: sector.key,
        label: sector.label,
        count: sector.count,
        ledCount: sector.ledCount,
        ledPercentage: sector.count ? Math.round((sector.ledCount / sector.count) * 100) : 0,
        powerTotalW: sector.powerTotalW
      }));

    const localities: LocalitySummary[] = Array.from(localityMap.values())
      .sort((a, b) => b.count - a.count)
      .map((locality) => ({
        name: locality.name,
        count: locality.count,
        ledCount: locality.ledCount,
        ledPercentage: locality.count ? Math.round((locality.ledCount / locality.count) * 100) : 0,
        powerTotalW: locality.powerTotalW
      }));

    const noCoordinate = records.filter((record) => record.coordinateStatus !== 'ok').length;
    const noPower = records.filter((record) => record.isLuminaire && record.powerW === null).length;
    const noLocality = records.filter((record) => !record.locality).length;
    const noSupply = records.filter((record) => !record.supply).length;
    const duplicates = Array.from(duplicateCounter.values()).filter((count) => count > 1).length;
    const powerValues = Array.from(
      new Set(records.filter((record) => record.powerW !== null).map((record) => String(record.powerW)))
    ).sort((a, b) => Number(a) - Number(b));

    return {
      updatedAt: new Date().toISOString(),
      records,
      sectors,
      localities,
      options: {
        localities: Array.from(new Set(records.map((record) => record.locality).filter(Boolean))).sort(),
        technologies: Array.from(new Set(records.map((record) => record.technology).filter(Boolean))).sort(),
        encendidos: Array.from(new Set(records.map((record) => record.encendido).filter(Boolean))).sort(),
        sectors: sectors.map((sector) => sector.label),
        powerValues
      },
      metrics: {
        totalPoints: records.length,
        comparablePoints,
        totalLuminaries,
        ledPoints,
        ledLuminaries,
        totalPowerW,
        ledPowerW,
        nonLedPowerW: Math.max(totalPowerW - ledPowerW, 0),
        ledSharePoints: comparablePoints ? Math.round((ledPoints / comparablePoints) * 100) : 0,
        ledShareLuminaries: totalLuminaries ? Math.round((ledLuminaries / totalLuminaries) * 100) : 0,
        ledSharePower: totalPowerW ? Math.round((ledPowerW / totalPowerW) * 100) : 0,
        noCoordinate,
        noPower,
        noLocality,
        noSupply,
        duplicates
      }
    } satisfies LightingDataset;
  })();

  lightingCache = { value: promise, expiresAt: Date.now() + CACHE_TTL_MS };
  return promise;
}

function calculateDistanceMeters(lat1: number, lng1: number, lat2: number, lng2: number) {
  const earthRadius = 6371000;
  const toRad = (value: number) => (value * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return earthRadius * c;
}

async function buildMeterDataset(): Promise<MeterDataset> {
  if (meterCache && meterCache.expiresAt > Date.now()) {
    return meterCache.value;
  }

  const promise = (async () => {
    const lighting = await buildLightingDataset();
    const rows = await readWorkbookRows('medidores.xlsx');
    const headers = rows[0].map((header) => String(header).trim());

    const records = rows.slice(1).map((row) => {
      const data = rowToObject(headers, row);
      const coordinate = parseCoordinate(data['Punto GEO']);
      const qualityFlags: string[] = [];
      if (coordinate.status !== 'ok') qualityFlags.push('no_coordinate');
      if (!String(data['DOMICILIO'] ?? '').trim()) qualityFlags.push('no_address');
      if (!String(data['USUARIO'] ?? '').trim()) qualityFlags.push('no_user');

      return {
        user: String(data['USUARIO'] ?? '').trim(),
        holder: String(data['Titular'] ?? '').trim(),
        serviceHolder: String(data['Titular servicio'] ?? '').trim(),
        address: String(data['DOMICILIO'] ?? '').trim(),
        consumptionType: String(data['TIPO CONSUMO'] ?? '').trim(),
        userType: String(data['TIPO USUARIO'] ?? '').trim(),
        connectionType: String(data['Tipo Conexión'] ?? '').trim(),
        meter: String(data['Medidor'] ?? '').trim(),
        pointGeo: String(data['Punto GEO'] ?? '').trim(),
        lat: coordinate.lat,
        lng: coordinate.lng,
        coordinateStatus: coordinate.status,
        qualityFlags,
        nearbyLightingCount: 0,
        nearbyLightingPoints: [] as string[]
      } satisfies MeterRecord;
    });

    records.forEach((meter) => {
      if (meter.lat === null || meter.lng === null) return;
      lighting.records.forEach((point) => {
        if (point.lat === null || point.lng === null) return;
        const distance = calculateDistanceMeters(meter.lat as number, meter.lng as number, point.lat, point.lng);
        if (distance <= 60) {
          meter.nearbyLightingCount += 1;
          if (meter.nearbyLightingPoints.length < 5) {
            meter.nearbyLightingPoints.push(`${point.point} · ${point.address}`);
          }
        }
      });
    });

    const georeferencedMeters = records.filter((record) => record.coordinateStatus === 'ok').length;
    const linkedMeters = records.filter((record) => record.nearbyLightingCount > 0).length;

    return {
      updatedAt: new Date().toISOString(),
      records,
      metrics: {
        totalMeters: records.length,
        georeferencedMeters,
        noCoordinate: records.filter((record) => record.coordinateStatus !== 'ok').length,
        linkedMeters,
        orphanMeters: records.length - linkedMeters
      },
      options: {
        consumptionTypes: Array.from(new Set(records.map((record) => record.consumptionType).filter(Boolean))).sort(),
        userTypes: Array.from(new Set(records.map((record) => record.userType).filter(Boolean))).sort(),
        connectionTypes: Array.from(new Set(records.map((record) => record.connectionType).filter(Boolean))).sort(),
        holders: Array.from(new Set(records.map((record) => record.holder).filter(Boolean))).sort()
      }
    } satisfies MeterDataset;
  })();

  meterCache = { value: promise, expiresAt: Date.now() + CACHE_TTL_MS };
  return promise;
}

export function getLightingDataset() {
  return buildLightingDataset();
}

export function getMeterDataset() {
  return buildMeterDataset();
}

export function getDashboardDataset(): Promise<DashboardDataset> {
  return Promise.all([getLightingDataset(), getMeterDataset()]).then(([lighting, meters]) => ({
    updatedAt: new Date().toISOString(),
    lighting,
    meters
  }));
}

export function filterLightingRecords(
  records: LightingRecord[],
  filters: {
    search: string;
    locality: string;
    technology: string;
    encendido: string;
    sector: string;
    supply: string;
    powerMin: string;
    powerMax: string;
  }
) {
  const search = normalizeText(filters.search);
  const locality = normalizeText(filters.locality);
  const technology = normalizeText(filters.technology);
  const encendido = normalizeText(filters.encendido);
  const sector = normalizeText(filters.sector);
  const supply = normalizeText(filters.supply);
  const powerMin = parseNumber(filters.powerMin);
  const powerMax = parseNumber(filters.powerMax);

  return records.filter((record) => {
    if (search) {
      const haystack = [record.point, record.address, record.supply, record.technology, record.locality, record.sectorLabel].join(' ');
      if (!normalizeText(haystack).includes(search)) return false;
    }
    if (locality && normalizeText(record.locality) !== locality) return false;
    if (technology && normalizeText(record.technology) !== technology) return false;
    if (encendido && normalizeText(record.encendido) !== encendido) return false;
    if (sector && normalizeText(record.sectorLabel) !== sector && record.sectorKey !== sector) return false;
    if (supply && !normalizeText(record.supply).includes(supply)) return false;
    if (powerMin !== null && (record.powerW ?? 0) < powerMin) return false;
    if (powerMax !== null && (record.powerW ?? 0) > powerMax) return false;
    return true;
  });
}

export function filterMeterRecords(
  records: MeterRecord[],
  filters: {
    search: string;
    consumptionType: string;
    userType: string;
    connectionType: string;
  }
) {
  const search = normalizeText(filters.search);
  const consumptionType = normalizeText(filters.consumptionType);
  const userType = normalizeText(filters.userType);
  const connectionType = normalizeText(filters.connectionType);

  return records.filter((record) => {
    if (search) {
      const haystack = [record.user, record.holder, record.address, record.meter, record.pointGeo].join(' ');
      if (!normalizeText(haystack).includes(search)) return false;
    }
    if (consumptionType && normalizeText(record.consumptionType) !== consumptionType) return false;
    if (userType && normalizeText(record.userType) !== userType) return false;
    if (connectionType && normalizeText(record.connectionType) !== connectionType) return false;
    return true;
  });
}
