-- Las cuentas anteriores pertenecen a la misma empresa.
ALTER TABLE business MODIFY id INT UNSIGNED NOT NULL AUTO_INCREMENT;
INSERT INTO business (id, nombre) VALUES (1, 'Mi Negocio') ON DUPLICATE KEY UPDATE id = id;
ALTER TABLE users
  ADD COLUMN business_id INT UNSIGNED NOT NULL DEFAULT 1,
  ADD COLUMN role ENUM('admin', 'seller') NOT NULL DEFAULT 'seller',
  ADD COLUMN theme_mode ENUM('system', 'light', 'dark') NOT NULL DEFAULT 'system',
  ADD CONSTRAINT fk_users_business FOREIGN KEY (business_id) REFERENCES business(id);
UPDATE users SET role = 'admin' ORDER BY id LIMIT 1;
ALTER TABLE clients ADD COLUMN business_id INT UNSIGNED NOT NULL DEFAULT 1,
  ADD CONSTRAINT fk_clients_business FOREIGN KEY (business_id) REFERENCES business(id);
ALTER TABLE products ADD COLUMN business_id INT UNSIGNED NOT NULL DEFAULT 1,
  ADD CONSTRAINT fk_products_business FOREIGN KEY (business_id) REFERENCES business(id);
ALTER TABLE branches ADD COLUMN business_id INT UNSIGNED NOT NULL DEFAULT 1,
  ADD CONSTRAINT fk_branches_business FOREIGN KEY (business_id) REFERENCES business(id);
ALTER TABLE agents ADD COLUMN business_id INT UNSIGNED NOT NULL DEFAULT 1,
  ADD COLUMN account_id INT UNSIGNED NULL,
  ADD UNIQUE KEY uq_agents_account(account_id),
  ADD CONSTRAINT fk_agents_business FOREIGN KEY (business_id) REFERENCES business(id),
  ADD CONSTRAINT fk_agents_account FOREIGN KEY (account_id) REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE quotes ADD COLUMN business_id INT UNSIGNED NOT NULL DEFAULT 1,
  ADD CONSTRAINT fk_quotes_business FOREIGN KEY (business_id) REFERENCES business(id),
  ADD KEY idx_quotes_business_created(business_id, created_at);
ALTER TABLE sales ADD COLUMN business_id INT UNSIGNED NOT NULL DEFAULT 1,
  ADD CONSTRAINT fk_sales_business FOREIGN KEY (business_id) REFERENCES business(id),
  ADD KEY idx_sales_business_created(business_id, created_at);
ALTER TABLE quote_items ADD COLUMN sort_order INT NOT NULL DEFAULT 2147483647,
  ADD KEY idx_quote_items_order(quote_id, sort_order, id);
ALTER TABLE sale_items ADD COLUMN sort_order INT NOT NULL DEFAULT 2147483647,
  ADD KEY idx_sale_items_order(sale_id, sort_order, id);
UPDATE quote_items SET sort_order = id;
UPDATE sale_items SET sort_order = id;
