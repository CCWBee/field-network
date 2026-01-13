'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { useTaskStore } from '@/lib/store';

const statusColors: Record<string, string> = {
  draft: 'bg-slate-100 text-slate-800',
  posted: 'bg-blue-100 text-blue-800',
  claimed: 'bg-yellow-100 text-yellow-800',
  submitted: 'bg-purple-100 text-purple-800',
  accepted: 'bg-green-100 text-green-800',
  disputed: 'bg-red-100 text-red-800',
  cancelled: 'bg-slate-100 text-slate-500',
  expired: 'bg-slate-100 text-slate-500',
};

export default function RequesterDashboard() {
  const { tasks, isLoading, fetchTasks } = useTaskStore();

  useEffect(() => {
    fetchTasks();
  }, [fetchTasks]);

  const stats = {
    total: tasks.length,
    active: tasks.filter(t => ['posted', 'claimed', 'submitted'].includes(t.status)).length,
    completed: tasks.filter(t => t.status === 'accepted').length,
    pending_review: tasks.filter(t => t.status === 'submitted').length,
  };

  return (
    <div>
      <div className="flex justify-between items-center mb-8">
        <h1 className="text-2xl font-bold text-slate-800">My Tasks</h1>
        <Link
          href="/dashboard/requester/new"
          className="bg-field-500 text-white px-4 py-2 rounded-md hover:bg-field-600"
        >
          Create New Task
        </Link>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-4 mb-8">
        <div className="glass rounded-lg p-4 border border-surface-200">
          <div className="text-2xl font-bold text-slate-800">{stats.total}</div>
          <div className="text-sm text-slate-500">Total Tasks</div>
        </div>
        <div className="glass rounded-lg p-4 border border-surface-200">
          <div className="text-2xl font-bold text-field-600">{stats.active}</div>
          <div className="text-sm text-slate-500">Active</div>
        </div>
        <div className="glass rounded-lg p-4 border border-surface-200">
          <div className="text-2xl font-bold text-purple-600">{stats.pending_review}</div>
          <div className="text-sm text-slate-500">Pending Review</div>
        </div>
        <div className="glass rounded-lg p-4 border border-surface-200">
          <div className="text-2xl font-bold text-green-600">{stats.completed}</div>
          <div className="text-sm text-slate-500">Completed</div>
        </div>
      </div>

      {/* Tasks List */}
      {isLoading ? (
        <div className="flex justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-field-500"></div>
        </div>
      ) : tasks.length === 0 ? (
        <div className="glass rounded-lg p-12 text-center border border-surface-200">
          <p className="text-slate-500 mb-4">You haven't created any tasks yet.</p>
          <Link
            href="/dashboard/requester/new"
            className="text-field-600 hover:text-field-500"
          >
            Create your first task
          </Link>
        </div>
      ) : (
        <div className="glass rounded-lg overflow-hidden border border-surface-200">
          <table className="min-w-full divide-y divide-surface-200">
            <thead className="bg-slate-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                  Task
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                  Status
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                  Bounty
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                  Deadline
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-surface-200">
              {tasks.map((task) => (
                <tr key={task.id} className="hover:bg-slate-50">
                  <td className="px-6 py-4">
                    <div className="text-sm font-medium text-slate-800">{task.title}</div>
                    <div className="text-sm text-slate-500">{task.template}</div>
                  </td>
                  <td className="px-6 py-4">
                    <span className={`px-2 py-1 text-xs rounded-full ${statusColors[task.status]}`}>
                      {task.status}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-sm text-slate-800">
                    {task.bounty.currency} {task.bounty.amount.toFixed(2)}
                  </td>
                  <td className="px-6 py-4 text-sm text-slate-500">
                    {new Date(task.time_window.end_iso).toLocaleDateString()}
                  </td>
                  <td className="px-6 py-4 text-sm">
                    <Link
                      href={`/dashboard/requester/tasks/${task.id}`}
                      className="text-field-600 hover:text-field-500"
                    >
                      View
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
