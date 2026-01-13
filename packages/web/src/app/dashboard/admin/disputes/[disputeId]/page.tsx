'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuthStore } from '@/lib/store';

interface DisputeDetail {
  id: string;
  status: string;
  resolution_type: string | null;
  resolution_comment: string | null;
  opened_at: string;
  resolved_at: string | null;
  submission: {
    id: string;
    status: string;
    proof_bundle_hash: string | null;
    verification_score: number;
    task: {
      id: string;
      title: string;
      instructions: string;
      bounty_amount: number;
      currency: string;
      requirements: any;
    };
    artefacts: Array<{
      id: string;
      type: string;
      storage_key: string;
      sha256: string;
    }>;
    decisions: Array<{
      id: string;
      type: string;
      reason_code: string | null;
      comment: string | null;
      created_at: string;
    }>;
  };
}

export default function DisputeDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { token, user } = useAuthStore();

  const [dispute, setDispute] = useState<DisputeDetail | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isResolving, setIsResolving] = useState(false);
  const [error, setError] = useState('');

  // Resolution form
  const [resolutionType, setResolutionType] = useState<string>('accept_pay');
  const [payoutPercent, setPayoutPercent] = useState('100');
  const [comment, setComment] = useState('');

  useEffect(() => {
    if (user && user.role !== 'admin') {
      router.push('/dashboard');
      return;
    }

    if (token) {
      loadDispute();
    }
  }, [token, user]);

  const loadDispute = async () => {
    try {
      const result = await fetch(`http://localhost:3000/v1/disputes/${params.disputeId}`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      if (!result.ok) throw new Error('Failed to load dispute');
      const data = await result.json();
      setDispute(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load dispute');
    } finally {
      setIsLoading(false);
    }
  };

  const handleResolve = async () => {
    if (!comment.trim()) {
      setError('Please provide a resolution comment');
      return;
    }

    setIsResolving(true);
    setError('');

    try {
      const result = await fetch(`http://localhost:3000/v1/disputes/${params.disputeId}/resolve`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          resolution_type: resolutionType,
          worker_payout_percent: parseInt(payoutPercent),
          comment,
        }),
      });

      if (!result.ok) {
        const data = await result.json();
        throw new Error(data.error || 'Failed to resolve dispute');
      }

      router.push('/dashboard/admin/disputes');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to resolve dispute');
    } finally {
      setIsResolving(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (!dispute) {
    return (
      <div className="text-center py-12">
        <p className="text-slate-500">{error || 'Dispute not found'}</p>
        <Link href="/dashboard/admin/disputes" className="text-field-600 hover:text-field-500 mt-4 inline-block">
          Back to disputes
        </Link>
      </div>
    );
  }

  const isResolved = dispute.status === 'resolved';

  return (
    <div className="max-w-4xl mx-auto">
      <Link href="/dashboard/admin/disputes" className="text-sm text-slate-500 hover:text-slate-700 mb-4 inline-block">
        &larr; Back to disputes
      </Link>

      <div className="flex justify-between items-start mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Dispute Resolution</h1>
          <p className="text-slate-500 mt-1">
            {dispute.submission.task.title}
          </p>
        </div>
        <span className={`px-3 py-1 rounded-full text-sm ${
          isResolved ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'
        }`}>
          {dispute.status}
        </span>
      </div>

      {error && (
        <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-md">
          <p className="text-sm text-red-600">{error}</p>
        </div>
      )}

      {/* Task Details */}
      <div className="glass rounded-lg border border-surface-200 p-6 mb-6">
        <h2 className="text-lg font-medium text-slate-900 mb-4">Task Details</h2>
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <span className="text-slate-500">Task ID:</span>
            <span className="ml-2 font-mono">{dispute.submission.task.id.slice(0, 8)}...</span>
          </div>
          <div>
            <span className="text-slate-500">Bounty:</span>
            <span className="ml-2 font-medium text-green-600">
              {dispute.submission.task.currency} {dispute.submission.task.bounty_amount.toFixed(2)}
            </span>
          </div>
        </div>
        <div className="mt-4">
          <span className="text-slate-500 text-sm">Instructions:</span>
          <p className="mt-1 text-slate-700 whitespace-pre-wrap">{dispute.submission.task.instructions}</p>
        </div>
      </div>

      {/* Submission Details */}
      <div className="glass rounded-lg border border-surface-200 p-6 mb-6">
        <h2 className="text-lg font-medium text-slate-900 mb-4">Submission</h2>
        <div className="grid grid-cols-2 gap-4 text-sm mb-4">
          <div>
            <span className="text-slate-500">Verification Score:</span>
            <span className="ml-2 font-medium">{dispute.submission.verification_score}%</span>
          </div>
          <div>
            <span className="text-slate-500">Artefacts:</span>
            <span className="ml-2">{dispute.submission.artefacts.length} file(s)</span>
          </div>
        </div>

        {/* Previous Decisions */}
        {dispute.submission.decisions.length > 0 && (
          <div className="mt-4 border-t pt-4">
            <h3 className="text-sm font-medium text-slate-700 mb-2">Previous Decisions</h3>
            {dispute.submission.decisions.map((decision) => (
              <div key={decision.id} className="p-3 bg-slate-50 rounded mb-2">
                <div className="flex justify-between">
                  <span className={`text-sm font-medium ${
                    decision.type === 'accept' ? 'text-green-600' : 'text-red-600'
                  }`}>
                    {decision.type.toUpperCase()}
                  </span>
                  <span className="text-xs text-slate-400">
                    {new Date(decision.created_at).toLocaleString()}
                  </span>
                </div>
                {decision.reason_code && (
                  <div className="text-sm text-slate-500 mt-1">Reason: {decision.reason_code}</div>
                )}
                {decision.comment && (
                  <div className="text-sm text-slate-600 mt-1">{decision.comment}</div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Resolution Form */}
      {!isResolved && (
        <div className="glass rounded-lg border border-surface-200 p-6">
          <h2 className="text-lg font-medium text-slate-900 mb-4">Resolve Dispute</h2>

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">Resolution</label>
              <div className="grid grid-cols-2 gap-3">
                {[
                  { value: 'accept_pay', label: 'Accept & Pay Worker', desc: 'Full payment to worker' },
                  { value: 'partial_pay', label: 'Partial Payment', desc: 'Split payment' },
                  { value: 'reject_refund', label: 'Reject & Refund', desc: 'Full refund to requester' },
                  { value: 'strike', label: 'Reject + Strike', desc: 'Refund + strike to worker' },
                ].map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => setResolutionType(option.value)}
                    className={`p-3 border rounded-lg text-left ${
                      resolutionType === option.value
                        ? 'border-field-500 bg-field-50'
                        : 'border-surface-300 hover:border-slate-400'
                    }`}
                  >
                    <div className="font-medium text-sm">{option.label}</div>
                    <div className="text-xs text-slate-500">{option.desc}</div>
                  </button>
                ))}
              </div>
            </div>

            {resolutionType === 'partial_pay' && (
              <div>
                <label className="block text-sm font-medium text-slate-700">Worker Payout %</label>
                <input
                  type="number"
                  min="0"
                  max="100"
                  value={payoutPercent}
                  onChange={(e) => setPayoutPercent(e.target.value)}
                  className="mt-1 block w-32 px-3 py-2 border border-surface-300 rounded-md"
                />
              </div>
            )}

            <div>
              <label className="block text-sm font-medium text-slate-700">Resolution Comment</label>
              <textarea
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                rows={3}
                placeholder="Explain your decision..."
                className="mt-1 block w-full px-3 py-2 border border-surface-300 rounded-md"
              />
            </div>

            <button
              onClick={handleResolve}
              disabled={isResolving}
              className="w-full py-2 bg-field-500 text-white rounded-md hover:bg-field-600 disabled:opacity-50"
            >
              {isResolving ? 'Resolving...' : 'Resolve Dispute'}
            </button>
          </div>
        </div>
      )}

      {/* Resolution Info */}
      {isResolved && dispute.resolution_type && (
        <div className="bg-green-50 rounded-lg p-6">
          <h2 className="text-lg font-medium text-green-800 mb-2">Resolution</h2>
          <div className="text-sm text-green-700">
            <p><strong>Type:</strong> {dispute.resolution_type}</p>
            {dispute.resolution_comment && (
              <p className="mt-2"><strong>Comment:</strong> {dispute.resolution_comment}</p>
            )}
            <p className="mt-2 text-green-600">
              Resolved on {new Date(dispute.resolved_at!).toLocaleString()}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
