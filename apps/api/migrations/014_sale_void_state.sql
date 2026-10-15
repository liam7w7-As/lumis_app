ALTER TABLE sales
  ADD COLUMN estado ENUM('activa', 'anulada') NOT NULL DEFAULT 'activa',
  ADD COLUMN anulado_at TIMESTAMP NULL DEFAULT NULL,
  ADD KEY idx_sales_estado (estado);
