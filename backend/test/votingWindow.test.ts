import assert from "node:assert/strict";
import test from "node:test";
import { isVotingWindowOpen, votingEndsAt } from "../src/utils/votingWindow";

const scheduledAt = new Date("2026-09-17T09:00:00.000Z");
const startedAt = new Date("2026-09-17T12:00:00.000Z");

test("таймер отсчитывается от фактического запуска, а не от расписания", () => {
  const end = votingEndsAt({
    date_time: scheduledAt,
    voting_started_at: startedAt,
    voting_duration_minutes: 10,
  });

  assert.equal(end?.toISOString(), "2026-09-17T12:10:00.000Z");
  assert.equal(
    isVotingWindowOpen(
      {
        date_time: scheduledAt,
        voting_started_at: startedAt,
        voting_duration_minutes: 10,
      },
      new Date("2026-09-17T12:09:59.999Z")
    ),
    true
  );
  assert.equal(
    isVotingWindowOpen(
      {
        date_time: scheduledAt,
        voting_started_at: startedAt,
        voting_duration_minutes: 10,
      },
      new Date("2026-09-17T12:10:00.000Z")
    ),
    false
  );
});

test("старые записи без времени запуска используют расписание", () => {
  const end = votingEndsAt({ date_time: scheduledAt, voting_duration_minutes: 10 });
  assert.equal(end?.toISOString(), "2026-09-17T09:10:00.000Z");
});
