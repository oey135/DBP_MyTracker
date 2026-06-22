// ─────────────────────────────────────────────
// server/db.js  —  MySQL 연결 풀
// ─────────────────────────────────────────────
// 설치: npm install mysql2 dotenv
//
// .env 파일 예시:
//   DB_HOST=localhost
//   DB_PORT=3306
//   DB_USER=root
//   DB_PASSWORD=yourpassword
//   DB_NAME=mytracker
// ─────────────────────────────────────────────

import mysql from "mysql2/promise";
import "dotenv/config";

const pool = mysql.createPool({
  host:               process.env.DB_HOST     ?? "localhost",
  port:               Number(process.env.DB_PORT ?? 3306),
  user:               process.env.DB_USER     ?? "root",
  password:           process.env.DB_PASSWORD ?? "",
  database:           process.env.DB_NAME     ?? "mytracker",
  charset:            "utf8mb4",
  waitForConnections: true,
  connectionLimit:    10,
  queueLimit:         0,
  // DATE 컬럼을 JS Date가 아닌 문자열 "YYYY-MM-DD" 로 반환
  dateStrings:        true,
  // Render 슬립 후 재시작 시 끊긴 연결 자동 복구
  enableKeepAlive:    true,
  keepAliveInitialDelay: 0,
});

export default pool;
