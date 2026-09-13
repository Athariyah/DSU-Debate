import type { DebateEvent } from "../types";

/**
 * Демо-данные, повторяющие форму ответов реального бэкенда
 * (GET /api/events, GET /api/events/:id). Используются только тогда,
 * когда переменная окружения VITE_API_URL не указывает на живой сервер —
 * это позволяет верстать и демонстрировать фронтенд автономно.
 */

function recalcPercentages(event: DebateEvent): DebateEvent {
  const total = event.participants.reduce((sum, p) => sum + p.votesCount, 0);
  const participants = [...event.participants]
    .sort((a, b) => b.votesCount - a.votesCount)
    .map((p, idx) => ({
      ...p,
      rank: idx + 1,
      percentage: total > 0 ? Math.round((p.votesCount / total) * 1000) / 10 : 0,
    }));
  return { ...event, participants, totalVotes: total };
}

const rawEvents: DebateEvent[] = [
  {
    id: "evt-active-1",
    title: "Роль социальных сетей в современном обществе",
    status: "active",
    participantsCount: 3,
    scheduledAt: new Date().toISOString(),
    totalVotes: 0,
    participants: [
      {
        id: "p-1",
        eventId: "evt-active-1",
        name: "Алексей Петров",
        subtitle: "Сторонник ограничений",
        votesCount: 42,
        percentage: 0,
      },
      {
        id: "p-2",
        eventId: "evt-active-1",
        name: "Мария Иванова",
        subtitle: "За свободное использование",
        votesCount: 35,
        percentage: 0,
      },
      {
        id: "p-3",
        eventId: "evt-active-1",
        name: "Даниил Соколов",
        subtitle: "Против ограничений",
        votesCount: 23,
        percentage: 0,
      },
    ],
  },
  {
    id: "evt-upcoming-1",
    title: "Искусственный интеллект: угроза или возможность?",
    status: "upcoming",
    participantsCount: 2,
    scheduledAt: buildDate(12, 14, 0),
    totalVotes: 0,
    participants: [
      { id: "p-4", eventId: "evt-upcoming-1", name: "Игорь Волков", subtitle: "ИИ — угроза", votesCount: 0, percentage: 0 },
      { id: "p-5", eventId: "evt-upcoming-1", name: "Светлана Ким", subtitle: "ИИ — возможность", votesCount: 0, percentage: 0 },
    ],
  },
  {
    id: "evt-upcoming-2",
    title: "Стоит ли вводить 4-дневную рабочую неделю?",
    status: "upcoming",
    participantsCount: 3,
    scheduledAt: buildDate(14, 17, 0),
    totalVotes: 0,
    participants: [
      { id: "p-6", eventId: "evt-upcoming-2", name: "Николай Орлов", votesCount: 0, percentage: 0 },
      { id: "p-7", eventId: "evt-upcoming-2", name: "Елена Гром", votesCount: 0, percentage: 0 },
      { id: "p-8", eventId: "evt-upcoming-2", name: "Артём Белов", votesCount: 0, percentage: 0 },
    ],
  },
  {
    id: "evt-upcoming-3",
    title: "Лучше жить в городе или в деревне?",
    status: "upcoming",
    participantsCount: 2,
    scheduledAt: buildDate(16, 15, 0),
    totalVotes: 0,
    participants: [
      { id: "p-9", eventId: "evt-upcoming-3", name: "Полина Реч", votesCount: 0, percentage: 0 },
      { id: "p-10", eventId: "evt-upcoming-3", name: "Тимур Садык", votesCount: 0, percentage: 0 },
    ],
  },
];

function buildDate(day: number, hour: number, minute: number) {
  const now = new Date();
  const d = new Date(now.getFullYear(), now.getMonth(), day, hour, minute);
  if (d.getTime() < now.getTime()) d.setMonth(d.getMonth() + 1);
  return d.toISOString();
}

export const mockStore: { events: DebateEvent[] } = {
  events: rawEvents.map(recalcPercentages),
};

export function mockRegisterVote(eventId: string, participantId: string): DebateEvent {
  const event = mockStore.events.find((e) => e.id === eventId);
  if (!event) throw new Error("Event not found");
  const participant = event.participants.find((p) => p.id === participantId);
  if (!participant) throw new Error("Participant not found");
  participant.votesCount += 1;
  const updated = recalcPercentages(event);
  mockStore.events = mockStore.events.map((e) => (e.id === eventId ? updated : e));
  return updated;
}

export function mockGetEvent(eventId: string): DebateEvent | undefined {
  return mockStore.events.find((e) => e.id === eventId);
}
