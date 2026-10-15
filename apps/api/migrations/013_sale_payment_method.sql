ALTER TABLE sales
  ADD COLUMN metodo_pago ENUM('efectivo', 'qr', 'transferencia', 'por_pagar')
    NOT NULL DEFAULT 'efectivo',
  ADD KEY idx_sales_metodo_pago (metodo_pago);
