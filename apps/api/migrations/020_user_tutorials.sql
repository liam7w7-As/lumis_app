CREATE TABLE IF NOT EXISTS user_tutorials (
  user_id INT UNSIGNED NOT NULL,
  business_id INT UNSIGNED NOT NULL,
  guide_key VARCHAR(40) NOT NULL,
  version INT UNSIGNED NOT NULL DEFAULT 1,
  status ENUM('in_progress', 'completed', 'skipped') NOT NULL DEFAULT 'in_progress',
  step_id VARCHAR(80) NULL,
  updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (user_id, guide_key, version),
  KEY idx_tutorial_business (business_id),
  CONSTRAINT fk_tutorial_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_tutorial_business FOREIGN KEY (business_id) REFERENCES business(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
