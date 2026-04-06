// Re-export types from shared package to ensure consistency
export type {
  TaskStatus,
  SubmissionStatus,
  UserRole,
} from '@field-network/shared';

// Import for use in state machine
import type { TaskStatus, SubmissionStatus } from '@field-network/shared';

export const TASK_TRANSITIONS: Record<TaskStatus, TaskStatus[]> = {
  draft: ['posted', 'cancelled'],
  posted: ['claimed', 'cancelled', 'expired'],
  claimed: ['posted', 'submitted', 'cancelled', 'expired'], // posted = unclaimed
  submitted: ['accepted', 'disputed', 'cancelled'],
  accepted: [], // terminal
  disputed: ['accepted', 'cancelled'], // after resolution
  cancelled: [], // terminal
  expired: [], // terminal
};

// Claim Status State Machine
export type ClaimStatus = 'active' | 'released' | 'expired' | 'converted';

export const CLAIM_TRANSITIONS: Record<ClaimStatus, ClaimStatus[]> = {
  active: ['released', 'expired', 'converted'], // converted = submission created
  released: [],
  expired: [],
  converted: [],
};

// Submission Status State Machine (type imported from @field-network/shared)

export const SUBMISSION_TRANSITIONS: Record<SubmissionStatus, SubmissionStatus[]> = {
  created: ['uploading'],
  uploading: ['finalised'],
  finalised: ['accepted', 'rejected'],
  accepted: [], // terminal
  rejected: ['disputed'],
  disputed: ['resolved'],
  resolved: [], // terminal
};

// Dispute Status State Machine
export type DisputeStatus =
  | 'opened'
  | 'evidence_pending'
  | 'under_review'
  | 'resolved';

export const DISPUTE_TRANSITIONS: Record<DisputeStatus, DisputeStatus[]> = {
  opened: ['evidence_pending', 'under_review'],
  evidence_pending: ['under_review'],
  under_review: ['resolved'],
  resolved: [], // terminal
};

// Escrow Status State Machine
export type EscrowStatus = 'pending' | 'funded' | 'released' | 'refunded' | 'disputed';

export const ESCROW_TRANSITIONS: Record<EscrowStatus, EscrowStatus[]> = {
  pending: ['funded'],
  funded: ['released', 'refunded', 'disputed'],
  released: [],
  refunded: [],
  disputed: ['released', 'refunded'],
};
