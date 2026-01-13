'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import { useAuthStore } from '@/lib/store';

interface Dispute {
  id: string;
  submission_id: string;
  status: string;
  resolution_type: string | null;
  opened_at: string;
  resolved_at: string | null;
  submission: {
    task: {
      id: string;
      title: string;
      bounty_amount: number;
      currency: string;
    };
    worker_email: string | null;
  };
}

export default function AdminDisputesPage() {
  const router = useRouter();
  const { token, user } = useAuthStore();
  const [disputes, setDisputes] = useState<Dispute[]>([]);
  const [filter, setFilter] = useState<'all' | 'opened' | 'resolved'>('opened');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (user && user.role !== 'admin') {
      router.push('/dashboard');
      return;
    }

    if (token) {
      loadDisputes();
    }
  }, [token, user, filter]);

  const loadDisputes = async () => {
    api.setToken(token);
    try {
      const params: any = {};
      if (filter !== 'all') {
        params.status = filter;
      }
      const result = await fetch(`http://localhost:3000/v1/disputes?${new URLSearchParams(params)}`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      if (!result.ok) throw new Error('Failed to load disputes');
      const data = await result.json();
      setDisputes(data.disputes);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load disputes');
    } finally {
      setIsLoading(false);
    }
  };

  const getStatusBadge = (status: string) => {
    const styles: Record<string, string> = {
      opened: 'bg-yellow-100 text-yellow-800',
      evidence_pending: 'bg-blue-100 text-blue-800',
      under_review: 'bg-purple-100 text-purple-800',
      resolved: 'bg-green-100 text-green-800',
    };
    return styles[status] || 'bg-slate-100 text-slate-800';
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
      <div className="flex justify-between items-center mb-8">
        <div>
          <Link href="/dashboard/admin" className="text-sm text-slate-500 hover:text-slate-700 mb-2 inline-block">
            &larr; Back to Admin
          </Link>
          <h1 className="text-2xl font-bold text-slate-900">Dispute Resolution</h1>
        </div>

        {/* Filter */}
        <div className="flex gap-2">
          {(['all', 'opened', 'resolved'] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-4 py-2 rounded-md text-sm ${
                filter === f
                  ? 'bg-field-500 text-white'
                  : 'bg-white text-slate-600 border border-surface-300 hover:bg-slate-50'
              }`}
            >
              {f.charAt(0).toUpperCase() + f.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {error && (
        <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-md">
          <p className="text-sm text-red-600">{error}</p>
        </div>
      )}

      {disputes.length === 0 ? (
        <div className="glass rounded-lg border border-surface-200 p-12 text-center">
          <p className="text-slate-500">No disputes found</p>
        </div>
      ) : (
        <div className="glass rounded-lg border border-surface-200 overflow-hidden">
          <table className="min-w-full divide-y divide-surface-200">
            <thead className="bg-slate-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase">Task</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase">Worker</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase">Bounty</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase">Status</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase">Opened</th>
                <th className="px-6 py-3 text-right text-xs font-medium text-slate-500 uppercase">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-surface-200">
              {disputes.map((dispute) => (
                <tr key={dispute.id} className="hover:bg-slate-50">
                  <td className="px-6 py-4">
                    <div className="text-sm font-medium text-slate-900">
                      {dispute.submission.task.title}
                    </div>
                    <div className="text-xs text-slate-500">{dispute.submission.task.id.slice(0, 8)}</div>
                  </td>
                  <td className="px-6 py-4 text-sm text-slate-500">
                    {dispute.submission.worker_email || 'Wallet user'}
                  </td>
                  <td className="px-6 py-4 text-sm font-medium text-green-600">
                    {dispute.submission.task.currency} {dispute.submission.task.bounty_amount.toFixed(2)}
                  </td>
                  <td className="px-6 py-4">
                    <span className={`px-2 py-1 text-xs rounded-full ${getStatusBadge(dispute.status)}`}>
                      {dispute.status}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-sm text-slate-500">
                    {new Date(dispute.opened_at).toLocaleDateString()}
                  </td>
                  <td className="px-6 py-4 text-right">
                    <Link
                      href={`/dashboard/admin/disputes/${dispute.id}`}
                      className="text-field-600 hover:text-field-700 text-sm font-medium"
                    >
                      Review
                    </Link>
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
