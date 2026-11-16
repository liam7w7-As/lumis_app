-- Solo se cambian los valores predeterminados para documentos nuevos.
-- Las opciones que ya eligieron los usuarios conservan su valor guardado.
ALTER TABLE quotes
  ALTER COLUMN include_seal SET DEFAULT 0,
  ALTER COLUMN show_notes SET DEFAULT 0,
  ALTER COLUMN include_signature SET DEFAULT 0;

ALTER TABLE sales
  ALTER COLUMN include_sello SET DEFAULT 0,
  ADD COLUMN notes TEXT NULL,
  ADD COLUMN show_notes TINYINT(1) NOT NULL DEFAULT 0,
  ADD COLUMN include_signature TINYINT(1) NOT NULL DEFAULT 0;
