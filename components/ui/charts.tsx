"use client";

import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { fmtMoney } from "@/lib/utils";

const axisStyle = { fontSize: 11, fill: "hsl(var(--muted-foreground))" };

export function RevenueArea({ data }: { data: { day: string; revenue: number }[] }) {
  return (
    <ResponsiveContainer width="100%" height={260}>
      <AreaChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id="revGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="hsl(var(--chart-1))" stopOpacity={0.35} />
            <stop offset="100%" stopColor="hsl(var(--chart-1))" stopOpacity={0.02} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
        <XAxis dataKey="day" tickLine={false} axisLine={false} tick={axisStyle} dy={6} />
        <YAxis
          tickLine={false}
          axisLine={false}
          tick={axisStyle}
          width={48}
          tickFormatter={(v: number) => `$${(v / 1000).toFixed(1)}k`}
        />
        <Tooltip
          formatter={(v) => [fmtMoney(Number(v)), "Revenue"]}
          contentStyle={{
            background: "hsl(var(--popover))",
            border: "1px solid hsl(var(--border))",
            borderRadius: 12,
            fontSize: 12,
            color: "hsl(var(--popover-foreground))",
          }}
          labelStyle={{ color: "hsl(var(--muted-foreground))" }}
          cursor={{ stroke: "hsl(var(--border))" }}
        />
        <Area
          type="monotone"
          dataKey="revenue"
          stroke="hsl(var(--chart-1))"
          strokeWidth={2.5}
          fill="url(#revGrad)"
          activeDot={{ r: 5, strokeWidth: 2, stroke: "hsl(var(--card))" }}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}

export function DeptBars({ data }: { data: { dept: string; count: number }[] }) {
  return (
    <ResponsiveContainer width="100%" height={220}>
      <BarChart data={data} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
        <XAxis dataKey="dept" tickLine={false} axisLine={false} tick={{ ...axisStyle, fontSize: 10 }} dy={6} interval={0} />
        <YAxis tickLine={false} axisLine={false} tick={axisStyle} width={28} allowDecimals={false} />
        <Tooltip
          cursor={{ fill: "hsl(var(--muted) / .5)" }}
          contentStyle={{
            background: "hsl(var(--popover))",
            border: "1px solid hsl(var(--border))",
            borderRadius: 12,
            fontSize: 12,
            color: "hsl(var(--popover-foreground))",
          }}
        />
        <Bar dataKey="count" name="Appointments" radius={[6, 6, 0, 0]} fill="hsl(var(--chart-2))" maxBarSize={36} />
      </BarChart>
    </ResponsiveContainer>
  );
}

export function Sparkline({ points, className }: { points: number[]; className?: string }) {
  const max = Math.max(...points, 1);
  const min = Math.min(...points, 0);
  const range = max - min || 1;
  const coords = points
    .map((p, i) => `${(i / (points.length - 1)) * 100},${28 - ((p - min) / range) * 24 - 2}`)
    .join(" ");
  return (
    <svg viewBox="0 0 100 28" preserveAspectRatio="none" className={className} aria-hidden>
      <polyline
        points={coords}
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
