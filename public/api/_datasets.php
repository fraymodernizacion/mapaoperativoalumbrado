<?php

declare(strict_types=1);

require_once __DIR__ . '/_bootstrap.php';

function api_build_lighting_record(array $row, array $history = []): array
{
  $technology = (string) ($row['technology'] ?? '');
  $powerW = $row['power_w'] === null || $row['power_w'] === '' ? null : (int) $row['power_w'];
  $quantity = max(1, (int) ($row['quantity'] ?? 1));
  $technologyGroup = api_classify_technology($technology);
  $isLuminaire = api_is_luminaire_type($technologyGroup);
  $isLed = $technologyGroup === 'led';
  $powerTotalW = $isLuminaire && $powerW !== null ? $powerW * $quantity : 0;
  $address = trim((string) ($row['address'] ?? ''));
  $locality = trim((string) ($row['locality'] ?? ''));
  $sectorLabel = $address !== '' ? $address : 'Sin dirección';
  $sectorKey = api_normalize_text($sectorLabel);
  $coordinateStatus = (string) ($row['coordinate_status'] ?? 'missing');
  $qualityFlags = [];

  if ($coordinateStatus !== 'ok') $qualityFlags[] = 'no_coordinate';
  if ($isLuminaire && $powerW === null) $qualityFlags[] = 'no_power';
  if ($locality === '') $qualityFlags[] = 'no_locality';
  if (trim((string) ($row['supply'] ?? '')) === '') $qualityFlags[] = 'no_supply';
  if ($address === '') $qualityFlags[] = 'no_address';

  return [
    'recordId' => (string) ($row['record_id'] ?? ''),
    'source' => (string) ($row['source'] ?? 'excel'),
    'createdAt' => api_to_iso($row['created_at'] ?? null),
    'updatedAt' => api_to_iso($row['updated_at'] ?? null),
    'point' => (string) ($row['point'] ?? ''),
    'position' => (string) ($row['position'] ?? ''),
    'technology' => $technology,
    'technologyGroup' => $technologyGroup,
    'powerW' => $powerW,
    'encendido' => (string) ($row['encendido'] ?? ''),
    'observations' => (string) ($row['observations'] ?? ''),
    'quantity' => $quantity,
    'supply' => (string) ($row['supply'] ?? ''),
    'address' => $address,
    'locality' => $locality,
    'lat' => $row['lat'] === null || $row['lat'] === '' ? null : (float) $row['lat'],
    'lng' => $row['lng'] === null || $row['lng'] === '' ? null : (float) $row['lng'],
    'coordinateStatus' => $coordinateStatus,
    'isLuminaire' => $isLuminaire,
    'isLed' => $isLed,
    'powerTotalW' => $powerTotalW,
    'sectorKey' => $sectorKey,
    'sectorLabel' => $sectorLabel,
    'qualityFlags' => $qualityFlags,
    'history' => $history,
  ];
}

function api_fetch_lighting_records(PDO $pdo): array
{
  $statement = $pdo->query('SELECT * FROM lighting_records ORDER BY CASE WHEN source = "manual" THEN 1 ELSE 0 END, created_at IS NULL, created_at, record_id');
  $rows = $statement->fetchAll(PDO::FETCH_ASSOC);

  $historyRows = $pdo->query('SELECT record_id, timestamp, field_name, before_value, after_value FROM lighting_history ORDER BY timestamp DESC, id DESC')->fetchAll(PDO::FETCH_ASSOC);
  $historyGroupMap = [];
  foreach ($historyRows as $historyRow) {
    $recordId = (string) ($historyRow['record_id'] ?? '');
    $timestamp = (string) ($historyRow['timestamp'] ?? '');
    if ($recordId === '' || $timestamp === '') {
      continue;
    }
    $key = $recordId . '|' . $timestamp;
    if (!isset($historyGroupMap[$key])) {
      $historyGroupMap[$key] = [
        'timestamp' => api_to_iso($timestamp) ?? $timestamp,
        'changes' => [],
      ];
    }

    $field = (string) ($historyRow['field_name'] ?? '');
    if ($field !== '') {
      $historyGroupMap[$key]['changes'][$field] = [
        'before' => $historyRow['before_value'],
        'after' => $historyRow['after_value'],
      ];
    }
  }

  $historyByRecord = [];
  foreach ($historyGroupMap as $key => $group) {
    [$recordId] = explode('|', $key, 2);
    $historyByRecord[$recordId] ??= [];
    $historyByRecord[$recordId][] = $group;
  }

  return array_map(static function (array $row) use ($historyByRecord) {
    return api_build_lighting_record($row, $historyByRecord[$row['record_id']] ?? []);
  }, $rows);
}

function api_filter_lighting_records(array $records, array $filters): array
{
  $search = api_normalize_text($filters['search'] ?? '');
  $locality = api_normalize_text($filters['locality'] ?? '');
  $technology = api_normalize_text($filters['technology'] ?? '');
  $encendido = api_normalize_text($filters['encendido'] ?? '');
  $sector = api_normalize_text($filters['sector'] ?? '');
  $supply = api_normalize_text($filters['supply'] ?? '');
  $powerMin = $filters['powerMin'] ?? '';
  $powerMax = $filters['powerMax'] ?? '';

  return array_values(array_filter($records, static function (array $record) use ($search, $locality, $technology, $encendido, $sector, $supply, $powerMin, $powerMax): bool {
    $haystack = api_normalize_text(implode(' ', [
      $record['point'] ?? '',
      $record['position'] ?? '',
      $record['technology'] ?? '',
      $record['encendido'] ?? '',
      $record['observations'] ?? '',
      $record['supply'] ?? '',
      $record['address'] ?? '',
      $record['locality'] ?? '',
    ]));

    if ($search !== '' && !str_contains($haystack, $search)) return false;
    if ($locality !== '' && api_normalize_text((string) ($record['locality'] ?? '')) !== $locality) return false;
    if ($technology !== '' && api_normalize_text((string) ($record['technology'] ?? '')) !== $technology) return false;
    if ($encendido !== '' && api_normalize_text((string) ($record['encendido'] ?? '')) !== $encendido) return false;
    if ($sector !== '' && api_normalize_text((string) ($record['sectorLabel'] ?? '')) !== $sector && api_normalize_text((string) ($record['sectorKey'] ?? '')) !== $sector) return false;
    if ($supply !== '' && api_normalize_text((string) ($record['supply'] ?? '')) !== $supply) return false;

    $power = $record['powerW'] ?? null;
    if ($powerMin !== '' && $power !== null && (float) $power < (float) $powerMin) return false;
    if ($powerMax !== '' && $power !== null && (float) $power > (float) $powerMax) return false;

    return true;
  }));
}

function api_build_lighting_metrics(array $records): array
{
  $duplicateCounter = [];
  foreach ($records as $record) {
    $key = implode('|', [
      $record['point'] ?? '',
      $record['address'] ?? '',
      $record['supply'] ?? '',
      $record['technology'] ?? '',
      (string) ($record['powerW'] ?? ''),
    ]);
    $duplicateCounter[$key] = ($duplicateCounter[$key] ?? 0) + 1;
  }

  $comparablePoints = count(array_filter($records, static fn(array $record): bool => (bool) ($record['isLuminaire'] ?? false)));
  $ledPoints = count(array_filter($records, static fn(array $record): bool => (bool) ($record['isLuminaire'] ?? false) && (bool) ($record['isLed'] ?? false)));
  $totalLuminaries = array_reduce($records, static fn(int $sum, array $record): int => $sum + (int) ($record['quantity'] ?? 1), 0);
  $ledLuminaries = array_reduce($records, static fn(int $sum, array $record): int => $sum + (((bool) ($record['isLed'] ?? false)) ? (int) ($record['quantity'] ?? 1) : 0), 0);
  $totalPowerW = array_reduce($records, static fn(int $sum, array $record): int => $sum + (int) ($record['powerTotalW'] ?? 0), 0);
  $ledPowerW = array_reduce($records, static fn(int $sum, array $record): int => $sum + (((bool) ($record['isLed'] ?? false)) ? (int) ($record['powerTotalW'] ?? 0) : 0), 0);

  $noCoordinate = count(array_filter($records, static fn(array $record): bool => ($record['coordinateStatus'] ?? 'missing') !== 'ok'));
  $noPower = count(array_filter($records, static fn(array $record): bool => (bool) ($record['isLuminaire'] ?? false) && ($record['powerW'] ?? null) === null));
  $noLocality = count(array_filter($records, static fn(array $record): bool => trim((string) ($record['locality'] ?? '')) === ''));
  $noSupply = count(array_filter($records, static fn(array $record): bool => trim((string) ($record['supply'] ?? '')) === ''));
  $duplicates = count(array_filter($duplicateCounter, static fn(int $count): bool => $count > 1));

  $powerValues = array_values(array_unique(array_filter(array_map(static fn(array $record): ?string => $record['powerW'] === null ? null : (string) $record['powerW'], $records))));
  sort($powerValues, SORT_NUMERIC);

  return [
    'totalPoints' => count($records),
    'comparablePoints' => $comparablePoints,
    'totalLuminaries' => $totalLuminaries,
    'ledPoints' => $ledPoints,
    'ledLuminaries' => $ledLuminaries,
    'totalPowerW' => $totalPowerW,
    'ledPowerW' => $ledPowerW,
    'nonLedPowerW' => max($totalPowerW - $ledPowerW, 0),
    'ledSharePoints' => $comparablePoints ? (int) round(($ledPoints / $comparablePoints) * 100) : 0,
    'ledShareLuminaries' => $totalLuminaries ? (int) round(($ledLuminaries / $totalLuminaries) * 100) : 0,
    'ledSharePower' => $totalPowerW ? (int) round(($ledPowerW / $totalPowerW) * 100) : 0,
    'noCoordinate' => $noCoordinate,
    'noPower' => $noPower,
    'noLocality' => $noLocality,
    'noSupply' => $noSupply,
    'duplicates' => $duplicates,
  ];
}

function api_build_lighting_options(array $records): array
{
  $localities = [];
  $technologies = [];
  $encendidos = [];
  foreach ($records as $record) {
    $locality = trim((string) ($record['locality'] ?? ''));
    if ($locality !== '') $localities[$locality] = true;
    $technology = trim((string) ($record['technology'] ?? ''));
    if ($technology !== '') $technologies[$technology] = true;
    $encendido = trim((string) ($record['encendido'] ?? ''));
    if ($encendido !== '') $encendidos[$encendido] = true;
  }

  return [
    'localities' => array_values(array_keys($localities)),
    'technologies' => array_values(array_keys($technologies)),
    'encendidos' => array_values(array_keys($encendidos)),
    'sectors' => array_values(array_unique(array_map(static fn(array $record): string => (string) ($record['sectorLabel'] ?? ''), $records))),
    'powerValues' => array_values(array_filter(array_unique(array_map(static fn(array $record): ?string => $record['powerW'] === null ? null : (string) $record['powerW'], $records)))),
  ];
}

function api_build_lighting_summaries(array $records): array
{
  $sectorsMap = [];
  $localitiesMap = [];

  foreach ($records as $record) {
    $sectorKey = (string) ($record['sectorKey'] ?? '');
    $sectorLabel = (string) ($record['sectorLabel'] ?? 'Sin dirección');
    if (!isset($sectorsMap[$sectorKey])) {
      $sectorsMap[$sectorKey] = ['key' => $sectorKey, 'label' => $sectorLabel, 'count' => 0, 'ledCount' => 0, 'powerTotalW' => 0];
    }
    $sectorsMap[$sectorKey]['count'] += 1;
    $sectorsMap[$sectorKey]['ledCount'] += ((bool) ($record['isLed'] ?? false) && (bool) ($record['isLuminaire'] ?? false)) ? 1 : 0;
    $sectorsMap[$sectorKey]['powerTotalW'] += (int) ($record['powerTotalW'] ?? 0);

    $localityName = trim((string) ($record['locality'] ?? '')) ?: 'Sin localidad';
    if (!isset($localitiesMap[$localityName])) {
      $localitiesMap[$localityName] = ['name' => $localityName, 'count' => 0, 'ledCount' => 0, 'powerTotalW' => 0];
    }
    $localitiesMap[$localityName]['count'] += 1;
    $localitiesMap[$localityName]['ledCount'] += ((bool) ($record['isLed'] ?? false) && (bool) ($record['isLuminaire'] ?? false)) ? 1 : 0;
    $localitiesMap[$localityName]['powerTotalW'] += (int) ($record['powerTotalW'] ?? 0);
  }

  $sectors = array_values(array_map(static function (array $sector): array {
    return [
      'key' => $sector['key'],
      'label' => $sector['label'],
      'count' => $sector['count'],
      'ledCount' => $sector['ledCount'],
      'ledPercentage' => $sector['count'] ? (int) round(($sector['ledCount'] / $sector['count']) * 100) : 0,
      'powerTotalW' => $sector['powerTotalW'],
    ];
  }, $sectorsMap));
  usort($sectors, static fn(array $a, array $b): int => $b['count'] <=> $a['count']);
  $sectors = array_slice($sectors, 0, 40);

  $localities = array_values(array_map(static function (array $locality): array {
    return [
      'name' => $locality['name'],
      'count' => $locality['count'],
      'ledCount' => $locality['ledCount'],
      'ledPercentage' => $locality['count'] ? (int) round(($locality['ledCount'] / $locality['count']) * 100) : 0,
      'powerTotalW' => $locality['powerTotalW'],
    ];
  }, $localitiesMap));
  usort($localities, static fn(array $a, array $b): int => $b['count'] <=> $a['count']);

  return [$sectors, $localities];
}

function api_fetch_lighting_dataset(PDO $pdo): array
{
  $records = api_fetch_lighting_records($pdo);
  [$sectors, $localities] = api_build_lighting_summaries($records);

  return [
    'updatedAt' => gmdate(DATE_ATOM),
    'records' => $records,
    'sectors' => array_map(static function (array $sector): array {
      $sector['displayLabel'] = mb_strlen($sector['label']) > 38 ? rtrim(mb_substr($sector['label'], 0, 35)) . '…' : $sector['label'];
      return $sector;
    }, $sectors),
    'localities' => $localities,
    'options' => api_build_lighting_options($records),
    'metrics' => api_build_lighting_metrics($records),
  ];
}

function api_distance_meters(float $lat1, float $lng1, float $lat2, float $lng2): float
{
  $earthRadius = 6371000.0;
  $toRad = static fn(float $value): float => ($value * M_PI) / 180;
  $dLat = $toRad($lat2 - $lat1);
  $dLng = $toRad($lng2 - $lng1);
  $a = sin($dLat / 2) ** 2 + cos($toRad($lat1)) * cos($toRad($lat2)) * sin($dLng / 2) ** 2;
  $c = 2 * atan2(sqrt($a), sqrt(1 - $a));
  return $earthRadius * $c;
}

function api_build_meter_record(array $row): array
{
  return [
    'user' => (string) ($row['user_name'] ?? ''),
    'holder' => (string) ($row['holder'] ?? ''),
    'serviceHolder' => (string) ($row['service_holder'] ?? ''),
    'address' => (string) ($row['address'] ?? ''),
    'consumptionType' => (string) ($row['consumption_type'] ?? ''),
    'userType' => (string) ($row['user_type'] ?? ''),
    'connectionType' => (string) ($row['connection_type'] ?? ''),
    'meter' => (string) ($row['meter'] ?? ''),
    'pointGeo' => (string) ($row['point_geo'] ?? ''),
    'lat' => $row['lat'] === null || $row['lat'] === '' ? null : (float) $row['lat'],
    'lng' => $row['lng'] === null || $row['lng'] === '' ? null : (float) $row['lng'],
    'coordinateStatus' => (string) ($row['coordinate_status'] ?? 'missing'),
    'qualityFlags' => [],
    'nearbyLightingCount' => 0,
    'nearbyLightingPoints' => [],
  ];
}

function api_fetch_meter_dataset(PDO $pdo): array
{
  $lighting = api_fetch_lighting_records($pdo);
  $statement = $pdo->query('SELECT * FROM meter_records ORDER BY id ASC');
  $rows = $statement->fetchAll(PDO::FETCH_ASSOC);
  $records = array_map('api_build_meter_record', $rows);

  foreach ($records as &$meter) {
    if ($meter['coordinateStatus'] !== 'ok') {
      $meter['qualityFlags'][] = 'no_coordinate';
    }
    if (trim($meter['address']) === '') {
      $meter['qualityFlags'][] = 'no_address';
    }
    if (trim($meter['user']) === '') {
      $meter['qualityFlags'][] = 'no_user';
    }

    if ($meter['lat'] === null || $meter['lng'] === null) {
      continue;
    }

    foreach ($lighting as $point) {
      if ($point['lat'] === null || $point['lng'] === null) {
        continue;
      }
      $distance = api_distance_meters((float) $meter['lat'], (float) $meter['lng'], (float) $point['lat'], (float) $point['lng']);
      if ($distance <= 60) {
        $meter['nearbyLightingCount'] += 1;
        if (count($meter['nearbyLightingPoints']) < 5) {
          $meter['nearbyLightingPoints'][] = sprintf('%s · %s', $point['point'], $point['address']);
        }
      }
    }
  }
  unset($meter);

  $georeferencedMeters = count(array_filter($records, static fn(array $record): bool => $record['coordinateStatus'] === 'ok'));
  $linkedMeters = count(array_filter($records, static fn(array $record): bool => $record['nearbyLightingCount'] > 0));

  $consumptionTypes = [];
  $userTypes = [];
  $connectionTypes = [];
  $holders = [];
  foreach ($records as $record) {
    $consumptionTypes[$record['consumptionType']] = true;
    $userTypes[$record['userType']] = true;
    $connectionTypes[$record['connectionType']] = true;
    $holders[$record['holder']] = true;
  }

  return [
    'updatedAt' => gmdate(DATE_ATOM),
    'records' => $records,
    'metrics' => [
      'totalMeters' => count($records),
      'georeferencedMeters' => $georeferencedMeters,
      'noCoordinate' => count(array_filter($records, static fn(array $record): bool => $record['coordinateStatus'] !== 'ok')),
      'linkedMeters' => $linkedMeters,
      'orphanMeters' => count($records) - $linkedMeters,
    ],
    'options' => [
      'consumptionTypes' => array_values(array_keys(array_filter($consumptionTypes, static fn($value, $key) => $key !== '', ARRAY_FILTER_USE_BOTH))),
      'userTypes' => array_values(array_keys(array_filter($userTypes, static fn($value, $key) => $key !== '', ARRAY_FILTER_USE_BOTH))),
      'connectionTypes' => array_values(array_keys(array_filter($connectionTypes, static fn($value, $key) => $key !== '', ARRAY_FILTER_USE_BOTH))),
      'holders' => array_values(array_keys(array_filter($holders, static fn($value, $key) => $key !== '', ARRAY_FILTER_USE_BOTH))),
    ],
  ];
}

function api_fetch_dashboard_dataset(PDO $pdo): array
{
  return [
    'updatedAt' => gmdate(DATE_ATOM),
    'lighting' => api_fetch_lighting_dataset($pdo),
    'meters' => api_fetch_meter_dataset($pdo),
  ];
}

