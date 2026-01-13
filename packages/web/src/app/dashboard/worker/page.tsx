'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api';
import { useAuthStore } from '@/lib/store';

export default function WorkerDashboard() {
  const { token } = useAuthStore();
  const [tasks, setTasks] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [claimingId, setClaimingId] = useState<string | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    fetchTasks();
  }, [token]);

  const fetchTasks = async () => {
    try {
      api.setToken(token);
      const result = await api.getTasks({ status: 'posted' });
      setTasks(result.tasks);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load tasks');
    } finally {
      setIsLoading(false);
    }
  };

  const handleClaim = async (taskId: string) => {
    setClaimingId(taskId);
    setError('');
    try {
      api.setToken(token);
      await api.claimTask(taskId);
      await fetchTasks();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to claim task');
    } finally {
      setClaimingId(null);
    }
  };

  return (
    <div>
      <div className="flex justify-between items-center mb-8">
        <h1 className="text-2xl font-bold text-slate-800">Available Tasks</h1>
        <Link
          href="/dashboard/worker/claims"
          className="text-field-600 hover:text-field-500"
        >
          View My Claims &rarr;
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
      ) : tasks.length === 0 ? (
        <div className="glass rounded-lg p-12 text-center border border-surface-200">
          <p className="text-slate-500">No tasks available right now. Check back later!</p>
        </div>
      ) : (
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {tasks.map((task) => (
            <div key={task.id} className="glass rounded-lg overflow-hidden border border-surface-200">
              <div className="p-6">
                <div className="flex justify-between items-start mb-4">
                  <h3 className="text-lg font-medium text-slate-800">{task.title}</h3>
                  <span className="text-lg font-bold text-green-600">
                    {task.bounty.currency} {task.bounty.amount.toFixed(2)}
                  </span>
                </div>

                <div className="space-y-2 text-sm text-slate-500 mb-4">
                  <div className="flex items-center">
                    <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                    </svg>
                    {task.location.lat.toFixed(4)}, {task.location.lon.toFixed(4)}
                    <span className="ml-1">({task.location.radius_m}m radius)</span>
                  </div>
                  <div className="flex items-center">
                    <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    Due: {new Date(task.time_window.end_iso).toLocaleDateString()}
                  </div>
                  <div className="flex items-center">
                    <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                    </svg>
                    {task.template}
                  </div>
                </div>

                {task.is_claimed ? (
                  <span className="block text-center py-2 text-yellow-600 bg-yellow-50 rounded-md text-sm">
                    Already claimed
                  </span>
                ) : (
                  <button
                    onClick={() => handleClaim(task.id)}
                    disabled={claimingId === task.id}
                    className="w-full py-2 bg-field-500 text-white rounded-md hover:bg-field-600 disabled:opacity-50"
                  >
                    {claimingId === task.id ? 'Claiming...' : 'Claim Task'}
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
