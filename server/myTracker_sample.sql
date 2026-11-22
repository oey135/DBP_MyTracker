-- =====================================================================
-- MyTracker DB 샘플 (스키마 + 샘플 데이터)
--   스키마는 server/myTracker.sql 과 동일하고, 그 뒤에 샘플 데이터를 넣는다.
--   ERD(docs/ERD.md)는 이 파일로 만든 DB 기준이다.
-- 대상: MySQL 8.0.16+
--
-- 실행: mysql -u <user> -p < server/myTracker_sample.sql
--   운영 DB를 건드리지 않도록 별도 DB(mytracker_sample)를 만들어 사용한다.
--
-- 샘플 계정 (모두 비밀번호 test1234)
--   minji@example.com / jihoon@example.com / sora@example.com
--   taeyang@example.com / hana@example.com
--   uid 6 = 탈퇴한 회원 (소프트 삭제)
--
-- 샘플 데이터 기준일: 2026-11-22
-- =====================================================================
CREATE DATABASE IF NOT EXISTS mytracker_sample
  DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;
USE mytracker_sample;

DROP TABLE IF EXISTS payment;
DROP TABLE IF EXISTS subscription_member;
DROP TABLE IF EXISTS subscription;
DROP TABLE IF EXISTS friends;
DROP TABLE IF EXISTS user;


-- ---------------------------------------------------------------------
-- 1. user                                  [기획서 1-1 회원 관리]
--   탈퇴 = 소프트 삭제(deleted_at), 개인정보 완전 삭제, 복구 불가
--   탈퇴 시 user_name·email → 'deleted_{uid}', password → NULL
-- ---------------------------------------------------------------------
CREATE TABLE user (
  uid        INT          PRIMARY KEY AUTO_INCREMENT,
  user_name  VARCHAR(20)  UNIQUE NOT NULL,
  email      VARCHAR(255) UNIQUE NOT NULL,      -- 친구 검색 키 (기획서 III-4)
  password   VARCHAR(256) NULL,
  deleted_at DATETIME     NULL,
  CONSTRAINT chk_user_password                  -- 활성 회원은 password 필수
    CHECK (deleted_at IS NOT NULL OR password IS NOT NULL)
);


-- ---------------------------------------------------------------------
-- 2. friends                               [기획서 1-5 친구 관리]
--   sender = 요청자 / 요청·수락·거절 = status / 친구 삭제 = 행 DELETE
--   역방향 중복 방지 (LEAST/GREATEST + UNIQUE)
-- ---------------------------------------------------------------------
CREATE TABLE friends (
  sender   INT NOT NULL,
  receiver INT NOT NULL,
  status   ENUM('pending','accepted','rejected') NOT NULL DEFAULT 'pending',
  PRIMARY KEY (sender, receiver),
  UNIQUE KEY uq_friends_pair ((LEAST(sender, receiver)), (GREATEST(sender, receiver))),
  FOREIGN KEY (sender)   REFERENCES user (uid),
  FOREIGN KEY (receiver) REFERENCES user (uid),
  CONSTRAINT chk_friends_self CHECK (sender <> receiver)  -- 자기 자신 요청 금지
);


-- ---------------------------------------------------------------------
-- 3. subscription  (개인/공유 통합, uid = 소유자)
--                                [기획서 1-2 개인 구독, 1-3 결제 일정·알림,
--                                 1-4 지출 분석, 1-5 공개 범위, 1-6 분담 방식]
--   category      : 카테고리별 지출 통계용 분류
--   billing_cycle : 월간/연간 결제 주기 (월평균 환산은 조회 시 계산)
--   billing_date  : 연도 2000 고정
--                   monthly → 2000-01-DD / yearly → 2000-MM-DD
--                   다음 결제 예정일·캘린더는 이 값으로 계산 (별도 저장 X)
--   notify_days_before : 결제 예정일 며칠 전 알림, NULL = 알림 끔
--   visibility    : private = 나만 / friends = 수락된 친구에게 공개
--   split_type    : equal = 균등 분담 / custom = 지정 금액 분담
--   해지 정책     : status 'cancelled' + end_date 기록, billing_date는 지우지 않음
--   삭제 정책     : 결제 기록 없음 → 실제 삭제 (member 행 먼저 삭제, 트랜잭션)
--                   결제 기록 있음 → status 'cancelled' + end_date로 대체
-- ---------------------------------------------------------------------
CREATE TABLE subscription (
  sub_id             INT          PRIMARY KEY AUTO_INCREMENT,
  uid                INT          NOT NULL,
  title              VARCHAR(50)  NOT NULL,
  category           ENUM('ott','music','reading','productivity','cloud',
                          'game','shopping','etc') NOT NULL DEFAULT 'etc',
  price              INT          NOT NULL CHECK (price >= 0),
  billing_cycle      ENUM('monthly','yearly') NOT NULL DEFAULT 'monthly',
  billing_date       DATE,
  start_date         DATE,
  end_date           DATE,
  notify_days_before TINYINT UNSIGNED NULL,
  visibility         ENUM('private','friends') NOT NULL DEFAULT 'private',
  split_type         ENUM('equal','custom')    NOT NULL DEFAULT 'equal',
  memo               TEXT,
  status             ENUM('subscribed','cancelled') DEFAULT 'subscribed',
  FOREIGN KEY (uid) REFERENCES user (uid),
  CONSTRAINT chk_notify_range                   -- 알림은 최대 30일 전
    CHECK (notify_days_before IS NULL OR notify_days_before <= 30),
  CONSTRAINT chk_cancel_end_date                -- 해지 시 종료일 필수
    CHECK (status <> 'cancelled' OR end_date IS NOT NULL),
  CONSTRAINT chk_period                         -- 종료일 ≥ 시작일
    CHECK (start_date IS NULL OR end_date IS NULL OR end_date >= start_date),
  CONSTRAINT chk_billing_year
    CHECK (billing_date IS NULL OR YEAR(billing_date) = 2000),
  CONSTRAINT chk_billing_monthly
    CHECK (billing_cycle = 'yearly' OR billing_date IS NULL OR MONTH(billing_date) = 1)
);


-- ---------------------------------------------------------------------
-- 4. subscription_member                   [기획서 1-6 공유 구독]
--   소유자도 role = 'owner' 행으로 포함 (개인 구독 = owner 행 1개)
--   share_amount : 참여자별 부담 금액
--   status       : 친구 초대(invited) → 수락(joined) → 나가기(left)
--                  나가기는 DELETE 대신 left (정산 이력 보존)
-- ---------------------------------------------------------------------
CREATE TABLE subscription_member (
  sub_id       INT NOT NULL,
  uid          INT NOT NULL,
  role         ENUM('owner','member') NOT NULL,
  share_amount INT NOT NULL CHECK (share_amount >= 0),
  status       ENUM('invited','joined','left') NOT NULL DEFAULT 'invited',
  PRIMARY KEY (sub_id, uid),
  UNIQUE KEY uq_member_one_owner                -- 구독당 owner 1명
    ((IF(role = 'owner', sub_id, NULL))),
  FOREIGN KEY (sub_id) REFERENCES subscription (sub_id),
  FOREIGN KEY (uid)    REFERENCES user (uid)
);


-- ---------------------------------------------------------------------
-- 5. payment  (결제 이력 + 정산 통합)  [기획서 III-2 결제 이력, 1-6 정산]
--   type     : payment = 실제 결제 기록 (사용자가 직접 기록)
--              settlement = 참여자별 정산 몫
--   amount   : 기록 시점 금액 → 구독료가 바뀌어도 이력 보존
--   due_date : 어느 회차(결제일)의 몫인지
--   paid_at  : 실제 낸 날 / 정산 상태 = paid_at NULL 여부
--   지출 통계(월별·연간·서비스별·전월 비교)는 type = 'payment' 기준
-- ---------------------------------------------------------------------
CREATE TABLE payment (
  payment_id INT  PRIMARY KEY AUTO_INCREMENT,
  sub_id     INT  NOT NULL,
  uid        INT  NOT NULL,
  type       ENUM('payment','settlement') NOT NULL,
  amount     INT  NOT NULL CHECK (amount >= 0),
  due_date   DATE NOT NULL,
  paid_at    DATE NULL,
  UNIQUE KEY uq_payment_period                  -- 같은 회차 중복 기록 방지
    (sub_id, uid, type, due_date),
  KEY idx_payment_uid_due (uid, due_date),      -- 사용자별 기간 지출 통계 조회용
  FOREIGN KEY (sub_id, uid) REFERENCES subscription_member (sub_id, uid),
  CONSTRAINT chk_payment_paid                   -- 실제 결제는 낸 날 필수
    CHECK (type = 'settlement' OR paid_at IS NOT NULL)
);


-- =====================================================================
-- 샘플 데이터
-- =====================================================================

-- ---------------------------------------------------------------------
-- user : 활성 회원 5명 + 탈퇴 회원 1명
--   탈퇴 회원은 이름·이메일이 deleted_{uid}로 바뀌고 password = NULL
-- ---------------------------------------------------------------------
INSERT INTO user (uid, user_name, email, password, deleted_at) VALUES
  (1, 'minji',     'minji@example.com',         '$2b$10$j8/T3kuc57LMjBuTwyLGDu2LEBV8zxJ4gEDHUYGhPmF9u1bJPd3p6', NULL),
  (2, 'jihoon',    'jihoon@example.com',        '$2b$10$j8/T3kuc57LMjBuTwyLGDu2LEBV8zxJ4gEDHUYGhPmF9u1bJPd3p6', NULL),
  (3, 'sora',      'sora@example.com',          '$2b$10$j8/T3kuc57LMjBuTwyLGDu2LEBV8zxJ4gEDHUYGhPmF9u1bJPd3p6', NULL),
  (4, 'taeyang',   'taeyang@example.com',       '$2b$10$j8/T3kuc57LMjBuTwyLGDu2LEBV8zxJ4gEDHUYGhPmF9u1bJPd3p6', NULL),
  (5, 'hana',      'hana@example.com',          '$2b$10$j8/T3kuc57LMjBuTwyLGDu2LEBV8zxJ4gEDHUYGhPmF9u1bJPd3p6', NULL),
  (6, 'deleted_6', 'deleted_6@deleted.invalid', NULL, '2026-10-01 21:30:00');

-- ---------------------------------------------------------------------
-- friends : 수락(accepted) / 대기(pending) / 거절(rejected)
--   탈퇴 회원(uid 6)의 친구 관계는 탈퇴 시 삭제되어 없음
-- ---------------------------------------------------------------------
INSERT INTO friends (sender, receiver, status) VALUES
  (1, 2, 'accepted'),   -- minji ↔ jihoon
  (3, 1, 'accepted'),   -- sora ↔ minji
  (2, 3, 'accepted'),   -- jihoon ↔ sora
  (1, 4, 'pending'),    -- minji → taeyang 요청 대기
  (4, 5, 'pending'),    -- taeyang → hana 요청 대기
  (5, 1, 'rejected');   -- hana → minji 요청 거절

-- ---------------------------------------------------------------------
-- subscription : 8개 카테고리, 월간/연간, 해지, 알림, 공개 범위, 분담 방식
--   billing_date 는 2000년 고정 (monthly = 2000-01-DD, yearly = 2000-MM-DD)
-- ---------------------------------------------------------------------
INSERT INTO subscription
  (sub_id, uid, title, category, price, billing_cycle, billing_date,
   start_date, end_date, notify_days_before, visibility, split_type, memo, status)
VALUES
  -- minji(1)
  (1,  1, 'Netflix',          'ott',          17000,  'monthly', '2000-01-15', '2025-03-15', NULL,         3,    'friends', 'equal',  '프리미엄, 친구 2명과 공유', 'subscribed'),
  (2,  1, 'Spotify',          'music',        10900,  'monthly', '2000-01-05', '2025-09-05', NULL,         NULL, 'private', 'equal',  NULL,                        'subscribed'),
  (3,  1, 'iCloud+',          'cloud',        4400,   'monthly', '2000-01-28', '2024-01-28', NULL,         1,    'friends', 'equal',  '200GB',                     'subscribed'),
  (4,  1, '리디셀렉트',       'reading',      9900,   'monthly', '2000-01-10', '2026-01-10', '2026-06-10', NULL, 'private', 'equal',  '읽을 책을 다 읽어서 해지',  'cancelled'),
  (5,  1, 'Microsoft 365',    'productivity', 119000, 'yearly',  '2000-03-01', '2024-03-01', NULL,         7,    'private', 'equal',  '패밀리 요금제',             'subscribed'),
  -- jihoon(2)
  (6,  2, 'YouTube Premium',  'ott',          14900,  'monthly', '2000-01-20', '2025-11-20', NULL,         2,    'friends', 'custom', 'minji 4,000원 고정 분담',   'subscribed'),
  (7,  2, '쿠팡 와우',        'shopping',     7890,   'monthly', '2000-01-10', '2025-05-10', NULL,         NULL, 'friends', 'equal',  NULL,                        'subscribed'),
  -- sora(3)
  (8,  3, 'Nintendo Switch Online', 'game',   34900,  'yearly',  '2000-07-01', '2025-07-01', NULL,         5,    'friends', 'equal',  '패밀리 플랜',               'subscribed'),
  -- taeyang(4)
  (9,  4, '헬스장 앱',        'etc',          5000,   'monthly', '2000-01-25', '2026-08-25', NULL,         NULL, 'private', 'equal',  NULL,                        'subscribed'),
  -- hana(5)
  (10, 5, 'Google One',       'cloud',        2400,   'monthly', '2000-01-02', '2026-02-02', NULL,         NULL, 'friends', 'equal',  '100GB',                     'subscribed');

-- ---------------------------------------------------------------------
-- subscription_member : 모든 구독에 owner 행 1개 + 공유 참여자
--   equal  : joined 인원으로 나눔, 나머지는 owner 부담 (17000 = 5668 + 5666 + 5666)
--   custom : 멤버 금액 지정, owner = 구독료 - 멤버 합계 (14900 = 10900 + 4000)
--   invited 는 수락 전까지 0원 / left 는 나간 뒤에도 행 유지 (정산 이력 보존)
-- ---------------------------------------------------------------------
INSERT INTO subscription_member (sub_id, uid, role, share_amount, status) VALUES
  (1,  1, 'owner',  5668,   'joined'),
  (1,  2, 'member', 5666,   'joined'),
  (1,  3, 'member', 5666,   'joined'),
  (2,  1, 'owner',  10900,  'joined'),
  (3,  1, 'owner',  4400,   'joined'),
  (4,  1, 'owner',  9900,   'joined'),
  (5,  1, 'owner',  119000, 'joined'),
  (6,  2, 'owner',  10900,  'joined'),
  (6,  1, 'member', 4000,   'joined'),
  (6,  3, 'member', 0,      'invited'),   -- sora 초대 수락 대기
  (7,  2, 'owner',  7890,   'joined'),
  (8,  3, 'owner',  34900,  'joined'),
  (8,  2, 'member', 17450,  'left'),      -- jihoon 2026-08에 나감
  (9,  4, 'owner',  5000,   'joined'),
  (10, 5, 'owner',  2400,   'joined');

-- ---------------------------------------------------------------------
-- payment : type = payment (실제 결제 기록) / settlement (참여자 정산 몫)
--   amount 는 기록 당시 금액 (Microsoft 365 2025년 109,000원 → 2026년 119,000원)
--   settlement 의 paid_at = NULL 이면 아직 정산 안 됨
-- ---------------------------------------------------------------------
INSERT INTO payment (payment_id, sub_id, uid, type, amount, due_date, paid_at) VALUES
  -- Netflix (owner minji + 참여자 jihoon, sora)
  (1,  1, 1, 'payment',    5668,   '2026-09-15', '2026-09-15'),
  (2,  1, 1, 'payment',    5668,   '2026-10-15', '2026-10-15'),
  (3,  1, 1, 'payment',    5668,   '2026-11-15', '2026-11-15'),
  (4,  1, 2, 'payment',    5666,   '2026-10-15', '2026-10-16'),
  (5,  1, 3, 'payment',    5666,   '2026-10-15', '2026-10-15'),
  (6,  1, 2, 'settlement', 5666,   '2026-10-15', '2026-10-16'),
  (7,  1, 3, 'settlement', 5666,   '2026-10-15', '2026-10-15'),
  (8,  1, 2, 'settlement', 5666,   '2026-11-15', NULL),          -- jihoon 11월 미정산
  (9,  1, 3, 'settlement', 5666,   '2026-11-15', '2026-11-17'),
  -- Spotify
  (10, 2, 1, 'payment',    10900,  '2026-09-05', '2026-09-05'),
  (11, 2, 1, 'payment',    10900,  '2026-10-05', '2026-10-05'),
  (12, 2, 1, 'payment',    10900,  '2026-11-05', '2026-11-06'),
  -- iCloud+
  (13, 3, 1, 'payment',    4400,   '2026-09-28', '2026-09-28'),
  (14, 3, 1, 'payment',    4400,   '2026-10-28', '2026-10-28'),
  -- 리디셀렉트 (2026-06-10 해지, 이력은 유지)
  (15, 4, 1, 'payment',    9900,   '2026-04-10', '2026-04-10'),
  (16, 4, 1, 'payment',    9900,   '2026-05-10', '2026-05-10'),
  (17, 4, 1, 'payment',    9900,   '2026-06-10', '2026-06-10'),
  -- Microsoft 365 (연간)
  (18, 5, 1, 'payment',    109000, '2025-03-01', '2025-03-01'),
  (19, 5, 1, 'payment',    119000, '2026-03-01', '2026-03-02'),
  -- YouTube Premium (owner jihoon + 참여자 minji, custom)
  (20, 6, 2, 'payment',    10900,  '2026-10-20', '2026-10-20'),
  (21, 6, 2, 'payment',    10900,  '2026-11-20', '2026-11-20'),
  (22, 6, 1, 'payment',    4000,   '2026-11-20', '2026-11-21'),
  (23, 6, 1, 'settlement', 4000,   '2026-10-20', '2026-10-22'),
  (24, 6, 1, 'settlement', 4000,   '2026-11-20', '2026-11-21'),
  -- 쿠팡 와우
  (25, 7, 2, 'payment',    7890,   '2026-10-10', '2026-10-10'),
  (26, 7, 2, 'payment',    7890,   '2026-11-10', '2026-11-10'),
  -- Nintendo Switch Online (연간, jihoon은 나갔지만 2026-07 정산 이력은 남음)
  (27, 8, 3, 'payment',    17450,  '2026-07-01', '2026-07-01'),
  (28, 8, 2, 'settlement', 17450,  '2026-07-01', '2026-07-03'),
  -- 헬스장 앱
  (29, 9, 4, 'payment',    5000,   '2026-09-25', '2026-09-25'),
  (30, 9, 4, 'payment',    5000,   '2026-10-25', '2026-10-25'),
  -- Google One
  (31, 10, 5, 'payment',   2400,   '2026-10-02', '2026-10-02'),
  (32, 10, 5, 'payment',   2400,   '2026-11-02', '2026-11-02');
