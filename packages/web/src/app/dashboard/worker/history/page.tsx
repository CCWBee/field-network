'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api';
import { useAuthStore } from '@/lib/store';
import PublicProfileCard from '@/components/PublicProfileCard';
import ReviewSubmitForm from '@/components/ReviewSubmitForm';

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

const statusColors: Record<string, string> = {
  draft: 'bg-slate-100 text-slate-600',
  uploading: 'bg-blue-100 text-blue-700',
  finalised: 'bg-purple-100 text-purple-700',
  accepted: 'bg-green-100 text-green-700',
  rejected: 'bg-red-100 text-red-700',
  disputed: 'bg-yellow-100 text-yellow-700',
};

export default function WorkerHistoryPage() {
  const { token } = useAuthStore();
  const [submissions, setSubmissions] = useState<SubmissionHistory[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [showReviewForm, setShowReviewForm] = useState<string | null>(null);
  const [reviewedRequesters, setReviewedRequesters] = useState<Set<string>>(new Set());

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

  return (
    <div>
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Submission History</h1>
          <p className="text-slate-500 mt-1">View your past submissions and leave reviews</p>
        </div>
        <Link
          href="/dashboard/worker"
          className="text-field-600 hover:text-field-500"
        >
          Browse Tasks
        </Link>
      </div>

      {error && (
        <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-md">
          <p className="text-sm text-red-600">{error}</p>
        </div>
      )}

      {isLoading ? (
        <div className="flex justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-field-500"></div>
        </div>
      ) : submissions.length === 0 ? (
        <div className="glass rounded-lg p-12 text-center border border-surface-200">
          <p className="text-slate-500 mb-4">No submission history yet.</p>
          <Link
            href="/dashboard/worker"
            className="text-field-600 hover:text-field-500"
          >
            Browse available tasks
          </Link>
        </div>
      ) : (
        <div className="space-y-4">
          {submissions.map((submission) => (
            <div key={submission.submission_id} className="glass rounded-lg border border-surface-200 overflow-hidden">
              <div className="p-6">
                <div className="flex justify-between items-start mb-4">
                  <div>
                    <Link
                      href={`/dashboard/worker/submit/${submission.task_id}`}
                      className="text-lg font-medium text-slate-800 hover:text-field-600"
                    >
                      {submission.task_title}
                    </Link>
                    <div className="flex items-center gap-3 mt-2">
                      <span className={`px-2 py-1 text-xs rounded-full ${statusColors[submission.status] || 'bg-slate-100 text-slate-600'}`}>
                        {submission.status}
                      </span>
                      <span className="text-sm text-slate-500">
                        {new Date(submission.updated_at).toLocaleDateString()}
                      </span>
                    </div>
                  </div>
                  <span className="text-lg font-bold text-green-600">
                    {submission.bounty.currency} {submission.bounty.amount.toFixed(2)}
                  </span>
                </div>

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
                  <div className="mt-4 pt-4 border-t border-surface-200">
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
                        className="w-full py-2 px-4 border border-field-300 text-field-600 rounded-lg hover:bg-field-50 transition-colors text-sm"
                      >
                        Leave a review for {submission.requester.username || 'this requester'}
                      </button>
                    )}
                  </div>
                )}
                {submission.status === 'accepted' && submission.requester && reviewedRequesters.has(submission.requester.id) && (
                  <div className="mt-4 pt-4 border-t border-surface-200 text-sm text-green-600 flex items-center gap-2">
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
