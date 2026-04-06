// Task Types
export interface TaskLocation {
  type: 'point' | 'polygon';
  lat?: number;
  lon?: number;
  coordinates?: number[][];
  radius_m: number;
}

export interface TaskTimeWindow {
  start_iso: string;
  end_iso: string;
}

export interface PhotoRequirements {
  count: number;
  min_width_px?: number;
  min_height_px?: number;
  format_allow?: string[];
  no_filters?: boolean;
}

export interface BearingRequirements {
  required: boolean;
  target_deg?: number;
  tolerance_deg?: number;
}

export interface TaskRequirements {
  photos: PhotoRequirements;
  bearing?: BearingRequirements;
  freshness?: {
    must_be_captured_within_task_window: boolean;
  };
}

export interface TaskBounty {
  currency: string;
  amount: number;
}

export interface TaskRights {
  exclusivity_days: number;
  allow_resale_after_exclusivity: boolean;
}

export interface TaskPolicy {
  safety_notes?: string;
  blocked_categories?: string[];
  requires_manual_review?: boolean;
}

export interface TaskAssurance {
  mode: 'single' | 'quorum';
  quorum?: number | null;
}

export interface GeoPhotoTask {
  schema_version: string;
  template: string;
  title: string;
  instructions: string;
  location: TaskLocation;
  time_window: TaskTimeWindow;
  requirements: TaskRequirements;
  assurance: TaskAssurance;
  bounty: TaskBounty;
  rights: TaskRights;
  policy?: TaskPolicy;
}

// Task Status
export type TaskStatus =
  | 'draft'
  | 'posted'
  | 'claimed'
  | 'submitted'
  | 'accepted'
  | 'disputed'
  | 'cancelled'
  | 'expired';

// Submission Status
export type SubmissionStatus =
  | 'created'
  | 'uploading'
  | 'finalised'
  | 'accepted'
  | 'rejected'
  | 'disputed'
  | 'resolved';

// User Roles
export type UserRole = 'requester' | 'worker' | 'admin';

// API Scopes
export const SCOPES = {
  TASKS_READ: 'tasks:read',
  TASKS_WRITE: 'tasks:write',
  TASKS_PUBLISH: 'tasks:publish',
  CLAIMS_WRITE: 'claims:write',
  SUBMISSIONS_READ: 'submissions:read',
  SUBMISSIONS_WRITE: 'submissions:write',
  DECISIONS_ACCEPT: 'decisions:accept',
  DECISIONS_REJECT: 'decisions:reject',
  ESCROW_FUND: 'escrow:fund',
  ESCROW_RELEASE: 'escrow:release',
  ADMIN_RESOLVE_DISPUTES: 'admin:resolve_disputes',
} as const;

// Proof Bundle
export interface ProofBundle {
  bundle_id: string;
  task_id: string;
  submission_id: string;
  worker_id: string;
  capture_claims: {
    declared_captured_at?: string;
    declared_location?: { lat: number; lon: number };
    declared_bearing?: number;
  };
  artefacts: {
    id: string;
    type: string;
    storage_key: string;
    sha256: string;
    dimensions: { width: number; height: number };
  }[];
  finalised_at: string;
}

// Verification Result
export interface VerificationResult {
  passed: string[];
  failed: string[];
  flags: string[];
  score: number;
}

// Webhook Event Types
export const WEBHOOK_EVENTS = [
  'task.published',
  'task.claimed',
  'task.submitted',
  'task.accepted',
  'task.cancelled',
  'task.expired',
  'submission.finalised',
  'submission.accepted',
  'submission.rejected',
  'dispute.opened',
  'dispute.resolved',
] as const;

export type WebhookEventType = typeof WEBHOOK_EVENTS[number];

// Rejection Reason Codes
export const REJECTION_REASONS = {
  WRONG_LOCATION: 'wrong_location',
  WRONG_TIME: 'wrong_time',
  INSUFFICIENT_QUALITY: 'insufficient_quality',
  WRONG_SUBJECT: 'wrong_subject',
  MISSING_REQUIREMENTS: 'missing_requirements',
  SUSPECTED_FRAUD: 'suspected_fraud',
  OTHER: 'other',
} as const;

export type RejectionReason = typeof REJECTION_REASONS[keyof typeof REJECTION_REASONS];
