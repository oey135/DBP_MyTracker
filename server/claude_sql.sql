USE bsby7drmskkoscccevjw;

SELECT sub_id, uid, title, category, billing_cycle FROM subscription;

-- 탈퇴한 회원 점검?
SELECT uid, user_name, email, deleted_at FROM user ORDER BY uid DESC;
-- SELECT uid, title FROM subscription WHERE uid = ; 

-- 0. 백업 (이미 만들어졌으면 그대로 넘어감)
CREATE TABLE IF NOT EXISTS subscription_bak AS SELECT * FROM subscription;
CREATE TABLE IF NOT EXISTS user_bak AS SELECT * FROM user;

-- 1. subscription: 복합 PK -> sub_id PK, 기능 컬럼 추가
ALTER TABLE `subscription`
  ADD COLUMN `sub_id` int NOT NULL AUTO_INCREMENT FIRST,
  ADD COLUMN `category` enum('ott','music','cloud','productivity','game','etc') NOT NULL DEFAULT 'etc' AFTER `title`,
  ADD COLUMN `billing_cycle` enum('monthly','yearly') NOT NULL DEFAULT 'monthly' AFTER `price`,
  ADD COLUMN `visibility` enum('private','friends') NOT NULL DEFAULT 'private',
  ADD COLUMN `is_shared` tinyint(1) NOT NULL DEFAULT 0,
  ADD COLUMN `alert_days_before` int NULL DEFAULT NULL,
  DROP PRIMARY KEY,
  ADD PRIMARY KEY (`sub_id`),
  ADD UNIQUE KEY `uq_uid_title` (`uid`, `title`);

-- 2. 공유 구독 참여자 및 분담 금액
CREATE TABLE `subscription_member` (
  `sub_id` int NOT NULL,
  `uid` int NOT NULL,
  `share_amount` int NOT NULL,
  PRIMARY KEY (`sub_id`, `uid`),
  CONSTRAINT `fk_sm_sub` FOREIGN KEY (`sub_id`) REFERENCES `subscription` (`sub_id`) ON DELETE CASCADE,
  CONSTRAINT `fk_sm_user` FOREIGN KEY (`uid`) REFERENCES `user` (`uid`),
  CONSTRAINT `chk_share` CHECK (`share_amount` >= 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8;

-- 3. 결제 이력 + 정산 (통합)
CREATE TABLE `payment` (
  `payment_id` int NOT NULL AUTO_INCREMENT,
  `sub_id` int NOT NULL,
  `uid` int NOT NULL,
  `pay_date` date NOT NULL,
  `amount` int NOT NULL,
  `settle_status` enum('not_required','pending','settled') NOT NULL DEFAULT 'not_required',
  `settled_at` datetime NULL DEFAULT NULL,
  PRIMARY KEY (`payment_id`),
  KEY `idx_payment_uid_date` (`uid`, `pay_date`),
  CONSTRAINT `fk_pay_sub` FOREIGN KEY (`sub_id`) REFERENCES `subscription` (`sub_id`),
  CONSTRAINT `fk_pay_user` FOREIGN KEY (`uid`) REFERENCES `user` (`uid`),
  CONSTRAINT `chk_amount` CHECK (`amount` >= 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8;


USE bsby7drmskkoscccevjw;

-- 1. 코멘트만 변경 (타입, NOT NULL 등은 기존과 동일)
ALTER TABLE `subscription`
  MODIFY COLUMN `billing_date` date NOT NULL
  COMMENT '기준연도 2000 고정. monthly: 2000-01-DD(일자만), yearly: 2000-MM-DD(월·일)';

-- 2. 연도가 2000이 아닌 값이 들어오지 않도록 제약 추가
ALTER TABLE `subscription`
  ADD CONSTRAINT `chk_billing_year` CHECK (YEAR(`billing_date`) = 2000);

-- 3. 연간 구독은 월을 쓰고, 월간 구독은 1월로 고정
ALTER TABLE `subscription`
  ADD CONSTRAINT `chk_billing_monthly` CHECK (`billing_cycle` = 'yearly' OR MONTH(`billing_date`) = 1);


SELECT sub_id, title, billing_date FROM subscription
WHERE YEAR(billing_date) <> 2000 OR (billing_cycle = 'monthly' AND MONTH(billing_date) <> 1);

-- 거부되어야 정상 (에러 발생)
INSERT INTO subscription (uid, title, price, billing_cycle, billing_date)
VALUES (1, 'test_bad', 1000, 'monthly', '2026-05-10');