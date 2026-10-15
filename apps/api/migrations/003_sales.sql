CREATE TABLE IF NOT EXISTS quotes (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id INT UNSIGNED NOT NULL,
  client_id INT UNSIGNED NOT NULL,
  status ENUM('borrador', 'aprobada', 'rechazada', 'convertida') NOT NULL DEFAULT 'borrador',
  notes TEXT NULL,
  total DECIMAL(12, 2) NOT NULL DEFAULT 0.00,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_quotes_user (user_id),
  KEY idx_quotes_client (client_id),
  CONSTRAINT fk_quotes_user FOREIGN KEY (user_id)
    REFERENCES users (id) ON DELETE CASCADE,
  CONSTRAINT fk_quotes_client FOREIGN KEY (client_id)
    REFERENCES clients (id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS quote_items (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  quote_id INT UNSIGNED NOT NULL,
  product_id INT UNSIGNED NULL,
  description VARCHAR(255) NOT NULL,
  quantity DECIMAL(10, 2) NOT NULL DEFAULT 1.00,
  unit_price DECIMAL(12, 2) NOT NULL DEFAULT 0.00,
  subtotal DECIMAL(12, 2) NOT NULL DEFAULT 0.00,
  PRIMARY KEY (id),
  KEY idx_quote_items_quote (quote_id),
  CONSTRAINT fk_quote_items_quote FOREIGN KEY (quote_id)
    REFERENCES quotes (id) ON DELETE CASCADE,
  CONSTRAINT fk_quote_items_product FOREIGN KEY (product_id)
    REFERENCES products (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS sales (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id INT UNSIGNED NOT NULL,
  client_id INT UNSIGNED NOT NULL,
  quote_id INT UNSIGNED NULL,
  total DECIMAL(12, 2) NOT NULL DEFAULT 0.00,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_sales_quote (quote_id),
  KEY idx_sales_user (user_id),
  KEY idx_sales_client (client_id),
  CONSTRAINT fk_sales_user FOREIGN KEY (user_id)
    REFERENCES users (id) ON DELETE CASCADE,
  CONSTRAINT fk_sales_client FOREIGN KEY (client_id)
    REFERENCES clients (id) ON DELETE RESTRICT,
  CONSTRAINT fk_sales_quote FOREIGN KEY (quote_id)
    REFERENCES quotes (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS sale_items (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  sale_id INT UNSIGNED NOT NULL,
  product_id INT UNSIGNED NULL,
  description VARCHAR(255) NOT NULL,
  quantity DECIMAL(10, 2) NOT NULL DEFAULT 1.00,
  unit_price DECIMAL(12, 2) NOT NULL DEFAULT 0.00,
  subtotal DECIMAL(12, 2) NOT NULL DEFAULT 0.00,
  PRIMARY KEY (id),
  KEY idx_sale_items_sale (sale_id),
  CONSTRAINT fk_sale_items_sale FOREIGN KEY (sale_id)
    REFERENCES sales (id) ON DELETE CASCADE,
  CONSTRAINT fk_sale_items_product FOREIGN KEY (product_id)
    REFERENCES products (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
