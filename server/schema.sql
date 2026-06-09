-- ─────────────────────────────────────────────
-- schema.sql  —  MyTracker DB 초기화
-- MySQL 8.0+
-- 실행: mysql -u root -p mytracker < schema.sql
-- ─────────────────────────────────────────────

CREATE DATABASE IF NOT EXISTS mytracker
  DEFAULT CHARACTER SET utf8mb4
  DEFAULT COLLATE utf8mb4_unicode_ci;

USE mytracker;

-- ── user ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS user (
  uid       INT          NOT NULL AUTO_INCREMENT,
  user_name VARCHAR(20)  NOT NULL,
  email     VARCHAR(255) NOT NULL,
  password  VARCHAR(256) NOT NULL,
  PRIMARY KEY (uid),
  UNIQUE KEY uq_user_name (user_name),
  UNIQUE KEY uq_email     (email)
);

-- ── friends ───────────────────────────────────
CREATE TABLE IF NOT EXISTS friends (
  sender   INT NOT NULL,
  receiver INT NOT NULL,
  status   ENUM('pending', 'accepted', 'rejected') NOT NULL DEFAULT 'pending',
  PRIMARY KEY (sender, receiver),
  CONSTRAINT chk_no_self   CHECK (sender <> receiver),
  CONSTRAINT fk_sender     FOREIGN KEY (sender)   REFERENCES user(uid) ON DELETE CASCADE,
  CONSTRAINT fk_receiver   FOREIGN KEY (receiver) REFERENCES user(uid) ON DELETE CASCADE
);

-- ── subscription ──────────────────────────────
-- billing_date: DATE 타입이지만 일(day)만 사용
--   "2000-01-DD" 형태로 저장 — 연·월은 더미값
CREATE TABLE IF NOT EXISTS subscription (
  uid          INT          NOT NULL,
  title        VARCHAR(50)  NOT NULL,
  price        INT          NOT NULL,
  start_date   DATE,
  billing_date DATE         NOT NULL COMMENT '일자만 사용 (2000-01-DD)',
  memo         TEXT,
  status       ENUM('subscribed', 'cancelled') DEFAULT 'subscribed',
  PRIMARY KEY (uid, title),
  CONSTRAINT chk_price      CHECK (price >= 0),
  CONSTRAINT fk_sub_user    FOREIGN KEY (uid) REFERENCES user(uid) ON DELETE CASCADE
);

-- ── 샘플 데이터 ───────────────────────────────
INSERT IGNORE INTO user (uid, user_name, email, password) VALUES
  (1, 'me',     'me@example.com',     '$2b$10$placeholder_hash'),
  (2, 'jiyeon', 'jiyeon@example.com', '$2b$10$placeholder_hash'),
  (3, 'minjun', 'minjun@example.com', '$2b$10$placeholder_hash'),
  (4, 'sora',   'sora@example.com',   '$2b$10$placeholder_hash');

INSERT IGNORE INTO friends (sender, receiver, status) VALUES
  (1, 2, 'accepted'),
  (3, 1, 'accepted'),
  (4, 1, 'pending');

INSERT IGNORE INTO subscription (uid, title, price, start_date, billing_date, memo, status) VALUES
  (1, 'Netflix',            17000, '2024-01-15', '2000-01-15', '가족 계정',    'subscribed'),
  (1, 'Spotify',            10900, '2023-08-01', '2000-01-01', '',             'subscribed'),
  (1, 'YouTube Premium',    14900, '2024-03-10', '2000-01-10', '광고 없이 보기','subscribed'),
  (1, 'Toss Plus',           4900, '2025-01-01', '2000-01-01', '',             'cancelled'),
  (2, 'Netflix',            17000, '2024-02-01', '2000-01-01', '',             'subscribed'),
  (2, 'Coupang Rocket Wow',  7890, '2023-11-01', '2000-01-01', '',             'subscribed'),
  (3, 'Apple One',          25000, '2024-05-01', '2000-01-01', '',             'subscribed');
