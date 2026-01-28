'use client';

import dynamic from 'next/dynamic';
import { useMemo, useState } from 'react';
import type { MapPoint } from './Map';

// Dynamic import to avoid SSR issues with Leaflet
const Map = dynamic(() => import('./Map'), { ssr: false });

type CompletedTask = {
  id: string;
  title: string;
  lat: number;
  lon: number;
  bounty: { amount: number; currency: string };
  template: string;
  completed_at: string | null;
};

type CompletedTasksMapProps = {
  tasks: CompletedTask[];
  title?: string;
  subtitle?: string;
  height?: string;
  onTaskSelect?: (task: CompletedTask) => void;
  className?: string;
  showFilters?: boolean;
};

const templateColors: Record<string, string> = {
  geo_photo_v1: '#14b8a6', // teal
  geo_video_v1: '#6366f1', // indigo
  poi_verify_v1: '#f59e0b', // amber
  survey_v1: '#ec4899', // pink
  default: '#64748b', // slate
};

export default function CompletedTasksMap({
  tasks,
  title = 'Completed Tasks Map',
  subtitle,
  height = '400px',
  onTaskSelect,
  className = '',
  showFilters = true,
}: CompletedTasksMapProps) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [templateFilter, setTemplateFilter] = useState<string>('all');
  const [timeFilter, setTimeFilter] = useState<string>('all');

  // Get unique templates for filter
  const templates = useMemo(() => {
    return Array.from(new Set(tasks.map((t) => t.template))).sort();
  }, [tasks]);

  // Filter tasks
  const filteredTasks = useMemo(() => {
    return tasks.filter((task) => {
      // Template filter
      if (templateFilter !== 'all' && task.template !== templateFilter) {
        return false;
      }

      // Time filter
      if (timeFilter !== 'all' && task.completed_at) {
        const completedDate = new Date(task.completed_at);
        const now = new Date();
        const daysDiff = Math.floor((now.getTime() - completedDate.getTime()) / (1000 * 60 * 60 * 24));

        switch (timeFilter) {
          case '7d':
            if (daysDiff > 7) return false;
            break;
          case '30d':
            if (daysDiff > 30) return false;
            break;
          case '90d':
            if (daysDiff > 90) return false;
            break;
        }
      }

      return true;
    });
  }, [tasks, templateFilter, timeFilter]);

  // Convert to map points
  const mapPoints: MapPoint[] = useMemo(() => {
    return filteredTasks.map((task) => ({
      id: task.id,
      lat: task.lat,
      lon: task.lon,
      label: `${task.bounty.currency} ${task.bounty.amount.toFixed(2)}`,
      color: templateColors[task.template] || templateColors.default,
      popup: (
        <div className="min-w-[200px]">
          <div className="font-medium text-slate-800">{task.title}</div>
          <div className="text-sm text-slate-500 mt-1">{task.template}</div>
          <div className="text-sm font-semibold text-green-600 mt-1">
            {task.bounty.currency} {task.bounty.amount.toFixed(2)}
          </div>
          {task.completed_at && (
            <div className="text-xs text-slate-400 mt-1">
              Completed {new Date(task.completed_at).toLocaleDateString()}
            </div>
          )}
        </div>
      ),
    }));
  }, [filteredTasks]);

  const selectedTask = useMemo(() => {
    return tasks.find((t) => t.id === selectedId) || null;
  }, [tasks, selectedId]);

  const handlePointClick = (point: MapPoint) => {
    setSelectedId(point.id);
    const task = tasks.find((t) => t.id === point.id);
    if (task && onTaskSelect) {
      onTaskSelect(task);
    }
  };

  // Calculate stats
  const totalEarned = filteredTasks.reduce((sum, t) => sum + t.bounty.amount, 0);
  const avgBounty = filteredTasks.length > 0 ? totalEarned / filteredTasks.length : 0;

  return (
    <div className={`glass rounded-lg border border-surface-200 overflow-hidden ${className}`}>
      {/* Header */}
      <div className="p-4 border-b border-surface-200">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h3 className="text-lg font-medium text-slate-800">{title}</h3>
            {subtitle && <p className="text-sm text-slate-500 mt-1">{subtitle}</p>}
          </div>
          <div className="flex items-center gap-4 text-sm">
            <div className="text-right">
              <div className="text-xs uppercase tracking-wide text-slate-400">Tasks</div>
              <div className="font-semibold text-slate-800">{filteredTasks.length}</div>
            </div>
            <div className="text-right">
              <div className="text-xs uppercase tracking-wide text-slate-400">Earned</div>
              <div className="font-semibold text-green-600">
                USDC {totalEarned.toFixed(2)}
              </div>
            </div>
          </div>
        </div>

        {/* Filters */}
        {showFilters && (
          <div className="flex flex-wrap items-center gap-3 mt-4">
            <select
              value={templateFilter}
              onChange={(e) => setTemplateFilter(e.target.value)}
              className="text-sm border border-surface-300 rounded-md px-2 py-1.5 bg-white text-slate-600"
            >
              <option value="all">All Types</option>
              {templates.map((template) => (
                <option key={template} value={template}>
                  {template}
                </option>
              ))}
            </select>

            <select
              value={timeFilter}
              onChange={(e) => setTimeFilter(e.target.value)}
              className="text-sm border border-surface-300 rounded-md px-2 py-1.5 bg-white text-slate-600"
            >
              <option value="all">All Time</option>
              <option value="7d">Last 7 Days</option>
              <option value="30d">Last 30 Days</option>
              <option value="90d">Last 90 Days</option>
            </select>

            {/* Legend */}
            <div className="flex items-center gap-2 ml-auto">
              {templates.slice(0, 3).map((template) => (
                <div key={template} className="flex items-center gap-1 text-xs text-slate-500">
                  <div
                    className="w-2.5 h-2.5 rounded-full"
                    style={{ backgroundColor: templateColors[template] || templateColors.default }}
                  />
                  <span>{template.replace(/_v\d+$/, '')}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Map */}
      <div style={{ height }}>
        {filteredTasks.length === 0 ? (
          <div className="flex items-center justify-center h-full text-slate-500">
            <div className="text-center">
              <svg className="w-12 h-12 mx-auto mb-3 text-slate-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
              </svg>
              <p>No completed tasks to display</p>
              <p className="text-sm mt-1">Complete tasks to see them on the map</p>
            </div>
          </div>
        ) : (
          <Map
            points={mapPoints}
            height={height}
            onPointClick={handlePointClick}
            selectedId={selectedId}
            fitBoundsOnLoad={true}
            tileLayer="carto-light"
          />
        )}
      </div>

      {/* Selected task detail */}
      {selectedTask && (
        <div className="p-4 border-t border-surface-200 bg-slate-50">
          <div className="flex items-start justify-between">
            <div>
              <div className="font-medium text-slate-800">{selectedTask.title}</div>
              <div className="text-sm text-slate-500 mt-1">
                {selectedTask.template} - {selectedTask.lat.toFixed(4)}, {selectedTask.lon.toFixed(4)}
              </div>
            </div>
            <div className="text-right">
              <div className="text-lg font-semibold text-green-600">
                {selectedTask.bounty.currency} {selectedTask.bounty.amount.toFixed(2)}
              </div>
              {selectedTask.completed_at && (
                <div className="text-xs text-slate-400">
                  {new Date(selectedTask.completed_at).toLocaleDateString()}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
