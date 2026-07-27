-- Solis Commons Database Schema
-- XAMPP MariaDB + PHP backend

CREATE DATABASE IF NOT EXISTS solis_commons CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE solis_commons;

-- ── Users (relational — for auth) ──
CREATE TABLE users (
  id          VARCHAR(32)  PRIMARY KEY,
  name        VARCHAR(128) NOT NULL,
  initials    VARCHAR(8)   NOT NULL,
  email       VARCHAR(255) NOT NULL UNIQUE,
  password    VARCHAR(255) NOT NULL COMMENT 'bcrypt hash',
  location    VARCHAR(128) DEFAULT '',
  bio         TEXT DEFAULT NULL,
  essay       TEXT DEFAULT NULL,
  avatar      VARCHAR(64)  DEFAULT '' COMMENT 'gradient string or "gold"',
  joined      VARCHAR(32)  DEFAULT '',
  status      VARCHAR(32)  DEFAULT 'Active' COMMENT 'Active, Inactive, etc.',
  standing    INT          DEFAULT 0,
  competence  INT          DEFAULT 0,
  created_at  TIMESTAMP    DEFAULT CURRENT_TIMESTAMP,
  updated_at  TIMESTAMP    DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB;

-- ── Auth tokens ──
CREATE TABLE auth_tokens (
  id         INT AUTO_INCREMENT PRIMARY KEY,
  user_id    VARCHAR(32)  NOT NULL,
  token      VARCHAR(128) NOT NULL UNIQUE,
  expires_at DATETIME     NOT NULL,
  created_at TIMESTAMP    DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- ── App data (JSON blobs matching mock.json shape) ──
CREATE TABLE app_data (
  data_key   VARCHAR(64)  PRIMARY KEY COMMENT 'e.g. circles, cells, stfs, threads, ...',
  data_value LONGTEXT     NOT NULL COMMENT 'JSON array or object',
  updated_at TIMESTAMP    DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB;

-- ── Mutation audit log ──
CREATE TABLE mutation_log (
  id         INT AUTO_INCREMENT PRIMARY KEY,
  user_id    VARCHAR(32)  NOT NULL,
  action     VARCHAR(64)  NOT NULL COMMENT 'set, push, update, delete',
  data_key   VARCHAR(64)  NOT NULL COMMENT 'which collection (cells, circles, ...)',
  item_id    VARCHAR(128) DEFAULT NULL COMMENT 'specific item id if applicable',
  snapshot   LONGTEXT     DEFAULT NULL COMMENT 'JSON: state after mutation',
  created_at TIMESTAMP    DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB;
