-- =====================================================================
-- MyTracker 최종 스키마 (5 테이블)
--   상의·확정 내용 + 2학기 발전 기획서 기능 반영
--   + subscription.category (카테고리별 지출 통계용, 2026-11-22 추가)
-- 대상: MySQL 8.0.16+
--
-- ⚠ 기존 테이블과 데이터를 모두 삭제하고 새로 생성함
--   운영 DB에 실행하기 전에 반드시 백업할 것. USE 대상 DB 이름도 확인.
--
-- 기획서 표(6테이블)와의 대응
--   Payments + Settlements            → payment (type = payment | settlement)
--   Friendships                       → friends
--   SharedGroups + GroupMembers
--     + SharedSubscriptions           → subscription + subscription_member
--                                        (공유 그룹 = 공유 구독 1건)
-- =====================================================================
USE mytracker;

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
