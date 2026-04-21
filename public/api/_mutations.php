<?php

declare(strict_types=1);

require_once __DIR__ . '/_datasets.php';

function api_now_string(): string
{
  return date('Y-m-d H:i:s');
}

function api_generate_record_id(string $prefix = 'manual'): string
{
  return sprintf('%s:%s:%s', $prefix, date('YmdHis'), bin2hex(random_bytes(4)));
}

function api_normalize_point_code(string $basePoint, int $offset): string
{
  $basePoint = trim($basePoint);
  if ($basePoint === '') {
    return sprintf('M-%04d', $offset + 1);
  }

  if ($offset === 0) {
    return $basePoint;
  }

  if (preg_match('/^(.*?)(\d+)$/', $basePoint, $matches) === 1) {
    $prefix = $matches[1];
    $digits = $matches[2];
    $width = strlen($digits);
    $next = (int) $digits + $offset;
    return $prefix . str_pad((string) $next, $width, '0', STR_PAD_LEFT);
  }

  return $basePoint . '-' . ($offset + 1);
}

function api_next_manual_point_code(PDO $pdo): string
{
  $statement = $pdo->query("SELECT point FROM lighting_records WHERE source = 'manual' ORDER BY record_id DESC");
  $max = 0;

  foreach ($statement->fetchAll(PDO::FETCH_COLUMN) as $point) {
    if (preg_match('/^M-(\d+)$/', strtoupper(trim((string) $point)), $matches) === 1) {
      $max = max($max, (int) $matches[1]);
    }
  }

  return sprintf('M-%04d', $max + 1);
}

function api_fetch_lighting_row_by_id(PDO $pdo, string $recordId): ?array
{
  $statement = $pdo->prepare('SELECT * FROM lighting_records WHERE record_id = ? LIMIT 1');
  $statement->execute([$recordId]);
  $row = $statement->fetch(PDO::FETCH_ASSOC);

  return $row === false ? null : $row;
}

function api_fetch_lighting_rows_by_ids(PDO $pdo, array $recordIds): array
{
  $recordIds = array_values(array_filter(array_map('strval', $recordIds), static fn(string $value): bool => $value !== ''));
  if (!$recordIds) {
    return [];
  }

  $placeholders = implode(',', array_fill(0, count($recordIds), '?'));
  $statement = $pdo->prepare("SELECT * FROM lighting_records WHERE record_id IN ($placeholders)");
  $statement->execute($recordIds);
  $rows = $statement->fetchAll(PDO::FETCH_ASSOC);

  $rowsById = [];
  foreach ($rows as $row) {
    $rowsById[(string) $row['record_id']] = $row;
  }

  $orderedRows = [];
  foreach ($recordIds as $recordId) {
    if (isset($rowsById[$recordId])) {
      $orderedRows[] = $rowsById[$recordId];
    }
  }

  return $orderedRows;
}

function api_fetch_lighting_record_response(PDO $pdo, string $recordId): ?array
{
  $row = api_fetch_lighting_row_by_id($pdo, $recordId);
  if (!$row) {
    return null;
  }

  $historyStatement = $pdo->prepare(
    'SELECT record_id, timestamp, field_name, before_value, after_value FROM lighting_history WHERE record_id = ? ORDER BY timestamp DESC, id DESC'
  );
  $historyStatement->execute([$recordId]);

  return api_build_lighting_record($row, api_group_history($historyStatement->fetchAll(PDO::FETCH_ASSOC)));
}

function api_update_lighting_records(PDO $pdo, array $recordIds, array $fields): array
{
  $recordIds = array_values(array_filter(array_map('strval', $recordIds), static fn(string $value): bool => $value !== ''));
  if (!$recordIds) {
    throw new InvalidArgumentException('Debes seleccionar al menos una luminaria editable.');
  }

  $technology = trim((string) ($fields['technology'] ?? ''));
  $encendido = trim((string) ($fields['encendido'] ?? ''));
  $powerW = api_parse_number($fields['powerW'] ?? null);
  if ($technology === '' || $encendido === '' || $powerW === null) {
    throw new InvalidArgumentException('Completá tecnología, potencia y encendido antes de guardar.');
  }

  $timestamp = api_now_string();
  $pdo->beginTransaction();

  try {
    $rows = api_fetch_lighting_rows_by_ids($pdo, $recordIds);
    if (count($rows) !== count($recordIds)) {
      throw new RuntimeException('Uno o más registros seleccionados ya no existen.');
    }

    $updateStatement = $pdo->prepare(
      'UPDATE lighting_records SET technology = ?, power_w = ?, encendido = ?, updated_at = ? WHERE record_id = ?'
    );
    $historyStatement = $pdo->prepare(
      'INSERT INTO lighting_history (record_id, timestamp, field_name, before_value, after_value) VALUES (?, ?, ?, ?, ?)'
    );

    foreach ($rows as $row) {
      $recordId = (string) $row['record_id'];
      $changes = [];

      $currentTechnology = (string) ($row['technology'] ?? '');
      $currentPowerW = $row['power_w'] === null || $row['power_w'] === '' ? null : (string) (int) $row['power_w'];
      $currentEncendido = (string) ($row['encendido'] ?? '');

      if ($currentTechnology !== $technology) {
        $changes[] = ['field' => 'technology', 'before' => $currentTechnology, 'after' => $technology];
      }
      if ((string) ($currentPowerW ?? '') !== (string) (int) $powerW) {
        $changes[] = ['field' => 'powerW', 'before' => $currentPowerW, 'after' => (string) (int) $powerW];
      }
      if ($currentEncendido !== $encendido) {
        $changes[] = ['field' => 'encendido', 'before' => $currentEncendido, 'after' => $encendido];
      }

      $updateStatement->execute([$technology, (int) $powerW, $encendido, $timestamp, $recordId]);

      foreach ($changes as $change) {
        $historyStatement->execute([
          $recordId,
          $timestamp,
          $change['field'],
          $change['before'] === '' ? null : $change['before'],
          $change['after'] === '' ? null : $change['after'],
        ]);
      }
    }

    $pdo->commit();
  } catch (Throwable $error) {
    if ($pdo->inTransaction()) {
      $pdo->rollBack();
    }

    throw $error;
  }

  $records = [];
  foreach ($recordIds as $recordId) {
    $record = api_fetch_lighting_record_response($pdo, $recordId);
    if ($record) {
      $records[] = $record;
    }
  }

  return [
    'recordIds' => $recordIds,
    'records' => $records,
  ];
}

function api_create_lighting_points(PDO $pdo, array $payload): array
{
  $locations = $payload['locations'] ?? [];
  if (!is_array($locations) || !$locations) {
    throw new InvalidArgumentException('Marcá al menos un punto sobre el mapa antes de guardar.');
  }

  $technology = trim((string) ($payload['technology'] ?? ''));
  $encendido = trim((string) ($payload['encendido'] ?? ''));
  $powerW = api_parse_number($payload['powerW'] ?? null);
  $locality = trim((string) ($payload['locality'] ?? ''));
  $address = trim((string) ($payload['address'] ?? ''));
  $supply = trim((string) ($payload['supply'] ?? ''));
  $observations = trim((string) ($payload['observations'] ?? ''));
  $quantity = api_parse_quantity($payload['quantity'] ?? 1);
  $basePoint = trim((string) ($payload['point'] ?? ''));

  if ($technology === '' || $encendido === '' || $powerW === null) {
    throw new InvalidArgumentException('Completá tecnología, potencia y encendido antes de guardar.');
  }

  $timestamp = api_now_string();
  $pdo->beginTransaction();

  try {
    if ($basePoint === '') {
      $basePoint = api_next_manual_point_code($pdo);
    }

    $insertStatement = $pdo->prepare(
      'INSERT INTO lighting_records (
        record_id, source, point, position, technology, power_w, encendido, observations, quantity,
        supply, address, locality, lat, lng, coordinate_status, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
    );

    $recordIds = [];
    foreach ($locations as $index => $location) {
      $lat = api_parse_number($location['lat'] ?? null);
      $lng = api_parse_number($location['lng'] ?? null);
      if ($lat === null || $lng === null) {
        throw new InvalidArgumentException('Una de las ubicaciones no tiene coordenadas válidas.');
      }

      $recordId = api_generate_record_id();
      $pointCode = api_normalize_point_code($basePoint, (int) $index);
      $position = sprintf('%.7f, %.7f', $lat, $lng);

      $insertStatement->execute([
        $recordId,
        'manual',
        $pointCode,
        $position,
        $technology,
        (int) $powerW,
        $encendido,
        $observations,
        $quantity,
        $supply,
        $address,
        $locality,
        $lat,
        $lng,
        'ok',
        $timestamp,
        $timestamp,
      ]);

      $recordIds[] = $recordId;
    }

    $pdo->commit();
  } catch (Throwable $error) {
    if ($pdo->inTransaction()) {
      $pdo->rollBack();
    }

    throw $error;
  }

  $records = [];
  foreach ($recordIds as $recordId) {
    $record = api_fetch_lighting_record_response($pdo, $recordId);
    if ($record) {
      $records[] = $record;
    }
  }

  return [
    'recordIds' => $recordIds,
    'records' => $records,
  ];
}
