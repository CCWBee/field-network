'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuthStore } from '@/lib/store';

interface Task {
  id: string;
  title: string;
  status: string;
  bounty_amount: number;
  currency: string;
  location: {
    lat: number;
    lon: number;
    radius_m: number;
  };
  time_window: {
    start: string;
    end: string;
  };
  created_at: string;
  published_at: string | null;
  requester: {
    id: string;
    email: string;
    username: string | null;
  };
  active_claims: number;
  submissions_count: number;
  escrow: {
    status: string;
    amount: number;
  } | null;
}

interface TasksResponse {
  tasks: Task[];
  total: number;
  limit: number;
  offset: number;
}

export default function AdminTasksPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { token, user } = useAuthStore();

  const [tasks, setTasks] = useState<Task[]>([]);
  const [total, setTotal] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [cancellingTaskId, setCancellingTaskId] = useState<string | null>(null);

  // Filters
  const [statusFilter, setStatusFilter] = useState(searchParams.get('status') || 'all');
  const [page, setPage] = useState(parseInt(searchParams.get('page') || '1', 10));
  const limit = 25;

  // Check admin access
  useEffect(() => {
    if (user && user.role !== 'admin') {
      router.push('/dashboard');
    }
  }, [user, router]);

  const loadTasks = useCallback(async () => {
    if (!token) return;

    setIsLoading(true);
    setError(null);

    try {
      const offset = (page - 1) * limit;

      const params = new URLSearchParams({
        limit: limit.toString(),
        offset: offset.toString(),
      });

      if (statusFilter !== 'all') {
        params.set('status', statusFilter);
      }

      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000'}/v1/admin/tasks?${params}`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        throw new Error('Failed to load tasks');
      }

      const data: TasksResponse = await response.json();
      setTasks(data.tasks);
      setTotal(data.total);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setIsLoading(false);
    }
  }, [token, page, statusFilter]);

  useEffect(() => {
    loadTasks();
  }, [loadTasks]);

  // Update URL when filters change
  useEffect(() => {
    const params = new URLSearchParams();
    if (statusFilter !== 'all') params.set('status', statusFilter);
    if (page > 1) params.set('page', page.toString());

    const queryString = params.toString();
    router.replace(`/dashboard/admin/tasks${queryString ? `?${queryString}` : ''}`, { scroll: false });
  }, [statusFilter, page, router]);

  const handleCancelTask = async (taskId: string) => {
    if (!confirm('Are you sure you want to cancel this task? This will refund the escrow to the requester.')) {
      return;
    }

    setCancellingTaskId(taskId);

    try {
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000'}/v1/admin/tasks/${taskId}/cancel`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ reason: 'Admin cancellation' }),
      });

      if (!response.ok) {
        throw new Error('Failed to cancel task');
      }

      // Reload tasks
      loadTasks();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to cancel task');
    } finally {
      setCancellingTaskId(null);
    }
  };

  const totalPages = Math.ceil(total / limit);

  const getStatusBadge = (status: string) => {
    const styles: Record<string, string> = {
      draft: 'bg-ink-50 text-ink-700 border-ink-200',
      posted: 'bg-signal-blue/10 text-signal-blue border-signal-blue/20',
      claimed: 'bg-signal-amber/10 text-signal-amber border-signal-amber/20',
      submitted: 'bg-purple-100 text-purple-800 border-purple-200',
      accepted: 'bg-signal-green/10 text-signal-green border-signal-green/20',
      disputed: 'bg-signal-red/10 text-signal-red border-signal-red/20',
      cancelled: 'bg-ink-50 text-ink-500 border-ink-200',
      expired: 'bg-signal-amber/10 text-signal-amber border-signal-amber/20',
    };

    return (
      <span className={`px-2 py-1 text-xs font-medium rounded-sm border ${styles[status] || 'bg-ink-50 text-ink-700 border-ink-200'}`}>
        {status}
      </span>
    );
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-GB', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
  };

  const formatCurrency = (amount: number, currency: string) => {
    return new Intl.NumberFormat('en-GB', {
      style: 'currency',
      currency: currency === 'USDC' ? 'USD' : currency,
    }).format(amount);
  };

  if (isLoading && tasks.length === 0) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-field-500"></div>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-ink-900 tracking-tight">Task Moderation</h1>
          <p className="text-ink-500 mt-1">View and manage all tasks on the platform</p>
        </div>
        <div className="text-sm text-ink-500 font-mono tabular-nums">
          {total} task{total !== 1 ? 's' : ''} total
        </div>
      </div>

      {error && (
        <div className="mb-6 p-4 rounded-sm bg-signal-red/10 border border-signal-red/20 text-signal-red">
          {error}
        </div>
      )}

      {/* Filters */}
      <div className="bg-paper rounded-sm border border-ink-200 p-4 mb-6">
        <div className="flex flex-wrap gap-4">
          <div>
            <label className="block text-xs uppercase tracking-wider font-medium text-ink-500 mb-1">Status</label>
            <select
              value={statusFilter}
              onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
              className="px-3 py-2 rounded-sm border border-ink-200 bg-white text-ink-900 text-sm focus:outline-none focus:ring-2 focus:ring-field-500"
            >
              <option value="all">All Statuses</option>
              <option value="draft">Draft</option>
              <option value="posted">Posted</option>
              <option value="claimed">Claimed</option>
              <option value="submitted">Submitted</option>
              <option value="accepted">Accepted</option>
              <option value="disputed">Disputed</option>
              <option value="cancelled">Cancelled</option>
              <option value="expired">Expired</option>
            </select>
          </div>

          <div className="flex items-end">
            <button
              onClick={() => { setStatusFilter('all'); setPage(1); }}
              className="px-3 py-2 text-sm text-ink-500 hover:text-ink-900"
            >
              Reset Filters
            </button>
          </div>
        </div>
      </div>

      {/* Tasks Table */}
      <div className="bg-paper rounded-sm border border-ink-200 overflow-hidden">
        {tasks.length === 0 ? (
          <div className="p-12 text-center">
            <svg className="w-12 h-12 mx-auto text-ink-300 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
            </svg>
            <h3 className="text-lg font-medium text-ink-700 mb-1">No tasks found</h3>
            <p className="text-ink-500 text-sm">
              {statusFilter !== 'all'
                ? `No tasks with status "${statusFilter}"`
                : 'No tasks have been created yet'}
            </p>
          </div>
        ) : (
          <table className="min-w-full">
            <thead className="bg-ink-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-ink-500 uppercase tracking-wider">Task</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-ink-500 uppercase tracking-wider">Requester</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-ink-500 uppercase tracking-wider">Bounty</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-ink-500 uppercase tracking-wider">Status</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-ink-500 uppercase tracking-wider">Claims</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-ink-500 uppercase tracking-wider">Created</th>
                <th className="px-6 py-3 text-right text-xs font-medium text-ink-500 uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-ink-100">
              {tasks.map((task) => (
                <tr key={task.id} className="hover:bg-paper-warm">
                  <td className="px-6 py-4">
                    <div className="text-sm font-medium text-ink-900 truncate max-w-xs">
                      {task.title}
                    </div>
                    <div className="text-xs text-ink-300 font-mono tabular-nums">{task.id.slice(0, 8)}</div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="text-sm text-ink-700">
                      {task.requester.username || task.requester.email}
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="text-sm font-semibold font-mono tabular-nums text-field-600">
                      {formatCurrency(task.bounty_amount, task.currency)}
                    </div>
                    {task.escrow && (
                      <div className="text-xs text-ink-300">
                        Escrow: {task.escrow.status}
                      </div>
                    )}
                  </td>
                  <td className="px-6 py-4">
                    {getStatusBadge(task.status)}
                  </td>
                  <td className="px-6 py-4 text-sm text-ink-500">
                    <div className="font-mono tabular-nums">{task.active_claims} active</div>
                    <div className="text-xs text-ink-300 font-mono tabular-nums">{task.submissions_count} submissions</div>
                  </td>
                  <td className="px-6 py-4 text-sm text-ink-500">
                    {formatDate(task.created_at)}
                    {task.published_at && (
                      <div className="text-xs text-ink-300">
                        Published: {formatDate(task.published_at)}
                      </div>
                    )}
                  </td>
                  <td className="px-6 py-4 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <Link
                        href={`/dashboard/tasks/${task.id}`}
                        className="text-field-600 hover:text-field-700 text-sm font-medium"
                      >
                        View
                      </Link>
                      {!['cancelled', 'accepted'].includes(task.status) && (
                        <button
                          onClick={() => handleCancelTask(task.id)}
                          disabled={cancellingTaskId === task.id}
                          className="text-signal-red hover:text-signal-red/80 text-sm font-medium disabled:opacity-50"
                        >
                          {cancellingTaskId === task.id ? 'Cancelling...' : 'Cancel'}
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="mt-6 flex items-center justify-between">
          <div className="text-sm text-ink-500 font-mono tabular-nums">
            Showing {((page - 1) * limit) + 1} to {Math.min(page * limit, total)} of {total}
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setPage(Math.max(1, page - 1))}
              disabled={page === 1}
              className="px-3 py-2 rounded-sm border border-ink-200 bg-white text-ink-700 text-sm disabled:opacity-50 disabled:cursor-not-allowed hover:bg-paper-warm"
            >
              Previous
            </button>

            <div className="flex items-center gap-1">
              {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                let pageNum;
                if (totalPages <= 5) {
                  pageNum = i + 1;
                } else if (page <= 3) {
                  pageNum = i + 1;
                } else if (page >= totalPages - 2) {
                  pageNum = totalPages - 4 + i;
                } else {
                  pageNum = page - 2 + i;
                }

                return (
                  <button
                    key={pageNum}
                    onClick={() => setPage(pageNum)}
                    className={`w-10 h-10 rounded-sm text-sm font-medium ${
                      page === pageNum
                        ? 'bg-field-500 text-white'
                        : 'bg-white border border-ink-200 text-ink-700 hover:bg-paper-warm'
                    }`}
                  >
                    {pageNum}
                  </button>
                );
              })}
            </div>

            <button
              onClick={() => setPage(Math.min(totalPages, page + 1))}
              disabled={page === totalPages}
              className="px-3 py-2 rounded-sm border border-ink-200 bg-white text-ink-700 text-sm disabled:opacity-50 disabled:cursor-not-allowed hover:bg-paper-warm"
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
