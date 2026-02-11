'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useAuthStore } from '@/lib/store';
import { api } from '@/lib/api';

export default function DashboardPage() {
  const { user } = useAuthStore();
  const [stats, setStats] = useState({ myTasks: 0, activeClaims: 0, availableTasks: 0 });

  useEffect(() => {
    const fetchStats = async () => {
      try {
        const [myTasks, available] = await Promise.all([
          api.getTasks({ mine: 'true' } as any),
          api.getTasks({ status: 'posted' }),
        ]);
        setStats({
          myTasks: myTasks.tasks?.length || 0,
          activeClaims: 0,
          availableTasks: available.tasks?.length || 0,
        });
      } catch (e) {
        // Ignore errors for stats
      }
    };
    fetchStats();
  }, []);

  const displayName = user?.email
    ? user.email.split('@')[0]
    : user?.wallets?.[0]?.address
      ? `${user.wallets[0].address.slice(0, 6)}...${user.wallets[0].address.slice(-4)}`
      : 'there';

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-ink-900 tracking-tight">
          Welcome back, {displayName}
        </h1>
        <p className="text-ink-500 text-sm mt-1">
          Your hub for real-world data collection
        </p>
      </div>

      {/* Stats Row */}
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-paper border border-ink-200 rounded-sm p-4">
          <div className="font-mono text-2xl font-bold text-ink-900 tabular-nums">{stats.myTasks}</div>
          <div className="text-xs uppercase tracking-wider text-ink-500 mt-1">Tasks Posted</div>
        </div>
        <div className="bg-paper border border-ink-200 rounded-sm p-4">
          <div className="font-mono text-2xl font-bold text-ink-900 tabular-nums">{stats.activeClaims}</div>
          <div className="text-xs uppercase tracking-wider text-ink-500 mt-1">Active Claims</div>
        </div>
        <div className="bg-paper border border-ink-200 rounded-sm p-4">
          <div className="font-mono text-2xl font-bold text-ink-900 tabular-nums">{stats.availableTasks}</div>
          <div className="text-xs uppercase tracking-wider text-ink-500 mt-1">Available Tasks</div>
        </div>
      </div>

      {/* Action Cards */}
      <div className="grid md:grid-cols-2 gap-4">
        {/* Request Data */}
        <div className="bg-paper border border-ink-200 rounded-sm">
          <div className="p-5">
            <div className="flex items-start justify-between mb-4">
              <div>
                <h2 className="text-ink-900 font-semibold">Request Data</h2>
                <p className="text-ink-500 text-sm mt-1">
                  Post tasks and pay bounties for verified observations
                </p>
              </div>
              <div className="w-10 h-10 border border-ink-200 rounded-sm flex items-center justify-center flex-shrink-0">
                <svg className="w-5 h-5 text-ink-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 4v16m8-8H4" />
                </svg>
              </div>
            </div>
            <div className="space-y-2">
              <Link
                href="/dashboard/requester/new"
                className="block w-full text-center py-2.5 px-4 bg-field-500 text-white rounded-sm text-sm font-medium hover:bg-field-600 transition-colors"
              >
                Create New Task
              </Link>
              <Link
                href="/dashboard/requester"
                className="block w-full text-center py-2.5 px-4 border border-ink-200 text-ink-700 rounded-sm text-sm font-medium hover:bg-ink-50 transition-colors"
              >
                View My Tasks
              </Link>
            </div>
          </div>
        </div>

        {/* Collect Data */}
        <div className="bg-paper border border-ink-200 rounded-sm">
          <div className="p-5">
            <div className="flex items-start justify-between mb-4">
              <div>
                <h2 className="text-ink-900 font-semibold">Collect Data</h2>
                <p className="text-ink-500 text-sm mt-1">
                  Complete tasks and earn USDC for verified submissions
                </p>
              </div>
              <div className="w-10 h-10 border border-ink-200 rounded-sm flex items-center justify-center flex-shrink-0">
                <svg className="w-5 h-5 text-ink-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
              </div>
            </div>
            <div className="space-y-2">
              <Link
                href="/dashboard/worker"
                className="block w-full text-center py-2.5 px-4 bg-field-500 text-white rounded-sm text-sm font-medium hover:bg-field-600 transition-colors"
              >
                Browse Available Tasks
              </Link>
              <Link
                href="/dashboard/worker/claims"
                className="block w-full text-center py-2.5 px-4 border border-ink-200 text-ink-700 rounded-sm text-sm font-medium hover:bg-ink-50 transition-colors"
              >
                My Active Claims
              </Link>
            </div>
          </div>
        </div>
      </div>

      {/* How it works */}
      <div className="bg-paper border border-ink-200 rounded-sm p-5">
        <h3 className="text-xs font-medium uppercase tracking-wider text-ink-500 mb-4">How it works</h3>
        <div className="grid md:grid-cols-3 gap-4 text-sm">
          <div className="flex items-start space-x-3">
            <div className="w-6 h-6 bg-field-50 border border-field-500/20 rounded-sm flex items-center justify-center flex-shrink-0">
              <span className="font-mono text-xs font-bold text-field-600">1</span>
            </div>
            <p className="text-ink-700"><span className="font-medium text-ink-900">Post or Browse</span> — Create tasks with bounties or find tasks near you</p>
          </div>
          <div className="flex items-start space-x-3">
            <div className="w-6 h-6 bg-field-50 border border-field-500/20 rounded-sm flex items-center justify-center flex-shrink-0">
              <span className="font-mono text-xs font-bold text-field-600">2</span>
            </div>
            <p className="text-ink-700"><span className="font-medium text-ink-900">Capture & Submit</span> — Take geo-verified photos with your phone</p>
          </div>
          <div className="flex items-start space-x-3">
            <div className="w-6 h-6 bg-field-50 border border-field-500/20 rounded-sm flex items-center justify-center flex-shrink-0">
              <span className="font-mono text-xs font-bold text-field-600">3</span>
            </div>
            <p className="text-ink-700"><span className="font-medium text-ink-900">Verify & Pay</span> — Automated checks + escrow release on approval</p>
          </div>
        </div>
      </div>

      {/* Network status bar */}
      <div className="border-t border-ink-100 pt-4 flex items-center justify-between text-xs text-ink-300">
        <div className="flex items-center space-x-4">
          <span className="uppercase tracking-wider">Network Status</span>
          <span className="flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-signal-green"></span>
            Operational
          </span>
        </div>
        <div className="font-mono tabular-nums">
          Base L2 &middot; USDC
        </div>
      </div>
    </div>
  );
}
