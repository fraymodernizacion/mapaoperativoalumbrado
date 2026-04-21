<?php

declare(strict_types=1);

require_once __DIR__ . '/../../../api/_mutations.php';

try {
  $pdo = api_pdo();
  $payload = api_read_json_body();
  $recordId = trim((string) ($payload['recordId'] ?? ''));
  if ($recordId === '') {
    throw new InvalidArgumentException('Falta el identificador del registro.');
  }

  $result = api_update_lighting_records($pdo, [$recordId], $payload);
  api_json([
    'ok' => true,
    'recordIds' => $result['recordIds'],
    'records' => $result['records'],
  ]);
} catch (Throwable $error) {
  api_json([
    'ok' => false,
    'message' => $error->getMessage(),
  ], 400);
}
