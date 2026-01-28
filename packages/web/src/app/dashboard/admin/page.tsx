'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import { useAuthStore } from '@/lib/store';

interface Stats {
  openDisputes: number;
  totalTasks: number;
  activeWorkers: number;
}

export default function AdminDashboard() {
  const router = useRouter();
  const { token, user } = useAuthStore();
  const [stats, setStats] = useState<Stats>({ openDisputes: 0, totalTasks: 0, activeWorkers: 0 });
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (user && user.role !== 'admin') {
      router.push('/dashboard');
      return;
    }

    if (token) {
      loadStats();
    }
  }, [token, user]);

  const loadStats = async () => {
    api.setToken(token);
    try {
      const data = await api.getAdminStats();
      setStats({
        openDisputes: data.open_disputes,
        totalTasks: data.total_tasks,
        activeWorkers: data.active_workers,
      });
    } catch (error) {
      console.error('Failed to load stats:', error);
    } finally {
      setIsLoading(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-field-500"></div>
      </div>
    );
  }

  return (
    <div>
      <h1 className="text-2xl font-bold text-slate-800 mb-8">Admin Dashboard</h1>

      {/* Quick Stats */}
      <div className="grid grid-cols-3 gap-6 mb-8">
        <div className="glass rounded-lg p-6 border border-surface-200">
          <div className="text-sm text-slate-500">Open Disputes</div>
          <div className="text-3xl font-bold text-red-600">{stats.openDisputes}</div>
        </div>
        <div className="glass rounded-lg p-6 border border-surface-200">
          <div className="text-sm text-slate-500">Total Tasks</div>
          <div className="text-3xl font-bold text-field-600">{stats.totalTasks}</div>
        </div>
        <div className="glass rounded-lg p-6 border border-surface-200">
          <div className="text-sm text-slate-500">Active Workers</div>
          <div className="text-3xl font-bold text-green-600">{stats.activeWorkers}</div>
        </div>
      </div>

      {/* Quick Links */}
      <div className="grid grid-cols-2 gap-6">
        <Link href="/dashboard/admin/disputes" className="block">
          <div className="glass rounded-lg p-6 hover:shadow-md transition-shadow border border-surface-200">
            <h3 className="text-lg font-medium text-slate-800 mb-2">Dispute Resolution</h3>
            <p className="text-slate-500 text-sm">Review and resolve open disputes between requesters and workers.</p>
          </div>
        </Link>
        <Link href="/dashboard/admin/users" className="block">
          <div className="glass rounded-lg p-6 hover:shadow-md transition-shadow border border-surface-200">
            <h3 className="text-lg font-medium text-slate-800 mb-2">User Management</h3>
            <p className="text-slate-500 text-sm">View and manage user accounts, suspensions, and bans.</p>
          </div>
        </Link>
      </div>
    </div>
  );
}
