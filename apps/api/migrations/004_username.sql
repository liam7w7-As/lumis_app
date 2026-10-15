ALTER TABLE users
  ADD COLUMN username VARCHAR(60) NULL AFTER name,
  MODIFY COLUMN email VARCHAR(190) NULL;

UPDATE users SET username = SUBSTRING_INDEX(email, '@', 1) WHERE username IS NULL;

ALTER TABLE users
  MODIFY COLUMN username VARCHAR(60) NOT NULL,
  ADD UNIQUE KEY uq_users_username (username);
