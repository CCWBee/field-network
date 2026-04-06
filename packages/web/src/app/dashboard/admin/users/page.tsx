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
      active: 'bg-signal-green/10 text-signal-green',
      suspended: 'bg-signal-amber/10 text-signal-amber',
      banned: 'bg-signal-red/10 text-signal-red',
    };
    return styles[status] || 'bg-ink-50 text-ink-700';
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
          <Link href="/dashboard/admin" className="text-sm text-ink-500 hover:text-ink-700 mb-2 inline-block">
            &larr; Back to Admin
          </Link>
          <h1 className="text-xl font-bold text-ink-900 tracking-tight">User Management</h1>
          <p className="text-sm text-ink-500">Review user health and enforce account status.</p>
        </div>

        <div className="flex gap-2">
          {['all', 'active', 'suspended', 'banned'].map((status) => (
            <button
              key={status}
              onClick={() => setStatusFilter(status)}
              className={`px-4 py-2 rounded-sm text-sm ${
                statusFilter === status
                  ? 'bg-field-500 text-white'
                  : 'bg-white text-ink-700 border border-ink-200 hover:bg-paper-warm'
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
          className="w-full md:w-96 px-4 py-2 rounded-sm border border-ink-200 bg-white text-ink-900"
        />
        <button
          onClick={loadUsers}
          className="px-4 py-2 rounded-sm bg-ink-900 text-white text-sm"
        >
          Refresh
        </button>
      </div>

      {error && (
        <div className="mb-6 p-4 bg-signal-red/10 border border-signal-red/20 rounded-sm">
          <p className="text-sm text-signal-red">{error}</p>
        </div>
      )}

      {filteredUsers.length === 0 ? (
        <div className="bg-paper rounded-sm border border-ink-200 p-12 text-center">
          <p className="text-ink-500">No users found</p>
        </div>
      ) : (
        <div className="bg-paper rounded-sm border border-ink-200 overflow-hidden">
          <table className="min-w-full">
            <thead className="bg-ink-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-ink-500 uppercase tracking-wider">User</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-ink-500 uppercase tracking-wider">Status</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-ink-500 uppercase tracking-wider">Reliability</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-ink-500 uppercase tracking-wider">Dispute Rate</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-ink-500 uppercase tracking-wider">Earned</th>
                <th className="px-6 py-3 text-right text-xs font-medium text-ink-500 uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ink-100">
              {filteredUsers.map((userRow) => (
                <tr key={userRow.id} className="hover:bg-paper-warm">
                  <td className="px-6 py-4">
                    <div className="text-sm font-medium text-ink-900">
                      {userRow.username || userRow.email || userRow.ens_name || 'Unnamed user'}
                    </div>
                    <div className="text-xs text-ink-500">{userRow.email || userRow.ens_name || userRow.id.slice(0, 8)}</div>
                  </td>
                  <td className="px-6 py-4">
                    <span className={`px-2 py-1 text-xs rounded-sm ${statusBadge(userRow.status)}`}>
                      {userRow.status}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-sm text-ink-700 font-mono tabular-nums">
                    {userRow.stats ? userRow.stats.reliability_score.toFixed(0) : '--'}
                  </td>
                  <td className="px-6 py-4 text-sm text-ink-700 font-mono tabular-nums">
                    {userRow.stats ? `${userRow.stats.dispute_rate.toFixed(1)}%` : '--'}
                  </td>
                  <td className="px-6 py-4 text-sm text-ink-700 font-mono tabular-nums">
                    {userRow.stats ? `USDC ${userRow.stats.total_earned.toFixed(2)}` : '--'}
                  </td>
                  <td className="px-6 py-4 text-right">
                    <div className="flex justify-end gap-2">
                      <button
                        onClick={() => updateStatus(userRow.id, 'active')}
                        disabled={updatingId === userRow.id}
                        className="text-xs px-3 py-1 rounded-sm border border-ink-200 hover:bg-paper-warm"
                      >
                        Activate
                      </button>
                      <button
                        onClick={() => updateStatus(userRow.id, 'suspended')}
                        disabled={updatingId === userRow.id}
                        className="text-xs px-3 py-1 rounded-sm border border-signal-amber/30 text-signal-amber hover:bg-signal-amber/5"
                      >
                        Suspend
                      </button>
                      <button
                        onClick={() => updateStatus(userRow.id, 'banned')}
                        disabled={updatingId === userRow.id}
                        className="text-xs px-3 py-1 rounded-sm border border-signal-red/30 text-signal-red hover:bg-signal-red/5"
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
