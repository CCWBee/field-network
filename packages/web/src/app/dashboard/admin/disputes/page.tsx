'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { api } from '@/lib/api';
import { useAuthStore } from '@/lib/store';
import {
  Spinner,
  Alert,
  Badge,
  Card,
  CardBody,
  Select,
  Button,
  EmptyDisputeList,
  StaggeredList,
  StaggeredItem,
} from '@/components/ui';

interface Dispute {
  id: string;
  submission_id: string;
  opened_by: string;
  status: string;
  resolution_type: string | null;
  split_percentage: number | null;
  opened_at: string;
  resolved_at: string | null;
  submission: {
    id: string;
    task_id: string;
    worker_id: string;
    status: string;
    task: {
      id: string;
      title: string;
      bounty_amount: number;
      currency: string;
    };
    worker: {
      id: string;
      email: string;
      username: string | null;
    };
    requester: {
      id: string;
      email: string;
      username: string | null;
    } | null;
    artefact_count: number;
  };
}

interface DisputesResponse {
  disputes: Dispute[];
  total: number;
  limit: number;
  offset: number;
}

export default function AdminDisputesPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { token, user } = useAuthStore();

  const [disputes, setDisputes] = useState<Dispute[]>([]);
  const [total, setTotal] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [statusFilter, setStatusFilter] = useState(searchParams.get('status') || 'all');
  const [sortBy, setSortBy] = useState(searchParams.get('sort_by') || 'opened_at');
  const [sortOrder, setSortOrder] = useState(searchParams.get('sort_order') || 'desc');
  const [page, setPage] = useState(parseInt(searchParams.get('page') || '1', 10));
  const limit = 20;

  // Check admin access
  useEffect(() => {
    if (user && user.role !== 'admin') {
      router.push('/dashboard');
    }
  }, [user, router]);

  const loadDisputes = useCallback(async () => {
    if (!token) return;

    setIsLoading(true);
    setError(null);

    try {
      api.setToken(token);
      const offset = (page - 1) * limit;

      const params = new URLSearchParams({
        limit: limit.toString(),
        offset: offset.toString(),
        sort_by: sortBy,
        sort_order: sortOrder,
      });

      if (statusFilter !== 'all') {
        params.set('status', statusFilter);
      }

      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000'}/v1/admin/disputes?${params}`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        throw new Error('Failed to load disputes');
      }

      const data: DisputesResponse = await response.json();
      setDisputes(data.disputes);
      setTotal(data.total);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setIsLoading(false);
    }
  }, [token, page, statusFilter, sortBy, sortOrder]);

  useEffect(() => {
    loadDisputes();
  }, [loadDisputes]);

  // Update URL when filters change
  useEffect(() => {
    const params = new URLSearchParams();
    if (statusFilter !== 'all') params.set('status', statusFilter);
    if (sortBy !== 'opened_at') params.set('sort_by', sortBy);
    if (sortOrder !== 'desc') params.set('sort_order', sortOrder);
    if (page > 1) params.set('page', page.toString());

    const queryString = params.toString();
    router.replace(`/dashboard/admin/disputes${queryString ? `?${queryString}` : ''}`, { scroll: false });
  }, [statusFilter, sortBy, sortOrder, page, router]);

  const totalPages = Math.ceil(total / limit);

  const getStatusBadge = (status: string) => {
    const styles: Record<string, string> = {
      opened: 'bg-signal-amber/10 text-signal-amber border-signal-amber/20',
      evidence_pending: 'bg-signal-amber/10 text-signal-amber border-signal-amber/20',
      under_review: 'bg-signal-blue/10 text-signal-blue border-signal-blue/20',
      resolved: 'bg-signal-green/10 text-signal-green border-signal-green/20',
    };

    return (
      <span className={`px-2 py-1 text-xs font-medium rounded-sm border ${styles[status] || 'bg-ink-50 text-ink-700 border-ink-200'}`}>
        {status.replace(/_/g, ' ')}
      </span>
    );
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-GB', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const formatCurrency = (amount: number, currency: string) => {
    return new Intl.NumberFormat('en-GB', {
      style: 'currency',
      currency: currency === 'USDC' ? 'USD' : currency,
    }).format(amount);
  };

  if (isLoading && disputes.length === 0) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Spinner size="lg" label="Loading disputes..." />
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-ink-900 tracking-tight">Dispute Resolution</h1>
          <p className="text-ink-500 mt-1">Review and resolve disputes between requesters and workers</p>
        </div>
        <div className="text-sm text-ink-500 font-mono tabular-nums">
          {total} dispute{total !== 1 ? 's' : ''} total
        </div>
      </div>

      {error && (
        <Alert variant="error" dismissible className="mb-6">
          {error}
        </Alert>
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
              <option value="opened">Opened</option>
              <option value="evidence_pending">Evidence Pending</option>
              <option value="under_review">Under Review</option>
              <option value="resolved">Resolved</option>
            </select>
          </div>

          <div>
            <label className="block text-xs uppercase tracking-wider font-medium text-ink-500 mb-1">Sort By</label>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
              className="px-3 py-2 rounded-sm border border-ink-200 bg-white text-ink-900 text-sm focus:outline-none focus:ring-2 focus:ring-field-500"
            >
              <option value="opened_at">Opened Date</option>
              <option value="resolved_at">Resolved Date</option>
              <option value="status">Status</option>
            </select>
          </div>

          <div>
            <label className="block text-xs uppercase tracking-wider font-medium text-ink-500 mb-1">Order</label>
            <select
              value={sortOrder}
              onChange={(e) => setSortOrder(e.target.value)}
              className="px-3 py-2 rounded-sm border border-ink-200 bg-white text-ink-900 text-sm focus:outline-none focus:ring-2 focus:ring-field-500"
            >
              <option value="desc">Newest First</option>
              <option value="asc">Oldest First</option>
            </select>
          </div>

          <div className="flex items-end">
            <button
              onClick={() => { setStatusFilter('all'); setSortBy('opened_at'); setSortOrder('desc'); setPage(1); }}
              className="px-3 py-2 text-sm text-ink-500 hover:text-ink-900"
            >
              Reset Filters
            </button>
          </div>
        </div>
      </div>

      {/* Disputes List */}
      <div className="space-y-4">
        {disputes.length === 0 ? (
          <div className="bg-paper rounded-sm border border-ink-200">
            <div className="p-6">
              <EmptyDisputeList />
              {statusFilter !== 'all' && (
                <p className="text-center text-sm text-ink-500 -mt-4">
                  No disputes with status "{statusFilter.replace(/_/g, ' ')}"
                </p>
              )}
            </div>
          </div>
        ) : (
          disputes.map((dispute) => (
            <Link
              key={dispute.id}
              href={`/dashboard/admin/disputes/${dispute.id}`}
              className="block bg-paper rounded-sm border border-ink-200 hover:border-field-300 transition-colors"
            >
              <div className="p-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-3 mb-2">
                      {getStatusBadge(dispute.status)}
                      <span className="text-xs text-ink-300">
                        Opened {formatDate(dispute.opened_at)}
                      </span>
                    </div>

                    <h3 className="font-medium text-ink-900 truncate mb-1">
                      {dispute.submission.task.title}
                    </h3>

                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-ink-500">
                      <span>
                        <span className="text-ink-300">Worker:</span>{' '}
                        {dispute.submission.worker.username || dispute.submission.worker.email}
                      </span>
                      <span>
                        <span className="text-ink-300">Requester:</span>{' '}
                        {dispute.submission.requester?.username || dispute.submission.requester?.email || 'Unknown'}
                      </span>
                      <span>
                        <span className="text-ink-300">Artefacts:</span>{' '}
                        <span className="font-mono tabular-nums">{dispute.submission.artefact_count}</span>
                      </span>
                    </div>
                  </div>

                  <div className="text-right flex-shrink-0">
                    <div className="text-lg font-semibold font-mono tabular-nums text-ink-900">
                      {formatCurrency(dispute.submission.task.bounty_amount, dispute.submission.task.currency)}
                    </div>
                    <div className="text-xs text-ink-300">at stake</div>
                  </div>
                </div>

                {dispute.status === 'resolved' && (
                  <div className="mt-3 pt-3 border-t border-ink-100">
                    <div className="flex items-center gap-2 text-sm">
                      <span className="text-ink-500">Resolution:</span>
                      <span className="font-medium text-ink-700">
                        {dispute.resolution_type?.replace(/_/g, ' ')}
                      </span>
                      {dispute.split_percentage !== null && (
                        <span className="text-ink-500 font-mono tabular-nums">
                          ({dispute.split_percentage}% to worker)
                        </span>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </Link>
          ))
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
