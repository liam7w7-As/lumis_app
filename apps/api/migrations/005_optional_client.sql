ALTER TABLE quotes
  MODIFY COLUMN client_id INT UNSIGNED NULL,
  DROP FOREIGN KEY fk_quotes_client;

ALTER TABLE quotes
  ADD CONSTRAINT fk_quotes_client FOREIGN KEY (client_id)
    REFERENCES clients (id) ON DELETE SET NULL;
