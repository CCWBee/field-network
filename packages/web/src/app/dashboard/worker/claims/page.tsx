'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api';
import { useAuthStore } from '@/lib/store';

export default function WorkerClaimsPage() {
  const { token } = useAuthStore();
  const [claims, setClaims] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    fetchClaims();
  }, [token]);

  const fetchClaims = async () => {
    try {
      api.setToken(token);
      const result = await api.getMyClaims();
      setClaims(result.claims);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load claims');
    } finally {
      setIsLoading(false);
    }
  };

  const handleUnclaim = async (taskId: string) => {
    if (!confirm('Are you sure you want to release this claim?')) return;
    setActionLoading(taskId);
    try {
      api.setToken(token);
      await api.unclaimTask(taskId);
      await fetchClaims();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to unclaim');
    } finally {
      setActionLoading(null);
    }
  };

  const formatTimeRemaining = (ms: number) => {
    if (ms <= 0) return 'Expired';
    const hours = Math.floor(ms / (1000 * 60 * 60));
    const minutes = Math.floor((ms % (1000 * 60 * 60)) / (1000 * 60));
    return `${hours}h ${minutes}m remaining`;
  };

  return (
    <div>
      <div className="flex justify-between items-center mb-8">
        <h1 className="text-2xl font-bold text-slate-800">My Claims</h1>
        <Link
          href="/dashboard/worker"
          className="text-field-600 hover:text-field-500"
        >
          &larr; Browse Tasks
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
      ) : claims.length === 0 ? (
        <div className="glass rounded-lg p-12 text-center border border-surface-200">
          <p className="text-slate-500 mb-4">You don't have any active claims.</p>
          <Link
            href="/dashboard/worker"
            className="text-field-600 hover:text-field-500"
          >
            Browse available tasks
          </Link>
        </div>
      ) : (
        <div className="space-y-6">
          {claims.map((claim) => (
            <div key={claim.id} className="glass rounded-lg p-6 border border-surface-200">
              <div className="flex justify-between items-start">
                <div className="flex-1">
                  <h3 className="text-lg font-medium text-slate-800">{claim.task.title}</h3>
                  <div className="mt-2 space-y-1 text-sm text-slate-500">
                    <p>
                      <span className="font-medium text-green-600">
                        {claim.task.currency} {claim.task.bountyAmount?.toFixed(2)}
                      </span>
                    </p>
                    <p>
                      Location: {claim.task.locationLat?.toFixed(4)}, {claim.task.locationLon?.toFixed(4)}
                      ({claim.task.radiusM}m radius)
                    </p>
                    <p>
                      Deadline: {new Date(claim.task.timeEnd).toLocaleString()}
                    </p>
                  </div>
                </div>
                <div className="text-right">
                  <div className={`text-sm font-medium ${claim.time_remaining_ms > 0 ? 'text-yellow-600' : 'text-red-600'}`}>
                    {formatTimeRemaining(claim.time_remaining_ms)}
                  </div>
                  <div className="text-xs text-slate-400 mt-1">
                    Claimed: {new Date(claim.claimed_at).toLocaleString()}
                  </div>
                </div>
              </div>

              <div className="mt-6 flex justify-end space-x-3">
                <button
                  onClick={() => handleUnclaim(claim.task_id)}
                  disabled={actionLoading === claim.task_id}
                  className="px-4 py-2 border border-surface-300 text-slate-700 rounded-md hover:bg-slate-50 disabled:opacity-50"
                >
                  Release Claim
                </button>
                <Link
                  href={`/dashboard/worker/submit/${claim.task_id}`}
                  className="px-4 py-2 bg-field-500 text-white rounded-md hover:bg-field-600"
                >
                  Submit Photos
                </Link>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
