import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ChevronRight } from "lucide-react";
import { TopBar } from "../components/layout/TopBar";
import { BottomNav } from "../components/layout/BottomNav";
import { PullToRefresh } from "../components/ui/PullToRefresh";
import { ActiveDebateCard } from "../components/debate/ActiveDebateCard";
import { UpcomingDebateItem } from "../components/debate/UpcomingDebateItem";
import { VoteModal } from "../components/debate/VoteModal";
import { fetchActiveDebate, fetchCompletedDebates, fetchUpcomingDebates } from "../api/debates";
import { hasVoted } from "../utils/votedStore";
import type { DebateEvent } from "../types";

export function HomePage() {
  const navigate = useNavigate();
  const [activeEvent, setActiveEvent] = useState<DebateEvent | null>(null);
  const [upcoming, setUpcoming] = useState<DebateEvent[]>([]);
  const [completed, setCompleted] = useState<DebateEvent[]>([]);
  const [voteModalOpen, setVoteModalOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // initial — первая загрузка (скелетон); повторная (pull-to-refresh)
  // обновляет данные молча, поверх уже показанного контента, а ошибку
  // сети переживает без баннера: список остаётся на экране.
  const load = useCallback(async (initial: boolean) => {
    if (initial) setLoading(true);
    try {
      const [active, upcomingList, completedResult] = await Promise.all([
        fetchActiveDebate(),
        fetchUpcomingDebates(),
        fetchCompletedDebates(),
      ]);
      setActiveEvent(active);
      setUpcoming(upcomingList);
      setCompleted(completedResult.items);
      setError(null);
    } catch {
      if (initial) setError("Не удалось загрузить данные дебатов");
    } finally {
      if (initial) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load(true);
  }, [load]);

  const voted = activeEvent ? hasVoted(activeEvent.id) : false;

  function handleVoteClick() {
    if (!activeEvent) return;
    if (voted) {
      navigate(`/debate/${activeEvent.id}`);
    } else {
      setVoteModalOpen(true);
    }
  }

  return (
    <div className="relative flex h-full flex-col lg:pl-64">
      {/* Кнопку профиля в шапке убрали: за переход на профиль отвечает
          оригинальная вкладка в нижней панели, дублировать не нужно.
          Круглая кнопка в углу остаётся только в администрировании. */}
      <TopBar title="DSU Debate" />

      {/* Pull-to-refresh: тянем список вниз — главная обновляется. */}
      <PullToRefresh
        onRefresh={() => load(false)}
        className="mx-auto flex-1 w-full max-w-5xl px-5 pb-[calc(env(safe-area-inset-bottom,0px)+4.75rem)] pt-2 lg:px-10 lg:pb-10 lg:pt-6"
      >
        {loading && (
          <div className="h-52 animate-pulse rounded-[1.75rem] bg-white/5" />
        )}

        {error && <div className="rounded-3xl border border-rose-400/20 bg-rose-400/10 p-6 text-center text-sm text-rose-300">{error}</div>}

        {!loading && !error && activeEvent && (
          <ActiveDebateCard event={activeEvent} voted={voted} onVoteClick={handleVoteClick} />
        )}

        {!loading && !error && !activeEvent && (
          <div className="glass-panel rounded-3xl border border-white/10 p-6 text-center text-sm text-white/50">
            Сейчас нет активных дебатов. Загляните позже!
          </div>
        )}

        <div className="mt-7 flex items-center justify-between">
          <h3 className="text-[15px] font-semibold text-white">Ближайшие дебаты</h3>
          <button
            onClick={() => navigate("/debates")}
            className="inline-flex items-center gap-0.5 text-sm text-white/45 transition hover:text-white/70"
          >
            Все <ChevronRight size={14} className="text-white opacity-45" />
          </button>
        </div>

        <div className="mt-3 space-y-3 lg:grid lg:grid-cols-2 lg:gap-3 lg:space-y-0">
          {upcoming.map((event, index) => <UpcomingDebateItem key={event.id} event={event} index={index} />)}
          {!loading && !error && upcoming.length === 0 && (
            <p className="py-6 text-center text-sm text-white/40">Пока нет запланированных дебатов</p>
          )}
        </div>

        {!loading && !error && completed.length > 0 && (
          <>
            <h3 className="mt-8 text-[15px] font-semibold text-white">Последние завершённые</h3>
            <div className="mt-3 space-y-3 lg:grid lg:grid-cols-2 lg:gap-3 lg:space-y-0">
              {completed.slice(0, 3).map((event, index) => <UpcomingDebateItem key={event.id} event={event} index={index} />)}
            </div>
          </>
        )}
      </PullToRefresh>

      <BottomNav />

      {activeEvent && (
        <VoteModal
          event={activeEvent}
          open={voteModalOpen}
          onClose={() => setVoteModalOpen(false)}
          onVoted={() => {
            setVoteModalOpen(false);
            navigate(`/debate/${activeEvent.id}`);
          }}
        />
      )}
    </div>
  );
}
