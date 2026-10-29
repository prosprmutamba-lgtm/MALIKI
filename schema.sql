-- Script idempotent : peut être relancé pour la création ET les mises à jour (npm run db:migrate).
CREATE TABLE IF NOT EXISTS admins (
  id INT AUTO_INCREMENT PRIMARY KEY,
  email VARCHAR(190) NOT NULL UNIQUE,
  password_hash VARCHAR(100) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;
CREATE TABLE IF NOT EXISTS capacity (
  id TINYINT PRIMARY KEY,
  allocated INT NOT NULL DEFAULT 0,
  confirmed INT NOT NULL DEFAULT 0,
  CONSTRAINT chk_alloc CHECK (allocated BETWEEN 0 AND 115),
  CONSTRAINT chk_conf CHECK (confirmed BETWEEN 0 AND 115 AND confirmed <= allocated)
) ENGINE=InnoDB;
INSERT IGNORE INTO capacity (id, allocated, confirmed) VALUES (1, 0, 0);
CREATE TABLE IF NOT EXISTS invitations (
  id INT AUTO_INCREMENT PRIMARY KEY,
  number INT NOT NULL UNIQUE,
  token VARCHAR(64) NOT NULL UNIQUE,
  seats TINYINT NOT NULL DEFAULT 1,
  status ENUM('pending','confirmed','declined') NOT NULL DEFAULT 'pending',
  household_name VARCHAR(120) NULL,
  names JSON NULL,
  guests TINYINT NOT NULL DEFAULT 0,
  qr_token VARCHAR(64) NULL UNIQUE,
  confirmed_at DATETIME NULL,
  checked_in_at DATETIME NULL,
  CONSTRAINT chk_seats CHECK (seats BETWEEN 1 AND 2),
  CONSTRAINT chk_guests CHECK (guests <= seats),
  CONSTRAINT chk_number CHECK (number BETWEEN 1 AND 100)
) ENGINE=InnoDB;
CREATE TABLE IF NOT EXISTS settings (
  k VARCHAR(60) PRIMARY KEY,
  v TEXT NULL
) ENGINE=InnoDB;
