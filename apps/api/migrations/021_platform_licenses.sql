-- Las empresas existentes comienzan en Gratis sin perder documentos ni cuentas.
ALTER TABLE users ADD COLUMN enabled TINYINT(1) NOT NULL DEFAULT 1;

CREATE TABLE IF NOT EXISTS business_licenses (
  business_id INT UNSIGNED PRIMARY KEY,
  plan ENUM('free','pro','plus') NOT NULL DEFAULT 'free',
  status ENUM('active','suspended') NOT NULL DEFAULT 'active',
  expires_at DATETIME NULL,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (business_id) REFERENCES business(id)
);
INSERT IGNORE INTO business_licenses (business_id) SELECT id FROM business;

CREATE TABLE IF NOT EXISTS license_usage (
  business_id INT UNSIGNED NOT NULL,
  meter ENUM('quotes','sales','deliveries','scans') NOT NULL,
  period_key VARCHAR(20) NOT NULL DEFAULT 'lifetime',
  used BIGINT UNSIGNED NOT NULL DEFAULT 0,
  PRIMARY KEY (business_id,meter,period_key),
  FOREIGN KEY (business_id) REFERENCES business(id)
);
INSERT IGNORE INTO license_usage (business_id,meter,used)
  SELECT business_id,'quotes',COUNT(*) FROM quotes GROUP BY business_id;
INSERT IGNORE INTO license_usage (business_id,meter,used)
  SELECT business_id,'sales',COUNT(*) FROM sales GROUP BY business_id;
INSERT IGNORE INTO license_usage (business_id,meter,used)
  SELECT business_id,'deliveries',COUNT(*) FROM sales WHERE entregada_at IS NOT NULL GROUP BY business_id;

CREATE TABLE IF NOT EXISTS platform_admins (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  username VARCHAR(60) NOT NULL UNIQUE,
  name VARCHAR(120) NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  enabled TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS platform_sessions (
  token_hash CHAR(64) PRIMARY KEY,
  admin_id INT UNSIGNED NOT NULL,
  expires_at DATETIME NOT NULL,
  FOREIGN KEY (admin_id) REFERENCES platform_admins(id) ON DELETE CASCADE,
  KEY idx_platform_sessions_expiry(expires_at)
);
CREATE TABLE IF NOT EXISTS platform_login_attempts (
  username VARCHAR(60) PRIMARY KEY,
  attempts INT UNSIGNED NOT NULL DEFAULT 0,
  window_started DATETIME NOT NULL
);
CREATE TABLE IF NOT EXISTS license_events (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  business_id INT UNSIGNED NOT NULL,
  admin_id INT UNSIGNED NOT NULL,
  action VARCHAR(60) NOT NULL,
  detail JSON NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (business_id) REFERENCES business(id),
  FOREIGN KEY (admin_id) REFERENCES platform_admins(id),
  KEY idx_license_events_business(business_id,id)
);
