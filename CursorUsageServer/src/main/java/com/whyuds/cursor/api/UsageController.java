package com.whyuds.cursor.api;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.time.OffsetDateTime;
import java.time.ZoneOffset;

@RestController
@RequestMapping("/api/usage")
public class UsageController {
  private final JdbcTemplate jdbc;

  public UsageController(JdbcTemplate jdbc) {
    this.jdbc = jdbc;
  }

  public static class UsageLogRequest {
    public Long userId;
    public String email;
    public String createdAt;
    public String expiresAt;
    public Long totalLimitCents;
    public Long usedCents;
    public Long remainingCents;
    public String host;
    public String platform;
  }

  @PostMapping("/log")
  public ResponseEntity<?> log(@RequestBody UsageLogRequest req) {
    OffsetDateTime created = req.createdAt != null ? OffsetDateTime.parse(req.createdAt) : OffsetDateTime.now(ZoneOffset.UTC);
    OffsetDateTime expires = req.expiresAt != null ? OffsetDateTime.parse(req.expiresAt) : null;

    jdbc.update(
      "INSERT INTO cursor_user_info(email,user_id,created_at,expires_at,host,platform,updated_at) VALUES (?,?,?,?,?,?,NOW()) " +
      "ON DUPLICATE KEY UPDATE user_id=VALUES(user_id),created_at=VALUES(created_at),expires_at=VALUES(expires_at),host=VALUES(host),platform=VALUES(platform),updated_at=NOW()",
      req.email, req.userId, created, expires, req.host, req.platform
    );

    jdbc.update(
      "INSERT INTO cursor_user_usage_logs(email,user_id,created_at,expires_at,total_limit_cents,used_cents,remaining_cents,host,platform,log_time) " +
      "VALUES (?,?,?,?,?,?,?,?,?,NOW())",
      req.email, req.userId, created, expires, req.totalLimitCents, req.usedCents, req.remainingCents, req.host, req.platform
    );

    return ResponseEntity.ok().build();
  }

  public static class PingRequest {
    public Long userId;
    public String email;
    public String host;
    public String platform;
  }

  @PostMapping("/ping")
  public ResponseEntity<?> ping(@RequestBody PingRequest req) {
    jdbc.update(
      "INSERT INTO cursor_user_state(email,user_id,online,last_seen,host,platform) VALUES (?,?,?,?,?,?) " +
        "ON DUPLICATE KEY UPDATE online=VALUES(online),last_seen=VALUES(last_seen),host=VALUES(host),platform=VALUES(platform)",
      req.email, req.userId, true, OffsetDateTime.now(), req.host, req.platform
    );
    return ResponseEntity.ok().build();
  }

  public static class OfflineRequest {
    public Long userId;
    public String email;
  }

  @PostMapping("/offline")
  public ResponseEntity<?> offline(@RequestBody OfflineRequest req) {
    jdbc.update(
      "INSERT INTO cursor_user_state(email,user_id,online,last_seen) VALUES (?,?,?,?) " +
        "ON DUPLICATE KEY UPDATE online=VALUES(online),last_seen=VALUES(last_seen)",
      req.email, req.userId, false, OffsetDateTime.now()
    );
    return ResponseEntity.ok().build();
  }
}