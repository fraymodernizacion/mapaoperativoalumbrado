CREATE TABLE IF NOT EXISTS lighting_records (
  record_id VARCHAR(80) PRIMARY KEY,
  source VARCHAR(16) NOT NULL DEFAULT 'excel',
  point VARCHAR(255) NOT NULL,
  position VARCHAR(255) NOT NULL,
  technology VARCHAR(255) NOT NULL,
  power_w INT NULL,
  encendido VARCHAR(255) NOT NULL,
  observations TEXT NOT NULL DEFAULT '',
  quantity INT NOT NULL DEFAULT 1,
  supply VARCHAR(255) NOT NULL DEFAULT '',
  address VARCHAR(255) NOT NULL DEFAULT '',
  locality VARCHAR(255) NOT NULL DEFAULT '',
  lat DECIMAL(10,7) NULL,
  lng DECIMAL(10,7) NULL,
  coordinate_status VARCHAR(16) NOT NULL DEFAULT 'missing',
  created_at DATETIME NULL,
  updated_at DATETIME NULL,
  INDEX idx_lighting_point (point),
  INDEX idx_lighting_locality (locality),
  INDEX idx_lighting_supply (supply)
);

CREATE TABLE IF NOT EXISTS lighting_history (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  record_id VARCHAR(80) NOT NULL,
  timestamp DATETIME NOT NULL,
  field_name VARCHAR(32) NOT NULL,
  before_value VARCHAR(255) NULL,
  after_value VARCHAR(255) NULL,
  INDEX idx_lighting_history_record (record_id),
  INDEX idx_lighting_history_timestamp (timestamp)
);

CREATE TABLE IF NOT EXISTS meter_records (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  user_name VARCHAR(255) NOT NULL DEFAULT '',
  holder VARCHAR(255) NOT NULL DEFAULT '',
  service_holder VARCHAR(255) NOT NULL DEFAULT '',
  address VARCHAR(255) NOT NULL DEFAULT '',
  consumption_type VARCHAR(255) NOT NULL DEFAULT '',
  user_type VARCHAR(255) NOT NULL DEFAULT '',
  connection_type VARCHAR(255) NOT NULL DEFAULT '',
  meter VARCHAR(255) NOT NULL DEFAULT '',
  point_geo VARCHAR(255) NOT NULL DEFAULT '',
  lat DECIMAL(10,7) NULL,
  lng DECIMAL(10,7) NULL,
  coordinate_status VARCHAR(16) NOT NULL DEFAULT 'missing',
  created_at DATETIME NULL,
  updated_at DATETIME NULL,
  INDEX idx_meter_address (address),
  INDEX idx_meter_user (user_name)
);
