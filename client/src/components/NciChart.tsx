import { useState, useEffect, useRef } from "react";
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid, ReferenceLine } from 'recharts';
import { format } from "date-fns";
import { type Metric } from "@shared/schema";

const COLORS = {
  nciLine: "#00bfff",
  emaLine: "#ff3399",
  holderLine: "#c2cdd6",
  grid: "#2a3545",
  axisText: "#6b7b8d",
  refCold: "#ff4444",
  refMid: "#4a5568",
  refHot: "#00bfff",
};

interface NciChartProps {
  data: Metric[];
}

interface ChartPoint {
  time: number;
  nci: number;
  ema: number;
  holders: number;
}

export function NciChart({ data }: NciChartProps) {
  const [livePoints, setLivePoints] = useState<ChartPoint[]>([]);
  const lastMetricRef = useRef<Metric | null>(null);
  const tickRef = useRef<number>(0);

  useEffect(() => {
    const basePoints: ChartPoint[] = data.map(item => ({
      time: item.ts ? new Date(item.ts).getTime() : 0,
      nci: item.nciRaw,
      ema: item.nciEma,
      holders: item.holders,
    })).sort((a, b) => a.time - b.time);

    setLivePoints(basePoints);

    if (data.length > 0) {
      lastMetricRef.current = data[data.length - 1];
    }
  }, [data]);

  useEffect(() => {
    const interval = setInterval(() => {
      tickRef.current++;

      setLivePoints(prev => {
        if (prev.length === 0) return prev;

        const last = prev[prev.length - 1];
        const jitterNci = (Math.random() - 0.5) * 0.8;
        const jitterEma = (Math.random() - 0.5) * 0.3;

        const newPoint: ChartPoint = {
          time: Date.now(),
          nci: Math.max(0, Math.min(100, last.nci + jitterNci)),
          ema: Math.max(0, Math.min(100, last.ema + jitterEma)),
          holders: last.holders,
        };

        const maxPoints = 60;
        const updated = [...prev, newPoint];
        return updated.length > maxPoints ? updated.slice(updated.length - maxPoints) : updated;
      });
    }, 2000);

    return () => clearInterval(interval);
  }, []);

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-background/90 border border-primary/40 p-3 rounded-sm shadow-lg backdrop-blur-md">
          <p className="font-mono text-xs mb-2 border-b border-primary/20 pb-1" style={{ color: COLORS.holderLine }}>
            {format(new Date(label), "HH:mm:ss")}
          </p>
          <div className="space-y-1">
            <p className="text-sm" style={{ color: COLORS.nciLine }}>
              <span className="text-muted-foreground text-xs mr-2">PIPPIN RAW:</span>
              {Number(payload[0]?.value).toFixed(4)}
            </p>
            <p className="text-sm" style={{ color: COLORS.emaLine }}>
              <span className="text-muted-foreground text-xs mr-2">PIPPIN EMA:</span>
              {Number(payload[1]?.value).toFixed(4)}
            </p>
            <p className="text-sm" style={{ color: COLORS.holderLine }}>
              <span className="text-muted-foreground text-xs mr-2">HOLDERS:</span>
              {payload[2]?.value?.toLocaleString?.() || payload[2]?.value}
            </p>
          </div>
        </div>
      );
    }
    return null;
  };

  const latestNci = livePoints.length > 0 ? livePoints[livePoints.length - 1].nci : 0;

  return (
    <div className="h-[300px] w-full mt-4 relative">
      <div className="absolute top-0 left-0 z-10 flex items-center gap-2">
        <span className="w-2 h-2 bg-accent rounded-full animate-pulse" />
        <span className="text-[10px] font-mono text-accent uppercase tracking-widest">Live</span>
        <span className="text-[10px] font-mono text-muted-foreground ml-2">
          Alien: {latestNci.toFixed(2)}
        </span>
      </div>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={livePoints}>
          <defs>
            <linearGradient id="colorNci" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor={COLORS.nciLine} stopOpacity={0.35}/>
              <stop offset="95%" stopColor={COLORS.nciLine} stopOpacity={0}/>
            </linearGradient>
            <linearGradient id="colorEma" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor={COLORS.emaLine} stopOpacity={0.2}/>
              <stop offset="95%" stopColor={COLORS.emaLine} stopOpacity={0}/>
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke={COLORS.grid} opacity={0.15} vertical={false} />
          <XAxis
            dataKey="time"
            tickFormatter={(time) => format(new Date(time), "HH:mm:ss")}
            stroke={COLORS.axisText}
            fontSize={10}
            tickLine={false}
            axisLine={false}
            minTickGap={40}
          />
          <YAxis
            yAxisId="left"
            stroke={COLORS.nciLine}
            fontSize={10}
            tickLine={false}
            axisLine={false}
            domain={[0, 100]}
            width={35}
          />
          <YAxis
            yAxisId="right"
            orientation="right"
            stroke={COLORS.holderLine}
            fontSize={10}
            tickLine={false}
            axisLine={false}
            domain={['auto', 'auto']}
            width={35}
          />
          <ReferenceLine yAxisId="left" y={25} stroke={COLORS.refCold} strokeDasharray="3 3" strokeOpacity={0.4} />
          <ReferenceLine yAxisId="left" y={50} stroke={COLORS.refMid} strokeDasharray="3 3" strokeOpacity={0.3} />
          <ReferenceLine yAxisId="left" y={75} stroke={COLORS.refHot} strokeDasharray="3 3" strokeOpacity={0.4} />
          <Tooltip content={<CustomTooltip />} cursor={{ stroke: COLORS.holderLine, strokeWidth: 1, strokeDasharray: '4 4' }} />
          <Area
            yAxisId="left"
            type="monotone"
            dataKey="nci"
            stroke={COLORS.nciLine}
            strokeWidth={2.5}
            fillOpacity={1}
            fill="url(#colorNci)"
            animationDuration={500}
            isAnimationActive={true}
          />
          <Area
            yAxisId="left"
            type="monotone"
            dataKey="ema"
            stroke={COLORS.emaLine}
            strokeWidth={2}
            strokeDasharray="4 4"
            fillOpacity={1}
            fill="url(#colorEma)"
            animationDuration={500}
            isAnimationActive={true}
          />
          <Area
            yAxisId="right"
            type="monotone"
            dataKey="holders"
            stroke="transparent"
            fill="transparent"
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
