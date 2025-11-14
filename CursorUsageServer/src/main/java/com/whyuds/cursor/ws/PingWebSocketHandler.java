package com.whyuds.cursor.ws;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;
import org.springframework.web.socket.CloseStatus;
import org.springframework.web.socket.TextMessage;
import org.springframework.web.socket.WebSocketSession;
import org.springframework.web.socket.handler.TextWebSocketHandler;

import java.time.OffsetDateTime;
import java.util.Map;

@Component
public class PingWebSocketHandler extends TextWebSocketHandler {
  private final JdbcTemplate jdbc;

  public PingWebSocketHandler(JdbcTemplate jdbc) {
    this.jdbc = jdbc;
  }

  private String get(Map<String, Object> m, String k) {
    Object v = m.get(k);
    return v == null ? null : String.valueOf(v);
  }

  private Long getLong(Map<String, Object> m, String k) {
    try {
      Object v = m.get(k);
      if (v == null) return null;
      return Long.valueOf(String.valueOf(v));
    } catch (Exception e) {
      return null;
    }
  }

  @Override
  public void handleTextMessage(WebSocketSession session, TextMessage message) throws Exception {
    String payload = message.getPayload();
    Map<String, Object> obj = com.fasterxml.jackson.databind.json.JsonMapper.builder().build().readValue(payload, Map.class);
    String type = get(obj, "type");
    String email = get(obj, "email");
    Long userId = getLong(obj, "userId");
    String host = get(obj, "host");
    String platform = get(obj, "platform");
    boolean online = true;
    if ("init".equalsIgnoreCase(type)) {
      if (email != null) {
        session.getAttributes().put("email", email);
      }
      if (userId != null) {
        session.getAttributes().put("userId", userId);
      }
    }
    if ("init".equalsIgnoreCase(type) || "ping".equalsIgnoreCase(type)) {
      jdbc.update(
        "INSERT INTO cursor_user_state(email,user_id,online,last_seen,host,platform) VALUES (?,?,?,?,?,?) " +
          "ON DUPLICATE KEY UPDATE online=VALUES(online),last_seen=VALUES(last_seen),host=VALUES(host),platform=VALUES(platform)",
        email, userId, online, OffsetDateTime.now(), host, platform
      );
    }
  }

  @Override
  public void afterConnectionClosed(WebSocketSession session, CloseStatus status) throws Exception {
    Object email = session.getAttributes().get("email");
    Object userId = session.getAttributes().get("userId");
    if (email != null) {
      jdbc.update(
        "INSERT INTO cursor_user_state(email,user_id,online,last_seen) VALUES (?,?,?,?) " +
          "ON DUPLICATE KEY UPDATE online=VALUES(online),last_seen=VALUES(last_seen)",
        String.valueOf(email), userId == null ? null : Long.valueOf(String.valueOf(userId)), false, OffsetDateTime.now()
      );
    }
  }
}