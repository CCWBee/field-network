'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import { api } from '@/lib/api';
import { useAuthStore } from '@/lib/store';
import {
  Spinner,
  Alert,
  Button,
  Card,
  CardBody,
  EmptySearchResults,
  EmptyMapView,
  StaggeredList,
  StaggeredItem,
  HoverScale,
} from '@/components/ui';
import PublicProfileCard from '@/components/PublicProfileCard';

// Dynamic imports for components with client-side dependencies
const TaskBrowseMap = dynamic(() => import('@/components/TaskBrowseMap'), { ssr: false });
const EarningsChart = dynamic(() => import('@/components/EarningsChart'), { ssr: false });
const CompletedTasksMap = dynamic(() => import('@/components/CompletedTasksMap'), { ssr: false });
import AchievementProgress, { StatCard } from '@/components/AchievementProgress';

type WorkerStats = {
  summary: {
    tasks_claimed: number;
    tasks_delivered: number;
    tasks_accepted: number;
    tasks_rejected: number;
    total_earned: number;
    reliability_score: number;
    dispute_rate: number;
    current_streak: number;
    longest_streak: number;
    avg_completion_hours: number | null;
  };
  active: {
    claims: number;
    pending_submissions: number;
  };
  earnings_chart: Array<{
    month: string;
    label: string;
    amount: number;
  }>;
  completed_tasks: Array<{
    id: string;
    title: string;
    lat: number;
    lon: number;
    bounty: { amount: number; currency: string };
    template: string;
    completed_at: string | null;
  }>;
  recent_activity: Array<{
    submission_id: string;
    task_id: string;
    task_title: string;
    bounty: { amount: number; currency: string };
    status: string;
    updated_at: string;
  }>;
};

export default function WorkerDashboard() {
  const { token, user } = useAuthStore();
  const [tasks, setTasks] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [claimingId, setClaimingId] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [workerStats, setWorkerStats] = useState<WorkerStats | null>(null);
  const [statsLoading, setStatsLoading] = useState(true);
  const [royalties, setRoyalties] = useState({ total: 0, pending: 0, lastPayoutAt: null as string | null });
  const [mapCenter, setMapCenter] = useState<[number, number] | null>(null);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [maxDistanceKm, setMaxDistanceKm] = useState(50);
  const [minBounty, setMinBounty] = useState(0);
  const [useDistanceFilter, setUseDistanceFilter] = useState(false);
  const [bountyCurrency, setBountyCurrency] = useState('all');
  const [taskTemplate, setTaskTemplate] = useState('all');
  const [showClaimed, setShowClaimed] = useState(true);
  const [activeTab, setActiveTab] = useState<'missions' | 'stats' | 'history'>('missions');
  const [viewMode, setViewMode] = useState<'grid' | 'map'>('grid');

  useEffect(() => {
    fetchTasks();
    fetchRoyalties();
    fetchWorkerStats();
  }, [token]);

  useEffect(() => {
    if (user?.savedAddresses && user.savedAddresses.length > 0) {
      const [saved] = user.savedAddresses;
      if (saved?.lat != null && saved?.lon != null) {
        setMapCenter([saved.lat, saved.lon]);
        return;
      }
    }

    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          setMapCenter([position.coords.latitude, position.coords.longitude]);
        },
        () => {
          setMapCenter(null);
        }
      );
    }
  }, [user]);

  const calculateDistanceKm = (lat1: number, lon1: number, lat2: number, lon2: number) => {
    const R = 6371;
    const dLat = ((lat2 - lat1) * Math.PI) / 180;
    const dLon = ((lon2 - lon1) * Math.PI) / 180;
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  };

  const fetchTasks = async () => {
    try {
      api.setToken(token);
      const result = await api.getTasks({ status: 'posted' });
      setTasks(result.tasks);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load tasks');
    } finally {
      setIsLoading(false);
    }
  };

  const fetchWorkerStats = async () => {
    try {
      api.setToken(token);
      const stats = await api.getWorkerStats();
      setWorkerStats(stats);
    } catch (err) {
      console.error('Failed to load worker stats:', err);
    } finally {
      setStatsLoading(false);
    }
  };

  const handleClaim = async (taskId: string) => {
    setClaimingId(taskId);
    setError('');
    try {
      api.setToken(token);
      await api.claimTask(taskId);
      await fetchTasks();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to claim task');
    } finally {
      setClaimingId(null);
    }
  };

  const fetchRoyalties = async () => {
    try {
      api.setToken(token);
      const data = await api.getRoyaltySummary();
      setRoyalties({
        total: data.total_earned,
        pending: data.pending,
        lastPayoutAt: data.last_payout_at,
      });
    } catch {
      setRoyalties({ total: 0, pending: 0, lastPayoutAt: null });
    }
  };

  const stats = useMemo(() => {
    const formatApprox = (value: number) => {
      if (value < 1000) return `~USDC ${Math.round(value)}`;
      if (value < 10000) return `~USDC ${(value / 1000).toFixed(1)}k`;
      return `~USDC ${(value / 1000).toFixed(0)}k`;
    };
    return {
      reliability: workerStats?.summary.reliability_score ?? user?.stats?.reliabilityScore ?? 0,
      disputeRate: workerStats?.summary.dispute_rate ?? user?.stats?.disputeRate ?? 0,
      totalEarned: workerStats?.summary.total_earned ?? user?.stats?.totalEarned ?? 0,
      totalEarnedApprox: formatApprox(workerStats?.summary.total_earned ?? user?.stats?.totalEarned ?? 0),
      currentStreak: workerStats?.summary.current_streak ?? user?.stats?.currentStreak ?? 0,
      longestStreak: workerStats?.summary.longest_streak ?? user?.stats?.longestStreak ?? 0,
      tasksAccepted: workerStats?.summary.tasks_accepted ?? user?.stats?.tasksAccepted ?? 0,
      tasksClaimed: workerStats?.summary.tasks_claimed ?? 0,
      tasksDelivered: workerStats?.summary.tasks_delivered ?? 0,
      avgCompletionHours: workerStats?.summary.avg_completion_hours ?? null,
      activeClaims: workerStats?.active.claims ?? 0,
      pendingSubmissions: workerStats?.active.pending_submissions ?? 0,
    };
  }, [workerStats, user]);

  const badgeHighlights = useMemo(() => {
    const badges = user?.badges ?? [];
    return badges.slice(0, 6);
  }, [user]);

  const achievements = useMemo(() => {
    const accepted = workerStats?.summary.tasks_accepted ?? user?.stats?.tasksAccepted ?? 0;
    const streak = workerStats?.summary.current_streak ?? user?.stats?.currentStreak ?? 0;
    const disputeRate = workerStats?.summary.dispute_rate ?? user?.stats?.disputeRate ?? 0;
    const reliability = workerStats?.summary.reliability_score ?? user?.stats?.reliabilityScore ?? 100;

    return [
      {
        id: 'wayfinder',
        name: 'Wayfinder',
        description: 'Complete 25 tasks to earn this badge',
        target: 25,
        current: accepted,
        unit: 'tasks',
        tier: accepted >= 25 ? 'bronze' as const : 'bronze' as const,
        unlocked: accepted >= 25,
        icon: 'M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7',
      },
      {
        id: 'geoguessr',
        name: 'GeoGuessr',
        description: 'Complete 100 tasks to earn this badge',
        target: 100,
        current: accepted,
        unit: 'tasks',
        tier: accepted >= 100 ? 'silver' as const : 'bronze' as const,
        unlocked: accepted >= 100,
        icon: 'M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z M15 11a3 3 0 11-6 0 3 3 0 016 0z',
      },
      {
        id: 'iron-streak',
        name: 'Iron Streak',
        description: 'Maintain a 10-day completion streak',
        target: 10,
        current: streak,
        unit: 'days',
        tier: streak >= 10 ? 'gold' as const : 'bronze' as const,
        unlocked: streak >= 10,
        icon: 'M13 10V3L4 14h7v7l9-11h-7z',
      },
      {
        id: 'clean-signal',
        name: 'Clean Signal',
        description: 'Maintain 95%+ reliability score',
        target: 95,
        current: reliability,
        unit: '%',
        tier: reliability >= 95 ? 'gold' as const : 'silver' as const,
        unlocked: reliability >= 95,
        icon: 'M9 12l2 2 4-4M7.835 4.697a3.42 3.42 0 001.946-.806 3.42 3.42 0 014.438 0 3.42 3.42 0 001.946.806 3.42 3.42 0 013.138 3.138 3.42 3.42 0 00.806 1.946 3.42 3.42 0 010 4.438 3.42 3.42 0 00-.806 1.946 3.42 3.42 0 01-3.138 3.138 3.42 3.42 0 00-1.946.806 3.42 3.42 0 01-4.438 0 3.42 3.42 0 00-1.946-.806 3.42 3.42 0 01-3.138-3.138 3.42 3.42 0 00-.806-1.946 3.42 3.42 0 010-4.438 3.42 3.42 0 00.806-1.946 3.42 3.42 0 013.138-3.138z',
      },
    ];
  }, [workerStats, user]);

  const filteredTasks = useMemo(() => {
    return tasks.filter((task) => {
      if (minBounty > 0 && task.bounty.amount < minBounty) {
        return false;
      }
      if (bountyCurrency !== 'all' && task.bounty.currency !== bountyCurrency) {
        return false;
      }
      if (taskTemplate !== 'all' && task.template !== taskTemplate) {
        return false;
      }
      if (!showClaimed && task.is_claimed) {
        return false;
      }
      if (useDistanceFilter && mapCenter) {
        const distance = calculateDistanceKm(mapCenter[0], mapCenter[1], task.location.lat, task.location.lon);
        return distance <= maxDistanceKm;
      }
      return true;
    });
  }, [tasks, minBounty, bountyCurrency, taskTemplate, showClaimed, mapCenter, maxDistanceKm, useDistanceFilter]);

  const selectedTask = useMemo(() => {
    return tasks.find((task) => task.id === selectedTaskId) ?? null;
  }, [tasks, selectedTaskId]);

  const bountyCurrencies = useMemo(() => {
    return Array.from(
      new Set(
        tasks
          .map((task) => task?.bounty?.currency)
          .filter((currency): currency is string => Boolean(currency))
      )
    ).sort();
  }, [tasks]);

  const taskTemplates = useMemo(() => {
    return Array.from(
      new Set(
        tasks
          .map((task) => task?.template)
          .filter((template): template is string => Boolean(template))
      )
    ).sort();
  }, [tasks]);

  const selectedTaskDistanceKm = useMemo(() => {
    if (!selectedTask || !mapCenter) return null;
    return calculateDistanceKm(
      mapCenter[0],
      mapCenter[1],
      selectedTask.location.lat,
      selectedTask.location.lon
    );
  }, [selectedTask, mapCenter]);

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-6 mb-8">
        <div>
          <p className="text-xs uppercase tracking-wider text-ink-500">Field Operator</p>
          <h1 className="text-2xl font-bold text-ink-900 tracking-tight">Collector Mission Board</h1>
          <p className="text-ink-500 mt-2">Track bounties, performance, and live opportunities.</p>
        </div>
        <div className="flex gap-4">
          <Link
            href="/dashboard/worker/claims"
            className="text-field-500 hover:text-field-600 text-sm"
          >
            My Claims &rarr;
          </Link>
          <Link
            href="/dashboard/worker/history"
            className="text-field-500 hover:text-field-600 text-sm"
          >
            History &rarr;
          </Link>
        </div>
      </div>

      {/* Stats Overview Cards */}
      <div className="grid gap-4 grid-cols-2 md:grid-cols-4 lg:grid-cols-6 mb-8">
        <StatCard
          label="Total Earned"
          value={stats.totalEarnedApprox}
          subValue={`${stats.tasksAccepted} tasks`}
          icon={
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          }
        />
        <StatCard
          label="Reliability"
          value={`${stats.reliability.toFixed(0)}%`}
          subValue={`${stats.disputeRate.toFixed(1)}% dispute rate`}
          icon={
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          }
        />
        <StatCard
          label="Current Streak"
          value={stats.currentStreak}
          subValue={`Best: ${stats.longestStreak}`}
          icon={
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
          }
        />
        <StatCard
          label="Active Claims"
          value={stats.activeClaims}
          subValue={`${stats.pendingSubmissions} pending`}
          icon={
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
            </svg>
          }
        />
        <StatCard
          label="Available Tasks"
          value={filteredTasks.length}
          subValue={`${tasks.length} total`}
          icon={
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
            </svg>
          }
        />
        <StatCard
          label="Avg Completion"
          value={stats.avgCompletionHours ? `${stats.avgCompletionHours}h` : 'N/A'}
          subValue="per task"
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
          onClick={() => setActiveTab('missions')}
          className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
            activeTab === 'missions'
              ? 'border-field-500 text-field-600'
              : 'border-transparent text-ink-500 hover:text-ink-700'
          }`}
        >
          Available Missions
        </button>
        <button
          onClick={() => setActiveTab('stats')}
          className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
            activeTab === 'stats'
              ? 'border-field-500 text-field-600'
              : 'border-transparent text-ink-500 hover:text-ink-700'
          }`}
        >
          Earnings & Stats
        </button>
        <button
          onClick={() => setActiveTab('history')}
          className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
            activeTab === 'history'
              ? 'border-field-500 text-field-600'
              : 'border-transparent text-ink-500 hover:text-ink-700'
          }`}
        >
          Task History
        </button>
      </div>

      {error && (
        <div className="mb-6 p-4 border border-signal-red/30 rounded-sm">
          <p className="text-sm text-signal-red">{error}</p>
        </div>
      )}

      {/* Missions Tab */}
      {activeTab === 'missions' && (
        <>
          {/* View Mode Toggle */}
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-lg font-medium text-ink-900">
              {filteredTasks.length} Available {filteredTasks.length === 1 ? 'Task' : 'Tasks'}
            </h2>
            <div className="flex items-center gap-2 bg-ink-50 p-1 rounded-sm">
              <button
                onClick={() => setViewMode('grid')}
                className={`flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-sm transition-colors ${
                  viewMode === 'grid'
                    ? 'bg-paper text-ink-900 shadow-sm'
                    : 'text-ink-500 hover:text-ink-700'
                }`}
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
                </svg>
                Grid
              </button>
              <button
                onClick={() => setViewMode('map')}
                className={`flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-sm transition-colors ${
                  viewMode === 'map'
                    ? 'bg-paper text-ink-900 shadow-sm'
                    : 'text-ink-500 hover:text-ink-700'
                }`}
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
                </svg>
                Map
              </button>
            </div>
          </div>

          {/* Full Map View Mode */}
          {viewMode === 'map' ? (
            <div className="space-y-6">
              {/* Filters row for map view */}
              <div className="bg-paper rounded-sm border border-ink-200 p-4">
                <div className="flex flex-wrap items-center gap-4">
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      id="distanceFilterMap"
                      checked={useDistanceFilter}
                      onChange={(e) => setUseDistanceFilter(e.target.checked)}
                      className="rounded-sm border-ink-200 text-field-600"
                    />
                    <label htmlFor="distanceFilterMap" className="text-sm text-ink-700">
                      Within
                    </label>
                    <select
                      value={maxDistanceKm}
                      onChange={(e) => setMaxDistanceKm(Number(e.target.value))}
                      className="text-sm border border-ink-200 rounded-sm px-2 py-1 bg-paper"
                      disabled={!useDistanceFilter}
                    >
                      {[10, 25, 50, 100, 250, 500].map((km) => (
                        <option key={km} value={km}>{km} km</option>
                      ))}
                    </select>
                  </div>
                  <div className="flex items-center gap-2">
                    <label className="text-sm text-ink-700">Min bounty</label>
                    <input
                      type="number"
                      min="0"
                      value={minBounty}
                      onChange={(e) => setMinBounty(Number(e.target.value))}
                      className="w-20 text-sm border border-ink-200 rounded-sm px-2 py-1 bg-paper"
                    />
                  </div>
                  <select
                    value={taskTemplate}
                    onChange={(e) => setTaskTemplate(e.target.value)}
                    className="text-sm border border-ink-200 rounded-sm px-2 py-1 bg-paper"
                  >
                    <option value="all">All types</option>
                    {taskTemplates.map((template) => (
                      <option key={template} value={template}>{template}</option>
                    ))}
                  </select>
                  <label className="flex items-center gap-2 text-sm text-ink-700">
                    <input
                      type="checkbox"
                      checked={showClaimed}
                      onChange={(e) => setShowClaimed(e.target.checked)}
                      className="rounded-sm border-ink-200 text-field-600"
                    />
                    Show claimed
                  </label>
                  <div className="ml-auto text-sm text-ink-500">
                    {filteredTasks.length} tasks shown
                  </div>
                </div>
              </div>

              {/* Large map */}
              <div className="bg-paper rounded-sm border border-ink-200 overflow-hidden">
                <TaskBrowseMap
                  tasks={filteredTasks}
                  height="calc(100vh - 400px)"
                  userLocation={mapCenter}
                  radiusFilter={useDistanceFilter ? maxDistanceKm : null}
                  onTaskSelect={(task: any) => setSelectedTaskId(task.id)}
                  onTaskClaim={handleClaim}
                  selectedTaskId={selectedTaskId}
                  claimingTaskId={claimingId}
                  showUserLocation={true}
                  showRadiusCircle={useDistanceFilter}
                  enableClustering={filteredTasks.length > 15}
                />
              </div>
            </div>
          ) : (
            /* Grid View Mode */
            <>
          <div className="grid gap-6 lg:grid-cols-[280px_1fr] mb-10">
            <div className="bg-paper rounded-sm border border-ink-200 p-5">
              <div className="text-xs uppercase tracking-wider text-ink-500">Filters</div>
              <h2 className="text-lg font-semibold text-ink-900 mt-2">Mission Search</h2>
              <div className="mt-6 space-y-6 text-sm text-ink-700">
                <div>
                  <label className="block text-xs uppercase tracking-wider text-ink-500 mb-2">Distance</label>
                  <label className="flex items-center gap-2 mb-3">
                    <input
                      type="checkbox"
                      checked={useDistanceFilter}
                      onChange={(event) => setUseDistanceFilter(event.target.checked)}
                    />
                    Enable distance filter
                  </label>
                  <select
                    value={maxDistanceKm}
                    onChange={(event) => setMaxDistanceKm(Number(event.target.value))}
                    className="border border-ink-200 rounded-sm px-3 py-2 bg-paper w-full"
                    disabled={!useDistanceFilter}
                  >
                    {[10, 25, 50, 100, 250, 500].map((km) => (
                      <option key={km} value={km}>
                        {km} km
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs uppercase tracking-wider text-ink-500 mb-2">Minimum Bounty</label>
                  <input
                    type="number"
                    min="0"
                    value={minBounty}
                    onChange={(event) => setMinBounty(Number(event.target.value))}
                    className="border border-ink-200 rounded-sm px-3 py-2 bg-paper w-full"
                    placeholder="0"
                  />
                </div>
                <div>
                  <label className="block text-xs uppercase tracking-wider text-ink-500 mb-2">Bounty Currency</label>
                  <select
                    value={bountyCurrency}
                    onChange={(event) => setBountyCurrency(event.target.value)}
                    className="border border-ink-200 rounded-sm px-3 py-2 bg-paper w-full"
                  >
                    <option value="all">All currencies</option>
                    {bountyCurrencies.map((currency) => (
                      <option key={currency} value={currency}>
                        {currency}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs uppercase tracking-wider text-ink-500 mb-2">Task Type</label>
                  <select
                    value={taskTemplate}
                    onChange={(event) => setTaskTemplate(event.target.value)}
                    className="border border-ink-200 rounded-sm px-3 py-2 bg-paper w-full"
                  >
                    <option value="all">All templates</option>
                    {taskTemplates.map((template) => (
                      <option key={template} value={template}>
                        {template}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="rounded-sm border border-ink-200 bg-paper px-3 py-3">
                  <label className="flex items-center justify-between text-xs uppercase tracking-wider text-ink-500">
                    Include claimed
                    <input
                      type="checkbox"
                      checked={showClaimed}
                      onChange={(event) => setShowClaimed(event.target.checked)}
                    />
                  </label>
                  <div className="text-xs text-ink-500 mt-2">Toggle visibility for claimed tasks.</div>
                </div>
                <div className="rounded-sm border border-ink-200 bg-paper px-3 py-3">
                  <div className="text-xs uppercase tracking-wider text-ink-500">Results</div>
                  <div className="text-lg font-semibold font-mono tabular-nums text-ink-900 mt-1">{filteredTasks.length}</div>
                  <div className="text-xs text-ink-500">Tasks matched</div>
                </div>
              </div>
            </div>

            <div className="bg-paper rounded-sm border border-ink-200 p-6">
              <div className="flex flex-wrap items-center justify-between gap-4 mb-4">
                <div>
                  <h2 className="text-lg font-semibold text-ink-900">Live Bounty Map</h2>
                  <p className="text-sm text-ink-500">Click a marker for a quick view without leaving the map.</p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs uppercase tracking-wider text-ink-500">Operator View</span>
                  {mapCenter && (
                    <span className="text-xs text-field-500 px-2 py-1 border border-ink-200 rounded-sm">
                      Location active
                    </span>
                  )}
                </div>
              </div>
              <div className="relative">
                <TaskBrowseMap
                  tasks={filteredTasks}
                  height="420px"
                  userLocation={mapCenter}
                  radiusFilter={useDistanceFilter ? maxDistanceKm : null}
                  onTaskSelect={(task: any) => setSelectedTaskId(task.id)}
                  onTaskClaim={handleClaim}
                  selectedTaskId={selectedTaskId}
                  claimingTaskId={claimingId}
                  showUserLocation={true}
                  showRadiusCircle={useDistanceFilter}
                  enableClustering={filteredTasks.length > 15}
                />
              </div>
            </div>
          </div>

          {isLoading ? (
            <div className="flex justify-center py-12">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-field-500"></div>
            </div>
          ) : tasks.length === 0 ? (
            <div className="bg-paper rounded-sm p-12 text-center border border-ink-200">
              <p className="text-ink-500">No tasks available right now. Check back later!</p>
            </div>
          ) : (
            <div>
              <h2 className="text-lg font-medium text-ink-900 mb-4">Available Tasks</h2>
              <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
                {filteredTasks.map((task) => (
                  <div key={task.id} className="bg-paper rounded-sm overflow-hidden border border-ink-200">
                    <div className="p-6">
                      <div className="flex justify-between items-start mb-4">
                        <h3 className="text-lg font-medium text-ink-900">{task.title}</h3>
                        <span className="text-lg font-bold font-mono tabular-nums text-signal-green">
                          {task.bounty.currency} {task.bounty.amount.toFixed(2)}
                        </span>
                      </div>

                      {/* Requester Profile */}
                      {task.requester && (
                        <div className="mb-4 -mx-2">
                          <PublicProfileCard
                            user={{
                              id: task.requester.id,
                              username: task.requester.username,
                              avatar_url: task.requester.avatar_url,
                              ens_name: task.requester.ens_name,
                              stats: task.requester.stats ? {
                                reliability_score: task.requester.stats.reliability_score,
                                tasks_completed: task.requester.stats.tasks_posted,
                              } : undefined,
                            }}
                            size="sm"
                            showRating={false}
                            showBadges={false}
                            showStats={true}
                          />
                        </div>
                      )}

                      <div className="space-y-2 text-sm text-ink-500 mb-4">
                        <div className="flex items-center">
                          <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                          </svg>
                          {task.location.lat.toFixed(4)}, {task.location.lon.toFixed(4)}
                          <span className="ml-1">({task.location.radius_m}m radius)</span>
                        </div>
                        <div className="flex items-center">
                          <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                          </svg>
                          Due: {new Date(task.time_window.end_iso).toLocaleDateString()}
                        </div>
                        <div className="flex items-center">
                          <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                          </svg>
                          {task.template}
                        </div>
                      </div>

                      {task.is_claimed ? (
                        <span className="block text-center py-2 text-signal-amber border border-signal-amber/30 rounded-sm text-sm">
                          Already claimed
                        </span>
                      ) : (
                        <button
                          onClick={() => handleClaim(task.id)}
                          disabled={claimingId === task.id}
                          className="w-full py-2 bg-field-500 text-white rounded-sm hover:bg-field-600 disabled:opacity-50"
                        >
                          {claimingId === task.id ? 'Claiming...' : 'Claim Task'}
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
            </>
          )}
        </>
      )}

      {/* Stats Tab */}
      {activeTab === 'stats' && (
        <div className="space-y-6">
          {/* Earnings Chart */}
          {statsLoading ? (
            <div className="flex justify-center py-12">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-field-500"></div>
            </div>
          ) : workerStats ? (
            <>
              <EarningsChart
                data={workerStats.earnings_chart}
                title="Earnings History"
                subtitle="Last 12 months of bounty earnings"
                currency="USDC"
                height={350}
              />

              <div className="grid gap-6 lg:grid-cols-2">
                {/* Achievement Progress */}
                <AchievementProgress
                  achievements={achievements}
                  title="Next Milestones"
                  showCompleted={true}
                />

                {/* Profile Card */}
                <div className="bg-paper rounded-sm border border-ink-200 p-6">
                  <h2 className="text-lg font-medium text-ink-900 mb-4">Collector Profile</h2>
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <div className="text-sm text-ink-500">Reliability Score</div>
                      <div className="text-lg font-semibold font-mono tabular-nums text-ink-900">{stats.reliability.toFixed(0)}%</div>
                    </div>
                    <div className="flex items-center justify-between">
                      <div className="text-sm text-ink-500">Dispute Rate</div>
                      <div className="text-lg font-semibold font-mono tabular-nums text-ink-900">{stats.disputeRate.toFixed(1)}%</div>
                    </div>
                    <div className="flex items-center justify-between">
                      <div className="text-sm text-ink-500">Tasks Delivered</div>
                      <div className="text-lg font-semibold font-mono tabular-nums text-ink-900">{stats.tasksDelivered}</div>
                    </div>
                    <div className="flex items-center justify-between">
                      <div className="text-sm text-ink-500">Tasks Accepted</div>
                      <div className="text-lg font-semibold font-mono tabular-nums text-ink-900">{stats.tasksAccepted}</div>
                    </div>
                    <div className="flex items-center justify-between">
                      <div className="text-sm text-ink-500">Lifetime Earned</div>
                      <div className="text-lg font-semibold font-mono tabular-nums text-signal-green">{stats.totalEarnedApprox}</div>
                    </div>
                  </div>
                  <div className="mt-6 rounded-sm border border-ink-200 bg-paper px-4 py-3 text-sm text-ink-500">
                    Keep your streak clean to unlock lower platform fees and priority access.
                  </div>
                  <div className="mt-4 rounded-sm border border-ink-200 bg-paper px-4 py-3 text-sm text-ink-500">
                    Royalty stream: USDC {royalties.total.toFixed(2)} earned and {royalties.pending.toFixed(2)} pending
                    {royalties.lastPayoutAt && (
                      <span className="block text-xs text-ink-300 mt-1">
                        Last payout {new Date(royalties.lastPayoutAt).toLocaleDateString()}
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* Badge Highlights */}
              {badgeHighlights.length > 0 && (
                <div className="bg-paper rounded-sm border border-ink-200 p-6">
                  <h2 className="text-lg font-medium text-ink-900 mb-4">Achievement Highlights</h2>
                  <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
                    {badgeHighlights.map((badge) => (
                      <div key={`${badge.badgeType}-${badge.earnedAt}`} className="rounded-sm border border-ink-200 bg-paper px-4 py-3">
                        <div className="text-sm font-semibold text-ink-900">{badge.title}</div>
                        <div className="text-xs text-ink-500">{badge.description}</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          ) : (
            <div className="bg-paper rounded-sm p-12 text-center border border-ink-200">
              <p className="text-ink-500">Unable to load statistics. Please try again later.</p>
            </div>
          )}
        </div>
      )}

      {/* History Tab */}
      {activeTab === 'history' && (
        <div className="space-y-6">
          {statsLoading ? (
            <div className="flex justify-center py-12">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-field-500"></div>
            </div>
          ) : workerStats && workerStats.completed_tasks.length > 0 ? (
            <>
              <CompletedTasksMap
                tasks={workerStats.completed_tasks}
                title="Completed Tasks Map"
                subtitle="Your task completion footprint"
                height="450px"
                showFilters={true}
              />

              {/* Recent Activity */}
              <div className="bg-paper rounded-sm border border-ink-200 overflow-hidden">
                <div className="p-4 border-b border-ink-200">
                  <h3 className="text-lg font-medium text-ink-900">Recent Activity</h3>
                </div>
                <div className="divide-y divide-ink-100">
                  {workerStats.recent_activity.map((activity) => (
                    <div key={activity.submission_id} className="p-4 hover:bg-ink-50 transition-colors">
                      <div className="flex items-center justify-between">
                        <div>
                          <div className="font-medium text-ink-900">{activity.task_title}</div>
                          <div className="text-sm text-ink-500">
                            {new Date(activity.updated_at).toLocaleDateString()} - {activity.status}
                          </div>
                        </div>
                        <div className="text-right">
                          <div className={`font-semibold font-mono tabular-nums ${activity.status === 'accepted' ? 'text-signal-green' : 'text-ink-700'}`}>
                            {activity.bounty.currency} {activity.bounty.amount.toFixed(2)}
                          </div>
                          <span className={`text-xs px-2 py-0.5 rounded-sm border ${
                            activity.status === 'accepted' ? 'text-signal-green border-signal-green/30' :
                            activity.status === 'finalised' ? 'text-purple-700 border-purple-300' :
                            activity.status === 'rejected' ? 'text-signal-red border-signal-red/30' :
                            'text-ink-500 border-ink-200'
                          }`}>
                            {activity.status}
                          </span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </>
          ) : (
            <div className="bg-paper rounded-sm p-12 text-center border border-ink-200">
              <svg className="w-12 h-12 mx-auto mb-4 text-ink-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
              </svg>
              <p className="text-ink-500">No completed tasks yet.</p>
              <p className="text-sm text-ink-300 mt-1">Complete tasks to build your history and see them on the map.</p>
            </div>
          )}
        </div>
      )}

      {/* Task Quick View Modal */}
      {selectedTask && (
        <div
          className="fixed inset-0 z-40 flex items-center justify-center bg-ink-900/40 px-4"
          onClick={() => setSelectedTaskId(null)}
        >
          <div
            className="w-full max-w-xl rounded-sm border border-ink-200 bg-paper p-6 shadow-sm"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="text-xs uppercase tracking-wider text-ink-500">Quick View</div>
                <h3 className="text-xl font-bold text-ink-900 mt-2 tracking-tight">{selectedTask.title}</h3>
                <p className="text-sm text-ink-500 mt-1">
                  {selectedTask.template} - {selectedTask.bounty.currency} {selectedTask.bounty.amount.toFixed(2)}
                </p>
              </div>
              <button
                onClick={() => setSelectedTaskId(null)}
                className="text-sm text-ink-300 hover:text-ink-700"
              >
                Close
              </button>
            </div>
            <div className="mt-5 grid gap-3 text-sm text-ink-700">
              <div className="flex items-center justify-between">
                <span className="text-ink-500">Reward</span>
                <span className="font-semibold font-mono tabular-nums text-ink-900">
                  {selectedTask.bounty.currency} {selectedTask.bounty.amount.toFixed(2)}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-ink-500">Location</span>
                <span>
                  {selectedTask.location.lat.toFixed(4)}, {selectedTask.location.lon.toFixed(4)}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-ink-500">Radius</span>
                <span>{selectedTask.location.radius_m}m</span>
              </div>
              {selectedTaskDistanceKm !== null && (
                <div className="flex items-center justify-between">
                  <span className="text-ink-500">Distance</span>
                  <span>{selectedTaskDistanceKm.toFixed(1)} km</span>
                </div>
              )}
              <div className="flex items-center justify-between">
                <span className="text-ink-500">Due</span>
                <span>{new Date(selectedTask.time_window.end_iso).toLocaleDateString()}</span>
              </div>
            </div>
            <div className="mt-6 flex gap-2">
              {selectedTask.is_claimed ? (
                <span className="flex-1 rounded-sm border border-signal-amber/30 px-3 py-2 text-center text-sm text-signal-amber">
                  Already claimed
                </span>
              ) : (
                <button
                  onClick={() => handleClaim(selectedTask.id)}
                  className="flex-1 px-3 py-2 text-sm bg-field-500 text-white rounded-sm hover:bg-field-600"
                >
                  Claim Task
                </button>
              )}
              <a
                href={`/dashboard/worker/submit/${selectedTask.id}`}
                target="_blank"
                rel="noreferrer"
                className="flex-1 px-3 py-2 text-sm border border-ink-200 rounded-sm text-ink-700 hover:text-ink-900 text-center"
              >
                Open Task
              </a>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
