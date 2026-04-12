import fs from 'node:fs';
import path from 'node:path';
import ExcelJS from 'exceljs';

const CACHE_TTL_MS = 1e3 * 60 * 10;
let lightingCache = null;
let meterCache = null;
function getDataPath(fileName) {
  return path.join(process.cwd(), "data", fileName);
}
async function readWorkbookRows(fileName) {
  const filePath = getDataPath(fileName);
  if (!fs.existsSync(filePath)) {
    throw new Error(`No se encontr\xF3 el archivo ${fileName} en la carpeta data/`);
  }
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(filePath);
  const worksheet = workbook.worksheets[0];
  if (!worksheet) {
    throw new Error(`El archivo ${fileName} no contiene hojas.`);
  }
  const rows = [];
  worksheet.eachRow({ includeEmpty: false }, (row) => {
    var _a, _b;
    const cells = [];
    for (let index = 1; index <= worksheet.columnCount; index += 1) {
      const cell = row.getCell(index);
      cells.push(String((_b = (_a = cell.text) != null ? _a : cell.value) != null ? _b : "").trim());
    }
    rows.push(cells);
  });
  return rows;
}
function normalizeText(value) {
  return String(value != null ? value : "").normalize("NFD").replace(/\p{Diacritic}/gu, "").replace(/\s+/g, " ").replace(/[^\w\s°º\-./#&]/g, " ").replace(/\s*-\s*/g, " - ").trim().toUpperCase();
}
function parseNumber(value) {
  const text = String(value != null ? value : "").replace(",", ".").trim();
  if (!text || text === "-" || text === "\u2014") return null;
  const parsed = Number(text);
  return Number.isFinite(parsed) ? parsed : null;
}
function parseQuantity(value) {
  const quantity = parseNumber(value);
  if (quantity === null || quantity <= 0) return 1;
  return quantity;
}
function parseCoordinate(value) {
  const text = String(value != null ? value : "").trim().toUpperCase();
  if (!text) return { lat: null, lng: null, status: "missing" };
  const match = text.match(/^([NS])\s*(\d{1,2})\s+(\d{1,2}(?:[.,]\d+)?)\s+([EW])\s*(\d{1,3})\s+(\d{1,2}(?:[.,]\d+)?)$/);
  if (!match) {
    return { lat: null, lng: null, status: "invalid" };
  }
  const latDegrees = Number(match[2]);
  const latMinutes = Number(match[3].replace(",", "."));
  const lngDegrees = Number(match[5]);
  const lngMinutes = Number(match[6].replace(",", "."));
  const lat = latDegrees + latMinutes / 60;
  const lng = lngDegrees + lngMinutes / 60;
  const signedLat = match[1] === "S" ? -lat : lat;
  const signedLng = match[4] === "W" ? -lng : lng;
  if (!Number.isFinite(signedLat) || !Number.isFinite(signedLng)) {
    return { lat: null, lng: null, status: "invalid" };
  }
  return { lat: signedLat, lng: signedLng, status: "ok" };
}
function classifyTechnology(technology) {
  const text = normalizeText(technology);
  if (text.includes("LED")) return "led";
  if (text.includes("SODIO")) return "sodio";
  if (text.includes("BAJO CONSUMO") || text.includes("FLUORESCENTE") || text.includes("FLUOR")) return "bajo_consumo";
  if (text.includes("GABINETE") || text.includes("TABLERO") || text.includes("SIN MEDIDOR") || text.includes("SIN LUMINARIA")) {
    return "gabinete";
  }
  return "otros";
}
function isLuminaireType(group) {
  return group !== "gabinete";
}
function rowToObject(headers, row) {
  return headers.reduce((acc, header, index) => {
    acc[header] = row[index];
    return acc;
  }, {});
}
async function buildLightingDataset() {
  if (lightingCache && lightingCache.expiresAt > Date.now()) {
    return lightingCache.value;
  }
  const promise = (async () => {
    var _a, _b;
    const rows = await readWorkbookRows("alumbrado.xlsx");
    const headers = rows[0].map((header) => String(header).trim());
    const records = rows.slice(1).map((row) => {
      var _a2, _b2, _c, _d, _e, _f, _g, _h, _i, _j;
      const data = rowToObject(headers, row);
      const technology = String((_a2 = data["TIPO"]) != null ? _a2 : "").trim();
      const technologyGroup = classifyTechnology(technology);
      const isLuminaire = isLuminaireType(technologyGroup);
      const quantity = isLuminaire ? parseQuantity(data["CANTIDAD POR PUNTO"]) : 0;
      const powerW = parseNumber(data["POTENCIA (W)"]);
      const position = String((_b2 = data["POSICI\xD3N"]) != null ? _b2 : "").trim();
      const address = String((_c = data["DIRECCI\xD3N"]) != null ? _c : "").trim();
      const coordinate = parseCoordinate(position);
      const sectorLabel = address || "Sin direcci\xF3n";
      const sectorKey = normalizeText(sectorLabel);
      const led = technologyGroup === "led";
      const powerTotalW = isLuminaire && powerW ? powerW * quantity : 0;
      const qualityFlags = [];
      if (coordinate.status !== "ok") qualityFlags.push("no_coordinate");
      if (isLuminaire && powerW === null) qualityFlags.push("no_power");
      if (!String((_d = data["LOCALIDAD"]) != null ? _d : "").trim()) qualityFlags.push("no_locality");
      if (!String((_e = data["SUMINISTRO"]) != null ? _e : "").trim()) qualityFlags.push("no_supply");
      if (!address) qualityFlags.push("no_address");
      return {
        point: String((_f = data["PUNTO"]) != null ? _f : "").trim(),
        position,
        technology,
        technologyGroup,
        powerW,
        encendido: String((_g = data["TIPO DE ENCENDIDO"]) != null ? _g : "").trim(),
        observations: String((_h = data["OBSERVACIONES"]) != null ? _h : "").trim(),
        quantity,
        supply: String((_i = data["SUMINISTRO"]) != null ? _i : "").trim(),
        address,
        locality: String((_j = data["LOCALIDAD"]) != null ? _j : "").trim(),
        lat: coordinate.lat,
        lng: coordinate.lng,
        coordinateStatus: coordinate.status,
        isLuminaire,
        isLed: led,
        powerTotalW,
        sectorKey,
        sectorLabel,
        qualityFlags
      };
    });
    const duplicateCounter = /* @__PURE__ */ new Map();
    for (const record of records) {
      const key = `${record.point}|${record.address}|${record.supply}|${record.technology}|${(_a = record.powerW) != null ? _a : ""}`;
      duplicateCounter.set(key, ((_b = duplicateCounter.get(key)) != null ? _b : 0) + 1);
    }
    const comparablePoints = records.filter((record) => record.isLuminaire).length;
    const ledPoints = records.filter((record) => record.isLuminaire && record.isLed).length;
    const totalLuminaries = records.reduce((sum, record) => sum + record.quantity, 0);
    const ledLuminaries = records.reduce((sum, record) => sum + (record.isLed ? record.quantity : 0), 0);
    const totalPowerW = records.reduce((sum, record) => sum + record.powerTotalW, 0);
    const ledPowerW = records.reduce((sum, record) => sum + (record.isLed ? record.powerTotalW : 0), 0);
    const sectorsMap = /* @__PURE__ */ new Map();
    const localityMap = /* @__PURE__ */ new Map();
    records.forEach((record) => {
      var _a2, _b2;
      const sectorEntry = (_a2 = sectorsMap.get(record.sectorKey)) != null ? _a2 : { key: record.sectorKey, label: record.sectorLabel, count: 0, ledCount: 0, powerTotalW: 0 };
      sectorEntry.count += 1;
      if (record.isLed && record.isLuminaire) sectorEntry.ledCount += 1;
      sectorEntry.powerTotalW += record.powerTotalW;
      sectorsMap.set(record.sectorKey, sectorEntry);
      const localityName = record.locality || "Sin localidad";
      const localityEntry = (_b2 = localityMap.get(localityName)) != null ? _b2 : { name: localityName, count: 0, ledCount: 0, powerTotalW: 0 };
      localityEntry.count += 1;
      if (record.isLed && record.isLuminaire) localityEntry.ledCount += 1;
      localityEntry.powerTotalW += record.powerTotalW;
      localityMap.set(localityName, localityEntry);
    });
    const sectors = Array.from(sectorsMap.values()).sort((a, b) => b.count - a.count).slice(0, 40).map((sector) => ({
      key: sector.key,
      label: sector.label,
      count: sector.count,
      ledCount: sector.ledCount,
      ledPercentage: sector.count ? Math.round(sector.ledCount / sector.count * 100) : 0,
      powerTotalW: sector.powerTotalW
    }));
    const localities = Array.from(localityMap.values()).sort((a, b) => b.count - a.count).map((locality) => ({
      name: locality.name,
      count: locality.count,
      ledCount: locality.ledCount,
      ledPercentage: locality.count ? Math.round(locality.ledCount / locality.count * 100) : 0,
      powerTotalW: locality.powerTotalW
    }));
    const noCoordinate = records.filter((record) => record.coordinateStatus !== "ok").length;
    const noPower = records.filter((record) => record.isLuminaire && record.powerW === null).length;
    const noLocality = records.filter((record) => !record.locality).length;
    const noSupply = records.filter((record) => !record.supply).length;
    const duplicates = Array.from(duplicateCounter.values()).filter((count) => count > 1).length;
    const powerValues = Array.from(
      new Set(records.filter((record) => record.powerW !== null).map((record) => String(record.powerW)))
    ).sort((a, b) => Number(a) - Number(b));
    return {
      updatedAt: (/* @__PURE__ */ new Date()).toISOString(),
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
        ledSharePoints: comparablePoints ? Math.round(ledPoints / comparablePoints * 100) : 0,
        ledShareLuminaries: totalLuminaries ? Math.round(ledLuminaries / totalLuminaries * 100) : 0,
        ledSharePower: totalPowerW ? Math.round(ledPowerW / totalPowerW * 100) : 0,
        noCoordinate,
        noPower,
        noLocality,
        noSupply,
        duplicates
      }
    };
  })();
  lightingCache = { value: promise, expiresAt: Date.now() + CACHE_TTL_MS };
  return promise;
}
function calculateDistanceMeters(lat1, lng1, lat2, lng2) {
  const earthRadius = 6371e3;
  const toRad = (value) => value * Math.PI / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return earthRadius * c;
}
async function buildMeterDataset() {
  if (meterCache && meterCache.expiresAt > Date.now()) {
    return meterCache.value;
  }
  const promise = (async () => {
    const lighting = await buildLightingDataset();
    const rows = await readWorkbookRows("medidores.xlsx");
    const headers = rows[0].map((header) => String(header).trim());
    const records = rows.slice(1).map((row) => {
      var _a, _b, _c, _d, _e, _f, _g, _h, _i, _j, _k;
      const data = rowToObject(headers, row);
      const coordinate = parseCoordinate(data["Punto GEO"]);
      const qualityFlags = [];
      if (coordinate.status !== "ok") qualityFlags.push("no_coordinate");
      if (!String((_a = data["DOMICILIO"]) != null ? _a : "").trim()) qualityFlags.push("no_address");
      if (!String((_b = data["USUARIO"]) != null ? _b : "").trim()) qualityFlags.push("no_user");
      return {
        user: String((_c = data["USUARIO"]) != null ? _c : "").trim(),
        holder: String((_d = data["Titular"]) != null ? _d : "").trim(),
        serviceHolder: String((_e = data["Titular servicio"]) != null ? _e : "").trim(),
        address: String((_f = data["DOMICILIO"]) != null ? _f : "").trim(),
        consumptionType: String((_g = data["TIPO CONSUMO"]) != null ? _g : "").trim(),
        userType: String((_h = data["TIPO USUARIO"]) != null ? _h : "").trim(),
        connectionType: String((_i = data["Tipo Conexi\xF3n"]) != null ? _i : "").trim(),
        meter: String((_j = data["Medidor"]) != null ? _j : "").trim(),
        pointGeo: String((_k = data["Punto GEO"]) != null ? _k : "").trim(),
        lat: coordinate.lat,
        lng: coordinate.lng,
        coordinateStatus: coordinate.status,
        qualityFlags,
        nearbyLightingCount: 0,
        nearbyLightingPoints: []
      };
    });
    records.forEach((meter) => {
      if (meter.lat === null || meter.lng === null) return;
      lighting.records.forEach((point) => {
        if (point.lat === null || point.lng === null) return;
        const distance = calculateDistanceMeters(meter.lat, meter.lng, point.lat, point.lng);
        if (distance <= 60) {
          meter.nearbyLightingCount += 1;
          if (meter.nearbyLightingPoints.length < 5) {
            meter.nearbyLightingPoints.push(`${point.point} \xB7 ${point.address}`);
          }
        }
      });
    });
    const georeferencedMeters = records.filter((record) => record.coordinateStatus === "ok").length;
    const linkedMeters = records.filter((record) => record.nearbyLightingCount > 0).length;
    return {
      updatedAt: (/* @__PURE__ */ new Date()).toISOString(),
      records,
      metrics: {
        totalMeters: records.length,
        georeferencedMeters,
        noCoordinate: records.filter((record) => record.coordinateStatus !== "ok").length,
        linkedMeters,
        orphanMeters: records.length - linkedMeters
      },
      options: {
        consumptionTypes: Array.from(new Set(records.map((record) => record.consumptionType).filter(Boolean))).sort(),
        userTypes: Array.from(new Set(records.map((record) => record.userType).filter(Boolean))).sort(),
        connectionTypes: Array.from(new Set(records.map((record) => record.connectionType).filter(Boolean))).sort(),
        holders: Array.from(new Set(records.map((record) => record.holder).filter(Boolean))).sort()
      }
    };
  })();
  meterCache = { value: promise, expiresAt: Date.now() + CACHE_TTL_MS };
  return promise;
}
function getLightingDataset() {
  return buildLightingDataset();
}
function getMeterDataset() {
  return buildMeterDataset();
}
function getDashboardDataset() {
  return Promise.all([getLightingDataset(), getMeterDataset()]).then(([lighting, meters]) => ({
    updatedAt: (/* @__PURE__ */ new Date()).toISOString(),
    lighting,
    meters
  }));
}
function filterLightingRecords(records, filters) {
  const search = normalizeText(filters.search);
  const locality = normalizeText(filters.locality);
  const technology = normalizeText(filters.technology);
  const encendido = normalizeText(filters.encendido);
  const sector = normalizeText(filters.sector);
  const supply = normalizeText(filters.supply);
  const powerMin = parseNumber(filters.powerMin);
  const powerMax = parseNumber(filters.powerMax);
  return records.filter((record) => {
    var _a, _b;
    if (search) {
      const haystack = [record.point, record.address, record.supply, record.technology, record.locality, record.sectorLabel].join(" ");
      if (!normalizeText(haystack).includes(search)) return false;
    }
    if (locality && normalizeText(record.locality) !== locality) return false;
    if (technology && normalizeText(record.technology) !== technology) return false;
    if (encendido && normalizeText(record.encendido) !== encendido) return false;
    if (sector && normalizeText(record.sectorLabel) !== sector && record.sectorKey !== sector) return false;
    if (supply && !normalizeText(record.supply).includes(supply)) return false;
    if (powerMin !== null && ((_a = record.powerW) != null ? _a : 0) < powerMin) return false;
    if (powerMax !== null && ((_b = record.powerW) != null ? _b : 0) > powerMax) return false;
    return true;
  });
}
function filterMeterRecords(records, filters) {
  const search = normalizeText(filters.search);
  const consumptionType = normalizeText(filters.consumptionType);
  const userType = normalizeText(filters.userType);
  const connectionType = normalizeText(filters.connectionType);
  return records.filter((record) => {
    if (search) {
      const haystack = [record.user, record.holder, record.address, record.meter, record.pointGeo].join(" ");
      if (!normalizeText(haystack).includes(search)) return false;
    }
    if (consumptionType && normalizeText(record.consumptionType) !== consumptionType) return false;
    if (userType && normalizeText(record.userType) !== userType) return false;
    if (connectionType && normalizeText(record.connectionType) !== connectionType) return false;
    return true;
  });
}

export { getDashboardDataset as a, getMeterDataset as b, filterMeterRecords as c, filterLightingRecords as f, getLightingDataset as g };
//# sourceMappingURL=municipal-data.mjs.map
