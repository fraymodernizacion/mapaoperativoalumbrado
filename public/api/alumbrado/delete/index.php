<?php

declare(strict_types=1);

require_once __DIR__ . '/../../../api/_mutations.php';

try {
  $pdo = api_pdo();
  $payload = api_read_json_body();
  $result = api_delete_lighting_points($pdo, (array) ($payload['recordIds'] ?? []));

  api_json([
    'ok' => true,
    'recordIds' => $result['recordIds'],
  ]);
} catch (Throwable $error) {
  api_json([
    'ok' => false,
    'message' => $error->getMessage(),
  ], 400);
}
