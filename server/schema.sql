-- ─────────────────────────────────────────────
-- schema.sql  —  MyTracker DB 스키마 (원격 Clever Cloud DB 기준, MySQL 8.0+)
-- 새 DB에 처음 만들 때 사용. 이미 운영 중인 원격 DB에는 실행하지 말 것 (이미 적용됨).
-- 실행 전: USE <DB이름>;  (원격: bsby7drmskkoscccevjw)
-- ─────────────────────────────────────────────

USE bsby7drmskkoscccevjw;

CREATE TABLE `user` (
  `uid`        int NOT NULL AUTO_INCREMENT,
  `user_name`  varchar(20)  NOT NULL,
  `email`      varchar(255) NOT NULL,
  `password`   varchar(256) NOT NULL,
  `deleted_at` datetime DEFAULT NULL,            -- 탈퇴 시각 (소프트 삭제)
  PRIMARY KEY (`uid`),
  UNIQUE KEY `uq_user_name` (`user_name`),
  UNIQUE KEY `uq_email` (`email`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8;

CREATE TABLE `friends` (
  `sender`   int NOT NULL,                       -- 요청한 사람
  `receiver` int NOT NULL,                       -- 요청받은 사람
  `status`   enum('pending','accepted','rejected') NOT NULL DEFAULT 'pending',
  PRIMARY KEY (`sender`, `receiver`),
  KEY `fk_receiver` (`receiver`),
  CONSTRAINT `fk_sender`   FOREIGN KEY (`sender`)   REFERENCES `user` (`uid`) ON DELETE CASCADE,
  CONSTRAINT `fk_receiver` FOREIGN KEY (`receiver`) REFERENCES `user` (`uid`) ON DELETE CASCADE,
  CONSTRAINT `chk_no_self` CHECK (`sender` <> `receiver`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8;

CREATE TABLE `subscription` (
  `sub_id`        int NOT NULL AUTO_INCREMENT,
  `uid`           int NOT NULL,                  -- 소유자(결제자)
  `title`         varchar(50) NOT NULL,
  `category`      enum('ott','music','cloud','productivity','game','etc') NOT NULL DEFAULT 'etc',
  `price`         int NOT NULL,                  -- monthly: 월 금액, yearly: 연 금액
  `billing_cycle` enum('monthly','yearly') NOT NULL DEFAULT 'monthly',
  `start_date`    date DEFAULT NULL,
  `billing_date`  date NOT NULL
      COMMENT '기준연도 2000 고정. monthly: 2000-01-DD(일자만), yearly: 2000-MM-DD(월·일)',
  `memo`          text,
  `status`        enum('subscribed','cancelled') DEFAULT 'subscribed',
  `visibility`    enum('private','friends') NOT NULL DEFAULT 'private',
  `is_shared`     tinyint(1) NOT NULL DEFAULT 0,
  `alert_days_before` int DEFAULT NULL,
  PRIMARY KEY (`sub_id`),
  UNIQUE KEY `uq_uid_title` (`uid`, `title`),
  CONSTRAINT `fk_sub_user` FOREIGN KEY (`uid`) REFERENCES `user` (`uid`) ON DELETE CASCADE,
  CONSTRAINT `chk_price` CHECK (`price` >= 0),
  CONSTRAINT `chk_billing_year` CHECK (YEAR(`billing_date`) = 2000),
  CONSTRAINT `chk_billing_monthly` CHECK (`billing_cycle` = 'yearly' OR MONTH(`billing_date`) = 1)
) ENGINE=InnoDB DEFAULT CHARSET=utf8;

CREATE TABLE `subscription_member` (             -- 공유 구독 참여자·분담금
  `sub_id`       int NOT NULL,
  `uid`          int NOT NULL,
  `share_amount` int NOT NULL,
  PRIMARY KEY (`sub_id`, `uid`),
  CONSTRAINT `fk_sm_sub`  FOREIGN KEY (`sub_id`) REFERENCES `subscription` (`sub_id`) ON DELETE CASCADE,
  CONSTRAINT `fk_sm_user` FOREIGN KEY (`uid`)    REFERENCES `user` (`uid`),
  CONSTRAINT `chk_share`  CHECK (`share_amount` >= 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8;

CREATE TABLE `payment` (                         -- 결제 이력 + 정산
  `payment_id`    int NOT NULL AUTO_INCREMENT,
  `sub_id`        int NOT NULL,
  `uid`           int NOT NULL,                  -- 낸 사람
  `pay_date`      date NOT NULL,
  `amount`        int NOT NULL,
  `settle_status` enum('not_required','pending','settled') NOT NULL DEFAULT 'not_required',
  `settled_at`    datetime DEFAULT NULL,
  PRIMARY KEY (`payment_id`),
  KEY `idx_payment_uid_date` (`uid`, `pay_date`),
  CONSTRAINT `fk_pay_sub`  FOREIGN KEY (`sub_id`) REFERENCES `subscription` (`sub_id`),
  CONSTRAINT `fk_pay_user` FOREIGN KEY (`uid`)    REFERENCES `user` (`uid`),
  CONSTRAINT `chk_amount`  CHECK (`amount` >= 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8;