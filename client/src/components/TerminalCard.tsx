import { ReactNode } from "react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

interface TerminalCardProps {
  title: string;
  children: ReactNode;
  className?: string;
  delay?: number;
  highlight?: boolean;
}

export function TerminalCard({ title, children, className, delay = 0, highlight = false }: TerminalCardProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay, ease: "easeOut" }}
      className={cn(
        "terminal-card flex flex-col p-4 rounded-sm bg-black/40",
        highlight && "border-primary/50 shadow-[0_0_15px_rgba(0,255,128,0.1)]",
        className
      )}
    >
      <div className="flex items-center justify-between mb-4 border-b border-primary/20 pb-2">
        <h3 className="text-sm md:text-base font-mono text-primary/80 uppercase tracking-widest flex items-center gap-2">
          <span className="w-2 h-2 bg-primary inline-block animate-pulse" />
          {title}
        </h3>
        <div className="flex gap-1">
          <div className="w-1 h-1 bg-primary/30 rounded-full" />
          <div className="w-1 h-1 bg-primary/30 rounded-full" />
          <div className="w-1 h-1 bg-primary/30 rounded-full" />
        </div>
      </div>
      <div className="flex-1 relative z-10">
        {children}
      </div>
    </motion.div>
  );
}
