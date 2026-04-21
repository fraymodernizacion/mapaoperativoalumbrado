<?php

declare(strict_types=1);

require_once __DIR__ . '/../../../api/_mutations.php';

try {
  $pdo = api_pdo();
  $payload = api_read_json_body();
  $result = api_update_lighting_records($pdo, (array) ($payload['recordIds'] ?? []), $payload);

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
