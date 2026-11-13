ALTER TABLE business
  ADD COLUMN pdf_mostrar_marca TINYINT(1) NOT NULL DEFAULT 1,
  ADD COLUMN pdf_mostrar_procedencia TINYINT(1) NOT NULL DEFAULT 1;
