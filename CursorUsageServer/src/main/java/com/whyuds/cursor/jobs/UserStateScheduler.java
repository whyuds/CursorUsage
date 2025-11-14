package com.whyuds.cursor.jobs;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import java.time.OffsetDateTime;

@Component
public class UserStateScheduler {
  private final JdbcTemplate jdbc;

  @Value("${user.state.offlineSeconds:60}")
  private int offlineSeconds;

  public UserStateScheduler(JdbcTemplate jdbc) {
    this.jdbc = jdbc;
  }

  @Scheduled(fixedDelayString = "${user.state.scanDelayMillis:60000}")
  public void markOfflineIfStale() {
    OffsetDateTime cutoff = OffsetDateTime.now().minusSeconds(offlineSeconds);
    jdbc.update("UPDATE cursor_user_state SET online=0 WHERE online=1 AND last_seen < ?", cutoff);
  }
}