ALTER TABLE sales DROP FOREIGN KEY fk_sales_client;

ALTER TABLE sales MODIFY COLUMN client_id INT UNSIGNED NULL;

ALTER TABLE sales
  ADD CONSTRAINT fk_sales_client FOREIGN KEY (client_id)
    REFERENCES clients (id) ON DELETE SET NULL;
