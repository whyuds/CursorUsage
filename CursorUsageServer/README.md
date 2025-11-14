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

## 心跳长链接
- 路径: `ws://<server-host>/ws/ping`
- 建链后发送初始化报文:
```json
{
  "type": "init",
  "email": "1459189802@qq.com",
  "userId": 260960778,
  "host": "DESKTOP-ABC",
  "platform": "win32"
}
```
- 每 30 秒发送心跳报文:
```json
{
  "type": "ping",
  "email": "1459189802@qq.com",
  "userId": 260960778
}
```

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
- 启动后若配置了 `teamServerUrl`，建立 `ws://<server-host>/ws/ping` 长链接并每 30 秒发送心跳

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