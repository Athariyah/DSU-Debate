import { Award, BarChart3, Brain, MessageSquare, Sparkles, Trophy } from "lucide-react";
import type { EventType } from "../types";

export const EVENT_TYPE_META: Record<EventType, { label: string; Icon: typeof Trophy }> = {
  debate: { label: "Дебаты", Icon: MessageSquare },
  tournament: { label: "Турнир", Icon: Trophy },
  poll: { label: "Опрос", Icon: BarChart3 },
  competition: { label: "Соревнование", Icon: Award },
  quiz: { label: "Квиз", Icon: Brain },
  other: { label: "Другое", Icon: Sparkles },
};

export function getEventTypeMeta(type: EventType | string | undefined, customLabel?: string | null) {
  const t = (type ?? "debate") as EventType;
  if (t === "other" && customLabel) {
    return { label: customLabel, Icon: Sparkles };
  }
  return EVENT_TYPE_META[t] ?? EVENT_TYPE_META.debate;
}
