'use client';

import { useState, useEffect, useMemo } from 'react';
import { api } from '@/lib/api';

interface ReputationEvent {
  id: string;
  previous_score: number;
  new_score: number;
  score_change: number;
  reason: string;
  task_id: string | null;
  badge_type: string | null;
  metadata: Record<string, any>;
  created_at: string;
}

type TimeRange = 'week' | 'month' | 'all';

interface Props {
  userId?: string; // If provided, show public history for that user
  className?: string;
}

export default function ReputationChart({ userId, className = '' }: Props) {
  const [events, setEvents] = useState<ReputationEvent[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [timeRange, setTimeRange] = useState<TimeRange>('month');
  const [hoveredEvent, setHoveredEvent] = useState<ReputationEvent | null>(null);

  useEffect(() => {
    fetchHistory();
  }, [userId]);

  const fetchHistory = async () => {
    setIsLoading(true);
    try {
      if (userId) {
        const result = await api.getPublicReputationHistory(userId, { limit: 100 });
        setEvents(result.events.map(e => ({ ...e, task_id: null, metadata: {} })));
      } else {
        const result = await api.getMyReputationHistory({ limit: 100 });
        setEvents(result.events);
      }
    } catch (error) {
      console.error('Failed to fetch reputation history:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const filteredEvents = useMemo(() => {
    if (timeRange === 'all') return events;

    const now = new Date();
    const cutoff = new Date();
    if (timeRange === 'week') {
      cutoff.setDate(now.getDate() - 7);
    } else if (timeRange === 'month') {
      cutoff.setDate(now.getDate() - 30);
    }

    return events.filter((e) => new Date(e.created_at) >= cutoff);
  }, [events, timeRange]);

  // Reverse to show chronological order (oldest first)
  const chronologicalEvents = useMemo(() => [...filteredEvents].reverse(), [filteredEvents]);

  // Calculate chart dimensions
  const chartWidth = 600;
  const chartHeight = 200;
  const padding = { top: 20, right: 20, bottom: 30, left: 40 };
  const innerWidth = chartWidth - padding.left - padding.right;
  const innerHeight = chartHeight - padding.top - padding.bottom;

  // Calculate scales
  const { minScore, maxScore, points, path } = useMemo(() => {
    if (chronologicalEvents.length === 0) {
      return { minScore: 0, maxScore: 100, points: [], path: '' };
    }

    const scores = chronologicalEvents.map((e) => e.new_score);
    const min = Math.max(0, Math.min(...scores) - 10);
    const max = Math.min(100, Math.max(...scores) + 10);

    const pts = chronologicalEvents.map((event, index) => {
      const x = padding.left + (index / (chronologicalEvents.length - 1 || 1)) * innerWidth;
      const y = padding.top + (1 - (event.new_score - min) / (max - min || 1)) * innerHeight;
      return { x, y, event };
    });

    const pathD = pts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');

    return { minScore: min, maxScore: max, points: pts, path: pathD };
  }, [chronologicalEvents, innerWidth, innerHeight]);

  const getReasonLabel = (reason: string) => {
    const labels: Record<string, string> = {
      task_accepted: 'Task Accepted',
      task_rejected: 'Task Rejected',
      dispute_resolved: 'Dispute Resolved',
      claim_abandoned: 'Claim Abandoned',
      badge_earned: 'Badge Earned',
      streak_bonus: 'Streak Bonus',
      initial_setup: 'Account Created',
      recalculation: 'Score Updated',
    };
    return labels[reason] || reason;
  };

  const getReasonColor = (reason: string) => {
    const colors: Record<string, string> = {
      task_accepted: 'text-green-600',
      task_rejected: 'text-red-600',
      dispute_resolved: 'text-orange-600',
      claim_abandoned: 'text-red-600',
      badge_earned: 'text-yellow-600',
      streak_bonus: 'text-blue-600',
      initial_setup: 'text-ink-700',
      recalculation: 'text-ink-500',
    };
    return colors[reason] || 'text-ink-700';
  };

  if (isLoading) {
    return (
      <div className={`bg-paper rounded-sm p-6 border border-ink-200 ${className}`}>
        <div className="flex items-center justify-center h-48">
          <div className="animate-spin rounded-full h-8 w-8 border-2 border-field-500 border-t-transparent"></div>
        </div>
      </div>
    );
  }

  if (events.length === 0) {
    return (
      <div className={`bg-paper rounded-sm p-6 border border-ink-200 ${className}`}>
        <h3 className="text-lg font-semibold text-ink-900 mb-4">Reputation History</h3>
        <div className="flex flex-col items-center justify-center h-48 text-ink-500">
          <svg className="w-12 h-12 mb-2 text-ink-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
          </svg>
          <p className="text-sm">No reputation history yet</p>
          <p className="text-xs mt-1">Complete tasks to start building your reputation</p>
        </div>
      </div>
    );
  }

  return (
    <div className={`bg-paper rounded-sm p-6 border border-ink-200 ${className}`}>
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-ink-900">Reputation History</h3>
        <div className="flex gap-1 bg-ink-100 rounded-sm p-1">
          {(['week', 'month', 'all'] as TimeRange[]).map((range) => (
            <button
              key={range}
              onClick={() => setTimeRange(range)}
              className={`px-3 py-1 text-sm rounded-sm transition-colors ${
                timeRange === range
                  ? 'bg-paper text-field-600 shadow-sm'
                  : 'text-ink-700 hover:text-ink-900'
              }`}
            >
              {range === 'week' ? '7D' : range === 'month' ? '30D' : 'All'}
            </button>
          ))}
        </div>
      </div>

      {/* Chart */}
      {filteredEvents.length > 0 ? (
        <div className="relative">
          <svg viewBox={`0 0 ${chartWidth} ${chartHeight}`} className="w-full h-auto">
            {/* Grid lines */}
            {[0, 25, 50, 75, 100].map((tick) => {
              const y = padding.top + (1 - (tick - minScore) / (maxScore - minScore || 1)) * innerHeight;
              if (y < padding.top || y > chartHeight - padding.bottom) return null;
              return (
                <g key={tick}>
                  <line
                    x1={padding.left}
                    y1={y}
                    x2={chartWidth - padding.right}
                    y2={y}
                    stroke="#e2e8f0"
                    strokeDasharray="4,4"
                  />
                  <text
                    x={padding.left - 8}
                    y={y}
                    textAnchor="end"
                    dominantBaseline="middle"
                    className="text-xs fill-ink-500"
                  >
                    {tick}
                  </text>
                </g>
              );
            })}

            {/* Line */}
            <path d={path} fill="none" stroke="#14b8a6" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />

            {/* Area fill */}
            {points.length > 0 && (
              <path
                d={`${path} L ${points[points.length - 1].x} ${chartHeight - padding.bottom} L ${points[0].x} ${chartHeight - padding.bottom} Z`}
                fill="url(#gradient)"
                opacity="0.2"
              />
            )}

            {/* Gradient definition */}
            <defs>
              <linearGradient id="gradient" x1="0%" y1="0%" x2="0%" y2="100%">
                <stop offset="0%" stopColor="#14b8a6" />
                <stop offset="100%" stopColor="#14b8a6" stopOpacity="0" />
              </linearGradient>
            </defs>

            {/* Data points */}
            {points.map((point, index) => (
              <g key={index}>
                <circle
                  cx={point.x}
                  cy={point.y}
                  r={hoveredEvent?.id === point.event.id ? 6 : 4}
                  fill={point.event.score_change >= 0 ? '#14b8a6' : '#ef4444'}
                  stroke="white"
                  strokeWidth="2"
                  className="cursor-pointer transition-all"
                  onMouseEnter={() => setHoveredEvent(point.event)}
                  onMouseLeave={() => setHoveredEvent(null)}
                />
              </g>
            ))}

            {/* Y-axis label */}
            <text
              x={12}
              y={chartHeight / 2}
              textAnchor="middle"
              dominantBaseline="middle"
              transform={`rotate(-90, 12, ${chartHeight / 2})`}
              className="text-xs fill-ink-500"
            >
              Score
            </text>
          </svg>

          {/* Tooltip */}
          {hoveredEvent && (
            <div className="absolute top-0 right-0 bg-paper rounded-sm shadow-lg border border-ink-200 p-3 text-sm max-w-xs">
              <p className={`font-medium ${getReasonColor(hoveredEvent.reason)}`}>
                {getReasonLabel(hoveredEvent.reason)}
              </p>
              <div className="flex items-center gap-2 mt-1">
                <span className="font-mono tabular-nums text-ink-500">{hoveredEvent.previous_score.toFixed(0)}</span>
                <span className="text-ink-300">-&gt;</span>
                <span className="font-mono tabular-nums font-medium text-ink-900">{hoveredEvent.new_score.toFixed(0)}</span>
                <span className={`text-xs font-mono tabular-nums px-1.5 py-0.5 rounded-sm border ${
                  hoveredEvent.score_change > 0 ? 'text-signal-green border-signal-green/30' :
                  hoveredEvent.score_change < 0 ? 'text-signal-red border-signal-red/30' :
                  'text-ink-700 border-ink-200'
                }`}>
                  {hoveredEvent.score_change > 0 ? '+' : ''}{hoveredEvent.score_change.toFixed(0)}
                </span>
              </div>
              <p className="text-xs text-ink-500 mt-1">
                {new Date(hoveredEvent.created_at).toLocaleDateString(undefined, {
                  month: 'short',
                  day: 'numeric',
                  year: 'numeric',
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </p>
            </div>
          )}
        </div>
      ) : (
        <div className="flex items-center justify-center h-48 text-ink-500">
          <p className="text-sm">No events in selected time range</p>
        </div>
      )}

      {/* Recent Events List */}
      <div className="mt-4 border-t border-ink-200 pt-4">
        <h4 className="text-sm font-medium text-ink-700 mb-2">Recent Events</h4>
        <div className="space-y-2 max-h-48 overflow-y-auto">
          {filteredEvents.slice(0, 10).map((event) => (
            <div
              key={event.id}
              className="flex items-center justify-between text-sm py-1"
            >
              <div className="flex items-center gap-2">
                <span className={`w-2 h-2 rounded-full ${
                  event.score_change > 0 ? 'bg-signal-green' :
                  event.score_change < 0 ? 'bg-signal-red' :
                  'bg-ink-300'
                }`}></span>
                <span className={getReasonColor(event.reason)}>
                  {getReasonLabel(event.reason)}
                </span>
                {event.badge_type && (
                  <span className="text-xs text-ink-500">({event.badge_type})</span>
                )}
              </div>
              <div className="flex items-center gap-2">
                <span className={`font-mono tabular-nums font-medium ${
                  event.score_change > 0 ? 'text-signal-green' :
                  event.score_change < 0 ? 'text-signal-red' :
                  'text-ink-500'
                }`}>
                  {event.score_change > 0 ? '+' : ''}{event.score_change.toFixed(0)}
                </span>
                <span className="text-xs text-ink-500">
                  {new Date(event.created_at).toLocaleDateString(undefined, {
                    month: 'short',
                    day: 'numeric',
                  })}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
