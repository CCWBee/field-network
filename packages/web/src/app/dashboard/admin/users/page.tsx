'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import { useAuthStore } from '@/lib/store';

interface AdminUser {
  id: string;
  email: string | null;
  username: string | null;
  role: string;
  status: string;
  ens_name: string | null;
  created_at: string;
  stats: {
    reliability_score: number;
    dispute_rate: number;
    tasks_completed: number;
    tasks_accepted: number;
    total_earned: number;
  } | null;
}

export default function AdminUsersPage() {
  const router = useRouter();
  const { token, user } = useAuthStore();
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  useEffect(() => {
    if (user && user.role !== 'admin') {
      router.push('/dashboard');
      return;
    }

    if (token) {
      loadUsers();
    }
  }, [token, user, statusFilter]);

  const loadUsers = async () => {
    api.setToken(token);
    setIsLoading(true);
    try {
      const data = await api.getAdminUsers({
        status: statusFilter === 'all' ? undefined : statusFilter,
        query: query || undefined,
      });
      setUsers(data.users);
      setError('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load users');
    } finally {
      setIsLoading(false);
    }
  };

  const filteredUsers = useMemo(() => {
    if (!query) return users;
    const q = query.toLowerCase();
    return users.filter((u) =>
      [u.email, u.username, u.ens_name].some((value) => value?.toLowerCase().includes(q))
    );
  }, [users, query]);

  const updateStatus = async (userId: string, status: 'active' | 'suspended' | 'banned') => {
    api.setToken(token);
    setUpdatingId(userId);
    try {
      await api.updateUserStatus(userId, status);
      await loadUsers();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update user status');
    } finally {
      setUpdatingId(null);
    }
  };

  const statusBadge = (status: string) => {
    const styles: Record<string, string> = {
      active: 'bg-emerald-100 text-emerald-700',
      suspended: 'bg-amber-100 text-amber-700',
      banned: 'bg-rose-100 text-rose-700',
    };
    return styles[status] || 'bg-slate-100 text-slate-700';
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
      <div className="flex flex-wrap items-center justify-between gap-4 mb-8">
        <div>
          <Link href="/dashboard/admin" className="text-sm text-slate-500 hover:text-slate-700 mb-2 inline-block">
            &larr; Back to Admin
          </Link>
          <h1 className="text-2xl font-bold text-slate-900">User Management</h1>
          <p className="text-sm text-slate-500">Review user health and enforce account status.</p>
        </div>

        <div className="flex gap-2">
          {['all', 'active', 'suspended', 'banned'].map((status) => (
            <button
              key={status}
              onClick={() => setStatusFilter(status)}
              className={`px-4 py-2 rounded-md text-sm ${
                statusFilter === status
                  ? 'bg-field-500 text-white'
                  : 'bg-white text-slate-600 border border-surface-300 hover:bg-slate-50'
              }`}
            >
              {status.charAt(0).toUpperCase() + status.slice(1)}
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-4 mb-6">
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search by email, username, or ENS"
          className="w-full md:w-96 px-4 py-2 rounded-md border border-surface-300 bg-white"
        />
        <button
          onClick={loadUsers}
          className="px-4 py-2 rounded-md bg-slate-900 text-white text-sm"
        >
          Refresh
        </button>
      </div>

      {error && (
        <div className="mb-6 p-4 bg-rose-50 border border-rose-200 rounded-md">
          <p className="text-sm text-rose-600">{error}</p>
        </div>
      )}

      {filteredUsers.length === 0 ? (
        <div className="glass rounded-lg border border-surface-200 p-12 text-center">
          <p className="text-slate-500">No users found</p>
        </div>
      ) : (
        <div className="glass rounded-lg border border-surface-200 overflow-hidden">
          <table className="min-w-full divide-y divide-surface-200">
            <thead className="bg-slate-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase">User</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase">Status</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase">Reliability</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase">Dispute Rate</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase">Earned</th>
                <th className="px-6 py-3 text-right text-xs font-medium text-slate-500 uppercase">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-surface-200">
              {filteredUsers.map((userRow) => (
                <tr key={userRow.id} className="hover:bg-slate-50">
                  <td className="px-6 py-4">
                    <div className="text-sm font-medium text-slate-900">
                      {userRow.username || userRow.email || userRow.ens_name || 'Unnamed user'}
                    </div>
                    <div className="text-xs text-slate-500">{userRow.email || userRow.ens_name || userRow.id.slice(0, 8)}</div>
                  </td>
                  <td className="px-6 py-4">
                    <span className={`px-2 py-1 text-xs rounded-full ${statusBadge(userRow.status)}`}>
                      {userRow.status}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-sm text-slate-700">
                    {userRow.stats ? userRow.stats.reliability_score.toFixed(0) : '—'}
                  </td>
                  <td className="px-6 py-4 text-sm text-slate-700">
                    {userRow.stats ? `${userRow.stats.dispute_rate.toFixed(1)}%` : '—'}
                  </td>
                  <td className="px-6 py-4 text-sm text-slate-700">
                    {userRow.stats ? `USDC ${userRow.stats.total_earned.toFixed(2)}` : '—'}
                  </td>
                  <td className="px-6 py-4 text-right">
                    <div className="flex justify-end gap-2">
                      <button
                        onClick={() => updateStatus(userRow.id, 'active')}
                        disabled={updatingId === userRow.id}
                        className="text-xs px-3 py-1 rounded-md border border-slate-200 hover:bg-slate-100"
                      >
                        Activate
                      </button>
                      <button
                        onClick={() => updateStatus(userRow.id, 'suspended')}
                        disabled={updatingId === userRow.id}
                        className="text-xs px-3 py-1 rounded-md border border-amber-200 text-amber-700 hover:bg-amber-50"
                      >
                        Suspend
                      </button>
                      <button
                        onClick={() => updateStatus(userRow.id, 'banned')}
                        disabled={updatingId === userRow.id}
                        className="text-xs px-3 py-1 rounded-md border border-rose-200 text-rose-700 hover:bg-rose-50"
                      >
                        Ban
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
