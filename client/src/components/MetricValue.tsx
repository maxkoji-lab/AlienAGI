import { ArrowUp, ArrowDown, Minus } from "lucide-react";
import { cn } from "@/lib/utils";

interface MetricValueProps {
  label: string;
  value: string | number;
  trend?: "up" | "down" | "neutral";
  subValue?: string;
  color?: "primary" | "secondary" | "accent";
}

export function MetricValue({ label, value, trend, subValue, color = "primary" }: MetricValueProps) {
  const colorClasses = {
    primary: "text-primary drop-shadow-[0_0_8px_rgba(0,255,128,0.5)]",
    secondary: "text-secondary drop-shadow-[0_0_8px_rgba(0,200,255,0.5)]",
    accent: "text-accent drop-shadow-[0_0_8px_rgba(255,0,255,0.5)]",
  };

  return (
    <div className="flex flex-col">
      <span className="text-xs text-muted-foreground uppercase tracking-widest mb-1">{label}</span>
      <div className="flex items-end gap-3">
        <span className={cn("text-3xl font-display font-bold leading-none", colorClasses[color])}>
          {value}
        </span>
        {trend && (
          <span className={cn(
            "mb-1 flex items-center text-xs font-bold",
            trend === "up" ? "text-primary" : trend === "down" ? "text-destructive" : "text-muted-foreground"
          )}>
            {trend === "up" && <ArrowUp className="w-3 h-3 mr-1" />}
            {trend === "down" && <ArrowDown className="w-3 h-3 mr-1" />}
            {trend === "neutral" && <Minus className="w-3 h-3 mr-1" />}
            {trend.toUpperCase()}
          </span>
        )}
      </div>
      {subValue && (
        <span className="text-xs text-muted-foreground mt-1 font-mono opacity-70">
          {subValue}
        </span>
      )}
    </div>
  );
}
