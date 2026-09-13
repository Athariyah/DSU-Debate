import assert from "node:assert/strict";
import test from "node:test";
import { castVoteSchema, createEventSchema } from "../src/validation/schemas";

test("castVoteSchema accepts UUID v4 and rejects other UUID versions", () => {
  const valid = castVoteSchema.safeParse({
    participantId: 1,
    deviceFingerprint: "b6f1a6b2-8e2b-4a90-9a2a-7a6f0e0a1234",
  });
  assert.equal(valid.success, true);

  const invalid = castVoteSchema.safeParse({
    participantId: 1,
    deviceFingerprint: "b6f1a6b2-8e2b-1a90-9a2a-7a6f0e0a1234",
  });
  assert.equal(invalid.success, false);
});

test("createEventSchema only accepts ISO timestamps with timezone", () => {
  assert.equal(
    createEventSchema.safeParse({
      title: "A valid debate",
      dateTime: "2026-09-14T16:00:00.000Z",
      participants: [{ name: "One" }, { name: "Two" }],
    }).success,
    true
  );
  assert.equal(
    createEventSchema.safeParse({ title: "A valid debate", dateTime: "tomorrow" }).success,
    false
  );
});
