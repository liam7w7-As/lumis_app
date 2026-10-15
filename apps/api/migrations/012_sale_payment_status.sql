ALTER TABLE sales
  ADD COLUMN estado_pago ENUM('por_cobrar', 'pagado') NOT NULL DEFAULT 'por_cobrar',
  ADD COLUMN paid_at TIMESTAMP NULL DEFAULT NULL,
  ADD KEY idx_sales_estado_pago (estado_pago);
