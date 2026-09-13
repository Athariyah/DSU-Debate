import type { DebateEvent } from "../types";

function recalcPercentages(event: DebateEvent): DebateEvent {
  const total = event.participants.reduce((sum, participant) => sum + participant.votesCount, 0);
  const participants = [...event.participants]
    .sort((a, b) => b.votesCount - a.votesCount)
    .map((participant, index) => ({
      ...participant,
      rank: index + 1,
      percentage: total > 0 ? Math.round((participant.votesCount / total) * 1000) / 10 : 0,
    }));
  return { ...event, participants, totalVotes: total };
}

const rawEvents: DebateEvent[] = [
  {
    id: 1,
    title: "Роль социальных сетей в современном обществе",
    status: "active",
    participantsCount: 3,
    scheduledAt: new Date().toISOString(),
    totalVotes: 100,
    participants: [
      { id: 1, eventId: 1, name: "Алексей Петров", subtitle: "Сторонник ограничений", votesCount: 42, percentage: 0 },
      { id: 2, eventId: 1, name: "Мария Иванова", subtitle: "За свободное использование", votesCount: 35, percentage: 0 },
      { id: 3, eventId: 1, name: "Даниил Соколов", subtitle: "Против ограничений", votesCount: 23, percentage: 0 },
    ],
  },
  {
    id: 2,
    title: "Искусственный интеллект: угроза или возможность?",
    status: "upcoming",
    participantsCount: 2,
    scheduledAt: buildDate(12, 14, 0),
    totalVotes: 0,
    participants: [
      { id: 4, eventId: 2, name: "Игорь Волков", subtitle: "ИИ — угроза", votesCount: 0, percentage: 0 },
      { id: 5, eventId: 2, name: "Светлана Ким", subtitle: "ИИ — возможность", votesCount: 0, percentage: 0 },
    ],
  },
  {
    id: 3,
    title: "Стоит ли вводить 4-дневную рабочую неделю?",
    status: "upcoming",
    participantsCount: 3,
    scheduledAt: buildDate(14, 17, 0),
    totalVotes: 0,
    participants: [
      { id: 6, eventId: 3, name: "Николай Орлов", votesCount: 0, percentage: 0 },
      { id: 7, eventId: 3, name: "Елена Гром", votesCount: 0, percentage: 0 },
      { id: 8, eventId: 3, name: "Артём Белов", votesCount: 0, percentage: 0 },
    ],
  },
  {
    id: 4,
    title: "Лучше жить в городе или в деревне?",
    status: "upcoming",
    participantsCount: 2,
    scheduledAt: buildDate(16, 15, 0),
    totalVotes: 0,
    participants: [
      { id: 9, eventId: 4, name: "Полина Реч", votesCount: 0, percentage: 0 },
      { id: 10, eventId: 4, name: "Тимур Садык", votesCount: 0, percentage: 0 },
    ],
  },
];

function buildDate(day: number, hour: number, minute: number) {
  const now = new Date();
  const date = new Date(now.getFullYear(), now.getMonth(), day, hour, minute);
  if (date.getTime() < now.getTime()) date.setMonth(date.getMonth() + 1);
  return date.toISOString();
}

export const mockStore: { events: DebateEvent[] } = {
  events: rawEvents.map(recalcPercentages),
};

export function mockRegisterVote(eventId: number, participantId: number): DebateEvent {
  const event = mockStore.events.find((item) => item.id === eventId);
  if (!event) throw new Error("Event not found");
  const participant = event.participants.find((item) => item.id === participantId);
  if (!participant) throw new Error("Participant not found");
  participant.votesCount += 1;
  const updated = recalcPercentages(event);
  mockStore.events = mockStore.events.map((item) => (item.id === eventId ? updated : item));
  return updated;
}

export function mockGetEvent(eventId: number): DebateEvent | undefined {
  return mockStore.events.find((event) => event.id === eventId);
}
