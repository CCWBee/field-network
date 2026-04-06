'use client';

import { formatDistanceToNow } from 'date-fns';

type TaskPopupData = {
  id: string;
  title: string;
  template: string;
  bounty: { amount: number; currency: string };
  location: { lat: number; lon: number; radius_m: number };
  time_window: { start_iso: string; end_iso: string };
  is_claimed?: boolean;
  distanceKm?: number | null;
};

type MapPopupProps = {
  task: TaskPopupData;
  onClaim?: (taskId: string) => void;
  onViewDetails?: (taskId: string) => void;
  claiming?: boolean;
  compact?: boolean;
};

export default function MapPopup({
  task,
  onClaim,
  onViewDetails,
  claiming = false,
  compact = false,
}: MapPopupProps) {
  const endDate = new Date(task.time_window.end_iso);
  const isExpired = endDate < new Date();
  const timeUntilEnd = formatDistanceToNow(endDate, { addSuffix: true });

  if (compact) {
    return (
      <div className="min-w-[180px] p-1">
        <div className="font-medium text-ink-900 text-sm truncate">{task.title}</div>
        <div className="flex items-center justify-between mt-1">
          <span className="text-sm font-mono tabular-nums font-semibold text-signal-green">
            {task.bounty.currency} {task.bounty.amount.toFixed(2)}
          </span>
          {task.distanceKm !== null && task.distanceKm !== undefined && (
            <span className="text-xs font-mono tabular-nums text-ink-500">{task.distanceKm.toFixed(1)} km</span>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="min-w-[240px] max-w-[300px]">
      {/* Header */}
      <div className="pb-2 border-b border-ink-100">
        <div className="text-xs uppercase tracking-wider text-field-600 mb-1">
          {task.template.replace(/_v\d+$/, '').replace(/_/g, ' ')}
        </div>
        <h3 className="font-semibold text-ink-900 leading-tight">{task.title}</h3>
      </div>

      {/* Details */}
      <div className="py-2 space-y-1.5 text-sm">
        {/* Bounty */}
        <div className="flex items-center justify-between">
          <span className="text-ink-500">Bounty</span>
          <span className="font-mono tabular-nums font-semibold text-signal-green">
            {task.bounty.currency} {task.bounty.amount.toFixed(2)}
          </span>
        </div>

        {/* Distance */}
        {task.distanceKm !== null && task.distanceKm !== undefined && (
          <div className="flex items-center justify-between">
            <span className="text-ink-500">Distance</span>
            <span className="font-mono tabular-nums text-ink-700">{task.distanceKm.toFixed(1)} km away</span>
          </div>
        )}

        {/* Radius */}
        <div className="flex items-center justify-between">
          <span className="text-ink-500">Capture radius</span>
          <span className="font-mono tabular-nums text-ink-700">{task.location.radius_m}m</span>
        </div>

        {/* Time */}
        <div className="flex items-center justify-between">
          <span className="text-ink-500">Deadline</span>
          <span className={isExpired ? 'text-signal-red' : 'text-ink-700'}>
            {isExpired ? 'Expired' : timeUntilEnd}
          </span>
        </div>
      </div>

      {/* Actions */}
      <div className="pt-2 border-t border-ink-100 flex gap-2">
        {task.is_claimed ? (
          <span className="flex-1 text-center py-1.5 text-xs text-signal-amber border border-signal-amber/30 rounded-sm">
            Already claimed
          </span>
        ) : isExpired ? (
          <span className="flex-1 text-center py-1.5 text-xs text-ink-500 bg-ink-50 rounded-sm">
            Task expired
          </span>
        ) : (
          <>
            {onClaim && (
              <button
                onClick={() => onClaim(task.id)}
                disabled={claiming}
                className="flex-1 py-1.5 text-xs bg-field-500 text-white rounded-sm hover:bg-field-600 disabled:opacity-50"
              >
                {claiming ? 'Claiming...' : 'Claim Task'}
              </button>
            )}
          </>
        )}
        {onViewDetails && (
          <button
            onClick={() => onViewDetails(task.id)}
            className="flex-1 py-1.5 text-xs border border-ink-200 text-ink-700 rounded-sm hover:bg-ink-50"
          >
            View Details
          </button>
        )}
      </div>
    </div>
  );
}

// Submission location popup for task detail view
type SubmissionPopupData = {
  id: string;
  status: string;
  location?: { lat: number; lon: number };
  distanceFromTask?: number;
  withinRadius?: boolean;
  artefactCount?: number;
  createdAt?: string;
};

type SubmissionMapPopupProps = {
  submission: SubmissionPopupData;
  taskLocation: { lat: number; lon: number; radius_m: number };
};

export function SubmissionMapPopup({
  submission,
  taskLocation,
}: SubmissionMapPopupProps) {
  const statusColors: Record<string, string> = {
    draft: 'text-ink-700 border border-ink-200',
    finalised: 'text-purple-700 border border-purple-200',
    accepted: 'text-signal-green border border-signal-green/30',
    rejected: 'text-signal-red border border-signal-red/30',
  };

  return (
    <div className="min-w-[200px]">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs uppercase tracking-wider font-medium text-ink-500">Submission</span>
        <span className={`px-2 py-0.5 text-xs rounded-sm ${statusColors[submission.status] || 'text-ink-700 border border-ink-200'}`}>
          {submission.status}
        </span>
      </div>

      <div className="space-y-1.5 text-sm">
        {submission.location && (
          <div className="flex items-center justify-between">
            <span className="text-ink-500">Location</span>
            <span className="font-mono tabular-nums text-ink-700">
              {submission.location.lat.toFixed(4)}, {submission.location.lon.toFixed(4)}
            </span>
          </div>
        )}

        {submission.distanceFromTask !== undefined && (
          <div className="flex items-center justify-between">
            <span className="text-ink-500">From task center</span>
            <span className={`font-mono tabular-nums ${submission.withinRadius ? 'text-signal-green' : 'text-signal-red'}`}>
              {submission.distanceFromTask.toFixed(0)}m
              {submission.withinRadius ? ' (within radius)' : ' (outside radius)'}
            </span>
          </div>
        )}

        {submission.artefactCount !== undefined && (
          <div className="flex items-center justify-between">
            <span className="text-ink-500">Artefacts</span>
            <span className="font-mono tabular-nums text-ink-700">{submission.artefactCount} uploaded</span>
          </div>
        )}

        {submission.createdAt && (
          <div className="flex items-center justify-between">
            <span className="text-ink-500">Submitted</span>
            <span className="text-ink-700">
              {formatDistanceToNow(new Date(submission.createdAt), { addSuffix: true })}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
