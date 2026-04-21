<?php

declare(strict_types=1);

require_once __DIR__ . '/../api/_mutations.php';

function import_schema(PDO $pdo, string $schemaPath): void
{
  $schemaSql = file_get_contents($schemaPath);
  if ($schemaSql === false) {
    throw new RuntimeException('No se pudo leer el esquema de base de datos.');
  }

  $statements = preg_split('/;\s*\n/', $schemaSql) ?: [];
  foreach ($statements as $statement) {
    $sql = trim($statement);
    if ($sql === '') {
      continue;
    }
    $pdo->exec($sql);
  }
}

function load_json(string $path): array
{
  $raw = file_get_contents($path);
  if ($raw === false) {
    throw new RuntimeException("No se pudo leer $path");
  }

  $decoded = json_decode($raw, true);
  if (!is_array($decoded)) {
    throw new RuntimeException("El archivo $path no contiene JSON válido.");
  }

  return $decoded;
}

$pdo = api_pdo();
$pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
$pdo->setAttribute(PDO::ATTR_DEFAULT_FETCH_MODE, PDO::FETCH_ASSOC);

import_schema($pdo, __DIR__ . '/../database/schema.sql');

$pdo->exec('SET FOREIGN_KEY_CHECKS = 0');
$pdo->exec('TRUNCATE TABLE lighting_history');
$pdo->exec('TRUNCATE TABLE lighting_records');
$pdo->exec('TRUNCATE TABLE meter_records');
$pdo->exec('SET FOREIGN_KEY_CHECKS = 1');

$lightingSeed = load_json(__DIR__ . '/../database/alumbrado_seed.json');
$lightingRows = $lightingSeed['rows'] ?? [];
$lightingStatement = $pdo->prepare(
  'INSERT INTO lighting_records (
    record_id, source, point, position, technology, power_w, encendido, observations, quantity,
    supply, address, locality, lat, lng, coordinate_status, created_at, updated_at
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
);

foreach ($lightingRows as $index => $row) {
  $position = trim((string) ($row['POSICIÓN'] ?? ''));
  $coordinate = api_parse_coordinate_text($position);
  $lightingStatement->execute([
    'alumbrado:' . ($index + 2),
    'excel',
    trim((string) ($row['PUNTO'] ?? '')),
    $position,
    trim((string) ($row['TIPO'] ?? '')),
    api_parse_number($row['POTENCIA (W)'] ?? null),
    trim((string) ($row['TIPO DE ENCENDIDO'] ?? '')),
    trim((string) ($row['OBSERVACIONES'] ?? '')),
    api_parse_quantity($row['CANTIDAD POR PUNTO'] ?? null),
    trim((string) ($row['SUMINISTRO'] ?? '')),
    trim((string) ($row['DIRECCIÓN'] ?? '')),
    trim((string) ($row['LOCALIDAD'] ?? '')),
    $coordinate['lat'],
    $coordinate['lng'],
    $coordinate['status'],
    api_now_string(),
    api_now_string(),
  ]);
}

$meterSeed = load_json(__DIR__ . '/../database/medidores_seed.json');
$meterRows = $meterSeed['rows'] ?? [];
$meterStatement = $pdo->prepare(
  'INSERT INTO meter_records (
    user_name, holder, service_holder, address, consumption_type, user_type, connection_type,
    meter, point_geo, lat, lng, coordinate_status, created_at, updated_at
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
);

foreach ($meterRows as $row) {
  $pointGeo = trim((string) ($row['Punto GEO'] ?? ''));
  $coordinate = api_parse_coordinate_text($pointGeo);
  $meterStatement->execute([
    trim((string) ($row['USUARIO'] ?? '')),
    trim((string) ($row['Titular'] ?? '')),
    trim((string) ($row['Titular servicio'] ?? '')),
    trim((string) ($row['DOMICILIO'] ?? '')),
    trim((string) ($row['TIPO CONSUMO'] ?? '')),
    trim((string) ($row['TIPO USUARIO'] ?? '')),
    trim((string) ($row['Tipo Conexión'] ?? '')),
    trim((string) ($row['Medidor'] ?? '')),
    $pointGeo,
    $coordinate['lat'],
    $coordinate['lng'],
    $coordinate['status'],
    api_now_string(),
    api_now_string(),
  ]);
}

echo "Seed importado correctamente\n";
