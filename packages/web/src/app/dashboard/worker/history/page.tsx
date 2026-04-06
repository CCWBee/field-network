'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api';
import { useAuthStore } from '@/lib/store';
import PublicProfileCard from '@/components/PublicProfileCard';
import ReviewSubmitForm from '@/components/ReviewSubmitForm';
import { VerificationBreakdown } from '@/components/disputes/VerificationBreakdown';

interface VerificationCheck {
  check: string;
  passed: boolean;
  message: string;
  actual?: string | number;
  expected?: string | number;
}

interface SubmissionHistory {
  submission_id: string;
  task_id: string;
  task_title: string;
  bounty: { amount: number; currency: string };
  status: string;
  updated_at: string;
  requester?: {
    id: string;
    username: string | null;
    avatar_url: string | null;
    ens_name: string | null;
    stats?: {
      tasks_posted: number;
      reliability_score: number;
    } | null;
  };
}

interface VerificationData {
  score: number;
  checks: VerificationCheck[];
}

const statusColors: Record<string, string> = {
  draft: 'text-ink-500 border border-ink-200',
  uploading: 'text-signal-blue border border-signal-blue/30',
  finalised: 'text-purple-700 border border-purple-300',
  accepted: 'text-signal-green border border-signal-green/30',
  rejected: 'text-signal-red border border-signal-red/30',
  disputed: 'text-signal-amber border border-signal-amber/30',
};

export default function WorkerHistoryPage() {
  const { token } = useAuthStore();
  const [submissions, setSubmissions] = useState<SubmissionHistory[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [showReviewForm, setShowReviewForm] = useState<string | null>(null);
  const [reviewedRequesters, setReviewedRequesters] = useState<Set<string>>(new Set());
  const [expandedSubmission, setExpandedSubmission] = useState<string | null>(null);
  const [verificationData, setVerificationData] = useState<Record<string, VerificationData>>({});
  const [loadingVerification, setLoadingVerification] = useState<string | null>(null);

  useEffect(() => {
    fetchHistory();
  }, [token]);

  const fetchHistory = async () => {
    try {
      api.setToken(token);
      const result = await api.getWorkerStats();
      setSubmissions(result.recent_activity || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load history');
    } finally {
      setIsLoading(false);
    }
  };

  const handleReviewSuccess = (requesterId: string) => {
    setShowReviewForm(null);
    setReviewedRequesters(prev => new Set([...prev, requesterId]));
  };

  const toggleVerification = async (submissionId: string) => {
    if (expandedSubmission === submissionId) {
      setExpandedSubmission(null);
      return;
    }

    setExpandedSubmission(submissionId);

    // If we already have the data, don't fetch again
    if (verificationData[submissionId]) {
      return;
    }

    // Fetch verification details
    setLoadingVerification(submissionId);
    try {
      api.setToken(token);
      const result = await api.getSubmission(submissionId);
      if (result.verification_details && result.verification_score !== undefined) {
        setVerificationData(prev => ({
          ...prev,
          [submissionId]: {
            score: result.verification_score,
            checks: result.verification_details,
          },
        }));
      }
    } catch (err) {
      console.error('Failed to load verification details:', err);
    } finally {
      setLoadingVerification(null);
    }
  };

  return (
    <div>
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-2xl font-bold text-ink-900 tracking-tight">Submission History</h1>
          <p className="text-ink-500 mt-1">View your past submissions and leave reviews</p>
        </div>
        <Link
          href="/dashboard/worker"
          className="text-field-500 hover:text-field-600"
        >
          Browse Tasks
        </Link>
      </div>

      {error && (
        <div className="mb-6 p-4 border border-signal-red/30 rounded-sm">
          <p className="text-sm text-signal-red">{error}</p>
        </div>
      )}

      {isLoading ? (
        <div className="flex justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-field-500"></div>
        </div>
      ) : submissions.length === 0 ? (
        <div className="bg-paper rounded-sm p-12 text-center border border-ink-200">
          <p className="text-ink-500 mb-4">No submission history yet.</p>
          <Link
            href="/dashboard/worker"
            className="text-field-500 hover:text-field-600"
          >
            Browse available tasks
          </Link>
        </div>
      ) : (
        <div className="space-y-4">
          {submissions.map((submission) => (
            <div key={submission.submission_id} className="bg-paper rounded-sm border border-ink-200 overflow-hidden">
              <div className="p-6">
                <div className="flex justify-between items-start mb-4">
                  <div>
                    <Link
                      href={`/dashboard/worker/submit/${submission.task_id}`}
                      className="text-lg font-medium text-ink-900 hover:text-field-500"
                    >
                      {submission.task_title}
                    </Link>
                    <div className="flex items-center gap-3 mt-2">
                      <span className={`px-2 py-1 text-xs rounded-sm ${statusColors[submission.status] || 'text-ink-500 border border-ink-200'}`}>
                        {submission.status}
                      </span>
                      <span className="text-sm text-ink-500">
                        {new Date(submission.updated_at).toLocaleDateString()}
                      </span>
                    </div>
                  </div>
                  <span className="text-lg font-bold font-mono tabular-nums text-signal-green">
                    {submission.bounty.currency} {submission.bounty.amount.toFixed(2)}
                  </span>
                </div>

                {/* Verification Score Toggle */}
                {(submission.status === 'finalised' || submission.status === 'accepted' || submission.status === 'rejected') && (
                  <div className="mb-4">
                    <button
                      onClick={() => toggleVerification(submission.submission_id)}
                      className="flex items-center gap-2 text-sm text-ink-700 hover:text-ink-900"
                    >
                      <svg
                        className={`w-4 h-4 transition-transform ${expandedSubmission === submission.submission_id ? 'rotate-90' : ''}`}
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                      </svg>
                      View Verification Details
                    </button>

                    {expandedSubmission === submission.submission_id && (
                      <div className="mt-3">
                        {loadingVerification === submission.submission_id ? (
                          <div className="flex items-center justify-center py-4">
                            <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-field-500"></div>
                            <span className="ml-2 text-sm text-ink-500">Loading verification details...</span>
                          </div>
                        ) : verificationData[submission.submission_id] ? (
                          <VerificationBreakdown
                            checks={verificationData[submission.submission_id].checks}
                            score={verificationData[submission.submission_id].score}
                          />
                        ) : (
                          <p className="text-sm text-ink-500 py-2">
                            No verification data available for this submission.
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                )}

                {/* Requester Profile */}
                {submission.requester && (
                  <div className="mb-4 -mx-2">
                    <PublicProfileCard
                      user={{
                        id: submission.requester.id,
                        username: submission.requester.username,
                        avatar_url: submission.requester.avatar_url,
                        ens_name: submission.requester.ens_name,
                        stats: submission.requester.stats ? {
                          reliability_score: submission.requester.stats.reliability_score,
                          tasks_completed: submission.requester.stats.tasks_posted,
                        } : undefined,
                      }}
                      size="sm"
                      showRating={false}
                      showBadges={false}
                      showStats={true}
                    />
                  </div>
                )}

                {/* Review Section for Accepted Submissions */}
                {submission.status === 'accepted' && submission.requester && !reviewedRequesters.has(submission.requester.id) && (
                  <div className="mt-4 pt-4 border-t border-ink-100">
                    {showReviewForm === submission.requester.id ? (
                      <ReviewSubmitForm
                        userId={submission.requester.id}
                        username={submission.requester.username}
                        taskId={submission.task_id}
                        role="worker"
                        onSuccess={() => handleReviewSuccess(submission.requester!.id)}
                        onCancel={() => setShowReviewForm(null)}
                      />
                    ) : (
                      <button
                        onClick={() => setShowReviewForm(submission.requester!.id)}
                        className="w-full py-2 px-4 border border-ink-200 text-field-500 rounded-sm hover:bg-ink-50 transition-colors text-sm"
                      >
                        Leave a review for {submission.requester.username || 'this requester'}
                      </button>
                    )}
                  </div>
                )}
                {submission.status === 'accepted' && submission.requester && reviewedRequesters.has(submission.requester.id) && (
                  <div className="mt-4 pt-4 border-t border-ink-100 text-sm text-signal-green flex items-center gap-2">
                    <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                    </svg>
                    Review submitted
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
