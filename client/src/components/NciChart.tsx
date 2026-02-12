import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid } from 'recharts';
import { format } from "date-fns";
import { type Metric } from "@shared/schema";

interface NciChartProps {
  data: Metric[];
}

export function NciChart({ data }: NciChartProps) {
  // Filter and format data for the chart
  const chartData = data.map(item => ({
    time: item.ts ? new Date(item.ts).getTime() : 0,
    nci: item.nciRaw,
    ema: item.nciEma,
    holders: item.holders
  })).sort((a, b) => a.time - b.time);

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-background/90 border border-primary/50 p-3 rounded shadow-lg backdrop-blur-md">
          <p className="text-primary font-mono text-xs mb-2 border-b border-primary/20 pb-1">
            {format(new Date(label), "HH:mm:ss")}
          </p>
          <div className="space-y-1">
            <p className="text-secondary text-sm">
              <span className="text-muted-foreground text-xs mr-2">NCI RAW:</span>
              {Number(payload[0].value).toFixed(4)}
            </p>
            <p className="text-accent text-sm">
              <span className="text-muted-foreground text-xs mr-2">NCI EMA:</span>
              {Number(payload[1].value).toFixed(4)}
            </p>
            <p className="text-primary text-sm">
              <span className="text-muted-foreground text-xs mr-2">HOLDERS:</span>
              {payload[2]?.value}
            </p>
          </div>
        </div>
      );
    }
    return null;
  };

  return (
    <div className="h-[300px] w-full mt-4">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={chartData}>
          <defs>
            <linearGradient id="colorNci" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="var(--secondary)" stopOpacity={0.3}/>
              <stop offset="95%" stopColor="var(--secondary)" stopOpacity={0}/>
            </linearGradient>
            <linearGradient id="colorEma" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="var(--accent)" stopOpacity={0.3}/>
              <stop offset="95%" stopColor="var(--accent)" stopOpacity={0}/>
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--muted-foreground)" opacity={0.1} vertical={false} />
          <XAxis 
            dataKey="time" 
            tickFormatter={(time) => format(new Date(time), "HH:mm")}
            stroke="var(--muted-foreground)"
            fontSize={10}
            tickLine={false}
            axisLine={false}
            minTickGap={30}
          />
          <YAxis 
            yAxisId="left"
            stroke="var(--secondary)"
            fontSize={10}
            tickLine={false}
            axisLine={false}
            domain={['auto', 'auto']}
            width={40}
          />
          <YAxis 
            yAxisId="right"
            orientation="right"
            stroke="var(--primary)"
            fontSize={10}
            tickLine={false}
            axisLine={false}
            domain={['auto', 'auto']}
            width={40}
          />
          <Tooltip content={<CustomTooltip />} cursor={{ stroke: 'var(--primary)', strokeWidth: 1, strokeDasharray: '4 4' }} />
          <Area 
            yAxisId="left"
            type="monotone" 
            dataKey="nci" 
            stroke="var(--secondary)" 
            strokeWidth={2}
            fillOpacity={1} 
            fill="url(#colorNci)" 
            isAnimationActive={false}
          />
          <Area 
            yAxisId="left"
            type="monotone" 
            dataKey="ema" 
            stroke="var(--accent)" 
            strokeWidth={2}
            strokeDasharray="4 4"
            fill="none" 
            isAnimationActive={false}
          />
          {/* Hidden holder line for tooltip data, mapped to right axis */}
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
