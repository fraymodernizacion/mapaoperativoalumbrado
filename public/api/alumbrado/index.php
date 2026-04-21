<?php

declare(strict_types=1);

require_once __DIR__ . '/../_datasets.php';

try {
  $pdo = api_pdo();
  $dataset = api_fetch_lighting_dataset($pdo);

  api_json([
    'updatedAt' => $dataset['updatedAt'],
    'metrics' => $dataset['metrics'],
    'options' => $dataset['options'],
    'sectors' => $dataset['sectors'],
    'localities' => $dataset['localities'],
    'records' => $dataset['records'],
    'totalRecords' => count($dataset['records']),
  ]);
} catch (Throwable $error) {
  api_json([
    'ok' => false,
    'message' => $error->getMessage(),
  ], 500);
}
