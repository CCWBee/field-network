'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useAuthStore, useTaskStore } from '@/lib/store';
import { api } from '@/lib/api';

export default function DashboardPage() {
  const { user } = useAuthStore();
  const [stats, setStats] = useState({ myTasks: 0, activeClaims: 0, availableTasks: 0 });

  useEffect(() => {
    // Fetch basic stats
    const fetchStats = async () => {
      try {
        const [myTasks, available] = await Promise.all([
          api.getTasks({ mine: 'true' } as any),
          api.getTasks({ status: 'posted' }),
        ]);
        setStats({
          myTasks: myTasks.tasks?.length || 0,
          activeClaims: 0, // Would need claims endpoint
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
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold text-slate-800">
          Welcome back, {displayName}
        </h1>
        <p className="text-slate-500 mt-1">
          Your hub for real-world data collection
        </p>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-3 gap-4">
        <div className="glass rounded-xl p-5">
          <div className="text-3xl font-bold text-field-600">{stats.myTasks}</div>
          <div className="text-sm text-slate-500 mt-1">Tasks Posted</div>
        </div>
        <div className="glass rounded-xl p-5">
          <div className="text-3xl font-bold text-field-600">{stats.activeClaims}</div>
          <div className="text-sm text-slate-500 mt-1">Active Claims</div>
        </div>
        <div className="glass rounded-xl p-5">
          <div className="text-3xl font-bold text-field-600">{stats.availableTasks}</div>
          <div className="text-sm text-slate-500 mt-1">Available Tasks</div>
        </div>
      </div>

      {/* Action Cards */}
      <div className="grid md:grid-cols-2 gap-6">
        {/* Post Tasks Card */}
        <div className="glass rounded-xl p-6 hover:shadow-lg transition-shadow">
          <div className="flex items-start justify-between mb-4">
            <div>
              <h2 className="text-xl font-semibold text-slate-800">Request Data</h2>
              <p className="text-slate-500 text-sm mt-1">
                Post tasks and pay bounties for verified observations
              </p>
            </div>
            <div className="w-12 h-12 rounded-full bg-field-100 flex items-center justify-center">
              <svg className="w-6 h-6 text-field-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
            </div>
          </div>
          <div className="space-y-3">
            <Link
              href="/dashboard/requester/new"
              className="block w-full text-center py-3 px-4 bg-field-500 text-white rounded-lg font-medium hover:bg-field-600 transition-colors glow-sm"
            >
              Create New Task
            </Link>
            <Link
              href="/dashboard/requester"
              className="block w-full text-center py-3 px-4 border border-slate-200 text-slate-600 rounded-lg font-medium hover:bg-slate-50 transition-colors"
            >
              View My Tasks
            </Link>
          </div>
        </div>

        {/* Collect Bounties Card */}
        <div className="glass rounded-xl p-6 hover:shadow-lg transition-shadow">
          <div className="flex items-start justify-between mb-4">
            <div>
              <h2 className="text-xl font-semibold text-slate-800">Collect Data</h2>
              <p className="text-slate-500 text-sm mt-1">
                Complete tasks and earn USDC for verified submissions
              </p>
            </div>
            <div className="w-12 h-12 rounded-full bg-field-100 flex items-center justify-center">
              <svg className="w-6 h-6 text-field-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            </div>
          </div>
          <div className="space-y-3">
            <Link
              href="/dashboard/worker"
              className="block w-full text-center py-3 px-4 bg-field-500 text-white rounded-lg font-medium hover:bg-field-600 transition-colors glow-sm"
            >
              Browse Available Tasks
            </Link>
            <Link
              href="/dashboard/worker/claims"
              className="block w-full text-center py-3 px-4 border border-slate-200 text-slate-600 rounded-lg font-medium hover:bg-slate-50 transition-colors"
            >
              My Active Claims
            </Link>
          </div>
        </div>
      </div>

      {/* Quick Info */}
      <div className="glass rounded-xl p-6">
        <h3 className="font-semibold text-slate-800 mb-3">How it works</h3>
        <div className="grid md:grid-cols-3 gap-4 text-sm">
          <div className="flex items-start space-x-3">
            <div className="w-6 h-6 rounded-full bg-field-500 text-white flex items-center justify-center text-xs font-bold flex-shrink-0">1</div>
            <p className="text-slate-600"><strong>Post or Browse</strong> — Create tasks with bounties or find tasks near you</p>
          </div>
          <div className="flex items-start space-x-3">
            <div className="w-6 h-6 rounded-full bg-field-500 text-white flex items-center justify-center text-xs font-bold flex-shrink-0">2</div>
            <p className="text-slate-600"><strong>Capture & Submit</strong> — Take geo-verified photos with your phone</p>
          </div>
          <div className="flex items-start space-x-3">
            <div className="w-6 h-6 rounded-full bg-field-500 text-white flex items-center justify-center text-xs font-bold flex-shrink-0">3</div>
            <p className="text-slate-600"><strong>Verify & Pay</strong> — Automated checks + escrow release on approval</p>
          </div>
        </div>
      </div>
    </div>
  );
}
