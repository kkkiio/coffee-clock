import React from "react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from "recharts";

interface Log {
  id: string;
  drank_at: string;
  caffeine_amount: number;
}

interface CaffeineChartProps {
  logs: Log[];
}

// Caffeine Half-Life in hours (average)
const HALF_LIFE = 5;

const calculateRemaining = (amount: number, elapsedHours: number) => {
  if (elapsedHours < 0) return 0;
  return amount * Math.pow(0.5, elapsedHours / HALF_LIFE);
};

export function CaffeineChart({ logs }: CaffeineChartProps) {
  const [data, setData] = React.useState<any[]>([]);

  React.useEffect(() => {
    if (!logs) return;

    // 1. Define time range: Today 00:00 to Tomorrow 06:00
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    
    const end = new Date(start);
    end.setDate(end.getDate() + 1);
    end.setHours(6, 0, 0, 0); // Show until 6 AM next day

    const points = [];
    let current = new Date(start);

    // 2. Generate points every 30 minutes
    while (current <= end) {
      const currentTime = current.getTime();
      let totalCaffeine = 0;

      logs.forEach((log) => {
        const logTime = new Date(log.drank_at).getTime();
        const elapsedHours = (currentTime - logTime) / (1000 * 60 * 60);
        
        // Only count coffee drank before this time point
        if (elapsedHours >= 0) {
          totalCaffeine += calculateRemaining(log.caffeine_amount, elapsedHours);
        }
      });

      points.push({
        time: current.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        timestamp: currentTime,
        amount: Math.round(totalCaffeine),
      });

      // Increment by 30 mins
      current.setMinutes(current.getMinutes() + 30);
    }

    setData(points);
  }, [logs]);

  if (!logs || logs.length === 0) {
    return (
      <div className="text-center text-muted p-5 bg-light rounded">
        Add a coffee log to see your metabolism curve.
      </div>
    );
  }

  return (
    <div style={{ width: "100%", height: 300 }}>
      <ResponsiveContainer>
        <AreaChart
          data={data}
          margin={{
            top: 10,
            right: 30,
            left: 0,
            bottom: 0,
          }}
        >
          <defs>
            <linearGradient id="colorCaffeine" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#6f4e37" stopOpacity={0.8}/>
              <stop offset="95%" stopColor="#6f4e37" stopOpacity={0}/>
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" vertical={false} />
          <XAxis 
            dataKey="time" 
            minTickGap={50} 
            tick={{fontSize: 12}}
          />
          <YAxis />
          <Tooltip />
          <ReferenceLine y={50} label="Sleep OK (<50mg)" stroke="green" strokeDasharray="3 3" />
          <Area
            type="monotone"
            dataKey="amount"
            stroke="#6f4e37"
            fillOpacity={1}
            fill="url(#colorCaffeine)"
            animationDuration={1000}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
