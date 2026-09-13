import { useEffect, useState } from "react";
import { TopBar } from "../components/layout/TopBar";
import { BottomNav } from "../components/layout/BottomNav";
import { UpcomingDebateItem } from "../components/debate/UpcomingDebateItem";
import { fetchActiveDebate, fetchUpcomingDebates } from "../api/debates";
import type { DebateEvent } from "../types";

export function DebatesPage() {
  const [active, setActive] = useState<DebateEvent | null>(null);
  const [upcoming, setUpcoming] = useState<DebateEvent[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([fetchActiveDebate(), fetchUpcomingDebates()]).then(([a, u]) => {
      setActive(a);
      setUpcoming(u);
      setLoading(false);
    });
  }, []);

  return (
    <div className="relative flex h-full flex-col">
      <TopBar title="Дебаты" rightSlot="profile" />

      <div className="no-scrollbar flex-1 overflow-y-auto px-5 pb-32 pt-2">
        {loading && <div className="h-24 animate-pulse rounded-2xl bg-white/5" />}

        {!loading && active && (
          <>
            <h3 className="mb-3 text-[15px] font-semibold text-white">Активные</h3>
            <UpcomingDebateItem event={active} />
          </>
        )}

        <h3 className="mb-3 mt-6 text-[15px] font-semibold text-white">Ближайшие</h3>
        <div className="space-y-3">
          {upcoming.map((event) => (
            <UpcomingDebateItem key={event.id} event={event} />
          ))}
          {!loading && upcoming.length === 0 && (
            <p className="py-6 text-center text-sm text-white/40">Пока нет запланированных дебатов</p>
          )}
        </div>
      </div>

      <BottomNav />
    </div>
  );
}
