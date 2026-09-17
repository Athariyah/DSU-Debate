import assert from "node:assert/strict";
import test from "node:test";
import { castVoteSchema, createEventSchema, updateEventSchema } from "../src/validation/schemas";

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

test("hiddenFromPublic flag is accepted by create and update schemas", () => {
  const created = createEventSchema.safeParse({
    title: "A hidden debate",
    dateTime: "2026-09-14T16:00:00.000Z",
    hiddenFromPublic: true,
    participants: [{ name: "One" }, { name: "Two" }],
  });
  assert.equal(created.success, true);
  if (created.success) assert.equal(created.data.hiddenFromPublic, true);

  // Флажок опциональный: без него создание остаётся валидным.
  const createdWithoutFlag = createEventSchema.safeParse({
    title: "A public debate",
    dateTime: "2026-09-14T16:00:00.000Z",
  });
  assert.equal(createdWithoutFlag.success, true);

  const updated = updateEventSchema.safeParse({ hiddenFromPublic: false });
  assert.equal(updated.success, true);
  if (updated.success) assert.equal(updated.data.hiddenFromPublic, false);

  const updatedInvalid = updateEventSchema.safeParse({ hiddenFromPublic: "yes" });
  assert.equal(updatedInvalid.success, false);
});
