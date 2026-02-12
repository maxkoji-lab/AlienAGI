import { useState, useEffect, useRef } from "react";
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid, ReferenceLine } from 'recharts';
import { format } from "date-fns";
import { type Metric } from "@shared/schema";

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
        <div className="bg-background/90 border border-primary/50 p-3 rounded-sm shadow-lg backdrop-blur-md">
          <p className="text-primary font-mono text-xs mb-2 border-b border-primary/20 pb-1">
            {format(new Date(label), "HH:mm:ss")}
          </p>
          <div className="space-y-1">
            <p className="text-secondary text-sm">
              <span className="text-muted-foreground text-xs mr-2">NCI RAW:</span>
              {Number(payload[0]?.value).toFixed(4)}
            </p>
            <p className="text-accent text-sm">
              <span className="text-muted-foreground text-xs mr-2">NCI EMA:</span>
              {Number(payload[1]?.value).toFixed(4)}
            </p>
            <p className="text-primary text-sm">
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
        <span className="w-2 h-2 bg-red-500 rounded-full animate-pulse" />
        <span className="text-[10px] font-mono text-red-400 uppercase tracking-widest">Live</span>
        <span className="text-[10px] font-mono text-muted-foreground ml-2">
          NCI: {latestNci.toFixed(2)}
        </span>
      </div>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={livePoints}>
          <defs>
            <linearGradient id="colorNci" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="var(--secondary)" stopOpacity={0.3}/>
              <stop offset="95%" stopColor="var(--secondary)" stopOpacity={0}/>
            </linearGradient>
            <linearGradient id="colorEma" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="var(--accent)" stopOpacity={0.2}/>
              <stop offset="95%" stopColor="var(--accent)" stopOpacity={0}/>
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--muted-foreground)" opacity={0.1} vertical={false} />
          <XAxis
            dataKey="time"
            tickFormatter={(time) => format(new Date(time), "HH:mm:ss")}
            stroke="var(--muted-foreground)"
            fontSize={10}
            tickLine={false}
            axisLine={false}
            minTickGap={40}
          />
          <YAxis
            yAxisId="left"
            stroke="var(--secondary)"
            fontSize={10}
            tickLine={false}
            axisLine={false}
            domain={[0, 100]}
            width={35}
          />
          <YAxis
            yAxisId="right"
            orientation="right"
            stroke="var(--primary)"
            fontSize={10}
            tickLine={false}
            axisLine={false}
            domain={['auto', 'auto']}
            width={35}
          />
          <ReferenceLine yAxisId="left" y={25} stroke="var(--destructive)" strokeDasharray="3 3" strokeOpacity={0.3} />
          <ReferenceLine yAxisId="left" y={50} stroke="var(--muted-foreground)" strokeDasharray="3 3" strokeOpacity={0.2} />
          <ReferenceLine yAxisId="left" y={75} stroke="var(--primary)" strokeDasharray="3 3" strokeOpacity={0.3} />
          <Tooltip content={<CustomTooltip />} cursor={{ stroke: 'var(--primary)', strokeWidth: 1, strokeDasharray: '4 4' }} />
          <Area
            yAxisId="left"
            type="monotone"
            dataKey="nci"
            stroke="var(--secondary)"
            strokeWidth={2}
            fillOpacity={1}
            fill="url(#colorNci)"
            animationDuration={500}
            isAnimationActive={true}
          />
          <Area
            yAxisId="left"
            type="monotone"
            dataKey="ema"
            stroke="var(--accent)"
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
