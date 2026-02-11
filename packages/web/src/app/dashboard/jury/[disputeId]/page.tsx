'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuthStore } from '@/lib/store';
import { EvidenceTimeline } from '@/components/disputes/EvidenceTimeline';
import { AutoScoreBreakdown } from '@/components/disputes/AutoScoreBreakdown';

interface Artefact {
  id: string;
  type: string;
  storage_key: string;
  sha256: string;
}

interface Evidence {
  id: string;
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

interface DisputeDetail {
  id: string;
  status: string;
  opened_at: string;
  evidence_deadline: string | null;
  evidence_deadline_passed: boolean;
  current_tier: number;
  tier2_deadline: string | null;
  auto_score_result: AutoScoreResult | null;
  evidence_count?: {
    total: number;
    worker: number;
    requester: number;
  };
  submission: {
    id: string;
    task_id: string;
    worker_id: string;
    status: string;
    verification_score: number;
    flags?: string[];
    task: {
      id: string;
      title: string;
      instructions: string;
      bounty_amount: number;
      currency: string;
      requirements: Record<string, any>;
    };
    artefacts: Artefact[];
  };
  evidence: Evidence[];
}

interface JuryStatus {
  totalJurors: number;
  votedCount: number;
  deadline: string | null;
  user_is_juror: boolean;
  user_has_voted: boolean;
  user_vote: string | null;
}

export default function JuryVotePage() {
  const params = useParams();
  const router = useRouter();
  const { token, user } = useAuthStore();
  const disputeId = params.disputeId as string;

  const [dispute, setDispute] = useState<DisputeDetail | null>(null);
  const [juryStatus, setJuryStatus] = useState<JuryStatus | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isVoting, setIsVoting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Voting form
  const [vote, setVote] = useState<'worker' | 'requester' | 'abstain' | null>(null);
  const [reason, setReason] = useState('');

  const loadDispute = useCallback(async () => {
    if (!token) return;

    setIsLoading(true);
    setError(null);

    try {
      const [disputeRes, juryRes] = await Promise.all([
        fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000'}/v1/disputes/${disputeId}`, {
          headers: { Authorization: `Bearer ${token}` },
        }),
        fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000'}/v1/disputes/${disputeId}/jury-status`, {
          headers: { Authorization: `Bearer ${token}` },
        }),
      ]);

      if (!disputeRes.ok || !juryRes.ok) {
        throw new Error('Failed to load dispute');
      }

      const [disputeData, juryData] = await Promise.all([
        disputeRes.json(),
        juryRes.json(),
      ]);

      setDispute(disputeData);
      setJuryStatus(juryData);

      if (juryData.user_vote) {
        setVote(juryData.user_vote);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setIsLoading(false);
    }
  }, [token, disputeId]);

  useEffect(() => {
    loadDispute();
  }, [loadDispute]);

  const handleVote = async () => {
    if (!vote) {
      setError('Please select a vote');
      return;
    }

    setIsVoting(true);
    setError(null);

    try {
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000'}/v1/disputes/${disputeId}/vote`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          vote,
          reason: reason || undefined,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to submit vote');
      }

      // Reload to show updated status
      await loadDispute();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to submit vote');
    } finally {
      setIsVoting(false);
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

  if (!dispute || !juryStatus) {
    return (
      <div className="text-center py-12">
        <h2 className="text-xl font-semibold text-ink-900 mb-2">Dispute Not Found</h2>
        <p className="text-ink-500 mb-4">{error || 'The dispute you are looking for does not exist.'}</p>
        <Link href="/dashboard/jury" className="text-field-500 hover:text-field-600 font-medium">
          Back to jury pool
        </Link>
      </div>
    );
  }

  if (!juryStatus.user_is_juror) {
    return (
      <div className="text-center py-12">
        <h2 className="text-xl font-semibold text-ink-900 mb-2">Not a Juror</h2>
        <p className="text-ink-500 mb-4">You are not a juror for this dispute.</p>
        <Link href="/dashboard/jury" className="text-field-500 hover:text-field-600 font-medium">
          Back to jury pool
        </Link>
      </div>
    );
  }

  const hasVoted = juryStatus.user_has_voted;

  return (
    <div className="max-w-4xl">
      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <Link href="/dashboard/jury" className="text-sm text-field-500 hover:text-field-600 mb-2 inline-block">
            &larr; Back to jury pool
          </Link>
          <h1 className="text-2xl font-bold text-ink-900 tracking-tight mb-1">Jury Vote</h1>
          <p className="text-ink-500">{dispute.submission.task.title}</p>
        </div>
        <div className="text-right">
          <div className="text-lg font-semibold font-mono tabular-nums text-ink-900">
            {formatCurrency(dispute.submission.task.bounty_amount, dispute.submission.task.currency)}
          </div>
          <div className="text-xs text-ink-300">at stake</div>
        </div>
      </div>

      {error && (
        <div className="mb-6 p-4 rounded-sm border border-signal-red/30 text-signal-red">
          {error}
        </div>
      )}

      {/* Deadline Banner */}
      {juryStatus.deadline && (
        <div className={`mb-6 p-4 rounded-sm border ${
          new Date(juryStatus.deadline) < new Date()
            ? 'border-signal-red/30 bg-signal-red/5'
            : new Date(juryStatus.deadline) < new Date(Date.now() + 6 * 60 * 60 * 1000)
            ? 'border-signal-amber/30 bg-signal-amber/5'
            : 'border-signal-blue/30 bg-signal-blue/5'
        }`}>
          <div className="flex items-center justify-between">
            <span className={`text-sm font-medium ${
              new Date(juryStatus.deadline) < new Date()
                ? 'text-signal-red'
                : new Date(juryStatus.deadline) < new Date(Date.now() + 6 * 60 * 60 * 1000)
                ? 'text-signal-amber'
                : 'text-signal-blue'
            }`}>
              Voting Deadline: {formatDate(juryStatus.deadline)}
            </span>
            <span className={`text-sm ${
              new Date(juryStatus.deadline) < new Date()
                ? 'text-signal-red'
                : new Date(juryStatus.deadline) < new Date(Date.now() + 6 * 60 * 60 * 1000)
                ? 'text-signal-amber'
                : 'text-signal-blue'
            }`}>
              {getTimeRemaining(juryStatus.deadline)}
            </span>
          </div>
        </div>
      )}

      {/* Voting Progress */}
      <div className="bg-paper rounded-sm border border-ink-200 p-4 mb-6">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-xs uppercase tracking-wider text-ink-500 font-medium">Voting Progress</h3>
          <span className="text-sm text-ink-500 font-mono tabular-nums">
            {juryStatus.votedCount} of {juryStatus.totalJurors} votes
          </span>
        </div>
        <div className="w-full bg-ink-200 rounded-sm h-2">
          <div
            className="bg-field-500 h-2 rounded-sm transition-all"
            style={{ width: `${(juryStatus.votedCount / juryStatus.totalJurors) * 100}%` }}
          ></div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Task & Submission Details */}
        <div className="space-y-6">
          {/* Task Requirements */}
          <div className="bg-paper rounded-sm border border-ink-200 p-4">
            <h3 className="text-xs uppercase tracking-wider text-ink-500 font-medium mb-3">Task Requirements</h3>
            <p className="text-sm text-ink-700 whitespace-pre-wrap mb-3">
              {dispute.submission.task.instructions}
            </p>
            <div className="text-xs text-ink-500">
              Verification Score: {' '}
              <span className={`font-medium font-mono tabular-nums ${
                dispute.submission.verification_score >= 80 ? 'text-signal-green' :
                dispute.submission.verification_score >= 50 ? 'text-signal-amber' : 'text-signal-red'
              }`}>
                {dispute.submission.verification_score}%
              </span>
            </div>
          </div>

          {/* Artefacts */}
          <div className="bg-paper rounded-sm border border-ink-200 p-4">
            <h3 className="text-xs uppercase tracking-wider text-ink-500 font-medium mb-3">
              Submitted Artefacts ({dispute.submission.artefacts.length})
            </h3>
            <div className="grid grid-cols-3 gap-2">
              {dispute.submission.artefacts.map((artefact) => (
                <div
                  key={artefact.id}
                  className="aspect-square bg-ink-50 rounded-sm flex items-center justify-center border border-ink-200"
                >
                  <svg className="w-6 h-6 text-ink-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                </div>
              ))}
            </div>
          </div>

          {/* Tier 1 Auto Score (if available) */}
          {dispute.auto_score_result && (
            <AutoScoreBreakdown autoScoreResult={dispute.auto_score_result} />
          )}

          {/* Evidence Timeline */}
          <EvidenceTimeline
            evidence={dispute.evidence || []}
            evidenceDeadline={dispute.evidence_deadline}
            evidenceDeadlinePassed={dispute.evidence_deadline_passed}
            evidenceCount={dispute.evidence_count}
          />
        </div>

        {/* Voting Panel */}
        <div>
          <div className="bg-paper rounded-sm border border-ink-200 p-6 sticky top-6">
            <h3 className="text-lg font-semibold text-ink-900 mb-4">
              {hasVoted ? 'Your Vote' : 'Cast Your Vote'}
            </h3>

            {hasVoted ? (
              <div className="text-center py-6">
                <div className={`inline-flex items-center justify-center w-16 h-16 rounded-sm mb-3 border ${
                  juryStatus.user_vote === 'worker'
                    ? 'border-signal-green/30 bg-signal-green/10'
                    : juryStatus.user_vote === 'requester'
                    ? 'border-signal-blue/30 bg-signal-blue/10'
                    : 'border-ink-200 bg-ink-50'
                }`}>
                  <svg className={`w-8 h-8 ${
                    juryStatus.user_vote === 'worker'
                      ? 'text-signal-green'
                      : juryStatus.user_vote === 'requester'
                      ? 'text-signal-blue'
                      : 'text-ink-500'
                  }`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                </div>
                <p className="text-lg font-medium text-ink-900 mb-1">
                  Vote Submitted
                </p>
                <p className={`text-sm font-medium ${
                  juryStatus.user_vote === 'worker'
                    ? 'text-signal-green'
                    : juryStatus.user_vote === 'requester'
                    ? 'text-signal-blue'
                    : 'text-ink-500'
                }`}>
                  {juryStatus.user_vote === 'worker'
                    ? 'Voted for Worker'
                    : juryStatus.user_vote === 'requester'
                    ? 'Voted for Requester'
                    : 'Abstained'}
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                {/* Vote Options */}
                <div className="space-y-2">
                  <button
                    type="button"
                    onClick={() => setVote('worker')}
                    className={`w-full p-4 border-2 rounded-sm text-left transition-colors ${
                      vote === 'worker'
                        ? 'border-signal-green bg-signal-green/5'
                        : 'border-ink-200 hover:border-ink-300'
                    }`}
                  >
                    <div className="font-medium text-ink-900">Worker Wins</div>
                    <div className="text-xs text-ink-500 mt-1">
                      The submission meets task requirements
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => setVote('requester')}
                    className={`w-full p-4 border-2 rounded-sm text-left transition-colors ${
                      vote === 'requester'
                        ? 'border-signal-blue bg-signal-blue/5'
                        : 'border-ink-200 hover:border-ink-300'
                    }`}
                  >
                    <div className="font-medium text-ink-900">Requester Wins</div>
                    <div className="text-xs text-ink-500 mt-1">
                      The submission does not meet requirements
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => setVote('abstain')}
                    className={`w-full p-4 border-2 rounded-sm text-left transition-colors ${
                      vote === 'abstain'
                        ? 'border-ink-500 bg-ink-50'
                        : 'border-ink-200 hover:border-ink-300'
                    }`}
                  >
                    <div className="font-medium text-ink-900">Abstain</div>
                    <div className="text-xs text-ink-500 mt-1">
                      Conflict of interest or insufficient information
                    </div>
                  </button>
                </div>

                {/* Reason (optional) */}
                <div>
                  <label className="block text-xs uppercase tracking-wider text-ink-500 mb-2">
                    Reason (optional)
                  </label>
                  <textarea
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    rows={3}
                    placeholder="Explain your reasoning..."
                    className="w-full px-4 py-3 border border-ink-200 rounded-sm bg-paper text-ink-900 text-sm focus:outline-none focus:ring-2 focus:ring-field-500 focus:border-transparent"
                  />
                </div>

                {/* Submit Button */}
                <button
                  onClick={handleVote}
                  disabled={!vote || isVoting}
                  className="w-full py-3 bg-field-500 text-white rounded-sm font-medium hover:bg-field-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {isVoting ? (
                    <span className="flex items-center justify-center gap-2">
                      <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                      Submitting...
                    </span>
                  ) : (
                    'Submit Vote'
                  )}
                </button>

                <p className="text-xs text-ink-300 text-center">
                  Your vote cannot be changed after submission
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
