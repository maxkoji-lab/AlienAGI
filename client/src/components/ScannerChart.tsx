import { useState, useEffect, useRef, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid, ReferenceLine } from 'recharts';
import { format } from "date-fns";
import { Button } from "@/components/ui/button";
import { apiRequest } from "@/lib/queryClient";
import { Pause, Play } from "lucide-react";

const COLORS = {
  nciLine: "#00e5ff",
  holderLine: "#ffdd00",
  grid: "#3a5a4a",
  axisText: "#5a8a6a",
  refCold: "#ff4444",
  refMid: "#555555",
  refHot: "#00ff80",
};

interface LiveDataPoint {
  time: number;
  nci: number;
  holders: number;
  whaleConcentration: number;
}

export interface ScannerLiveData {
  nci: number;
  holders: number;
  whaleConcentration: number;
  band: string;
  posture: string;
  prevNci: number;
  prevHolders: number;
}

interface ScannerChartProps {
  mint: string;
  initialNci: number;
  initialHolders: number;
  initialWhaleConcentration: number;
  onLiveUpdate?: (data: ScannerLiveData) => void;
}

export function ScannerChart({ mint, initialNci, initialHolders, initialWhaleConcentration, onLiveUpdate }: ScannerChartProps) {
  const [points, setPoints] = useState<LiveDataPoint[]>([]);
  const [isPolling, setIsPolling] = useState(true);
  const prevMintRef = useRef(mint);

  useEffect(() => {
    if (prevMintRef.current !== mint) {
      setPoints([]);
      prevMintRef.current = mint;
    }
    const initial: LiveDataPoint = {
      time: Date.now(),
      nci: initialNci,
      holders: initialHolders,
      whaleConcentration: initialWhaleConcentration,
    };
    setPoints([initial]);
  }, [mint, initialNci, initialHolders, initialWhaleConcentration]);

  const { data: liveData, dataUpdatedAt } = useQuery({
    queryKey: ['/api/analyze/live', mint],
    queryFn: async () => {
      const res = await apiRequest("POST", "/api/analyze/live", { mint });
      return res.json();
    },
    refetchInterval: isPolling ? 10000 : false,
    enabled: isPolling && !!mint,
    refetchOnWindowFocus: false,
    retry: 1,
  });

  const lastProcessedRef = useRef<number>(0);

  const pendingUpdateRef = useRef<ScannerLiveData | null>(null);

  useEffect(() => {
    if (!liveData || !dataUpdatedAt || dataUpdatedAt <= lastProcessedRef.current) return;
    lastProcessedRef.current = dataUpdatedAt;

    const newPoint: LiveDataPoint = {
      time: liveData.ts || Date.now(),
      nci: liveData.nciRaw,
      holders: liveData.holders,
      whaleConcentration: parseFloat(liveData.whaleConcentration),
    };

    setPoints(prev => {
      const maxPoints = 60;
      const updated = [...prev, newPoint];
      const trimmed = updated.length > maxPoints ? updated.slice(updated.length - maxPoints) : updated;

      const prevPt = trimmed.length > 1 ? trimmed[trimmed.length - 2] : trimmed[0];
      pendingUpdateRef.current = {
        nci: liveData.nciRaw,
        holders: liveData.holders,
        whaleConcentration: parseFloat(liveData.whaleConcentration),
        band: liveData.band || "",
        posture: liveData.posture || "",
        prevNci: prevPt.nci,
        prevHolders: prevPt.holders,
      };

      return trimmed;
    });
  }, [liveData, dataUpdatedAt]);

  useEffect(() => {
    if (pendingUpdateRef.current && onLiveUpdate) {
      onLiveUpdate(pendingUpdateRef.current);
      pendingUpdateRef.current = null;
    }
  }, [points, onLiveUpdate]);

  const latestPoint = points.length > 0 ? points[points.length - 1] : null;
  const prevPoint = points.length > 1 ? points[points.length - 2] : null;
  const nciDelta = latestPoint && prevPoint ? latestPoint.nci - prevPoint.nci : 0;
  const holderDelta = latestPoint && prevPoint ? latestPoint.holders - prevPoint.holders : 0;
  const lastFetchTime = dataUpdatedAt ? format(new Date(dataUpdatedAt), "HH:mm:ss") : "--:--:--";

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-background/90 border border-cyan-500/50 p-3 rounded-sm shadow-lg backdrop-blur-md">
          <p className="text-cyan-400 font-mono text-xs mb-2 border-b border-cyan-500/20 pb-1">
            {format(new Date(label), "HH:mm:ss")}
          </p>
          <div className="space-y-1">
            <p className="text-sm" style={{ color: COLORS.nciLine }}>
              <span className="text-muted-foreground text-xs mr-2">NCI:</span>
              {Number(payload[0]?.value).toFixed(2)}
            </p>
            <p className="text-sm" style={{ color: COLORS.holderLine }}>
              <span className="text-muted-foreground text-xs mr-2">HOLDERS:</span>
              {Number(payload[1]?.value).toLocaleString()}
            </p>
          </div>
        </div>
      );
    }
    return null;
  };

  return (
    <div className="mt-4 space-y-3" data-testid="scanner-chart-container">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <span className={`w-2 h-2 rounded-full ${isPolling ? "bg-red-500 animate-pulse" : "bg-muted-foreground"}`} />
            <span className="text-[10px] font-mono text-red-400 uppercase tracking-widest" data-testid="text-live-status">
              {isPolling ? "Live Feed" : "Paused"}
            </span>
          </div>
          <span className="text-[10px] font-mono text-muted-foreground" data-testid="text-last-fetch">
            Last: {lastFetchTime}
          </span>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-4 text-xs font-mono">
            {latestPoint && (
              <>
                <span className="text-secondary" data-testid="text-live-nci">
                  NCI: {latestPoint.nci.toFixed(2)}
                  {nciDelta !== 0 && (
                    <span className={nciDelta > 0 ? "text-primary ml-1" : "text-destructive ml-1"}>
                      {nciDelta > 0 ? "+" : ""}{nciDelta.toFixed(2)}
                    </span>
                  )}
                </span>
                <span className="text-primary" data-testid="text-live-holders">
                  H: {latestPoint.holders.toLocaleString()}
                  {holderDelta !== 0 && (
                    <span className={holderDelta > 0 ? "text-primary ml-1" : "text-destructive ml-1"}>
                      {holderDelta > 0 ? "+" : ""}{holderDelta}
                    </span>
                  )}
                </span>
              </>
            )}
          </div>
          <Button
            size="sm"
            variant="outline"
            onClick={() => setIsPolling(p => !p)}
            className="font-mono text-[10px] gap-1 border-primary/30"
            data-testid="button-toggle-live"
          >
            {isPolling ? <Pause className="w-3 h-3" /> : <Play className="w-3 h-3" />}
            {isPolling ? "PAUSE" : "RESUME"}
          </Button>
        </div>
      </div>

      <div className="h-[250px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={points}>
            <defs>
              <linearGradient id="scannerNci" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={COLORS.nciLine} stopOpacity={0.4}/>
                <stop offset="95%" stopColor={COLORS.nciLine} stopOpacity={0}/>
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
              minTickGap={50}
            />
            <YAxis
              yAxisId="left"
              stroke={COLORS.nciLine}
              fontSize={10}
              tickLine={false}
              axisLine={false}
              domain={[0, 100]}
              width={30}
            />
            <YAxis
              yAxisId="right"
              orientation="right"
              stroke={COLORS.holderLine}
              fontSize={10}
              tickLine={false}
              axisLine={false}
              domain={['dataMin - 10', 'dataMax + 10']}
              width={50}
              tickFormatter={(v) => v.toLocaleString()}
            />
            <ReferenceLine yAxisId="left" y={25} stroke={COLORS.refCold} strokeDasharray="3 3" strokeOpacity={0.4} label={{ value: "Cold", position: "insideLeft", fontSize: 9, fill: COLORS.refCold }} />
            <ReferenceLine yAxisId="left" y={50} stroke={COLORS.refMid} strokeDasharray="3 3" strokeOpacity={0.3} />
            <ReferenceLine yAxisId="left" y={75} stroke={COLORS.refHot} strokeDasharray="3 3" strokeOpacity={0.4} label={{ value: "Hot", position: "insideLeft", fontSize: 9, fill: COLORS.refHot }} />
            <Tooltip content={<CustomTooltip />} cursor={{ stroke: COLORS.nciLine, strokeWidth: 1, strokeDasharray: '4 4' }} />
            <Area
              yAxisId="left"
              type="monotone"
              dataKey="nci"
              stroke={COLORS.nciLine}
              strokeWidth={2.5}
              fillOpacity={1}
              fill="url(#scannerNci)"
              animationDuration={400}
              isAnimationActive={true}
            />
            <Area
              yAxisId="right"
              type="monotone"
              dataKey="holders"
              stroke={COLORS.holderLine}
              strokeWidth={2}
              strokeDasharray="4 2"
              fill="none"
              animationDuration={400}
              isAnimationActive={true}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      <div className="flex items-center justify-center gap-6 text-[10px] font-mono text-muted-foreground">
        <div className="flex items-center gap-2">
          <span className="w-3 h-0.5" style={{ backgroundColor: COLORS.nciLine }} />
          <span>NCI Score (0-100)</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="w-3 h-0.5" style={{ backgroundColor: COLORS.holderLine, borderTop: `1px dashed ${COLORS.holderLine}` }} />
          <span>Holder Count</span>
        </div>
        <span className="text-muted-foreground/50">Refresh: 10s</span>
      </div>
    </div>
  );
}
