CREATE TABLE offline_operations (
  business_id INT UNSIGNED NOT NULL,
  user_id INT UNSIGNED NOT NULL,
  operation_id VARCHAR(100) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  request_hash CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  state ENUM('pending', 'complete', 'uncertain') NOT NULL DEFAULT 'pending',
  response_status SMALLINT UNSIGNED NULL,
  response_json LONGTEXT NULL,
  document_version CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (business_id, user_id, operation_id),
  KEY idx_offline_operations_review (business_id, state, updated_at),
  CONSTRAINT fk_offline_operations_business FOREIGN KEY (business_id) REFERENCES business(id) ON DELETE CASCADE,
  CONSTRAINT fk_offline_operations_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
