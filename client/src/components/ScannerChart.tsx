import { useState, useEffect, useRef, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Pause, Play } from "lucide-react";
import { format } from "date-fns";

const COLORS = {
  nciLine: "#00e5ff",
  nciGlow: "rgba(0, 229, 255, 0.15)",
  holderLine: "#ffdd00",
  grid: "rgba(58, 90, 74, 0.15)",
  axisText: "#5a8a6a",
  refCold: "rgba(255, 68, 68, 0.5)",
  refMid: "rgba(85, 85, 85, 0.4)",
  refHot: "rgba(0, 255, 128, 0.5)",
  bg: "rgba(0, 0, 0, 0)",
  scanLine: "rgba(0, 229, 255, 0.03)",
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
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const pointsRef = useRef<LiveDataPoint[]>([]);
  const animFrameRef = useRef<number>(0);
  const scrollOffsetRef = useRef(0);
  const lastDrawTimeRef = useRef(0);
  const [isPolling, setIsPolling] = useState(true);
  const [displayNci, setDisplayNci] = useState(initialNci);
  const [displayHolders, setDisplayHolders] = useState(initialHolders);
  const [nciDelta, setNciDelta] = useState(0);
  const [holderDelta, setHolderDelta] = useState(0);
  const prevMintRef = useRef(mint);
  const pendingUpdateRef = useRef<ScannerLiveData | null>(null);

  useEffect(() => {
    if (prevMintRef.current !== mint) {
      pointsRef.current = [];
      scrollOffsetRef.current = 0;
      prevMintRef.current = mint;
    }
    const initial: LiveDataPoint = {
      time: Date.now(),
      nci: initialNci,
      holders: initialHolders,
      whaleConcentration: initialWhaleConcentration,
    };
    pointsRef.current = [initial];
    setDisplayNci(initialNci);
    setDisplayHolders(initialHolders);
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

  useEffect(() => {
    if (!liveData || !dataUpdatedAt || dataUpdatedAt <= lastProcessedRef.current) return;
    lastProcessedRef.current = dataUpdatedAt;

    const newPoint: LiveDataPoint = {
      time: liveData.ts || Date.now(),
      nci: liveData.nciRaw,
      holders: liveData.holders,
      whaleConcentration: parseFloat(liveData.whaleConcentration),
    };

    const prev = pointsRef.current;
    const maxPoints = 120;
    const updated = [...prev, newPoint];
    pointsRef.current = updated.length > maxPoints ? updated.slice(updated.length - maxPoints) : updated;

    const prevPt = prev.length > 0 ? prev[prev.length - 1] : newPoint;
    setDisplayNci(newPoint.nci);
    setDisplayHolders(newPoint.holders);
    setNciDelta(newPoint.nci - prevPt.nci);
    setHolderDelta(newPoint.holders - prevPt.holders);

    pendingUpdateRef.current = {
      nci: liveData.nciRaw,
      holders: liveData.holders,
      whaleConcentration: parseFloat(liveData.whaleConcentration),
      band: liveData.band || "",
      posture: liveData.posture || "",
      prevNci: prevPt.nci,
      prevHolders: prevPt.holders,
    };

    if (onLiveUpdate && pendingUpdateRef.current) {
      onLiveUpdate(pendingUpdateRef.current);
      pendingUpdateRef.current = null;
    }
  }, [liveData, dataUpdatedAt, onLiveUpdate]);

  const drawChart = useCallback((timestamp: number) => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) {
      animFrameRef.current = requestAnimationFrame(drawChart);
      return;
    }

    const dpr = window.devicePixelRatio || 1;
    const rect = container.getBoundingClientRect();
    const w = rect.width;
    const h = rect.height;

    if (canvas.width !== w * dpr || canvas.height !== h * dpr) {
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
    }

    const ctx = canvas.getContext("2d");
    if (!ctx) {
      animFrameRef.current = requestAnimationFrame(drawChart);
      return;
    }

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const dt = timestamp - lastDrawTimeRef.current;
    lastDrawTimeRef.current = timestamp;
    const scrollSpeed = 30;
    scrollOffsetRef.current += (dt / 1000) * scrollSpeed;

    const padLeft = 40;
    const padRight = 55;
    const padTop = 10;
    const padBottom = 25;
    const chartW = w - padLeft - padRight;
    const chartH = h - padTop - padBottom;

    ctx.clearRect(0, 0, w, h);

    ctx.strokeStyle = COLORS.grid;
    ctx.lineWidth = 0.5;
    for (let i = 0; i <= 4; i++) {
      const y = padTop + (chartH / 4) * i;
      ctx.beginPath();
      ctx.setLineDash([3, 3]);
      ctx.moveTo(padLeft, y);
      ctx.lineTo(padLeft + chartW, y);
      ctx.stroke();
    }
    ctx.setLineDash([]);

    const drawRefLine = (val: number, color: string, label?: string) => {
      const y = padTop + chartH - (val / 100) * chartH;
      ctx.strokeStyle = color;
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.moveTo(padLeft, y);
      ctx.lineTo(padLeft + chartW, y);
      ctx.stroke();
      ctx.setLineDash([]);
      if (label) {
        ctx.fillStyle = color;
        ctx.font = "9px monospace";
        ctx.textAlign = "left";
        ctx.fillText(label, padLeft + 4, y - 3);
      }
    };

    drawRefLine(25, COLORS.refCold, "COLD");
    drawRefLine(50, COLORS.refMid);
    drawRefLine(75, COLORS.refHot, "HOT");

    ctx.fillStyle = COLORS.axisText;
    ctx.font = "9px monospace";
    ctx.textAlign = "right";
    for (let v = 0; v <= 100; v += 25) {
      const y = padTop + chartH - (v / 100) * chartH;
      ctx.fillText(v.toString(), padLeft - 5, y + 3);
    }

    const points = pointsRef.current;
    if (points.length < 2) {
      animFrameRef.current = requestAnimationFrame(drawChart);
      return;
    }

    const now = Date.now();
    const windowMs = 120000;
    const viewStart = now - windowMs;

    let holderMin = Infinity, holderMax = -Infinity;
    for (const p of points) {
      if (p.holders < holderMin) holderMin = p.holders;
      if (p.holders > holderMax) holderMax = p.holders;
    }
    const holderRange = Math.max(holderMax - holderMin, 20);
    holderMin = holderMin - holderRange * 0.1;
    holderMax = holderMax + holderRange * 0.1;

    const timeToX = (t: number) => padLeft + ((t - viewStart) / windowMs) * chartW;
    const nciToY = (nci: number) => padTop + chartH - (Math.max(0, Math.min(100, nci)) / 100) * chartH;
    const holderToY = (h: number) => padTop + chartH - ((h - holderMin) / (holderMax - holderMin)) * chartH;

    ctx.save();
    ctx.beginPath();
    ctx.rect(padLeft, padTop, chartW, chartH);
    ctx.clip();

    const drawGlowLine = (
      getY: (p: LiveDataPoint) => number,
      color: string,
      glowColor: string,
      lineWidth: number,
      fillBelow: boolean,
      dashed: boolean
    ) => {
      const visible = points.filter(p => p.time >= viewStart - 5000);
      if (visible.length < 2) return;

      if (fillBelow) {
        ctx.beginPath();
        ctx.moveTo(timeToX(visible[0].time), padTop + chartH);
        ctx.lineTo(timeToX(visible[0].time), getY(visible[0]));
        for (let i = 1; i < visible.length; i++) {
          const prev = visible[i - 1];
          const curr = visible[i];
          const cpx = timeToX(prev.time) + (timeToX(curr.time) - timeToX(prev.time)) * 0.5;
          ctx.bezierCurveTo(cpx, getY(prev), cpx, getY(curr), timeToX(curr.time), getY(curr));
        }
        ctx.lineTo(timeToX(visible[visible.length - 1].time), padTop + chartH);
        ctx.closePath();

        const grad = ctx.createLinearGradient(0, padTop, 0, padTop + chartH);
        grad.addColorStop(0, glowColor);
        grad.addColorStop(1, "rgba(0,0,0,0)");
        ctx.fillStyle = grad;
        ctx.fill();
      }

      ctx.shadowColor = color;
      ctx.shadowBlur = 8;
      ctx.strokeStyle = color;
      ctx.lineWidth = lineWidth;
      ctx.lineJoin = "round";
      ctx.lineCap = "round";
      if (dashed) ctx.setLineDash([5, 3]);

      ctx.beginPath();
      ctx.moveTo(timeToX(visible[0].time), getY(visible[0]));
      for (let i = 1; i < visible.length; i++) {
        const prev = visible[i - 1];
        const curr = visible[i];
        const cpx = timeToX(prev.time) + (timeToX(curr.time) - timeToX(prev.time)) * 0.5;
        ctx.bezierCurveTo(cpx, getY(prev), cpx, getY(curr), timeToX(curr.time), getY(curr));
      }
      ctx.stroke();

      ctx.shadowBlur = 0;
      if (dashed) ctx.setLineDash([]);

      const last = visible[visible.length - 1];
      const lx = timeToX(last.time);
      const ly = getY(last);
      ctx.beginPath();
      ctx.arc(lx, ly, 3, 0, Math.PI * 2);
      ctx.fillStyle = color;
      ctx.fill();
      ctx.beginPath();
      ctx.arc(lx, ly, 6, 0, Math.PI * 2);
      ctx.strokeStyle = color;
      ctx.lineWidth = 1;
      ctx.globalAlpha = 0.3 + Math.sin(timestamp / 300) * 0.2;
      ctx.stroke();
      ctx.globalAlpha = 1;
    };

    drawGlowLine(
      (p) => nciToY(p.nci),
      COLORS.nciLine, COLORS.nciGlow, 2.5, true, false
    );

    drawGlowLine(
      (p) => holderToY(p.holders),
      COLORS.holderLine, "rgba(255,221,0,0.05)", 1.5, false, true
    );

    const scanX = padLeft + ((scrollOffsetRef.current * 2) % chartW);
    const scanGrad = ctx.createLinearGradient(scanX - 30, 0, scanX + 30, 0);
    scanGrad.addColorStop(0, "rgba(0,229,255,0)");
    scanGrad.addColorStop(0.5, COLORS.scanLine);
    scanGrad.addColorStop(1, "rgba(0,229,255,0)");
    ctx.fillStyle = scanGrad;
    ctx.fillRect(scanX - 30, padTop, 60, chartH);

    ctx.restore();

    ctx.fillStyle = COLORS.axisText;
    ctx.font = "9px monospace";
    ctx.textAlign = "right";
    const holderTicks = 5;
    for (let i = 0; i <= holderTicks; i++) {
      const val = holderMin + (holderMax - holderMin) * (i / holderTicks);
      const y = padTop + chartH - (i / holderTicks) * chartH;
      ctx.fillStyle = COLORS.holderLine + "80";
      ctx.fillText(Math.round(val).toLocaleString(), w - 2, y + 3);
    }

    const tickCount = 5;
    ctx.fillStyle = COLORS.axisText;
    ctx.textAlign = "center";
    for (let i = 0; i <= tickCount; i++) {
      const t = viewStart + (windowMs / tickCount) * i;
      const x = padLeft + (chartW / tickCount) * i;
      ctx.fillText(format(new Date(t), "mm:ss"), x, h - 4);
    }

    animFrameRef.current = requestAnimationFrame(drawChart);
  }, []);

  useEffect(() => {
    lastDrawTimeRef.current = performance.now();
    animFrameRef.current = requestAnimationFrame(drawChart);
    return () => cancelAnimationFrame(animFrameRef.current);
  }, [drawChart]);

  const lastFetchTime = dataUpdatedAt ? format(new Date(dataUpdatedAt), "HH:mm:ss") : "--:--:--";

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
            <span className="text-secondary" data-testid="text-live-nci">
              NCI: {displayNci.toFixed(2)}
              {nciDelta !== 0 && (
                <span className={nciDelta > 0 ? "text-primary ml-1" : "text-destructive ml-1"}>
                  {nciDelta > 0 ? "+" : ""}{nciDelta.toFixed(2)}
                </span>
              )}
            </span>
            <span className="text-primary" data-testid="text-live-holders">
              H: {displayHolders.toLocaleString()}
              {holderDelta !== 0 && (
                <span className={holderDelta > 0 ? "text-primary ml-1" : "text-destructive ml-1"}>
                  {holderDelta > 0 ? "+" : ""}{holderDelta}
                </span>
              )}
            </span>
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

      <div ref={containerRef} className="h-[250px] w-full relative">
        <canvas
          ref={canvasRef}
          className="absolute inset-0 w-full h-full"
          data-testid="scanner-canvas"
        />
      </div>

      <div className="flex items-center justify-center gap-6 text-[10px] font-mono text-muted-foreground">
        <div className="flex items-center gap-2">
          <span className="w-3 h-0.5" style={{ backgroundColor: COLORS.nciLine }} />
          <span>NCI Score (0-100)</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="w-3 h-0.5 border-t border-dashed" style={{ borderColor: COLORS.holderLine }} />
          <span>Holder Count</span>
        </div>
        <span className="text-muted-foreground/50">Refresh: 10s</span>
      </div>
    </div>
  );
}
