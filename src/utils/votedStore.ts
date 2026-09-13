/**
 * Локальный кэш "я уже голосовал(а) за X в дебате Y".
 * Реальным источником истины остаётся бэкенд (UNIQUE ограничения в votes),
 * это лишь UX-оптимизация, чтобы мгновенно показывать экран результатов
 * без повторного запроса модалки голосования.
 */

interface VotedRecord {
  participantId: string;
  votedAt: string;
}

function key(eventId: string) {
  return `dsu_voted_${eventId}`;
}

export function getVotedParticipant(eventId: string): VotedRecord | null {
  const raw = localStorage.getItem(key(eventId));
  if (!raw) return null;
  try {
    return JSON.parse(raw) as VotedRecord;
  } catch {
    return null;
  }
}

export function setVotedParticipant(eventId: string, participantId: string) {
  localStorage.setItem(
    key(eventId),
    JSON.stringify({ participantId, votedAt: new Date().toISOString() } satisfies VotedRecord)
  );
}

export function hasVoted(eventId: string): boolean {
  return getVotedParticipant(eventId) !== null;
}

const PROFILE_KEY = "dsu_profile_name";

export function getSavedProfileName(): { firstName: string; lastName: string } | null {
  const raw = localStorage.getItem(PROFILE_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function saveProfileName(firstName: string, lastName: string) {
  localStorage.setItem(PROFILE_KEY, JSON.stringify({ firstName, lastName }));
}
