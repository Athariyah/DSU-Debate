import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ChevronRight } from "lucide-react";
import { TopBar } from "../components/layout/TopBar";
import { BottomNav } from "../components/layout/BottomNav";
import { ActiveDebateCard } from "../components/debate/ActiveDebateCard";
import { UpcomingDebateItem } from "../components/debate/UpcomingDebateItem";
import { VoteModal } from "../components/debate/VoteModal";
import { fetchActiveDebate, fetchUpcomingDebates } from "../api/debates";
import { hasVoted } from "../utils/votedStore";
import type { DebateEvent } from "../types";

export function HomePage() {
  const navigate = useNavigate();
  const [activeEvent, setActiveEvent] = useState<DebateEvent | null>(null);
  const [upcoming, setUpcoming] = useState<DebateEvent[]>([]);
  const [voteModalOpen, setVoteModalOpen] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    Promise.all([fetchActiveDebate(), fetchUpcomingDebates()]).then(([active, upcomingList]) => {
      if (!mounted) return;
      setActiveEvent(active);
      setUpcoming(upcomingList);
      setLoading(false);
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

        {!loading && activeEvent && (
          <ActiveDebateCard event={activeEvent} voted={voted} onVoteClick={handleVoteClick} />
        )}

        {!loading && !activeEvent && (
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
          {upcoming.map((event) => (
            <UpcomingDebateItem key={event.id} event={event} />
          ))}
          {!loading && upcoming.length === 0 && (
            <p className="py-6 text-center text-sm text-white/40">Пока нет запланированных дебатов</p>
          )}
        </div>
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
