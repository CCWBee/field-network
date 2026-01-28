'use client';

import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
  Legend,
} from 'recharts';

type ChartDataPoint = {
  month: string;
  label: string;
  amount: number;
};

type EarningsChartProps = {
  data: ChartDataPoint[];
  title?: string;
  subtitle?: string;
  height?: number;
  currency?: string;
  variant?: 'area' | 'bar';
  color?: string;
  className?: string;
};

const formatCurrency = (value: number, currency: string = 'USDC'): string => {
  if (value >= 1000) {
    return `${currency} ${(value / 1000).toFixed(1)}k`;
  }
  return `${currency} ${value.toFixed(0)}`;
};

const CustomTooltip = ({
  active,
  payload,
  label,
  currency,
}: {
  active?: boolean;
  payload?: any[];
  label?: string;
  currency: string;
}) => {
  if (active && payload && payload.length) {
    return (
      <div className="glass rounded-lg p-3 border border-surface-200 shadow-lg">
        <p className="text-sm font-medium text-slate-800">{label}</p>
        <p className="text-lg font-bold text-field-600">
          {formatCurrency(payload[0].value, currency)}
        </p>
      </div>
    );
  }
  return null;
};

export default function EarningsChart({
  data,
  title = 'Earnings',
  subtitle,
  height = 300,
  currency = 'USDC',
  variant = 'area',
  color = '#14b8a6',
  className = '',
}: EarningsChartProps) {
  const totalEarnings = data.reduce((sum, point) => sum + point.amount, 0);
  const maxEarning = Math.max(...data.map((d) => d.amount));
  const avgEarning = totalEarnings / data.length;

  // Calculate trend (comparing last 3 months to previous 3 months)
  const recent = data.slice(-3).reduce((sum, d) => sum + d.amount, 0);
  const previous = data.slice(-6, -3).reduce((sum, d) => sum + d.amount, 0);
  const trendPercent = previous > 0 ? ((recent - previous) / previous) * 100 : 0;

  return (
    <div className={`glass rounded-lg border border-surface-200 p-6 ${className}`}>
      <div className="flex flex-wrap items-start justify-between gap-4 mb-6">
        <div>
          <h3 className="text-lg font-medium text-slate-800">{title}</h3>
          {subtitle && <p className="text-sm text-slate-500 mt-1">{subtitle}</p>}
        </div>
        <div className="flex items-center gap-4 text-sm">
          <div className="text-right">
            <div className="text-xs uppercase tracking-wide text-slate-400">Total</div>
            <div className="font-semibold text-slate-800">{formatCurrency(totalEarnings, currency)}</div>
          </div>
          {trendPercent !== 0 && (
            <div className="text-right">
              <div className="text-xs uppercase tracking-wide text-slate-400">Trend</div>
              <div className={`font-semibold ${trendPercent >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                {trendPercent >= 0 ? '+' : ''}{trendPercent.toFixed(1)}%
              </div>
            </div>
          )}
        </div>
      </div>

      <ResponsiveContainer width="100%" height={height}>
        {variant === 'area' ? (
          <AreaChart
            data={data}
            margin={{ top: 10, right: 10, left: 0, bottom: 0 }}
          >
            <defs>
              <linearGradient id="colorEarnings" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={color} stopOpacity={0.3} />
                <stop offset="95%" stopColor={color} stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
            <XAxis
              dataKey="label"
              axisLine={false}
              tickLine={false}
              tick={{ fill: '#64748b', fontSize: 12 }}
              dy={10}
            />
            <YAxis
              axisLine={false}
              tickLine={false}
              tick={{ fill: '#64748b', fontSize: 12 }}
              tickFormatter={(value) => formatCurrency(value, '')}
              width={50}
            />
            <Tooltip content={<CustomTooltip currency={currency} />} />
            <Area
              type="monotone"
              dataKey="amount"
              stroke={color}
              strokeWidth={2}
              fillOpacity={1}
              fill="url(#colorEarnings)"
            />
          </AreaChart>
        ) : (
          <BarChart
            data={data}
            margin={{ top: 10, right: 10, left: 0, bottom: 0 }}
          >
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
            <XAxis
              dataKey="label"
              axisLine={false}
              tickLine={false}
              tick={{ fill: '#64748b', fontSize: 12 }}
              dy={10}
            />
            <YAxis
              axisLine={false}
              tickLine={false}
              tick={{ fill: '#64748b', fontSize: 12 }}
              tickFormatter={(value) => formatCurrency(value, '')}
              width={50}
            />
            <Tooltip content={<CustomTooltip currency={currency} />} />
            <Bar
              dataKey="amount"
              fill={color}
              radius={[4, 4, 0, 0]}
              maxBarSize={40}
            />
          </BarChart>
        )}
      </ResponsiveContainer>

      <div className="mt-6 grid grid-cols-3 gap-4 border-t border-surface-200 pt-4">
        <div className="text-center">
          <div className="text-xs uppercase tracking-wide text-slate-400">Avg/Month</div>
          <div className="text-sm font-semibold text-slate-800 mt-1">
            {formatCurrency(avgEarning, currency)}
          </div>
        </div>
        <div className="text-center">
          <div className="text-xs uppercase tracking-wide text-slate-400">Peak</div>
          <div className="text-sm font-semibold text-slate-800 mt-1">
            {formatCurrency(maxEarning, currency)}
          </div>
        </div>
        <div className="text-center">
          <div className="text-xs uppercase tracking-wide text-slate-400">Months</div>
          <div className="text-sm font-semibold text-slate-800 mt-1">{data.length}</div>
        </div>
      </div>
    </div>
  );
}

// Stats card variant for compact displays
export function EarningsStatCard({
  data,
  title,
  currency = 'USDC',
  className = '',
}: {
  data: ChartDataPoint[];
  title: string;
  currency?: string;
  className?: string;
}) {
  const total = data.reduce((sum, point) => sum + point.amount, 0);
  const recent = data.slice(-3).reduce((sum, d) => sum + d.amount, 0);
  const previous = data.slice(-6, -3).reduce((sum, d) => sum + d.amount, 0);
  const trendPercent = previous > 0 ? ((recent - previous) / previous) * 100 : 0;

  return (
    <div className={`glass rounded-lg border border-surface-200 p-4 ${className}`}>
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs uppercase tracking-wide text-slate-400">{title}</span>
        {trendPercent !== 0 && (
          <span className={`text-xs font-medium ${trendPercent >= 0 ? 'text-green-600' : 'text-red-600'}`}>
            {trendPercent >= 0 ? '+' : ''}{trendPercent.toFixed(0)}%
          </span>
        )}
      </div>
      <div className="text-2xl font-bold text-slate-800 mb-3">
        {formatCurrency(total, currency)}
      </div>
      <ResponsiveContainer width="100%" height={50}>
        <AreaChart data={data} margin={{ top: 0, right: 0, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id="colorMini" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#14b8a6" stopOpacity={0.2} />
              <stop offset="95%" stopColor="#14b8a6" stopOpacity={0} />
            </linearGradient>
          </defs>
          <Area
            type="monotone"
            dataKey="amount"
            stroke="#14b8a6"
            strokeWidth={1.5}
            fillOpacity={1}
            fill="url(#colorMini)"
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
