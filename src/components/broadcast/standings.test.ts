import { describe, expect, test } from "vitest";
import { computeStandings } from "./standings";
import type { Participant } from "../../types";

function participant(id: number, votesCount: number): Participant {
  return { id, eventId: 1, name: `Участник ${id}`, votesCount, percentage: 0 };
}

describe("computeStandings", () => {
  test("победитель — наибольший процент, проигравший — наименьший", () => {
    const standings = computeStandings([
      participant(1, 10),
      participant(2, 40),
      participant(3, 25),
    ]);

    expect(standings.hasVotes).toBe(true);
    expect(standings.decisive).toBe(true);
    expect(standings.top.map((item) => item.id)).toEqual([2]);
    expect(standings.bottom.map((item) => item.id)).toEqual([1]);
    expect(standings.winner?.id).toBe(2);
    expect(standings.loser?.id).toBe(1);
    expect(standings.others.map((item) => item.id)).toEqual([3]);
    // sorted — по убыванию голосов
    expect(standings.sorted.map((item) => item.id)).toEqual([2, 3, 1]);
  });

  test("без голосов итог не подводится", () => {
    const standings = computeStandings([participant(1, 0), participant(2, 0)]);

    expect(standings.hasVotes).toBe(false);
    expect(standings.decisive).toBe(false);
    expect(standings.leaderUnique).toBe(false);
    expect(standings.winner).toBeNull();
    expect(standings.loser).toBeNull();
  });

  test("равные голоса сверху — ничья, не «победитель»", () => {
    const standings = computeStandings([participant(1, 15), participant(2, 15), participant(3, 4)]);

    expect(standings.hasVotes).toBe(true);
    expect(standings.decisive).toBe(false);
    expect(standings.top.map((item) => item.id)).toEqual([1, 2]);
    expect(standings.bottom.map((item) => item.id)).toEqual([3]);
    expect(standings.leaderUnique).toBe(false);
    expect(standings.winner).toBeNull();
  });

  test("один участник: топ и низ — он же, итог неоднозначен", () => {
    const standings = computeStandings([participant(1, 12)]);

    expect(standings.top).toHaveLength(1);
    expect(standings.bottom).toHaveLength(1);
    expect(standings.decisive).toBe(false);
    expect(standings.leaderUnique).toBe(true);
  });

  test("проигравших несколько: победитель есть, проигравший неоднозначен", () => {
    const standings = computeStandings([
      participant(1, 10),
      participant(2, 5),
      participant(3, 5),
    ]);

    expect(standings.winner?.id).toBe(1);
    expect(standings.loser).toBeNull();
    expect(standings.decisive).toBe(false);
    expect(standings.bottom.map((item) => item.id)).toEqual([2, 3]);
  });

  test("пустой список не падает", () => {
    const standings = computeStandings([]);
    expect(standings.sorted).toEqual([]);
    expect(standings.decisive).toBe(false);
  });
});
