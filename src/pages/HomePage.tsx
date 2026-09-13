import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ChevronRight } from "lucide-react";
import { TopBar } from "../components/layout/TopBar";
import { BottomNav } from "../components/layout/BottomNav";
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

  useEffect(() => {
    let mounted = true;
    Promise.all([fetchActiveDebate(), fetchUpcomingDebates(), fetchCompletedDebates()])
      .then(([active, upcomingList, completedResult]) => {
        if (!mounted) return;
        setActiveEvent(active);
        setUpcoming(upcomingList);
        setCompleted(completedResult.items);
      })
      .catch(() => {
        if (mounted) setError("Не удалось загрузить данные дебатов");
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });
    return () => {
      mounted = false;
    };
  }, []);

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
    <div className="relative flex h-full flex-col">
      <TopBar title="DSU Debate" rightSlot="profile" />

      <div className="no-scrollbar flex-1 overflow-y-auto px-5 pb-32 pt-2">
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
            className="inline-flex items-center gap-0.5 text-sm text-white/45 hover:text-white/70"
          >
            Все <ChevronRight size={14} />
          </button>
        </div>

        <div className="mt-3 space-y-3">
          {upcoming.map((event) => <UpcomingDebateItem key={event.id} event={event} />)}
          {!loading && !error && upcoming.length === 0 && (
            <p className="py-6 text-center text-sm text-white/40">Пока нет запланированных дебатов</p>
          )}
        </div>

        {!loading && !error && completed.length > 0 && (
          <>
            <h3 className="mt-8 text-[15px] font-semibold text-white">Последние завершённые</h3>
            <div className="mt-3 space-y-3">
              {completed.slice(0, 3).map((event) => <UpcomingDebateItem key={event.id} event={event} />)}
            </div>
          </>
        )}
      </div>

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
