<?php

return [
  'db_host' => getenv('ALUMBRADO_DB_HOST') ?: 'localhost',
  'db_port' => getenv('ALUMBRADO_DB_PORT') ?: '3306',
  'db_name' => getenv('ALUMBRADO_DB_NAME') ?: '',
  'db_user' => getenv('ALUMBRADO_DB_USER') ?: '',
  'db_pass' => getenv('ALUMBRADO_DB_PASS') ?: '',
];
