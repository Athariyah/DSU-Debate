import { useEffect, useState } from "react";
import { TopBar } from "../components/layout/TopBar";
import { BottomNav } from "../components/layout/BottomNav";
import { UpcomingDebateItem } from "../components/debate/UpcomingDebateItem";
import { fetchActiveDebate, fetchCompletedDebates, fetchUpcomingDebates } from "../api/debates";
import type { DebateEvent } from "../types";

export function DebatesPage() {
  const [active, setActive] = useState<DebateEvent | null>(null);
  const [upcoming, setUpcoming] = useState<DebateEvent[]>([]);
  const [completed, setCompleted] = useState<DebateEvent[]>([]);
  const [completedTotal, setCompletedTotal] = useState(0);
  const [completedPage, setCompletedPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([fetchActiveDebate(), fetchUpcomingDebates(), fetchCompletedDebates(1)])
      .then(([activeEvent, upcomingEvents, completedResult]) => {
        setActive(activeEvent);
        setUpcoming(upcomingEvents);
        setCompleted(completedResult.items);
        setCompletedTotal(completedResult.total);
      })
      .catch(() => setError("Не удалось загрузить список дебатов"))
      .finally(() => setLoading(false));
  }, []);

  async function loadMoreCompleted() {
    setLoadingMore(true);
    try {
      const nextPage = completedPage + 1;
      const result = await fetchCompletedDebates(nextPage);
      setCompleted((current) => [...current, ...result.items]);
      setCompletedPage(nextPage);
    } catch {
      setError("Не удалось загрузить историю");
    } finally {
      setLoadingMore(false);
    }
  }

  return (
    <div className="relative flex h-full flex-col">
      <TopBar title="Дебаты" rightSlot="profile" />
      <div className="no-scrollbar flex-1 overflow-y-auto px-5 pb-32 pt-2">
        {loading && <div className="h-24 animate-pulse rounded-2xl bg-white/5" />}
        {error && <p className="rounded-2xl border border-rose-400/20 bg-rose-400/10 p-4 text-sm text-rose-300">{error}</p>}

        {!loading && !error && active && <><h3 className="mb-3 text-[15px] font-semibold text-white">Активные</h3><UpcomingDebateItem event={active} /></>}

        {!loading && !error && (
          <>
            <h3 className="mb-3 mt-6 text-[15px] font-semibold text-white">Ближайшие</h3>
            <div className="space-y-3">
              {upcoming.map((event) => <UpcomingDebateItem key={event.id} event={event} />)}
              {upcoming.length === 0 && <p className="py-6 text-center text-sm text-white/40">Пока нет запланированных дебатов</p>}
            </div>

            <h3 className="mb-3 mt-8 text-[15px] font-semibold text-white">Завершённые</h3>
            <div className="space-y-3">
              {completed.map((event) => <UpcomingDebateItem key={event.id} event={event} />)}
              {completed.length === 0 && <p className="py-6 text-center text-sm text-white/40">История пока пуста</p>}
              {completed.length < completedTotal && (
                <button onClick={() => void loadMoreCompleted()} disabled={loadingMore} className="w-full rounded-2xl border border-white/10 px-4 py-3 text-sm text-white/60 hover:bg-white/5 disabled:opacity-50">
                  {loadingMore ? "Загрузка…" : "Загрузить ещё"}
                </button>
              )}
            </div>
          </>
        )}
      </div>
      <BottomNav />
    </div>
  );
}
