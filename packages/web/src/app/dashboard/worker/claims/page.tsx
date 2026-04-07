'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api';
import { useAuthStore } from '@/lib/store';
import { useToast, ConfirmDialog } from '@/components/ui';

export default function WorkerClaimsPage() {
  const { token } = useAuthStore();
  const toast = useToast();
  const [claims, setClaims] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [, setTick] = useState(0);
  const [confirmReleaseId, setConfirmReleaseId] = useState<string | null>(null);

  useEffect(() => {
    fetchClaims();
  }, [token]);

  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, []);

  const directionsUrl = (lat: number, lon: number) =>
    `https://www.google.com/maps/dir/?api=1&destination=${lat},${lon}`;

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

  const handleUnclaim = async () => {
    const taskId = confirmReleaseId;
    if (!taskId) return;
    setActionLoading(taskId);
    try {
      api.setToken(token);
      await api.unclaimTask(taskId);
      await fetchClaims();
      toast.success('Claim released');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to unclaim';
      setError(message);
      toast.error('Failed to release claim', message);
    } finally {
      setActionLoading(null);
      setConfirmReleaseId(null);
    }
  };

  const formatTimeRemaining = (ms: number) => {
    if (ms <= 0) return 'EXPIRED';
    const totalSeconds = Math.floor(ms / 1000);
    const days = Math.floor(totalSeconds / 86400);
    const hours = Math.floor((totalSeconds % 86400) / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    if (ms >= 4 * 60 * 60 * 1000) {
      if (days > 0) return `${days}d ${hours}h`;
      return `${hours}h ${minutes}m`;
    }
    return `${hours}h ${minutes}m ${seconds}s`;
  };

  const getDeadlineMs = (claim: any) => {
    // Prefer claim_expires_at if present, else fall back to claimed_at + 4hr, else server-provided time_remaining_ms
    if (claim.claim_expires_at) {
      return new Date(claim.claim_expires_at).getTime();
    }
    if (claim.claimed_at) {
      return new Date(claim.claimed_at).getTime() + 4 * 60 * 60 * 1000;
    }
    return Date.now() + (claim.time_remaining_ms ?? 0);
  };

  return (
    <div>
      <div className="flex justify-between items-center mb-8">
        <h1 className="text-2xl font-bold text-ink-900 tracking-tight">My Claims</h1>
        <Link
          href="/dashboard/worker"
          className="text-field-500 hover:text-field-600"
        >
          &larr; Browse Tasks
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
      ) : claims.length === 0 ? (
        <div className="bg-paper rounded-sm p-12 text-center border border-ink-200">
          <p className="text-ink-500 mb-4">You don't have any active claims.</p>
          <Link
            href="/dashboard/worker"
            className="text-field-500 hover:text-field-600"
          >
            Browse available tasks
          </Link>
        </div>
      ) : (
        <div className="space-y-6">
          {claims.map((claim) => {
            const deadlineMs = getDeadlineMs(claim);
            const remaining = deadlineMs - Date.now();
            const expired = remaining <= 0;
            const under15 = remaining > 0 && remaining < 15 * 60 * 1000;
            const under1h = remaining > 0 && remaining < 60 * 60 * 1000;
            const urgencyClass = expired
              ? 'text-signal-red'
              : under15
              ? 'text-signal-red animate-pulse'
              : under1h
              ? 'text-signal-amber'
              : 'text-signal-green';

            return (
            <div key={claim.id} className="bg-paper rounded-sm p-6 border border-ink-200">
              <div className="flex justify-between items-start">
                <div className="flex-1">
                  <h3 className="text-lg font-medium text-ink-900">{claim.task.title}</h3>
                  <div className="mt-2 space-y-1 text-sm text-ink-500">
                    <p>
                      <span className="font-medium text-signal-green">
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
                  {expired ? (
                    <span className="inline-block px-2 py-1 text-xs font-bold rounded-sm bg-signal-red text-white">
                      EXPIRED
                    </span>
                  ) : (
                    <div className={`text-sm font-medium font-mono tabular-nums ${urgencyClass}`}>
                      {formatTimeRemaining(remaining)}
                    </div>
                  )}
                  <div className="text-xs text-ink-300 mt-1">
                    Claimed: {new Date(claim.claimed_at).toLocaleString()}
                  </div>
                </div>
              </div>

              <div className="mt-6 flex justify-between items-center">
                <a
                  href={directionsUrl(claim.task.locationLat, claim.task.locationLon)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm text-field-600 hover:text-field-700 inline-flex items-center gap-1"
                >
                  <span aria-hidden>&#9758;</span> Directions
                </a>
                <div className="flex space-x-3">
                  <button
                    onClick={() => setConfirmReleaseId(claim.task_id)}
                    disabled={actionLoading === claim.task_id}
                    className="px-4 py-2 border border-ink-200 text-ink-700 rounded-sm hover:bg-ink-50 disabled:opacity-50"
                  >
                    Release Claim
                  </button>
                  <Link
                    href={`/dashboard/worker/submit/${claim.task_id}`}
                    className="px-4 py-2 bg-field-500 text-white rounded-sm hover:bg-field-600"
                  >
                    Submit Photos
                  </Link>
                </div>
              </div>
            </div>
            );
          })}
        </div>
      )}

      <ConfirmDialog
        isOpen={!!confirmReleaseId}
        onClose={() => setConfirmReleaseId(null)}
        onConfirm={handleUnclaim}
        title="Release claim?"
        message="You'll lose the exclusivity window and your reliability score may decrease."
        confirmLabel="Release claim"
        cancelLabel="Keep claim"
        variant="danger"
        isLoading={actionLoading === confirmReleaseId}
      />
    </div>
  );
}
