CREATE TABLE quote_scans (
  business_id INT UNSIGNED NOT NULL,
  user_id INT UNSIGNED NOT NULL,
  scan_id CHAR(36) NOT NULL,
  image_hash CHAR(64) NOT NULL,
  status ENUM('pending', 'complete', 'failed') NOT NULL,
  lease_token CHAR(36) NOT NULL,
  period_key VARCHAR(20) NOT NULL,
  result_json LONGTEXT NULL,
  started_at DATETIME NOT NULL,
  attempts INT UNSIGNED NOT NULL DEFAULT 1,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (business_id, user_id, scan_id),
  KEY idx_quote_scans_pending (business_id, status, period_key, started_at),
  KEY idx_quote_scans_recent (business_id, created_at),
  CONSTRAINT fk_quote_scans_business FOREIGN KEY (business_id) REFERENCES business(id) ON DELETE CASCADE,
  CONSTRAINT fk_quote_scans_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE quote_requests (
  business_id INT UNSIGNED NOT NULL,
  user_id INT UNSIGNED NOT NULL,
  request_key VARCHAR(100) NOT NULL,
  request_hash CHAR(64) NOT NULL,
  result_json TEXT NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (business_id, user_id, request_key),
  CONSTRAINT fk_quote_requests_business FOREIGN KEY (business_id) REFERENCES business(id) ON DELETE CASCADE,
  CONSTRAINT fk_quote_requests_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
