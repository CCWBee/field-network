'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import { api } from '@/lib/api';
import { useAuthStore } from '@/lib/store';

interface Artefact {
  id: string;
  type: string;
  storage_key: string;
  sha256: string;
  size_bytes: number;
  width_px: number;
  height_px: number;
  captured_at: string | null;
  gps_lat: number | null;
  gps_lon: number | null;
  download_url: string;
}

interface Decision {
  id: string;
  type: string;
  reason_code: string | null;
  comment: string | null;
  created_at: string;
  actor: {
    id: string;
    email: string;
    username: string | null;
  } | null;
}

interface UserStats {
  reliability_score: number;
  dispute_rate: number;
  tasks_completed?: number;
  tasks_accepted?: number;
  total_earned?: number;
  tasks_posted?: number;
  total_bounties_paid?: number;
}

interface Badge {
  type: string;
  tier: string;
  title: string;
}

interface UserWithStats {
  id: string;
  email: string;
  username: string | null;
  stats: UserStats | null;
  badges: Badge[];
}

interface DisputeDetail {
  id: string;
  submission_id: string;
  opened_by: string;
  status: string;
  resolution_type: string | null;
  resolution_comment: string | null;
  split_percentage: number | null;
  resolver_id: string | null;
  opened_at: string;
  resolved_at: string | null;
  submission: {
    id: string;
    task_id: string;
    status: string;
    proof_bundle_hash: string | null;
    verification_score: number;
    flags: string[];
    created_at: string;
    finalised_at: string | null;
    task: {
      id: string;
      title: string;
      instructions: string;
      bounty_amount: number;
      currency: string;
      requirements: Record<string, any>;
      location: {
        lat: number;
        lon: number;
        radius_m: number;
      };
      time_window: {
        start: string;
        end: string;
      };
    };
    artefacts: Artefact[];
    decisions: Decision[];
  };
  worker: UserWithStats;
  requester: UserWithStats | null;
  escrow: {
    id: string;
    status: string;
    amount: number;
    currency: string;
    funded_at: string | null;
  } | null;
  audit_log: Array<{
    id: string;
    action: string;
    actor_id: string;
    ip: string;
    created_at: string;
    details: Record<string, any>;
  }>;
  dispute_audit_log: Array<{
    id: string;
    action: string;
    actor_id: string;
    created_at: string;
    details: Record<string, any>;
  }>;
}

export default function DisputeDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { token, user } = useAuthStore();
  const disputeId = params.disputeId as string;

  const [dispute, setDispute] = useState<DisputeDetail | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isResolving, setIsResolving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedArtefact, setSelectedArtefact] = useState<Artefact | null>(null);

  // Resolution form
  const [outcome, setOutcome] = useState<'worker_wins' | 'requester_wins' | 'split'>('worker_wins');
  const [splitPercentage, setSplitPercentage] = useState(50);
  const [reason, setReason] = useState('');

  // Check admin access
  useEffect(() => {
    if (user && user.role !== 'admin') {
      router.push('/dashboard');
    }
  }, [user, router]);

  const loadDispute = useCallback(async () => {
    if (!token) return;

    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000'}/v1/admin/disputes/${disputeId}`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        throw new Error('Failed to load dispute');
      }

      const data: DisputeDetail = await response.json();
      setDispute(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setIsLoading(false);
    }
  }, [token, disputeId]);

  useEffect(() => {
    loadDispute();
  }, [loadDispute]);

  const handleResolve = async () => {
    if (reason.length < 20) {
      setError('Please provide a detailed resolution reason (at least 20 characters)');
      return;
    }

    setIsResolving(true);
    setError(null);

    try {
      const body: Record<string, any> = {
        outcome,
        reason,
      };

      if (outcome === 'split') {
        body.split_percentage = splitPercentage;
      }

      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000'}/v1/admin/disputes/${disputeId}/resolve`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to resolve dispute');
      }

      router.push('/dashboard/admin/disputes');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to resolve dispute');
    } finally {
      setIsResolving(false);
    }
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

  const getStatusBadge = (status: string) => {
    const styles: Record<string, string> = {
      opened: 'bg-yellow-100 text-yellow-800 border-yellow-200',
      evidence_pending: 'bg-orange-100 text-orange-800 border-orange-200',
      under_review: 'bg-blue-100 text-blue-800 border-blue-200',
      resolved: 'bg-green-100 text-green-800 border-green-200',
    };

    return (
      <span className={`px-3 py-1 text-sm font-medium rounded-full border ${styles[status] || 'bg-gray-100 text-gray-800 border-gray-200'}`}>
        {status.replace(/_/g, ' ')}
      </span>
    );
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-field-500"></div>
      </div>
    );
  }

  if (!dispute) {
    return (
      <div className="text-center py-12">
        <h2 className="text-xl font-semibold text-slate-800 mb-2">Dispute Not Found</h2>
        <p className="text-slate-500 mb-4">{error || 'The dispute you are looking for does not exist.'}</p>
        <Link href="/dashboard/admin/disputes" className="text-field-600 hover:text-field-700 font-medium">
          Back to disputes
        </Link>
      </div>
    );
  }

  const isResolved = dispute.status === 'resolved';
  const bountyAmount = dispute.submission.task.bounty_amount;

  // Calculate preview amounts based on current outcome selection
  let workerPreviewAmount = 0;
  let requesterPreviewAmount = 0;
  if (outcome === 'worker_wins') {
    workerPreviewAmount = bountyAmount;
  } else if (outcome === 'requester_wins') {
    requesterPreviewAmount = bountyAmount;
  } else {
    workerPreviewAmount = (bountyAmount * splitPercentage) / 100;
    requesterPreviewAmount = bountyAmount - workerPreviewAmount;
  }

  return (
    <div className="max-w-6xl">
      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 mb-1">Dispute Resolution</h1>
          <p className="text-slate-500">{dispute.submission.task.title}</p>
        </div>
        {getStatusBadge(dispute.status)}
      </div>

      {error && (
        <div className="mb-6 p-4 rounded-lg bg-red-50 border border-red-200 text-red-700">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main Content */}
        <div className="lg:col-span-2 space-y-6">
          {/* Task Details */}
          <div className="glass rounded-lg border border-surface-200 p-6">
            <h2 className="text-lg font-semibold text-slate-800 mb-4">Task Details</h2>
            <div className="grid grid-cols-2 gap-4 text-sm mb-4">
              <div>
                <span className="text-slate-500">Bounty:</span>
                <span className="ml-2 font-semibold text-field-600">
                  {formatCurrency(bountyAmount, dispute.submission.task.currency)}
                </span>
              </div>
              <div>
                <span className="text-slate-500">Status:</span>
                <span className="ml-2">{dispute.submission.status}</span>
              </div>
              <div>
                <span className="text-slate-500">Time Window:</span>
                <span className="ml-2 text-xs">
                  {formatDate(dispute.submission.task.time_window.start)} - {formatDate(dispute.submission.task.time_window.end)}
                </span>
              </div>
              <div>
                <span className="text-slate-500">Location Radius:</span>
                <span className="ml-2">{dispute.submission.task.location.radius_m}m</span>
              </div>
            </div>
            <div>
              <span className="text-sm text-slate-500">Instructions:</span>
              <p className="mt-1 text-slate-700 whitespace-pre-wrap text-sm">{dispute.submission.task.instructions}</p>
            </div>
          </div>

          {/* Submission & Verification */}
          <div className="glass rounded-lg border border-surface-200 p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-slate-800">Submission</h2>
              <div className="flex items-center gap-2">
                <span className="text-sm text-slate-500">Verification Score:</span>
                <span className={`text-lg font-bold ${
                  dispute.submission.verification_score >= 80 ? 'text-green-600' :
                  dispute.submission.verification_score >= 50 ? 'text-yellow-600' : 'text-red-600'
                }`}>
                  {dispute.submission.verification_score}%
                </span>
              </div>
            </div>

            {/* Verification Flags */}
            {dispute.submission.flags.length > 0 && (
              <div className="mb-4 p-3 bg-yellow-50 rounded-lg border border-yellow-200">
                <h3 className="text-sm font-medium text-yellow-800 mb-2">Verification Flags</h3>
                <div className="flex flex-wrap gap-2">
                  {dispute.submission.flags.map((flag, i) => (
                    <span key={i} className="px-2 py-1 text-xs bg-yellow-100 text-yellow-700 rounded">
                      {flag.replace(/_/g, ' ')}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Artefacts */}
            <div className="mb-4">
              <h3 className="text-sm font-medium text-slate-700 mb-2">
                Artefacts ({dispute.submission.artefacts.length})
              </h3>
              <div className="grid grid-cols-3 gap-3">
                {dispute.submission.artefacts.map((artefact) => (
                  <button
                    key={artefact.id}
                    onClick={() => setSelectedArtefact(artefact)}
                    className="relative aspect-square bg-slate-100 rounded-lg overflow-hidden border border-surface-200 hover:border-field-300 transition-colors"
                  >
                    {artefact.type === 'photo' ? (
                      <div className="w-full h-full flex items-center justify-center">
                        <svg className="w-8 h-8 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                        </svg>
                      </div>
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <svg className="w-8 h-8 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                        </svg>
                      </div>
                    )}
                    <div className="absolute bottom-0 left-0 right-0 bg-black/50 px-2 py-1">
                      <p className="text-xs text-white truncate">{artefact.type}</p>
                    </div>
                  </button>
                ))}
              </div>
            </div>

            {/* Previous Decisions */}
            {dispute.submission.decisions.length > 0 && (
              <div className="border-t border-surface-200 pt-4">
                <h3 className="text-sm font-medium text-slate-700 mb-2">Decision History</h3>
                <div className="space-y-2">
                  {dispute.submission.decisions.map((decision) => (
                    <div key={decision.id} className="p-3 bg-slate-50 rounded-lg">
                      <div className="flex items-center justify-between mb-1">
                        <span className={`text-sm font-medium ${
                          decision.type === 'accept' ? 'text-green-600' : 'text-red-600'
                        }`}>
                          {decision.type.toUpperCase()}
                        </span>
                        <span className="text-xs text-slate-400">
                          {formatDate(decision.created_at)}
                        </span>
                      </div>
                      {decision.actor && (
                        <p className="text-xs text-slate-500">
                          By: {decision.actor.username || decision.actor.email}
                        </p>
                      )}
                      {decision.reason_code && (
                        <p className="text-sm text-slate-600 mt-1">Reason: {decision.reason_code}</p>
                      )}
                      {decision.comment && (
                        <p className="text-sm text-slate-700 mt-1">{decision.comment}</p>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Resolution Form */}
          {!isResolved && (
            <div className="glass rounded-lg border border-surface-200 p-6">
              <h2 className="text-lg font-semibold text-slate-800 mb-4">Resolve Dispute</h2>

              <div className="space-y-6">
                {/* Outcome Selection */}
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-3">Resolution Outcome</label>
                  <div className="grid grid-cols-3 gap-3">
                    <button
                      type="button"
                      onClick={() => setOutcome('worker_wins')}
                      className={`p-4 border-2 rounded-lg text-left transition-colors ${
                        outcome === 'worker_wins'
                          ? 'border-green-500 bg-green-50'
                          : 'border-surface-300 hover:border-surface-400'
                      }`}
                    >
                      <div className="font-medium text-slate-800">Worker Wins</div>
                      <div className="text-xs text-slate-500 mt-1">Full payment to worker</div>
                      <div className="text-sm font-semibold text-green-600 mt-2">
                        {formatCurrency(bountyAmount, dispute.submission.task.currency)}
                      </div>
                    </button>

                    <button
                      type="button"
                      onClick={() => setOutcome('split')}
                      className={`p-4 border-2 rounded-lg text-left transition-colors ${
                        outcome === 'split'
                          ? 'border-blue-500 bg-blue-50'
                          : 'border-surface-300 hover:border-surface-400'
                      }`}
                    >
                      <div className="font-medium text-slate-800">Split Payment</div>
                      <div className="text-xs text-slate-500 mt-1">Partial payment to both</div>
                      <div className="text-sm font-semibold text-blue-600 mt-2">
                        Custom split
                      </div>
                    </button>

                    <button
                      type="button"
                      onClick={() => setOutcome('requester_wins')}
                      className={`p-4 border-2 rounded-lg text-left transition-colors ${
                        outcome === 'requester_wins'
                          ? 'border-red-500 bg-red-50'
                          : 'border-surface-300 hover:border-surface-400'
                      }`}
                    >
                      <div className="font-medium text-slate-800">Requester Wins</div>
                      <div className="text-xs text-slate-500 mt-1">Full refund to requester</div>
                      <div className="text-sm font-semibold text-red-600 mt-2">
                        {formatCurrency(bountyAmount, dispute.submission.task.currency)}
                      </div>
                    </button>
                  </div>
                </div>

                {/* Split Slider */}
                {outcome === 'split' && (
                  <div className="p-4 bg-blue-50 rounded-lg border border-blue-200">
                    <label className="block text-sm font-medium text-slate-700 mb-3">
                      Split Percentage (Worker: {splitPercentage}% | Requester: {100 - splitPercentage}%)
                    </label>
                    <input
                      type="range"
                      min="0"
                      max="100"
                      step="5"
                      value={splitPercentage}
                      onChange={(e) => setSplitPercentage(parseInt(e.target.value))}
                      className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer"
                    />
                    <div className="flex justify-between mt-3 text-sm">
                      <div>
                        <span className="text-slate-500">Worker receives:</span>
                        <span className="ml-2 font-semibold text-green-600">
                          {formatCurrency(workerPreviewAmount, dispute.submission.task.currency)}
                        </span>
                      </div>
                      <div>
                        <span className="text-slate-500">Requester receives:</span>
                        <span className="ml-2 font-semibold text-blue-600">
                          {formatCurrency(requesterPreviewAmount, dispute.submission.task.currency)}
                        </span>
                      </div>
                    </div>
                  </div>
                )}

                {/* Reason */}
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">
                    Resolution Reason <span className="text-red-500">*</span>
                  </label>
                  <textarea
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    rows={4}
                    placeholder="Provide a detailed explanation for your decision (minimum 20 characters)..."
                    className="w-full px-4 py-3 border border-surface-300 rounded-lg bg-white text-slate-800 focus:outline-none focus:ring-2 focus:ring-field-500 focus:border-transparent"
                  />
                  <div className="flex justify-between mt-1">
                    <p className="text-xs text-slate-400">
                      This will be visible to both parties
                    </p>
                    <p className={`text-xs ${reason.length < 20 ? 'text-red-500' : 'text-slate-400'}`}>
                      {reason.length}/20 minimum
                    </p>
                  </div>
                </div>

                {/* Submit Button */}
                <button
                  onClick={handleResolve}
                  disabled={isResolving || reason.length < 20}
                  className="w-full py-3 bg-field-500 text-white rounded-lg font-medium hover:bg-field-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {isResolving ? (
                    <span className="flex items-center justify-center gap-2">
                      <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                      Resolving...
                    </span>
                  ) : (
                    'Resolve Dispute'
                  )}
                </button>
              </div>
            </div>
          )}

          {/* Resolved Info */}
          {isResolved && (
            <div className="glass rounded-lg border border-green-200 bg-green-50 p-6">
              <h2 className="text-lg font-semibold text-green-800 mb-4">Resolution</h2>
              <div className="space-y-3 text-sm">
                <div>
                  <span className="text-green-700">Outcome:</span>
                  <span className="ml-2 font-medium text-green-900">
                    {dispute.resolution_type?.replace(/_/g, ' ')}
                  </span>
                </div>
                {dispute.split_percentage !== null && (
                  <div>
                    <span className="text-green-700">Split:</span>
                    <span className="ml-2 font-medium text-green-900">
                      {dispute.split_percentage}% to worker, {100 - dispute.split_percentage}% to requester
                    </span>
                  </div>
                )}
                {dispute.resolution_comment && (
                  <div>
                    <span className="text-green-700">Reason:</span>
                    <p className="mt-1 text-green-900">{dispute.resolution_comment}</p>
                  </div>
                )}
                <div className="pt-2 border-t border-green-200">
                  <span className="text-green-600 text-xs">
                    Resolved on {formatDate(dispute.resolved_at!)}
                  </span>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          {/* Worker Info */}
          <div className="glass rounded-lg border border-surface-200 p-4">
            <h3 className="text-sm font-semibold text-slate-800 mb-3">Worker</h3>
            <div className="space-y-2 text-sm">
              <p className="text-slate-700 font-medium">
                {dispute.worker.username || dispute.worker.email}
              </p>
              {dispute.worker.stats && (
                <>
                  <div className="flex justify-between text-slate-500">
                    <span>Reliability:</span>
                    <span className={`font-medium ${
                      dispute.worker.stats.reliability_score >= 80 ? 'text-green-600' :
                      dispute.worker.stats.reliability_score >= 50 ? 'text-yellow-600' : 'text-red-600'
                    }`}>
                      {dispute.worker.stats.reliability_score.toFixed(0)}%
                    </span>
                  </div>
                  <div className="flex justify-between text-slate-500">
                    <span>Dispute Rate:</span>
                    <span className="font-medium">{dispute.worker.stats.dispute_rate.toFixed(1)}%</span>
                  </div>
                  <div className="flex justify-between text-slate-500">
                    <span>Tasks Completed:</span>
                    <span className="font-medium">{dispute.worker.stats.tasks_completed || 0}</span>
                  </div>
                </>
              )}
              {dispute.worker.badges.length > 0 && (
                <div className="flex flex-wrap gap-1 mt-2">
                  {dispute.worker.badges.slice(0, 3).map((badge, i) => (
                    <span key={i} className="px-2 py-0.5 text-xs bg-field-100 text-field-700 rounded">
                      {badge.title}
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Requester Info */}
          {dispute.requester && (
            <div className="glass rounded-lg border border-surface-200 p-4">
              <h3 className="text-sm font-semibold text-slate-800 mb-3">Requester</h3>
              <div className="space-y-2 text-sm">
                <p className="text-slate-700 font-medium">
                  {dispute.requester.username || dispute.requester.email}
                </p>
                {dispute.requester.stats && (
                  <>
                    <div className="flex justify-between text-slate-500">
                      <span>Reliability:</span>
                      <span className={`font-medium ${
                        dispute.requester.stats.reliability_score >= 80 ? 'text-green-600' :
                        dispute.requester.stats.reliability_score >= 50 ? 'text-yellow-600' : 'text-red-600'
                      }`}>
                        {dispute.requester.stats.reliability_score.toFixed(0)}%
                      </span>
                    </div>
                    <div className="flex justify-between text-slate-500">
                      <span>Tasks Posted:</span>
                      <span className="font-medium">{dispute.requester.stats.tasks_posted || 0}</span>
                    </div>
                  </>
                )}
              </div>
            </div>
          )}

          {/* Escrow Info */}
          {dispute.escrow && (
            <div className="glass rounded-lg border border-surface-200 p-4">
              <h3 className="text-sm font-semibold text-slate-800 mb-3">Escrow</h3>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-slate-500">Amount:</span>
                  <span className="font-semibold text-field-600">
                    {formatCurrency(dispute.escrow.amount, dispute.escrow.currency)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Status:</span>
                  <span className="font-medium">{dispute.escrow.status}</span>
                </div>
                {dispute.escrow.funded_at && (
                  <div className="flex justify-between">
                    <span className="text-slate-500">Funded:</span>
                    <span className="text-xs">{formatDate(dispute.escrow.funded_at)}</span>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Timeline */}
          <div className="glass rounded-lg border border-surface-200 p-4">
            <h3 className="text-sm font-semibold text-slate-800 mb-3">Timeline</h3>
            <div className="space-y-3">
              <div className="flex gap-3 text-sm">
                <div className="w-2 h-2 mt-1.5 rounded-full bg-slate-400"></div>
                <div>
                  <p className="text-slate-700">Dispute opened</p>
                  <p className="text-xs text-slate-400">{formatDate(dispute.opened_at)}</p>
                </div>
              </div>
              {dispute.submission.finalised_at && (
                <div className="flex gap-3 text-sm">
                  <div className="w-2 h-2 mt-1.5 rounded-full bg-slate-400"></div>
                  <div>
                    <p className="text-slate-700">Submission finalised</p>
                    <p className="text-xs text-slate-400">{formatDate(dispute.submission.finalised_at)}</p>
                  </div>
                </div>
              )}
              {isResolved && dispute.resolved_at && (
                <div className="flex gap-3 text-sm">
                  <div className="w-2 h-2 mt-1.5 rounded-full bg-green-500"></div>
                  <div>
                    <p className="text-green-700 font-medium">Dispute resolved</p>
                    <p className="text-xs text-slate-400">{formatDate(dispute.resolved_at)}</p>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Artefact Modal */}
      {selectedArtefact && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setSelectedArtefact(null)}>
          <div className="bg-white rounded-lg max-w-2xl w-full mx-4 p-6" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-slate-800">Artefact Details</h3>
              <button onClick={() => setSelectedArtefact(null)} className="text-slate-400 hover:text-slate-600">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <span className="text-slate-500">Type:</span>
                <span className="ml-2">{selectedArtefact.type}</span>
              </div>
              <div>
                <span className="text-slate-500">Size:</span>
                <span className="ml-2">{(selectedArtefact.size_bytes / 1024).toFixed(1)} KB</span>
              </div>
              <div>
                <span className="text-slate-500">Dimensions:</span>
                <span className="ml-2">{selectedArtefact.width_px} x {selectedArtefact.height_px}</span>
              </div>
              <div>
                <span className="text-slate-500">SHA256:</span>
                <span className="ml-2 font-mono text-xs">{selectedArtefact.sha256.slice(0, 16)}...</span>
              </div>
              {selectedArtefact.gps_lat !== null && selectedArtefact.gps_lon !== null && (
                <div className="col-span-2">
                  <span className="text-slate-500">GPS:</span>
                  <span className="ml-2">{selectedArtefact.gps_lat.toFixed(6)}, {selectedArtefact.gps_lon.toFixed(6)}</span>
                </div>
              )}
              {selectedArtefact.captured_at && (
                <div className="col-span-2">
                  <span className="text-slate-500">Captured:</span>
                  <span className="ml-2">{formatDate(selectedArtefact.captured_at)}</span>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
