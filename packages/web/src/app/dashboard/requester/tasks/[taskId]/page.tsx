'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import { api } from '@/lib/api';
import { useAuthStore } from '@/lib/store';
import PublicProfileCard from '@/components/PublicProfileCard';
import ReviewSubmitForm from '@/components/ReviewSubmitForm';

// Dynamic import for TaskDetailMap to avoid SSR issues with Leaflet
const TaskDetailMap = dynamic(() => import('@/components/TaskDetailMap'), { ssr: false });

const statusColors: Record<string, string> = {
  draft: 'bg-slate-100 text-slate-800',
  posted: 'bg-blue-100 text-blue-800',
  claimed: 'bg-yellow-100 text-yellow-800',
  submitted: 'bg-purple-100 text-purple-800',
  accepted: 'bg-green-100 text-green-800',
  disputed: 'bg-red-100 text-red-800',
  cancelled: 'bg-slate-100 text-slate-500',
  expired: 'bg-slate-100 text-slate-500',
  finalised: 'bg-purple-100 text-purple-800',
  rejected: 'bg-red-100 text-red-800',
};

export default function TaskDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { token } = useAuthStore();
  const [task, setTask] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState('');
  const [showReviewForm, setShowReviewForm] = useState<string | null>(null); // worker ID to review
  const [reviewedWorkers, setReviewedWorkers] = useState<Set<string>>(new Set());

  useEffect(() => {
    const fetchTask = async () => {
      try {
        api.setToken(token);
        const data = await api.getTask(params.taskId as string);
        setTask(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load task');
      } finally {
        setIsLoading(false);
      }
    };

    if (token && params.taskId) {
      fetchTask();
    }
  }, [token, params.taskId]);

  const handlePublish = async () => {
    setActionLoading(true);
    try {
      api.setToken(token);
      await api.publishTask(task.id);
      const updated = await api.getTask(task.id);
      setTask(updated);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to publish');
    } finally {
      setActionLoading(false);
    }
  };

  const handleCancel = async () => {
    if (!confirm('Are you sure you want to cancel this task?')) return;
    setActionLoading(true);
    try {
      api.setToken(token);
      await api.cancelTask(task.id);
      router.push('/dashboard/requester');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to cancel');
      setActionLoading(false);
    }
  };

  const handleAcceptSubmission = async (submissionId: string) => {
    setActionLoading(true);
    try {
      api.setToken(token);
      await api.acceptSubmission(submissionId);
      const updated = await api.getTask(task.id);
      setTask(updated);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to accept');
    } finally {
      setActionLoading(false);
    }
  };

  const handleRejectSubmission = async (submissionId: string) => {
    const reason = prompt('Rejection reason (required):');
    if (!reason) return;
    setActionLoading(true);
    try {
      api.setToken(token);
      await api.rejectSubmission(submissionId, 'other', reason);
      const updated = await api.getTask(task.id);
      setTask(updated);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to reject');
    } finally {
      setActionLoading(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (!task) {
    return (
      <div className="text-center py-12">
        <p className="text-slate-500">{error || 'Task not found'}</p>
        <Link href="/dashboard/requester" className="text-field-600 hover:text-field-500 mt-4 inline-block">
          Back to tasks
        </Link>
      </div>
    );
  }

  return (
    <div>
      <div className="flex justify-between items-start mb-8">
        <div>
          <Link href="/dashboard/requester" className="text-sm text-slate-500 hover:text-slate-700 mb-2 inline-block">
            &larr; Back to tasks
          </Link>
          <h1 className="text-2xl font-bold text-slate-900">{task.title}</h1>
          <div className="flex items-center mt-2 space-x-3">
            <span className={`px-2 py-1 text-xs rounded-full ${statusColors[task.status]}`}>
              {task.status}
            </span>
            <span className="text-sm text-slate-500">{task.template}</span>
          </div>
        </div>
        <div className="space-x-2">
          {task.status === 'draft' && (
            <button
              onClick={handlePublish}
              disabled={actionLoading}
              className="px-4 py-2 bg-field-500 text-white rounded-md hover:bg-field-600 disabled:opacity-50"
            >
              Publish
            </button>
          )}
          {['draft', 'posted', 'claimed'].includes(task.status) && (
            <button
              onClick={handleCancel}
              disabled={actionLoading}
              className="px-4 py-2 border border-red-300 text-red-600 rounded-md hover:bg-red-50 disabled:opacity-50"
            >
              Cancel
            </button>
          )}
        </div>
      </div>

      {error && (
        <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-md">
          <p className="text-sm text-red-600">{error}</p>
        </div>
      )}

      <div className="grid grid-cols-3 gap-6">
        {/* Main Info */}
        <div className="col-span-2 space-y-6">
          <div className="glass rounded-lg border border-surface-200 p-6">
            <h2 className="text-lg font-medium text-slate-900 mb-4">Instructions</h2>
            <p className="text-slate-600 whitespace-pre-wrap">{task.instructions}</p>
          </div>

          <div className="glass rounded-lg border border-surface-200 p-6">
            <h2 className="text-lg font-medium text-slate-900 mb-4">Requirements</h2>
            <dl className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <dt className="text-slate-500">Photos Required</dt>
                <dd className="text-slate-900 font-medium">{task.requirements?.photos?.count || '-'}</dd>
              </div>
              <div>
                <dt className="text-slate-500">Min Resolution</dt>
                <dd className="text-slate-900">{task.requirements?.photos?.min_width_px}x{task.requirements?.photos?.min_height_px}</dd>
              </div>
              {task.requirements?.bearing?.required && (
                <>
                  <div>
                    <dt className="text-slate-500">Target Bearing</dt>
                    <dd className="text-slate-900">{task.requirements.bearing.target_deg}&deg;</dd>
                  </div>
                  <div>
                    <dt className="text-slate-500">Bearing Tolerance</dt>
                    <dd className="text-slate-900">&plusmn;{task.requirements.bearing.tolerance_deg}&deg;</dd>
                  </div>
                </>
              )}
            </dl>
          </div>

          {/* Submissions */}
          {task.submissions && task.submissions.length > 0 && (
            <div className="glass rounded-lg border border-surface-200 p-6">
              <h2 className="text-lg font-medium text-slate-900 mb-4">Submissions</h2>
              <div className="space-y-4">
                {task.submissions.map((sub: any) => (
                  <div key={sub.id} className="border rounded-lg p-4">
                    <div className="flex justify-between items-start mb-3">
                      <span className={`px-2 py-1 text-xs rounded-full ${statusColors[sub.status]}`}>
                        {sub.status}
                      </span>
                      {sub.status === 'finalised' && (
                        <div className="space-x-2">
                          <button
                            onClick={() => handleAcceptSubmission(sub.id)}
                            disabled={actionLoading}
                            className="px-3 py-1 bg-green-600 text-white text-sm rounded-md hover:bg-green-700 disabled:opacity-50"
                          >
                            Accept
                          </button>
                          <button
                            onClick={() => handleRejectSubmission(sub.id)}
                            disabled={actionLoading}
                            className="px-3 py-1 border border-red-300 text-red-600 text-sm rounded-md hover:bg-red-50 disabled:opacity-50"
                          >
                            Reject
                          </button>
                        </div>
                      )}
                    </div>

                    {/* Worker Profile Card */}
                    {sub.worker && (
                      <div className="mb-3">
                        <PublicProfileCard
                          user={{
                            id: sub.worker.id,
                            username: sub.worker.username,
                            avatar_url: sub.worker.avatar_url,
                            ens_name: sub.worker.ens_name,
                            stats: sub.worker.stats ? {
                              reliability_score: sub.worker.stats.reliability_score,
                              tasks_accepted: sub.worker.stats.tasks_accepted,
                            } : undefined,
                          }}
                          size="sm"
                          showRating={false}
                          showBadges={false}
                        />
                      </div>
                    )}

                    <div className="text-sm text-slate-500 space-y-1">
                      <p>{sub.artefacts?.length || 0} artefacts uploaded</p>
                      {sub.verificationScore !== undefined && (
                        <p>Verification score: {sub.verificationScore}%</p>
                      )}
                    </div>

                    {/* Review Section for Accepted Submissions */}
                    {sub.status === 'accepted' && sub.worker && !reviewedWorkers.has(sub.worker.id) && (
                      <div className="mt-4 pt-4 border-t border-surface-200">
                        {showReviewForm === sub.worker.id ? (
                          <ReviewSubmitForm
                            userId={sub.worker.id}
                            username={sub.worker.username}
                            taskId={task.id}
                            role="requester"
                            onSuccess={() => {
                              setShowReviewForm(null);
                              setReviewedWorkers(prev => new Set([...prev, sub.worker.id]));
                            }}
                            onCancel={() => setShowReviewForm(null)}
                          />
                        ) : (
                          <button
                            onClick={() => setShowReviewForm(sub.worker.id)}
                            className="w-full py-2 px-4 border border-field-300 text-field-600 rounded-lg hover:bg-field-50 transition-colors text-sm"
                          >
                            Leave a review for {sub.worker.username || 'this collector'}
                          </button>
                        )}
                      </div>
                    )}
                    {sub.status === 'accepted' && sub.worker && reviewedWorkers.has(sub.worker.id) && (
                      <div className="mt-4 pt-4 border-t border-surface-200 text-sm text-green-600 flex items-center gap-2">
                        <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                        </svg>
                        Review submitted
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          {/* Location Map */}
          {task.location && (
            <div className="glass rounded-lg border border-surface-200 overflow-hidden">
              <div className="p-4 border-b border-surface-200">
                <h2 className="text-lg font-medium text-slate-900">Location</h2>
                <p className="text-sm text-slate-500 mt-1">
                  {task.location?.lat?.toFixed(4)}, {task.location?.lon?.toFixed(4)} ({task.location?.radius_m}m radius)
                </p>
              </div>
              <TaskDetailMap
                taskLocation={{
                  lat: task.location.lat,
                  lon: task.location.lon,
                  radius_m: task.location.radius_m,
                }}
                submissions={task.submissions?.map((sub: any) => ({
                  id: sub.id,
                  status: sub.status,
                  location: sub.location || null,
                  artefacts: sub.artefacts,
                  createdAt: sub.created_at,
                })) || []}
                height="250px"
                showRadius={true}
                showSubmissionLines={true}
              />
              {task.submissions && task.submissions.length > 0 && (
                <div className="p-3 bg-slate-50 border-t border-surface-200">
                  <div className="flex items-center gap-4 text-xs">
                    <div className="flex items-center gap-1.5">
                      <div className="w-2.5 h-2.5 rounded-full bg-[#14b8a6]" />
                      <span className="text-slate-500">Task center</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <div className="w-2.5 h-2.5 rounded-full bg-[#6366f1]" />
                      <span className="text-slate-500">Submission</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <div className="w-2.5 h-2.5 rounded-full bg-[#22c55e]" />
                      <span className="text-slate-500">Accepted</span>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          <div className="glass rounded-lg border border-surface-200 p-6">
            <h2 className="text-lg font-medium text-slate-900 mb-4">Details</h2>
            <dl className="space-y-3 text-sm">
              <div>
                <dt className="text-slate-500">Bounty</dt>
                <dd className="text-xl font-bold text-slate-900">
                  {task.bounty?.currency} {task.bounty?.amount?.toFixed(2)}
                </dd>
              </div>
              <div>
                <dt className="text-slate-500">Time Window</dt>
                <dd className="text-slate-900">
                  {new Date(task.time_window?.start_iso).toLocaleString()}
                </dd>
                <dd className="text-slate-900">
                  to {new Date(task.time_window?.end_iso).toLocaleString()}
                </dd>
              </div>
              <div>
                <dt className="text-slate-500">Exclusivity</dt>
                <dd className="text-slate-900">{task.rights?.exclusivity_days} days</dd>
              </div>
            </dl>
          </div>

          {task.policy?.safety_notes && (
            <div className="bg-yellow-50 rounded-lg p-4">
              <h3 className="text-sm font-medium text-yellow-800 mb-2">Safety Notes</h3>
              <p className="text-sm text-yellow-700">{task.policy.safety_notes}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
