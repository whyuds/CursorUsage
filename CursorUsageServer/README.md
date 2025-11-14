# CursorUsageServer

## 简介
- 提供 HTTP 接口用于接收扩展每次刷新后的使用量快照并入库
- 提供 WebSocket 长链接用于心跳上报并更新用户在线状态
- 默认端口 `8080`，数据库连接通过环境变量注入

## 环境配置
- `JDBC_URL`: 数据库连接字符串，例如 `jdbc:mysql://bd.qubecomputeflow.r.qiyi.db:2809/qube_compute?useUnicode=true&characterEncoding=utf8&useSSL=false&serverTimezone=Asia/Shanghai`
- `JDBC_USERNAME`: 数据库用户名，例如 `qube_compute`
- `JDBC_PASSWORD`: 数据库密码，例如 `Qube123`
- `JDBC_DRIVER`: 驱动类名，例如 `com.mysql.cj.jdbc.Driver`

## 投递 API 格式
- 路径: `POST /api/usage/log`
- Content-Type: `application/json`
- 请求体示例:
```json
{
  "userId": 260960778,
  "email": "1459189802@qq.com",
  "createdAt": "2025-07-25T08:45:23.109Z",
  "expiresAt": "2025-11-30T00:00:00.000Z",
  "totalLimitCents": 40000,
  "usedCents": 1234,
  "remainingCents": 38766,
  "host": "DESKTOP-ABC",
  "platform": "win32"
}
```
- 响应: `200 OK`

## 在线心跳（HTTP）
- 路径: `POST /api/usage/ping`
- 请求体示例:
```json
{
  "email": "1459189802@qq.com",
  "userId": 260960778,
  "host": "DESKTOP-ABC",
  "platform": "win32"
}
```
- 作用: upsert 到 `cursor_user_state`，设置 `online=1`，更新 `last_seen`

## 离线标记（HTTP）
- 路径: `POST /api/usage/offline`
- 请求体示例:
```json
{
  "email": "1459189802@qq.com",
  "userId": 260960778
}
```
- 作用: upsert 到 `cursor_user_state`，设置 `online=0`，更新 `last_seen`

## 数据库 DDL
```sql
-- 用户信息表（email 为主键）
CREATE TABLE IF NOT EXISTS cursor_user_info (
  email            VARCHAR(128) PRIMARY KEY,
  user_id          BIGINT,
  created_at       DATETIME,
  expires_at       DATETIME,
  host             VARCHAR(128),
  platform         VARCHAR(64),
  updated_at       DATETIME
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 使用量日志表
CREATE TABLE IF NOT EXISTS cursor_user_usage_logs (
  id                BIGINT AUTO_INCREMENT PRIMARY KEY,
  email             VARCHAR(128) NOT NULL,
  user_id           BIGINT,
  created_at        DATETIME,
  expires_at        DATETIME,
  total_limit_cents BIGINT,
  used_cents        BIGINT,
  remaining_cents   BIGINT,
  host              VARCHAR(128),
  platform          VARCHAR(64),
  log_time          DATETIME,
  INDEX idx_email_time (email, log_time)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 在线状态表（email 为主键）
CREATE TABLE IF NOT EXISTS cursor_user_state (
  email      VARCHAR(128) PRIMARY KEY,
  user_id    BIGINT,
  online     TINYINT(1),
  last_seen  DATETIME,
  host       VARCHAR(128),
  platform   VARCHAR(64)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

## 扩展侧投递逻辑说明
- 扩展设置项 `cursorUsage.teamServerUrl` 默认为空；为空则不进行任何投递或心跳
- 每次刷新成功后向 `POST /api/usage/log` 投递一次使用量快照
- 扩展激活后立即 `POST /api/usage/ping` 设置在线，并每 30 秒继续 `ping`
- 扩展停用（deactivate）时 `POST /api/usage/offline` 设置离线

## 定时离线策略
- 服务端每 2 分钟扫描一次，将 `last_seen` 早于 2 分钟的在线用户置为离线
- 参数：`user.state.offlineSeconds=120`，`user.state.scanDelayMillis=120000`

## Cursor get-me 示例
```json
{
  "authId": "github|user_01K10C3EXY305QWX8VQ6956Y37",
  "userId": 260960778,
  "email": "1459189802@qq.com",
  "workosId": "user_01K10C3EXY305QWX8VQ6956Y37",
  "createdAt": "2025-07-25T08:45:23.109Z",
  "isEnterpriseUser": false
}
```