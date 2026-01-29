'use client';

import { ReactNode } from 'react';
import { motion } from 'framer-motion';

interface EmptyStateProps {
  title: string;
  description?: string;
  icon?: ReactNode;
  action?: ReactNode;
  className?: string;
}

// Default empty state icons for common scenarios
const defaultIcons = {
  tasks: (
    <svg className="w-16 h-16 text-slate-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={1.5}
        d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4"
      />
    </svg>
  ),
  submissions: (
    <svg className="w-16 h-16 text-slate-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={1.5}
        d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
      />
    </svg>
  ),
  disputes: (
    <svg className="w-16 h-16 text-slate-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={1.5}
        d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
      />
    </svg>
  ),
  map: (
    <svg className="w-16 h-16 text-slate-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={1.5}
        d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7"
      />
    </svg>
  ),
  search: (
    <svg className="w-16 h-16 text-slate-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={1.5}
        d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
      />
    </svg>
  ),
  notifications: (
    <svg className="w-16 h-16 text-slate-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={1.5}
        d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"
      />
    </svg>
  ),
  data: (
    <svg className="w-16 h-16 text-slate-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={1.5}
        d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4m0 5c0 2.21-3.582 4-8 4s-8-1.79-8-4"
      />
    </svg>
  ),
};

function EmptyState({
  title,
  description,
  icon,
  action,
  className = '',
}: EmptyStateProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className={`
        flex flex-col items-center justify-center text-center
        py-12 px-6
        ${className}
      `}
    >
      {icon && (
        <div className="mb-4">
          {icon as any}
        </div>
      )}
      <h3 className="text-lg font-medium text-slate-700 mb-2">{title}</h3>
      {description && (
        <p className="text-sm text-slate-500 max-w-sm mb-6">{description}</p>
      )}
      {action && <div>{action as any}</div>}
    </motion.div>
  );
}

// Pre-built empty states for common scenarios
function EmptyTaskList({ action }: { action?: ReactNode }) {
  return (
    <EmptyState
      icon={defaultIcons.tasks}
      title="No tasks yet"
      description="Create your first task to start collecting real-world data from field operators."
      action={action}
    />
  );
}

function EmptySubmissionList({ action }: { action?: ReactNode }) {
  return (
    <EmptyState
      icon={defaultIcons.submissions}
      title="No submissions"
      description="Submissions will appear here once workers start completing your tasks."
      action={action}
    />
  );
}

function EmptyDisputeList() {
  return (
    <EmptyState
      icon={defaultIcons.disputes}
      title="No disputes"
      description="No disputes to review at this time. Check back later."
    />
  );
}

function EmptySearchResults({ query }: { query?: string }) {
  return (
    <EmptyState
      icon={defaultIcons.search}
      title="No results found"
      description={
        query
          ? `We couldn't find any results for "${query}". Try adjusting your search or filters.`
          : "No results match your current filters. Try broadening your search criteria."
      }
    />
  );
}

function EmptyMapView() {
  return (
    <EmptyState
      icon={defaultIcons.map}
      title="No locations to display"
      description="Complete tasks to build your activity map and see them displayed here."
    />
  );
}

function EmptyNotifications() {
  return (
    <EmptyState
      icon={defaultIcons.notifications}
      title="All caught up"
      description="You have no new notifications. We'll let you know when something needs your attention."
    />
  );
}

export {
  EmptyState,
  EmptyTaskList,
  EmptySubmissionList,
  EmptyDisputeList,
  EmptySearchResults,
  EmptyMapView,
  EmptyNotifications,
  defaultIcons,
};
export type { EmptyStateProps };
