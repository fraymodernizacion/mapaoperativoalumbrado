<?php

declare(strict_types=1);

require_once __DIR__ . '/../_datasets.php';

try {
  $pdo = api_pdo();
  api_json(api_fetch_meter_dataset($pdo));
} catch (Throwable $error) {
  api_json([
    'ok' => false,
    'message' => $error->getMessage(),
  ], 500);
}
