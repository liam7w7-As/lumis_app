ALTER TABLE sales
  ADD COLUMN comprobante_url VARCHAR(255) NULL,
  ADD COLUMN nota_pago TEXT NULL,
  ADD COLUMN transferencia_numero VARCHAR(50) NULL;

CREATE TABLE IF NOT EXISTS sale_payments (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  sale_id INT UNSIGNED NOT NULL,
  monto DECIMAL(12, 2) NOT NULL,
  nota VARCHAR(190) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_sale_payments_sale (sale_id),
  CONSTRAINT fk_sale_payments_sale FOREIGN KEY (sale_id)
    REFERENCES sales (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
