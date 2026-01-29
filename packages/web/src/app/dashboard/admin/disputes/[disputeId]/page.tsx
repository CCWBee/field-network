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

interface Evidence {
  id: string;
  dispute_id: string;
  submitted_by: string;
  submitter: {
    id: string;
    email: string;
    username: string | null;
  };
  party: 'worker' | 'requester';
  type: 'text' | 'image' | 'document';
  description: string;
  storage_key: string | null;
  mime_type: string | null;
  size_bytes: number | null;
  download_url: string | null;
  created_at: string;
}

interface TierTransition {
  from: number;
  to: number;
  reason: string;
  actorId?: string;
  timestamp: string;
  details?: Record<string, unknown>;
}

interface AutoScoreCheck {
  name: string;
  passed: boolean;
  score: number;
  weight: number;
  details?: string;
}

interface AutoScoreResult {
  totalScore: number;
  checks: AutoScoreCheck[];
  recommendation: 'worker_wins' | 'requester_wins' | 'escalate';
  timestamp: string;
}

interface JuryVote {
  jurorId: string;
  hasVoted: boolean;
  weight: number;
}

interface JuryStatus {
  totalJurors: number;
  votedCount: number;
  deadline: string | null;
  votes: JuryVote[];
  results?: {
    workerVotes: number;
    requesterVotes: number;
    abstainVotes: number;
    workerWeight: number;
    requesterWeight: number;
  };
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
  evidence_deadline: string | null;
  evidence_deadline_passed: boolean;
  evidence: Evidence[];
  // Multi-tier fields
  current_tier: number;
  tier_history: TierTransition[];
  auto_score_result: AutoScoreResult | null;
  tier1_deadline: string | null;
  tier2_deadline: string | null;
  tier3_deadline: string | null;
  escalation_stake: number | null;
  jury_status?: JuryStatus;
  evidence_count: {
    total: number;
    worker: number;
    requester: number;
  };
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
  const [selectedEvidence, setSelectedEvidence] = useState<Evidence | null>(null);

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

  const formatFileSize = (bytes: number | null) => {
    if (!bytes) return 'Unknown';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const getStatusBadge = (status: string) => {
    const styles: Record<string, string> = {
      opened: 'bg-yellow-100 text-yellow-800 border-yellow-200',
      evidence_pending: 'bg-orange-100 text-orange-800 border-orange-200',
      under_review: 'bg-blue-100 text-blue-800 border-blue-200',
      tier1_review: 'bg-purple-100 text-purple-800 border-purple-200',
      tier2_voting: 'bg-indigo-100 text-indigo-800 border-indigo-200',
      tier3_appeal: 'bg-pink-100 text-pink-800 border-pink-200',
      resolved: 'bg-green-100 text-green-800 border-green-200',
    };

    const statusLabels: Record<string, string> = {
      tier1_review: 'Tier 1: Auto Review',
      tier2_voting: 'Tier 2: Jury Voting',
      tier3_appeal: 'Tier 3: Admin Appeal',
    };

    return (
      <span className={`px-3 py-1 text-sm font-medium rounded-full border ${styles[status] || 'bg-gray-100 text-gray-800 border-gray-200'}`}>
        {statusLabels[status] || status.replace(/_/g, ' ')}
      </span>
    );
  };

  const getTierBadge = (tier: number) => {
    const tierInfo: Record<number, { label: string; style: string }> = {
      1: { label: 'Tier 1: Auto', style: 'bg-purple-100 text-purple-800 border-purple-200' },
      2: { label: 'Tier 2: Jury', style: 'bg-indigo-100 text-indigo-800 border-indigo-200' },
      3: { label: 'Tier 3: Admin', style: 'bg-pink-100 text-pink-800 border-pink-200' },
    };
    const info = tierInfo[tier] || { label: `Tier ${tier}`, style: 'bg-gray-100 text-gray-800 border-gray-200' };
    return (
      <span className={`px-2 py-0.5 text-xs font-medium rounded-full border ${info.style}`}>
        {info.label}
      </span>
    );
  };

  const getEvidenceIcon = (type: string) => {
    switch (type) {
      case 'image':
        return (
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
          </svg>
        );
      case 'document':
        return (
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
        );
      default:
        return (
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 8h10M7 12h4m1 8l-4-4H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-3l-4 4z" />
          </svg>
        );
    }
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

  // Separate evidence by party
  const workerEvidence = dispute.evidence?.filter(e => e.party === 'worker') || [];
  const requesterEvidence = dispute.evidence?.filter(e => e.party === 'requester') || [];

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

      {/* Tier Progress Bar */}
      {dispute.current_tier && (
        <div className="glass rounded-lg border border-surface-200 p-4 mb-6">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-slate-700">Resolution Progress</h3>
            {getTierBadge(dispute.current_tier)}
          </div>

          {/* Tier timeline */}
          <div className="relative">
            <div className="flex items-center justify-between">
              {/* Tier 1 */}
              <div className="flex flex-col items-center">
                <div className={`w-10 h-10 rounded-full flex items-center justify-center border-2 ${
                  dispute.current_tier >= 1
                    ? dispute.current_tier === 1 && dispute.status !== 'resolved'
                      ? 'bg-purple-100 border-purple-500 text-purple-700'
                      : 'bg-green-100 border-green-500 text-green-700'
                    : 'bg-slate-100 border-slate-300 text-slate-500'
                }`}>
                  {dispute.current_tier > 1 || (dispute.current_tier === 1 && dispute.status === 'resolved') ? (
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                  ) : (
                    <span className="text-sm font-bold">1</span>
                  )}
                </div>
                <span className="text-xs mt-1 text-slate-600">Auto</span>
                {dispute.auto_score_result && (
                  <span className={`text-xs font-medium ${
                    dispute.auto_score_result.totalScore >= 80 ? 'text-green-600' :
                    dispute.auto_score_result.totalScore <= 20 ? 'text-red-600' : 'text-yellow-600'
                  }`}>
                    {dispute.auto_score_result.totalScore.toFixed(0)}%
                  </span>
                )}
              </div>

              {/* Connector 1-2 */}
              <div className={`flex-1 h-1 mx-2 ${
                dispute.current_tier >= 2 ? 'bg-green-400' : 'bg-slate-200'
              }`}></div>

              {/* Tier 2 */}
              <div className="flex flex-col items-center">
                <div className={`w-10 h-10 rounded-full flex items-center justify-center border-2 ${
                  dispute.current_tier >= 2
                    ? dispute.current_tier === 2 && dispute.status !== 'resolved'
                      ? 'bg-indigo-100 border-indigo-500 text-indigo-700'
                      : 'bg-green-100 border-green-500 text-green-700'
                    : 'bg-slate-100 border-slate-300 text-slate-500'
                }`}>
                  {dispute.current_tier > 2 || (dispute.current_tier === 2 && dispute.status === 'resolved') ? (
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                  ) : (
                    <span className="text-sm font-bold">2</span>
                  )}
                </div>
                <span className="text-xs mt-1 text-slate-600">Jury</span>
                {dispute.current_tier === 2 && dispute.jury_status && (
                  <span className="text-xs font-medium text-indigo-600">
                    {dispute.jury_status.votedCount}/{dispute.jury_status.totalJurors}
                  </span>
                )}
              </div>

              {/* Connector 2-3 */}
              <div className={`flex-1 h-1 mx-2 ${
                dispute.current_tier >= 3 ? 'bg-green-400' : 'bg-slate-200'
              }`}></div>

              {/* Tier 3 */}
              <div className="flex flex-col items-center">
                <div className={`w-10 h-10 rounded-full flex items-center justify-center border-2 ${
                  dispute.current_tier >= 3
                    ? dispute.current_tier === 3 && dispute.status !== 'resolved'
                      ? 'bg-pink-100 border-pink-500 text-pink-700'
                      : 'bg-green-100 border-green-500 text-green-700'
                    : 'bg-slate-100 border-slate-300 text-slate-500'
                }`}>
                  {dispute.current_tier === 3 && dispute.status === 'resolved' ? (
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                  ) : (
                    <span className="text-sm font-bold">3</span>
                  )}
                </div>
                <span className="text-xs mt-1 text-slate-600">Admin</span>
                {dispute.escalation_stake && dispute.current_tier === 3 && (
                  <span className="text-xs font-medium text-pink-600">
                    +{formatCurrency(dispute.escalation_stake, dispute.submission.task.currency)}
                  </span>
                )}
              </div>
            </div>

            {/* Deadline display */}
            {dispute.current_tier === 2 && dispute.tier2_deadline && (
              <div className="mt-3 text-center text-xs text-slate-500">
                Jury voting deadline: {formatDate(dispute.tier2_deadline)}
              </div>
            )}
            {dispute.current_tier === 3 && dispute.tier3_deadline && (
              <div className="mt-3 text-center text-xs text-slate-500">
                Admin appeal deadline: {formatDate(dispute.tier3_deadline)}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Auto Score Result (Tier 1) */}
      {dispute.auto_score_result && (
        <div className="glass rounded-lg border border-purple-200 bg-purple-50 p-4 mb-6">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-purple-800">Tier 1 Automated Analysis</h3>
            <span className={`px-2 py-0.5 text-xs font-medium rounded ${
              dispute.auto_score_result.recommendation === 'worker_wins'
                ? 'bg-green-200 text-green-800'
                : dispute.auto_score_result.recommendation === 'requester_wins'
                ? 'bg-red-200 text-red-800'
                : 'bg-yellow-200 text-yellow-800'
            }`}>
              {dispute.auto_score_result.recommendation === 'worker_wins'
                ? 'Worker Favored'
                : dispute.auto_score_result.recommendation === 'requester_wins'
                ? 'Requester Favored'
                : 'Escalate Recommended'}
            </span>
          </div>

          <div className="mb-3">
            <div className="flex items-center justify-between text-sm mb-1">
              <span className="text-purple-700">Overall Score</span>
              <span className={`font-bold ${
                dispute.auto_score_result.totalScore >= 80 ? 'text-green-600' :
                dispute.auto_score_result.totalScore <= 20 ? 'text-red-600' : 'text-yellow-600'
              }`}>
                {dispute.auto_score_result.totalScore.toFixed(1)}%
              </span>
            </div>
            <div className="w-full bg-purple-200 rounded-full h-2">
              <div
                className={`h-2 rounded-full ${
                  dispute.auto_score_result.totalScore >= 80 ? 'bg-green-500' :
                  dispute.auto_score_result.totalScore <= 20 ? 'bg-red-500' : 'bg-yellow-500'
                }`}
                style={{ width: `${dispute.auto_score_result.totalScore}%` }}
              ></div>
            </div>
          </div>

          <div className="space-y-2">
            {dispute.auto_score_result.checks.map((check, i) => (
              <div key={i} className="flex items-center justify-between text-xs">
                <div className="flex items-center gap-2">
                  {check.passed ? (
                    <svg className="w-4 h-4 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                  ) : (
                    <svg className="w-4 h-4 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  )}
                  <span className="text-purple-700">{check.name.replace(/_/g, ' ')}</span>
                </div>
                <span className="text-purple-600">{check.score.toFixed(0)}% (w:{check.weight})</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Jury Status (Tier 2) */}
      {dispute.current_tier === 2 && dispute.jury_status && (
        <div className="glass rounded-lg border border-indigo-200 bg-indigo-50 p-4 mb-6">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-indigo-800">Tier 2 Jury Voting</h3>
            <span className="text-xs text-indigo-600">
              {dispute.jury_status.votedCount} of {dispute.jury_status.totalJurors} votes cast
            </span>
          </div>

          <div className="grid grid-cols-5 gap-2 mb-3">
            {dispute.jury_status.votes.map((vote, i) => (
              <div
                key={i}
                className={`p-2 rounded text-center text-xs ${
                  vote.hasVoted
                    ? 'bg-indigo-200 text-indigo-800'
                    : 'bg-white border border-indigo-200 text-indigo-400'
                }`}
              >
                <div className="font-medium">Juror {i + 1}</div>
                <div className="text-xs opacity-75">
                  {vote.hasVoted ? 'Voted' : 'Pending'}
                </div>
              </div>
            ))}
          </div>

          {dispute.jury_status.results && (
            <div className="pt-3 border-t border-indigo-200">
              <div className="grid grid-cols-3 gap-2 text-center text-xs">
                <div className="p-2 bg-green-100 rounded">
                  <div className="font-medium text-green-800">Worker</div>
                  <div className="text-green-600">
                    {dispute.jury_status.results.workerVotes} ({dispute.jury_status.results.workerWeight.toFixed(2)}w)
                  </div>
                </div>
                <div className="p-2 bg-blue-100 rounded">
                  <div className="font-medium text-blue-800">Requester</div>
                  <div className="text-blue-600">
                    {dispute.jury_status.results.requesterVotes} ({dispute.jury_status.results.requesterWeight.toFixed(2)}w)
                  </div>
                </div>
                <div className="p-2 bg-slate-100 rounded">
                  <div className="font-medium text-slate-800">Abstain</div>
                  <div className="text-slate-600">{dispute.jury_status.results.abstainVotes}</div>
                </div>
              </div>
            </div>
          )}
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

          {/* Evidence Timeline */}
          {dispute.evidence && dispute.evidence.length > 0 && (
            <div className="glass rounded-lg border border-surface-200 p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold text-slate-800">Evidence Timeline</h2>
                <div className="flex items-center gap-4 text-sm">
                  <span className="text-slate-500">
                    Worker: <span className="font-medium text-green-600">{dispute.evidence_count?.worker || 0}</span>
                  </span>
                  <span className="text-slate-500">
                    Requester: <span className="font-medium text-blue-600">{dispute.evidence_count?.requester || 0}</span>
                  </span>
                </div>
              </div>

              {/* Evidence deadline notice */}
              {dispute.evidence_deadline && (
                <div className={`mb-4 p-3 rounded-lg border ${
                  dispute.evidence_deadline_passed
                    ? 'bg-red-50 border-red-200'
                    : 'bg-blue-50 border-blue-200'
                }`}>
                  <p className={`text-sm ${dispute.evidence_deadline_passed ? 'text-red-700' : 'text-blue-700'}`}>
                    {dispute.evidence_deadline_passed
                      ? 'Evidence submission deadline has passed'
                      : `Evidence deadline: ${formatDate(dispute.evidence_deadline)}`}
                  </p>
                </div>
              )}

              {/* Evidence items */}
              <div className="space-y-4">
                {dispute.evidence.map((evidence, index) => (
                  <div
                    key={evidence.id}
                    className={`relative pl-8 pb-4 ${
                      index !== dispute.evidence.length - 1 ? 'border-l-2 border-slate-200 ml-2' : 'ml-2'
                    }`}
                  >
                    {/* Timeline dot */}
                    <div className={`absolute left-0 -translate-x-1/2 w-4 h-4 rounded-full border-2 ${
                      evidence.party === 'worker'
                        ? 'bg-green-100 border-green-500'
                        : 'bg-blue-100 border-blue-500'
                    }`}></div>

                    <div className={`p-4 rounded-lg border ${
                      evidence.party === 'worker'
                        ? 'bg-green-50 border-green-200'
                        : 'bg-blue-50 border-blue-200'
                    }`}>
                      {/* Header */}
                      <div className="flex items-start justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <span className={`px-2 py-0.5 text-xs font-medium rounded ${
                            evidence.party === 'worker'
                              ? 'bg-green-200 text-green-800'
                              : 'bg-blue-200 text-blue-800'
                          }`}>
                            {evidence.party === 'worker' ? 'Worker' : 'Requester'}
                          </span>
                          <span className="text-sm text-slate-600">
                            {evidence.submitter.username || evidence.submitter.email}
                          </span>
                        </div>
                        <span className="text-xs text-slate-400">{formatDate(evidence.created_at)}</span>
                      </div>

                      {/* Description */}
                      <p className="text-sm text-slate-700 whitespace-pre-wrap mb-3">{evidence.description}</p>

                      {/* File attachment */}
                      {evidence.type !== 'text' && evidence.storage_key && (
                        <div className="flex items-center gap-3 p-3 bg-white/60 rounded-lg border border-slate-200">
                          <div className={`p-2 rounded ${
                            evidence.type === 'image' ? 'bg-purple-100 text-purple-600' : 'bg-red-100 text-red-600'
                          }`}>
                            {getEvidenceIcon(evidence.type)}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-slate-700 truncate">
                              {evidence.type === 'image' ? 'Image attachment' : 'PDF document'}
                            </p>
                            <p className="text-xs text-slate-500">
                              {evidence.mime_type} - {formatFileSize(evidence.size_bytes)}
                            </p>
                          </div>
                          {evidence.type === 'image' && (
                            <button
                              onClick={() => setSelectedEvidence(evidence)}
                              className="px-3 py-1.5 text-xs font-medium text-slate-600 bg-white border border-slate-300 rounded hover:bg-slate-50"
                            >
                              View
                            </button>
                          )}
                          {evidence.download_url && (
                            <a
                              href={`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000'}${evidence.download_url}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="px-3 py-1.5 text-xs font-medium text-white bg-field-500 rounded hover:bg-field-600"
                            >
                              Download
                            </a>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* No evidence message */}
          {(!dispute.evidence || dispute.evidence.length === 0) && (
            <div className="glass rounded-lg border border-surface-200 p-6">
              <h2 className="text-lg font-semibold text-slate-800 mb-4">Evidence</h2>
              <div className="text-center py-8 text-slate-500">
                <svg className="w-12 h-12 mx-auto mb-3 text-slate-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                <p>No evidence has been submitted yet</p>
                {dispute.evidence_deadline && !dispute.evidence_deadline_passed && (
                  <p className="text-sm mt-2">
                    Deadline: {formatDate(dispute.evidence_deadline)}
                  </p>
                )}
              </div>
            </div>
          )}

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
              {dispute.evidence_deadline && (
                <div className="flex gap-3 text-sm">
                  <div className={`w-2 h-2 mt-1.5 rounded-full ${
                    dispute.evidence_deadline_passed ? 'bg-red-400' : 'bg-orange-400'
                  }`}></div>
                  <div>
                    <p className="text-slate-700">Evidence deadline</p>
                    <p className="text-xs text-slate-400">{formatDate(dispute.evidence_deadline)}</p>
                  </div>
                </div>
              )}
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

      {/* Evidence Image Modal */}
      {selectedEvidence && selectedEvidence.type === 'image' && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75" onClick={() => setSelectedEvidence(null)}>
          <div className="bg-white rounded-lg max-w-4xl w-full mx-4 p-6 max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-slate-800">Evidence Image</h3>
              <button onClick={() => setSelectedEvidence(null)} className="text-slate-400 hover:text-slate-600">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Image container */}
            <div className="bg-slate-100 rounded-lg overflow-hidden mb-4">
              {selectedEvidence.download_url ? (
                <img
                  src={`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000'}${selectedEvidence.download_url}`}
                  alt="Evidence"
                  className="w-full h-auto max-h-[60vh] object-contain"
                />
              ) : (
                <div className="flex items-center justify-center h-64 text-slate-400">
                  <p>Image not available</p>
                </div>
              )}
            </div>

            {/* Evidence details */}
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <span className={`px-2 py-0.5 text-xs font-medium rounded ${
                  selectedEvidence.party === 'worker'
                    ? 'bg-green-200 text-green-800'
                    : 'bg-blue-200 text-blue-800'
                }`}>
                  {selectedEvidence.party === 'worker' ? 'Worker' : 'Requester'}
                </span>
                <span className="text-sm text-slate-600">
                  {selectedEvidence.submitter.username || selectedEvidence.submitter.email}
                </span>
                <span className="text-xs text-slate-400 ml-auto">
                  {formatDate(selectedEvidence.created_at)}
                </span>
              </div>
              <p className="text-sm text-slate-700">{selectedEvidence.description}</p>
              <div className="flex items-center gap-4 text-xs text-slate-500">
                <span>{selectedEvidence.mime_type}</span>
                <span>{formatFileSize(selectedEvidence.size_bytes)}</span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
