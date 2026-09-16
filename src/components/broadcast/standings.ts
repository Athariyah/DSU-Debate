import type { Participant } from "../../types";

export interface Standings {
  /** Участники, отсортированные по убыванию голосов (при равенстве — по id). */
  sorted: Participant[];
  /** Лидеры: участники с максимальным числом голосов. */
  top: Participant[];
  /** Отстающие: участники с минимальным числом голосов. */
  bottom: Participant[];
  /** Все остальные — между лидерами и отстающими. */
  others: Participant[];
  /** Поступил ли хотя бы один голос. */
  hasVotes: boolean;
  /** Лидер единственный — его можно показывать чипом «Лидер» во время voting. */
  leaderUnique: boolean;
  /** Победитель: единственный участник с наибольшим процентом (иначе null). */
  winner: Participant | null;
  /** Проигравший: единственный участник с наименьшим процентом (иначе null). */
  loser: Participant | null;
  /** Есть и победитель, и проигравший — итог можно показать «один на один». */
  decisive: boolean;
}

/**
 * Считает расстановку сил по текущим голосам. Используется и во время
 * голосования (чип «Лидер»), и в финальной анимации (победитель — наибольший
 * процент, проигравший — наименьший).
 */
export function computeStandings(participants: Participant[]): Standings {
  const sorted = [...participants].sort(
    (a, b) => b.votesCount - a.votesCount || a.id - b.id
  );

  const totalVotes = sorted.reduce((sum, participant) => sum + participant.votesCount, 0);
  const hasVotes = totalVotes > 0;

  if (sorted.length === 0) {
    return {
      sorted,
      top: [],
      bottom: [],
      others: [],
      hasVotes,
      leaderUnique: false,
      winner: null,
      loser: null,
      decisive: false,
    };
  }

  const max = sorted[0].votesCount;
  const min = sorted[sorted.length - 1].votesCount;
  const top = sorted.filter((participant) => participant.votesCount === max);
  const bottom = sorted.filter((participant) => participant.votesCount === min);
  const others = sorted.filter(
    (participant) => participant.votesCount !== max && participant.votesCount !== min
  );

  // Победитель — только если лидер один (иначе это ничья).
  const winner = hasVotes && top.length === 1 ? top[0] : null;
  // Проигравший — только если он один и это не тот же самый участник
  // (случай единственного участника или 10 / 5 / 5).
  const loser =
    winner && bottom.length === 1 && bottom[0].id !== winner.id ? bottom[0] : null;

  return {
    sorted,
    top,
    bottom,
    others,
    hasVotes,
    leaderUnique: hasVotes && top.length === 1,
    winner,
    loser,
    decisive: Boolean(winner && loser),
  };
}
