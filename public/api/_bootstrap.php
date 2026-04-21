<?php

declare(strict_types=1);

function api_config(): array
{
  $config = [
    'db_host' => getenv('ALUMBRADO_DB_HOST') ?: 'localhost',
    'db_port' => getenv('ALUMBRADO_DB_PORT') ?: '3306',
    'db_name' => getenv('ALUMBRADO_DB_NAME') ?: '',
    'db_user' => getenv('ALUMBRADO_DB_USER') ?: '',
    'db_pass' => getenv('ALUMBRADO_DB_PASS') ?: '',
  ];

  $configFile = __DIR__ . '/config.php';
  if (is_file($configFile)) {
    $loaded = require $configFile;
    if (is_array($loaded)) {
      $config = array_merge($config, array_filter($loaded, static fn($value) => $value !== null && $value !== ''));
    }
  }

  return $config;
}

function api_pdo(): PDO
{
  static $pdo = null;
  if ($pdo instanceof PDO) {
    return $pdo;
  }

  $config = api_config();
  if (($config['db_name'] ?? '') === '' || ($config['db_user'] ?? '') === '') {
    throw new RuntimeException('Falta configurar la conexión a MySQL en public/api/config.php o en variables de entorno.');
  }

  $dsn = sprintf(
    'mysql:host=%s;port=%s;dbname=%s;charset=utf8mb4',
    $config['db_host'] ?? 'localhost',
    $config['db_port'] ?? '3306',
    $config['db_name']
  );

  $pdo = new PDO($dsn, $config['db_user'], $config['db_pass'], [
    PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
    PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
    PDO::ATTR_EMULATE_PREPARES => false,
  ]);

  return $pdo;
}

function api_json(mixed $payload, int $statusCode = 200): never
{
  http_response_code($statusCode);
  header('Content-Type: application/json; charset=utf-8');
  echo json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
  exit;
}

function api_read_json_body(): array
{
  $raw = file_get_contents('php://input');
  if ($raw === false || trim($raw) === '') {
    return [];
  }

  $decoded = json_decode($raw, true);
  return is_array($decoded) ? $decoded : [];
}

function api_normalize_text(mixed $value): string
{
  $text = (string) ($value ?? '');
  $normalized = @iconv('UTF-8', 'ASCII//TRANSLIT//IGNORE', $text);
  if ($normalized === false) {
    $normalized = $text;
  }

  $normalized = preg_replace('/\s+/u', ' ', $normalized ?? '');
  $normalized = preg_replace('/[^\w\s°º\-./#&]/u', ' ', $normalized ?? '');
  $normalized = preg_replace('/\s*-\s*/u', ' - ', $normalized ?? '');

  return strtoupper(trim($normalized ?? ''));
}

function api_classify_technology(string $technology): string
{
  $text = api_normalize_text($technology);
  if (str_contains($text, 'LED')) return 'led';
  if (str_contains($text, 'SODIO')) return 'sodio';
  if (str_contains($text, 'BAJO CONSUMO') || str_contains($text, 'FLUORESCENTE') || str_contains($text, 'FLUOR')) {
    return 'bajo_consumo';
  }
  if (str_contains($text, 'GABINETE') || str_contains($text, 'TABLERO') || str_contains($text, 'SIN MEDIDOR') || str_contains($text, 'SIN LUMINARIA')) {
    return 'gabinete';
  }
  return 'otros';
}

function api_is_luminaire_type(string $group): bool
{
  return $group !== 'gabinete';
}

function api_parse_coordinate_text(string $text): array
{
  $text = strtoupper(trim($text));
  if ($text === '') {
    return ['lat' => null, 'lng' => null, 'status' => 'missing'];
  }

  if (preg_match('/^([NS])\s*(\d{1,2})\s+(\d{1,2}(?:[.,]\d+)?)\s+([EW])\s*(\d{1,3})\s+(\d{1,2}(?:[.,]\d+)?)$/', $text, $matches) !== 1) {
    return ['lat' => null, 'lng' => null, 'status' => 'invalid'];
  }

  $lat = (float) $matches[2] + ((float) str_replace(',', '.', $matches[3])) / 60;
  $lng = (float) $matches[5] + ((float) str_replace(',', '.', $matches[6])) / 60;

  $lat = $matches[1] === 'S' ? -$lat : $lat;
  $lng = $matches[4] === 'W' ? -$lng : $lng;

  return [
    'lat' => is_finite($lat) ? $lat : null,
    'lng' => is_finite($lng) ? $lng : null,
    'status' => is_finite($lat) && is_finite($lng) ? 'ok' : 'invalid',
  ];
}

function api_parse_number(mixed $value): ?float
{
  $text = trim(str_replace(',', '.', (string) ($value ?? '')));
  if ($text === '' || $text === '-' || $text === '—') {
    return null;
  }

  $number = (float) $text;
  return is_finite($number) ? $number : null;
}

function api_parse_quantity(mixed $value): int
{
  $number = api_parse_number($value);
  if ($number === null || $number <= 0) {
    return 1;
  }

  return (int) $number;
}

function api_to_iso(?string $value): ?string
{
  if ($value === null || trim($value) === '') {
    return null;
  }

  try {
    return (new DateTimeImmutable($value))->format(DATE_ATOM);
  } catch (Throwable) {
    return $value;
  }
}

function api_group_history(array $historyRows): array
{
  $grouped = [];
  foreach ($historyRows as $row) {
    $timestamp = (string) ($row['timestamp'] ?? '');
    $recordId = (string) ($row['record_id'] ?? '');
    if ($timestamp === '' || $recordId === '') {
      continue;
    }

    $key = $recordId . '|' . $timestamp;
    if (!isset($grouped[$key])) {
      $grouped[$key] = [
        'timestamp' => api_to_iso($timestamp) ?? $timestamp,
        'changes' => [],
      ];
    }

    $field = (string) ($row['field_name'] ?? '');
    if ($field !== '') {
      $grouped[$key]['changes'][$field] = [
        'before' => $row['before_value'] === null ? null : $row['before_value'],
        'after' => $row['after_value'] === null ? null : $row['after_value'],
      ];
    }
  }

  return array_values($grouped);
}

