'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import { useAuthStore } from '@/lib/store';
import { useTaskStore } from '@/lib/store';
import { api } from '@/lib/api';
import { StatCard } from '@/components/AchievementProgress';
import {
  Spinner,
  Button,
  Card,
  CardBody,
  EmptyTaskList,
  EmptyMapView,
  StaggeredList,
  StaggeredItem,
  HoverScale,
} from '@/components/ui';

// Dynamic imports for components with client-side dependencies
const EarningsChart = dynamic(() => import('@/components/EarningsChart'), { ssr: false });
const Map = dynamic(() => import('@/components/Map'), { ssr: false });

type RequesterStats = {
  summary: {
    tasks_posted: number;
    tasks_completed: number;
    total_bounties_paid: number;
    fulfillment_rate: number;
    avg_response_hours: number | null;
    repeat_workers: number;
  };
  tasks_by_status: {
    draft: number;
    posted: number;
    claimed: number;
    submitted: number;
    accepted: number;
    disputed: number;
    cancelled: number;
    expired: number;
  };
  pending_reviews: Array<{
    submission_id: string;
    task_id: string;
    task_title: string;
    bounty: { amount: number; currency: string };
    worker: { id: string; username: string | null };
    submitted_at: string | null;
  }>;
  spending_chart: Array<{
    month: string;
    label: string;
    amount: number;
  }>;
  tasks_map: Array<{
    id: string;
    title: string;
    status: string;
    lat: number;
    lon: number;
    bounty: { amount: number; currency: string };
    template: string;
    created_at: string;
  }>;
  template_usage: Array<{
    template: string;
    count: number;
  }>;
};

const statusColors: Record<string, string> = {
  draft: 'text-ink-500 border border-ink-200',
  posted: 'text-signal-blue border border-signal-blue/30',
  claimed: 'text-signal-amber border border-signal-amber/30',
  submitted: 'text-purple-700 border border-purple-300',
  accepted: 'text-signal-green border border-signal-green/30',
  disputed: 'text-signal-red border border-signal-red/30',
  cancelled: 'text-ink-300 border border-ink-200',
  expired: 'text-ink-300 border border-ink-200',
};

const mapStatusColors: Record<string, string> = {
  draft: '#94a3b8',
  posted: '#3b82f6',
  claimed: '#f59e0b',
  submitted: '#a855f7',
  accepted: '#22c55e',
  disputed: '#ef4444',
  cancelled: '#64748b',
  expired: '#64748b',
};

export default function RequesterDashboard() {
  const { user, token } = useAuthStore();
  const { tasks, isLoading, fetchTasks } = useTaskStore();
  const [inventory, setInventory] = useState<any[]>([]);
  const [requesterStats, setRequesterStats] = useState<RequesterStats | null>(null);
  const [statsLoading, setStatsLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'overview' | 'tasks' | 'analytics'>('overview');
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);

  useEffect(() => {
    fetchTasks();
  }, [fetchTasks]);

  useEffect(() => {
    const loadInventory = async () => {
      try {
        const data = await api.getResaleInventory(true);
        setInventory(data.items);
      } catch {
        setInventory([]);
      }
    };
    loadInventory();
  }, []);

  useEffect(() => {
    const loadRequesterStats = async () => {
      try {
        api.setToken(token);
        const stats = await api.getRequesterStats();
        setRequesterStats(stats);
      } catch (err) {
        console.error('Failed to load requester stats:', err);
      } finally {
        setStatsLoading(false);
      }
    };
    loadRequesterStats();
  }, [token]);

  const stats = useMemo(() => {
    return {
      total: requesterStats?.summary.tasks_posted ?? tasks.length,
      active: tasks.filter(t => ['posted', 'claimed', 'submitted'].includes(t.status)).length,
      completed: requesterStats?.summary.tasks_completed ?? tasks.filter(t => t.status === 'accepted').length,
      pending_review: tasks.filter(t => t.status === 'submitted').length,
      fulfillmentRate: requesterStats?.summary.fulfillment_rate ?? 0,
      avgResponseHours: requesterStats?.summary.avg_response_hours ?? null,
      repeatWorkers: requesterStats?.summary.repeat_workers ?? 0,
    };
  }, [tasks, requesterStats]);

  const payoutStats = useMemo(() => {
    const formatApprox = (value: number) => {
      if (value < 1000) return `~USDC ${Math.round(value)}`;
      if (value < 10000) return `~USDC ${(value / 1000).toFixed(1)}k`;
      return `~USDC ${(value / 1000).toFixed(0)}k`;
    };

    const totalBountiesPaid = requesterStats?.summary.total_bounties_paid ?? 0;
    const totalBounties = tasks.reduce((sum, task) => sum + (task.bounty.amount || 0), 0);
    const activeBounties = tasks
      .filter(t => ['posted', 'claimed', 'submitted'].includes(t.status))
      .reduce((sum, task) => sum + (task.bounty.amount || 0), 0);

    return {
      totalBounties,
      totalBountiesPaid,
      activeBounties,
      totalBountiesApprox: formatApprox(totalBounties),
      activeBountiesApprox: formatApprox(activeBounties),
      paidOutApprox: formatApprox(totalBountiesPaid),
    };
  }, [tasks, requesterStats]);

  const mapPoints = useMemo(() => {
    if (!requesterStats?.tasks_map) return [];
    return requesterStats.tasks_map.map((task) => ({
      id: task.id,
      lat: task.lat,
      lon: task.lon,
      label: `${task.bounty.currency} ${task.bounty.amount.toFixed(2)} - ${task.status}`,
      color: mapStatusColors[task.status] || '#64748b',
    }));
  }, [requesterStats]);

  const selectedMapTask = useMemo(() => {
    if (!selectedTaskId || !requesterStats?.tasks_map) return null;
    return requesterStats.tasks_map.find(t => t.id === selectedTaskId) || null;
  }, [selectedTaskId, requesterStats]);

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-6 mb-8">
        <div>
          <p className="text-xs uppercase tracking-wider text-ink-500">Requester Console</p>
          <h1 className="text-2xl font-bold text-ink-900 tracking-tight">Field Network Command</h1>
          <p className="text-ink-500 mt-2">Monitor live bounties, fulfillment, and resale-ready data.</p>
        </div>
        <Link
          href="/dashboard/requester/new"
          className="bg-field-500 text-white px-4 py-2 rounded-sm hover:bg-field-600"
        >
          Create New Task
        </Link>
      </div>

      {/* Stats Overview Cards */}
      <div className="grid gap-4 grid-cols-2 md:grid-cols-4 lg:grid-cols-6 mb-8">
        <StatCard
          label="Total Posted"
          value={stats.total}
          subValue={`${stats.completed} completed`}
          icon={
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
            </svg>
          }
        />
        <StatCard
          label="Active Bounties"
          value={stats.active}
          subValue={payoutStats.activeBountiesApprox}
          icon={
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
          }
        />
        <StatCard
          label="Pending Review"
          value={stats.pending_review}
          subValue="awaiting decision"
          icon={
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
            </svg>
          }
        />
        <StatCard
          label="Fulfillment Rate"
          value={`${stats.fulfillmentRate.toFixed(0)}%`}
          subValue="task completion"
          icon={
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          }
        />
        <StatCard
          label="Total Spent"
          value={payoutStats.paidOutApprox}
          subValue={`${stats.completed} tasks`}
          icon={
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          }
        />
        <StatCard
          label="Avg Response"
          value={stats.avgResponseHours ? `${stats.avgResponseHours}h` : 'N/A'}
          subValue="to submissions"
          icon={
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          }
        />
      </div>

      {/* Tab Navigation */}
      <div className="flex gap-2 mb-6 border-b border-ink-200">
        <button
          onClick={() => setActiveTab('overview')}
          className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
            activeTab === 'overview'
              ? 'border-field-500 text-field-500'
              : 'border-transparent text-ink-500 hover:text-ink-700'
          }`}
        >
          Overview
        </button>
        <button
          onClick={() => setActiveTab('tasks')}
          className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
            activeTab === 'tasks'
              ? 'border-field-500 text-field-500'
              : 'border-transparent text-ink-500 hover:text-ink-700'
          }`}
        >
          Mission Log
        </button>
        <button
          onClick={() => setActiveTab('analytics')}
          className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
            activeTab === 'analytics'
              ? 'border-field-500 text-field-500'
              : 'border-transparent text-ink-500 hover:text-ink-700'
          }`}
        >
          Spending & Analytics
        </button>
      </div>

      {/* Overview Tab */}
      {activeTab === 'overview' && (
        <>
          <div className="grid gap-6 lg:grid-cols-2 mb-10">
            {/* Bounty Spend */}
            <div className="bg-paper rounded-sm border border-ink-200 p-6">
              <h2 className="text-lg font-medium text-ink-900 mb-4">Bounty Spend</h2>
              <div className="grid gap-4">
                <div className="flex items-center justify-between">
                  <div className="text-sm text-ink-500">Active Bounties</div>
                  <div className="text-lg font-semibold font-mono tabular-nums text-ink-900">
                    {payoutStats.activeBountiesApprox}
                  </div>
                </div>
                <div className="flex items-center justify-between">
                  <div className="text-sm text-ink-500">Paid Out</div>
                  <div className="text-lg font-semibold font-mono tabular-nums text-signal-green">
                    {payoutStats.paidOutApprox}
                  </div>
                </div>
                <div className="flex items-center justify-between">
                  <div className="text-sm text-ink-500">Total Budgeted</div>
                  <div className="text-lg font-semibold font-mono tabular-nums text-ink-900">
                    {payoutStats.totalBountiesApprox}
                  </div>
                </div>
              </div>
              <div className="mt-6 rounded-sm border border-ink-200 bg-paper px-4 py-3 text-sm text-ink-500">
                Reliability score: {user?.stats?.reliabilityScore?.toFixed(0) || 0}% - Repeat workers: {stats.repeatWorkers}
              </div>
            </div>

            {/* Pending Reviews */}
            <div className="bg-paper rounded-sm border border-ink-200 p-6">
              <h2 className="text-lg font-medium text-ink-900 mb-4">Pending Reviews</h2>
              {statsLoading ? (
                <div className="flex justify-center py-8">
                  <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-field-500"></div>
                </div>
              ) : requesterStats?.pending_reviews && requesterStats.pending_reviews.length > 0 ? (
                <div className="space-y-3">
                  {requesterStats.pending_reviews.slice(0, 5).map((review) => (
                    <Link
                      key={review.submission_id}
                      href={`/dashboard/requester/tasks/${review.task_id}`}
                      className="block rounded-sm border border-ink-200 bg-paper px-4 py-3 hover:border-field-500/30 transition-colors"
                    >
                      <div className="flex items-center justify-between">
                        <div>
                          <div className="text-sm font-medium text-ink-900">{review.task_title}</div>
                          <div className="text-xs text-ink-500 mt-1">
                            by {review.worker.username || 'Anonymous'} - {review.submitted_at ? new Date(review.submitted_at).toLocaleDateString() : 'Pending'}
                          </div>
                        </div>
                        <div className="text-sm font-semibold font-mono tabular-nums text-signal-green">
                          {review.bounty.currency} {review.bounty.amount.toFixed(2)}
                        </div>
                      </div>
                    </Link>
                  ))}
                  {requesterStats.pending_reviews.length > 5 && (
                    <p className="text-sm text-ink-300 text-center mt-2">
                      +{requesterStats.pending_reviews.length - 5} more submissions
                    </p>
                  )}
                </div>
              ) : (
                <div className="rounded-sm border border-dashed border-ink-200 p-4 text-sm text-ink-500 text-center">
                  No pending submissions to review
                </div>
              )}
            </div>
          </div>

          {/* Task Status Breakdown & Map */}
          <div className="grid gap-6 lg:grid-cols-[1fr_2fr] mb-10">
            {/* Status Breakdown */}
            <div className="bg-paper rounded-sm border border-ink-200 p-6">
              <h2 className="text-lg font-medium text-ink-900 mb-4">Task Status Breakdown</h2>
              {statsLoading ? (
                <div className="flex justify-center py-8">
                  <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-field-500"></div>
                </div>
              ) : requesterStats?.tasks_by_status ? (
                <div className="space-y-3">
                  {Object.entries(requesterStats.tasks_by_status)
                    .filter(([, count]) => count > 0)
                    .map(([status, count]) => (
                      <div key={status} className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <div
                            className="w-3 h-3 rounded-sm"
                            style={{ backgroundColor: mapStatusColors[status] }}
                          />
                          <span className="text-sm text-ink-700 capitalize">{status}</span>
                        </div>
                        <span className="text-sm font-semibold font-mono tabular-nums text-ink-900">{count}</span>
                      </div>
                    ))}
                </div>
              ) : (
                <p className="text-sm text-ink-500">No tasks yet</p>
              )}

              {/* Template Usage */}
              {requesterStats?.template_usage && requesterStats.template_usage.length > 0 && (
                <div className="mt-6 pt-6 border-t border-ink-100">
                  <h3 className="text-sm font-medium text-ink-900 mb-3">Template Usage</h3>
                  <div className="space-y-2">
                    {requesterStats.template_usage.slice(0, 4).map((template) => (
                      <div key={template.template} className="flex items-center justify-between text-sm">
                        <span className="text-ink-700">{template.template.replace(/_v\d+$/, '')}</span>
                        <span className="font-medium font-mono tabular-nums text-ink-900">{template.count}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Tasks Map */}
            <div className="bg-paper rounded-sm border border-ink-200 overflow-hidden">
              <div className="p-4 border-b border-ink-200">
                <h2 className="text-lg font-medium text-ink-900">Task Locations</h2>
                <p className="text-sm text-ink-500 mt-1">All your task locations by status</p>
              </div>
              {statsLoading ? (
                <div className="flex items-center justify-center h-[350px]">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-field-500"></div>
                </div>
              ) : mapPoints.length > 0 ? (
                <>
                  <Map
                    points={mapPoints}
                    height="350px"
                    onPointClick={(point: any) => setSelectedTaskId(point.id)}
                    selectedId={selectedTaskId}
                    fitBoundsOnLoad={true}
                    tileLayer="carto-light"
                  />
                  {selectedMapTask && (
                    <div className="p-4 border-t border-ink-200 bg-ink-50">
                      <div className="flex items-center justify-between">
                        <div>
                          <div className="font-medium text-ink-900">{selectedMapTask.title}</div>
                          <div className="text-sm text-ink-500">
                            {selectedMapTask.template} - {selectedMapTask.lat.toFixed(4)}, {selectedMapTask.lon.toFixed(4)}
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="text-lg font-semibold font-mono tabular-nums text-ink-900">
                            {selectedMapTask.bounty.currency} {selectedMapTask.bounty.amount.toFixed(2)}
                          </div>
                          <span className={`text-xs px-2 py-0.5 rounded-sm ${statusColors[selectedMapTask.status]}`}>
                            {selectedMapTask.status}
                          </span>
                        </div>
                      </div>
                      <Link
                        href={`/dashboard/requester/tasks/${selectedMapTask.id}`}
                        className="mt-3 block text-center text-sm text-field-500 hover:text-field-600"
                      >
                        View Task Details
                      </Link>
                    </div>
                  )}
                </>
              ) : (
                <div className="flex items-center justify-center h-[350px] text-ink-500">
                  <div className="text-center">
                    <svg className="w-12 h-12 mx-auto mb-3 text-ink-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
                    </svg>
                    <p>No tasks with locations to display</p>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Resale Inventory */}
          <div className="bg-paper rounded-sm border border-ink-200 p-6">
            <h2 className="text-lg font-medium text-ink-900 mb-4">Nearby Data Inventory</h2>
            <div className="space-y-4 text-sm text-ink-700">
              <div className="flex items-center justify-between">
                <span>Live bounties around you</span>
                <span className="font-semibold font-mono tabular-nums text-ink-900">{stats.active}</span>
              </div>
              <div className="flex items-center justify-between">
                <span>Fulfilled this month</span>
                <span className="font-semibold font-mono tabular-nums text-ink-900">{stats.completed}</span>
              </div>
              <div className="flex items-center justify-between">
                <span>Pending review</span>
                <span className="font-semibold font-mono tabular-nums text-ink-900">{stats.pending_review}</span>
              </div>
            </div>
            <div className="mt-6 space-y-3">
              {inventory.length === 0 ? (
                <div className="rounded-sm border border-dashed border-ink-200 p-4 text-sm text-ink-500">
                  Curated resale inventory will appear here once tasks pass the exclusivity window.
                </div>
              ) : (
                inventory.slice(0, 3).map((item) => (
                  <div key={item.task_id} className="rounded-sm border border-ink-200 bg-paper px-4 py-3">
                    <div className="flex items-center justify-between">
                      <div className="text-sm font-medium text-ink-900">{item.title}</div>
                      <span className={`text-xs px-2 py-1 rounded-sm border ${
                        item.status === 'resale_ready' ? 'text-signal-green border-signal-green/30' : 'text-ink-500 border-ink-200'
                      }`}>
                        {item.status === 'resale_ready' ? 'Resale Ready' : 'Exclusive'}
                      </span>
                    </div>
                    <div className="text-xs text-ink-500 mt-1">
                      Available {new Date(item.resale_available_at).toLocaleDateString()} - Royalty {(item.royalty_rate * 100).toFixed(0)}%
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </>
      )}

      {/* Tasks Tab */}
      {activeTab === 'tasks' && (
        <>
          {isLoading ? (
            <div className="flex justify-center py-12">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-field-500"></div>
            </div>
          ) : tasks.length === 0 ? (
            <div className="bg-paper rounded-sm p-12 text-center border border-ink-200">
              <p className="text-ink-500 mb-4">You haven't created any tasks yet.</p>
              <Link
                href="/dashboard/requester/new"
                className="text-field-500 hover:text-field-600"
              >
                Create your first task
              </Link>
            </div>
          ) : (
            <div className="bg-paper rounded-sm overflow-hidden border border-ink-200">
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-ink-200">
                  <thead className="bg-ink-50">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-ink-500 uppercase tracking-wider">
                        Task
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-ink-500 uppercase tracking-wider">
                        Status
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-ink-500 uppercase tracking-wider">
                        Bounty
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-ink-500 uppercase tracking-wider">
                        Deadline
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-ink-500 uppercase tracking-wider">
                        Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-paper divide-y divide-ink-100">
                    {tasks.map((task) => (
                      <tr key={task.id} className="hover:bg-ink-50">
                        <td className="px-6 py-4">
                          <div className="text-sm font-medium text-ink-900">{task.title}</div>
                          <div className="text-sm text-ink-500">{task.template}</div>
                        </td>
                        <td className="px-6 py-4">
                          <span className={`px-2 py-1 text-xs rounded-sm ${statusColors[task.status]}`}>
                            {task.status}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-sm font-mono tabular-nums text-ink-900">
                          {task.bounty.currency} {task.bounty.amount.toFixed(2)}
                        </td>
                        <td className="px-6 py-4 text-sm text-ink-500">
                          {new Date(task.time_window.end_iso).toLocaleDateString()}
                        </td>
                        <td className="px-6 py-4 text-sm">
                          <Link
                            href={`/dashboard/requester/tasks/${task.id}`}
                            className="text-field-500 hover:text-field-600"
                          >
                            View
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}

      {/* Analytics Tab */}
      {activeTab === 'analytics' && (
        <div className="space-y-6">
          {statsLoading ? (
            <div className="flex justify-center py-12">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-field-500"></div>
            </div>
          ) : requesterStats ? (
            <>
              {/* Spending Chart */}
              <EarningsChart
                data={requesterStats.spending_chart}
                title="Spending History"
                subtitle="Last 12 months of bounty payments"
                currency="USDC"
                height={350}
                variant="bar"
                color="#14b8a6"
              />

              <div className="grid gap-6 lg:grid-cols-2">
                {/* Task Analytics */}
                <div className="bg-paper rounded-sm border border-ink-200 p-6">
                  <h2 className="text-lg font-medium text-ink-900 mb-4">Task Analytics</h2>
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <div className="text-sm text-ink-500">Total Tasks Posted</div>
                      <div className="text-lg font-semibold font-mono tabular-nums text-ink-900">{requesterStats.summary.tasks_posted}</div>
                    </div>
                    <div className="flex items-center justify-between">
                      <div className="text-sm text-ink-500">Tasks Completed</div>
                      <div className="text-lg font-semibold font-mono tabular-nums text-signal-green">{requesterStats.summary.tasks_completed}</div>
                    </div>
                    <div className="flex items-center justify-between">
                      <div className="text-sm text-ink-500">Fulfillment Rate</div>
                      <div className="text-lg font-semibold font-mono tabular-nums text-ink-900">{requesterStats.summary.fulfillment_rate.toFixed(1)}%</div>
                    </div>
                    <div className="flex items-center justify-between">
                      <div className="text-sm text-ink-500">Avg Response Time</div>
                      <div className="text-lg font-semibold font-mono tabular-nums text-ink-900">
                        {requesterStats.summary.avg_response_hours
                          ? `${requesterStats.summary.avg_response_hours.toFixed(1)}h`
                          : 'N/A'}
                      </div>
                    </div>
                    <div className="flex items-center justify-between">
                      <div className="text-sm text-ink-500">Repeat Workers</div>
                      <div className="text-lg font-semibold font-mono tabular-nums text-ink-900">{requesterStats.summary.repeat_workers}</div>
                    </div>
                  </div>
                </div>

                {/* Spending Summary */}
                <div className="bg-paper rounded-sm border border-ink-200 p-6">
                  <h2 className="text-lg font-medium text-ink-900 mb-4">Spending Summary</h2>
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <div className="text-sm text-ink-500">Total Bounties Paid</div>
                      <div className="text-lg font-semibold font-mono tabular-nums text-signal-green">
                        USDC {requesterStats.summary.total_bounties_paid.toFixed(2)}
                      </div>
                    </div>
                    <div className="flex items-center justify-between">
                      <div className="text-sm text-ink-500">Active Bounties</div>
                      <div className="text-lg font-semibold font-mono tabular-nums text-ink-900">{payoutStats.activeBountiesApprox}</div>
                    </div>
                    <div className="flex items-center justify-between">
                      <div className="text-sm text-ink-500">Total Budget</div>
                      <div className="text-lg font-semibold font-mono tabular-nums text-ink-900">{payoutStats.totalBountiesApprox}</div>
                    </div>
                  </div>

                  {/* Monthly average */}
                  {requesterStats.spending_chart.length > 0 && (
                    <div className="mt-6 pt-6 border-t border-ink-100">
                      <div className="flex items-center justify-between">
                        <div className="text-sm text-ink-500">Monthly Average</div>
                        <div className="text-lg font-semibold font-mono tabular-nums text-ink-900">
                          USDC {(requesterStats.spending_chart.reduce((sum, m) => sum + m.amount, 0) / requesterStats.spending_chart.length).toFixed(2)}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </>
          ) : (
            <div className="bg-paper rounded-sm p-12 text-center border border-ink-200">
              <p className="text-ink-500">Unable to load analytics. Please try again later.</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
