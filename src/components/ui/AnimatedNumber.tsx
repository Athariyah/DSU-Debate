import { useEffect, useRef } from "react";
import { animate, useMotionValue, useTransform, motion } from "framer-motion";

export function AnimatedNumber({ value, suffix = "" }: { value: number; suffix?: string }) {
  const motionValue = useMotionValue(value);
  const rounded = useTransform(motionValue, (latest) => `${Math.round(latest)}${suffix}`);
  const prev = useRef(value);

  useEffect(() => {
    const controls = animate(motionValue, value, {
      duration: 0.6,
      ease: "easeOut",
    });
    prev.current = value;
    return controls.stop;
  }, [value, motionValue]);

  return <motion.span>{rounded}</motion.span>;
}
