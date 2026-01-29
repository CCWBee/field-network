'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { useAuthStore } from '@/lib/store';

interface JuryDispute {
  disputeId: string;
  taskTitle: string;
  bountyAmount: number;
  currency: string;
  deadline: string | null;
  hasVoted: boolean;
}

export default function JuryPoolPage() {
  const { token, user } = useAuthStore();

  const [disputes, setDisputes] = useState<JuryDispute[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadJuryPool = useCallback(async () => {
    if (!token) return;

    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000'}/v1/disputes/jury-pool`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        throw new Error('Failed to load jury pool');
      }

      const data = await response.json();
      setDisputes(data.disputes);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setIsLoading(false);
    }
  }, [token]);

  useEffect(() => {
    loadJuryPool();
  }, [loadJuryPool]);

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

  const getTimeRemaining = (deadline: string) => {
    const now = new Date();
    const deadlineDate = new Date(deadline);
    const diff = deadlineDate.getTime() - now.getTime();

    if (diff <= 0) return 'Expired';

    const hours = Math.floor(diff / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));

    if (hours > 24) {
      const days = Math.floor(hours / 24);
      return `${days}d ${hours % 24}h remaining`;
    }
    return `${hours}h ${minutes}m remaining`;
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-field-500"></div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-800 mb-1">Jury Duty</h1>
        <p className="text-slate-500">
          Review disputes and cast your vote to help resolve conflicts between workers and requesters.
        </p>
      </div>

      {error && (
        <div className="mb-6 p-4 rounded-lg bg-red-50 border border-red-200 text-red-700">
          {error}
        </div>
      )}

      {/* Info Banner */}
      <div className="glass rounded-lg border border-indigo-200 bg-indigo-50 p-4 mb-6">
        <div className="flex items-start gap-3">
          <svg className="w-5 h-5 text-indigo-600 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <div className="text-sm text-indigo-800">
            <p className="font-medium mb-1">How Jury Voting Works</p>
            <ul className="list-disc list-inside space-y-1 text-indigo-700">
              <li>You have been selected as a juror based on your reliability score</li>
              <li>Review the submission evidence and task requirements carefully</li>
              <li>Vote whether the worker or requester should win the dispute</li>
              <li>Voting deadline is 48 hours from when the dispute was escalated</li>
              <li>Majority vote (3 of 5) determines the outcome</li>
            </ul>
          </div>
        </div>
      </div>

      {/* Disputes List */}
      {disputes.length === 0 ? (
        <div className="glass rounded-lg border border-surface-200 p-12 text-center">
          <svg className="w-12 h-12 mx-auto text-slate-300 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <h3 className="text-lg font-medium text-slate-600 mb-1">No Active Jury Duties</h3>
          <p className="text-slate-500 text-sm">
            You have no pending jury duty assignments. Check back later.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {disputes.map((dispute) => (
            <Link
              key={dispute.disputeId}
              href={`/dashboard/jury/${dispute.disputeId}`}
              className="block glass rounded-lg border border-surface-200 hover:border-indigo-300 transition-colors"
            >
              <div className="p-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-3 mb-2">
                      {dispute.hasVoted ? (
                        <span className="px-2 py-1 text-xs font-medium rounded-full bg-green-100 text-green-800 border border-green-200">
                          Voted
                        </span>
                      ) : (
                        <span className="px-2 py-1 text-xs font-medium rounded-full bg-yellow-100 text-yellow-800 border border-yellow-200">
                          Pending Vote
                        </span>
                      )}
                      {dispute.deadline && (
                        <span className={`text-xs ${
                          new Date(dispute.deadline) < new Date(Date.now() + 6 * 60 * 60 * 1000)
                            ? 'text-red-600 font-medium'
                            : 'text-slate-400'
                        }`}>
                          {getTimeRemaining(dispute.deadline)}
                        </span>
                      )}
                    </div>

                    <h3 className="font-medium text-slate-800 truncate mb-1">
                      {dispute.taskTitle}
                    </h3>
                  </div>

                  <div className="text-right flex-shrink-0">
                    <div className="text-lg font-semibold text-slate-800">
                      {formatCurrency(dispute.bountyAmount, dispute.currency)}
                    </div>
                    <div className="text-xs text-slate-400">at stake</div>
                  </div>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
