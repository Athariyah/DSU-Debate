import { motion } from "framer-motion";
import { useNavigate } from "react-router-dom";
import { Button } from "../components/ui/Button";

export function SplashPage() {
  const navigate = useNavigate();

  return (
    <div className="safe-top safe-bottom flex h-full flex-col justify-between px-7 pb-8 pt-16">
      <div />

      <div className="flex flex-col items-center text-center">
        <motion.h1
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="text-[32px] font-extrabold tracking-tight text-white"
        >
          DSU Debate
        </motion.h1>
        <motion.p
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.1 }}
          className="mt-3 text-[15px] text-white/50"
        >
          Твой голос — решение в споре.
        </motion.p>

        <motion.div
          initial={{ opacity: 0, scale: 0.85 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.6, delay: 0.2 }}
          className="relative mt-20 flex h-52 w-52 items-center justify-center"
        >
          <div className="absolute h-40 w-40 rounded-full bg-indigo-500/30 blur-3xl" />
          <div className="absolute h-32 w-32 rounded-full bg-sky-400/20 blur-2xl" />
          <div className="absolute h-24 w-24 -translate-x-5 -translate-y-3 rotate-[-8deg] rounded-[2rem] border border-white/25 bg-gradient-to-br from-white/15 to-white/0 backdrop-blur-md" />
          <div className="absolute h-24 w-24 translate-x-5 translate-y-3 rotate-[8deg] rounded-[2rem] border border-white/15 bg-gradient-to-br from-indigo-300/20 to-transparent backdrop-blur-md" />
        </motion.div>

        <div className="mt-16 flex items-center gap-2">
          <span className="h-1.5 w-1.5 rounded-full bg-white" />
          <span className="h-1.5 w-1.5 rounded-full bg-white/25" />
          <span className="h-1.5 w-1.5 rounded-full bg-white/25" />
        </div>
      </div>

      <Button fullWidth onClick={() => navigate("/home")}>
        Начать →
      </Button>
    </div>
  );
}
