import { describe, expect, it } from "vitest";
import { mockStore, mockRegisterVote } from "./mockData";

describe("mock debate contract", () => {
  it("keeps vote totals and percentages consistent", () => {
    const event = mockStore.events.find((item) => item.status === "active");
    expect(event).toBeDefined();
    if (!event) return;

    const before = event.totalVotes;
    const updated = mockRegisterVote(event.id, event.participants[0].id);
    expect(updated.totalVotes).toBe(before + 1);
    expect(updated.participants.reduce((sum, participant) => sum + participant.votesCount, 0)).toBe(updated.totalVotes);
  });
});
