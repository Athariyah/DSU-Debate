interface VotedRecord {
  participantId: number;
  votedAt: string;
}

function key(eventId: string | number) {
  return `dsu_voted_${eventId}`;
}

export function getVotedParticipant(eventId: string | number): VotedRecord | null {
  const raw = localStorage.getItem(key(eventId));
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as VotedRecord;
    return Number.isInteger(parsed.participantId) ? parsed : null;
  } catch {
    return null;
  }
}

export function setVotedParticipant(eventId: string | number, participantId: number) {
  localStorage.setItem(
    key(eventId),
    JSON.stringify({ participantId, votedAt: new Date().toISOString() } satisfies VotedRecord)
  );
}

export function hasVoted(eventId: string | number): boolean {
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
