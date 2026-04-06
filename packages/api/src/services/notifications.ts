import { prisma } from './database';
import {
  sendTaskClaimedEmail,
  sendSubmissionReceivedEmail,
  sendSubmissionAcceptedEmail,
  sendSubmissionRejectedEmail,
  sendDisputeOpenedEmail,
  sendDisputeResolvedEmail,
} from './email';

// Notification types
export type NotificationType =
  | 'task_claimed'
  | 'submission_received'
  | 'submission_accepted'
  | 'submission_rejected'
  | 'dispute_opened'
  | 'dispute_resolved'
  | 'dispute_escalated'
  | 'jury_duty'
  | 'badge_earned'
  | 'streak_milestone'
  | 'claim_expiring'
  | 'fee_tier_upgrade';

// Default notification preferences (in-app)
export const DEFAULT_NOTIFICATION_PREFS: Record<NotificationType, boolean> = {
  task_claimed: true,
  submission_received: true,
  submission_accepted: true,
  submission_rejected: true,
  dispute_opened: true,
  dispute_resolved: true,
  dispute_escalated: true,
  jury_duty: true,
  badge_earned: true,
  streak_milestone: true,
  claim_expiring: true,
  fee_tier_upgrade: true,
};

// Email notification preferences (subset of notifications that can be emailed)
export type EmailableNotificationType =
  | 'task_claimed'
  | 'submission_received'
  | 'submission_accepted'
  | 'submission_rejected'
  | 'dispute_opened'
  | 'dispute_resolved';

// Default email notification preferences
export const DEFAULT_EMAIL_PREFS: Record<EmailableNotificationType, boolean> = {
  task_claimed: true,
  submission_received: true,
  submission_accepted: true,
  submission_rejected: true,
  dispute_opened: true,
  dispute_resolved: true,
};

interface NotificationData {
  userId: string;
  type: NotificationType;
  title: string;
  body: string;
  data?: Record<string, any>;
}

// Extended notification preferences including email settings
interface NotificationPreferences {
  inApp: Record<NotificationType, boolean>;
  email: Record<EmailableNotificationType, boolean>;
  emailEnabled: boolean; // Master switch for all email notifications
}

/**
 * Get user's notification preferences
 */
export async function getNotificationPrefs(userId: string): Promise<Record<NotificationType, boolean>> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { notificationPrefs: true },
  });

  if (!user) {
    return DEFAULT_NOTIFICATION_PREFS;
  }

  try {
    // notificationPrefs is Json type in PostgreSQL - already an object
    const prefs = (typeof user.notificationPrefs === 'string'
      ? JSON.parse(user.notificationPrefs)
      : user.notificationPrefs) as Record<string, any>;
    return { ...DEFAULT_NOTIFICATION_PREFS, ...prefs };
  } catch {
    return DEFAULT_NOTIFICATION_PREFS;
  }
}

/**
 * Update user's notification preferences
 */
export async function updateNotificationPrefs(
  userId: string,
  prefs: Partial<Record<NotificationType, boolean>>
): Promise<Record<NotificationType, boolean>> {
  const currentPrefs = await getNotificationPrefs(userId);
  const newPrefs = { ...currentPrefs, ...prefs };

  await prisma.user.update({
    where: { id: userId },
    data: { notificationPrefs: JSON.stringify(newPrefs) },
  });

  return newPrefs;
}

/**
 * Get user's email notification preferences
 */
export async function getEmailNotificationPrefs(userId: string): Promise<{
  emailEnabled: boolean;
  prefs: Record<EmailableNotificationType, boolean>;
}> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { notificationPrefs: true },
  });

  if (!user) {
    return { emailEnabled: true, prefs: DEFAULT_EMAIL_PREFS };
  }

  try {
    const allPrefs = user.notificationPrefs as Record<string, any>;
    const emailEnabled = allPrefs?.emailEnabled !== false; // Default to true
    const emailPrefs = allPrefs?.email || {};
    return {
      emailEnabled,
      prefs: { ...DEFAULT_EMAIL_PREFS, ...emailPrefs },
    };
  } catch {
    return { emailEnabled: true, prefs: DEFAULT_EMAIL_PREFS };
  }
}

/**
 * Update user's email notification preferences
 */
export async function updateEmailNotificationPrefs(
  userId: string,
  options: {
    emailEnabled?: boolean;
    prefs?: Partial<Record<EmailableNotificationType, boolean>>;
  }
): Promise<{
  emailEnabled: boolean;
  prefs: Record<EmailableNotificationType, boolean>;
}> {
  const current = await getEmailNotificationPrefs(userId);
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { notificationPrefs: true },
  });

  const allPrefs = (user?.notificationPrefs as Record<string, any>) || {};

  if (options.emailEnabled !== undefined) {
    allPrefs.emailEnabled = options.emailEnabled;
  }

  if (options.prefs) {
    allPrefs.email = { ...(allPrefs.email || {}), ...options.prefs };
  }

  await prisma.user.update({
    where: { id: userId },
    data: { notificationPrefs: allPrefs },
  });

  return {
    emailEnabled: allPrefs.emailEnabled !== false,
    prefs: { ...DEFAULT_EMAIL_PREFS, ...(allPrefs.email || {}) },
  };
}

/**
 * Check if user wants email notifications for a specific type
 */
async function shouldSendEmail(
  userId: string,
  type: EmailableNotificationType
): Promise<{ send: boolean; email: string | null }> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { email: true, notificationPrefs: true },
  });

  if (!user?.email) {
    return { send: false, email: null };
  }

  const { emailEnabled, prefs } = await getEmailNotificationPrefs(userId);

  if (!emailEnabled) {
    return { send: false, email: user.email };
  }

  if (!prefs[type]) {
    return { send: false, email: user.email };
  }

  return { send: true, email: user.email };
}

/**
 * Create a notification for a user
 * Respects user's notification preferences
 */
export async function createNotification(data: NotificationData): Promise<{ id: string } | null> {
  // Check user's preferences
  const prefs = await getNotificationPrefs(data.userId);
  if (!prefs[data.type]) {
    return null; // User has disabled this notification type
  }

  const notification = await prisma.notification.create({
    data: {
      userId: data.userId,
      type: data.type,
      title: data.title,
      body: data.body,
      data: data.data || {},
    },
  });

  return { id: notification.id };
}

/**
 * Get unread notification count for a user
 */
export async function getUnreadCount(userId: string): Promise<number> {
  return prisma.notification.count({
    where: {
      userId,
      read: false,
    },
  });
}

/**
 * Get notifications for a user
 */
export async function getNotifications(
  userId: string,
  options: { limit?: number; offset?: number; unreadOnly?: boolean } = {}
): Promise<{
  notifications: Array<{
    id: string;
    type: string;
    title: string;
    body: string;
    data: Record<string, any>;
    read: boolean;
    createdAt: Date;
  }>;
  total: number;
  unreadCount: number;
}> {
  const limit = options.limit || 20;
  const offset = options.offset || 0;

  const where: any = { userId };
  if (options.unreadOnly) {
    where.read = false;
  }

  const [notifications, total, unreadCount] = await Promise.all([
    prisma.notification.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: limit,
      skip: offset,
    }),
    prisma.notification.count({ where }),
    prisma.notification.count({ where: { userId, read: false } }),
  ]);

  return {
    notifications: notifications.map((n) => ({
      id: n.id,
      type: n.type,
      title: n.title,
      body: n.body,
      data: (typeof n.data === 'string' ? JSON.parse(n.data) : n.data) as Record<string, any>,
      read: n.read,
      createdAt: n.createdAt,
    })),
    total,
    unreadCount,
  };
}

/**
 * Mark a notification as read
 */
export async function markAsRead(notificationId: string, userId: string): Promise<boolean> {
  const result = await prisma.notification.updateMany({
    where: {
      id: notificationId,
      userId, // Ensure user owns the notification
    },
    data: {
      read: true,
      readAt: new Date(),
    },
  });

  return result.count > 0;
}

/**
 * Mark all notifications as read for a user
 */
export async function markAllAsRead(userId: string): Promise<number> {
  const result = await prisma.notification.updateMany({
    where: {
      userId,
      read: false,
    },
    data: {
      read: true,
      readAt: new Date(),
    },
  });

  return result.count;
}

/**
 * Delete old notifications (cleanup job)
 */
export async function cleanupOldNotifications(daysOld: number = 90): Promise<number> {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - daysOld);

  const result = await prisma.notification.deleteMany({
    where: {
      createdAt: { lt: cutoff },
      read: true,
    },
  });

  return result.count;
}

// ============================================================================
// NOTIFICATION TEMPLATES
// ============================================================================

/**
 * Notify requester when their task is claimed
 */
export async function notifyTaskClaimed(
  requesterId: string,
  taskId: string,
  taskTitle: string,
  workerName: string
): Promise<void> {
  await createNotification({
    userId: requesterId,
    type: 'task_claimed',
    title: 'Task Claimed',
    body: `${workerName} has claimed your task "${taskTitle}"`,
    data: { taskId },
  });

  // Send email notification
  const { send, email } = await shouldSendEmail(requesterId, 'task_claimed');
  if (send && email) {
    const user = await prisma.user.findUnique({
      where: { id: requesterId },
      select: { username: true },
    });
    const baseUrl = process.env.WEB_URL || 'https://field-network.com';
    await sendTaskClaimedEmail(email, {
      requesterName: user?.username || undefined,
      taskTitle,
      workerName,
      taskUrl: `${baseUrl}/dashboard/requester/tasks/${taskId}`,
      ttlHours: 4,
    });
  }
}

/**
 * Notify requester when a submission is received
 */
export async function notifySubmissionReceived(
  requesterId: string,
  taskId: string,
  taskTitle: string,
  submissionId: string,
  workerName: string,
  verificationScore?: number
): Promise<void> {
  await createNotification({
    userId: requesterId,
    type: 'submission_received',
    title: 'Submission Received',
    body: `${workerName} submitted work for "${taskTitle}"`,
    data: { taskId, submissionId },
  });

  // Send email notification
  const { send, email } = await shouldSendEmail(requesterId, 'submission_received');
  if (send && email) {
    const user = await prisma.user.findUnique({
      where: { id: requesterId },
      select: { username: true },
    });
    const baseUrl = process.env.WEB_URL || 'https://field-network.com';
    await sendSubmissionReceivedEmail(email, {
      requesterName: user?.username || undefined,
      taskTitle,
      workerName,
      verificationScore: verificationScore || 0,
      submissionUrl: `${baseUrl}/dashboard/requester/submissions/${submissionId}`,
    });
  }
}

/**
 * Notify worker when their submission is accepted
 */
export async function notifySubmissionAccepted(
  workerId: string,
  taskId: string,
  taskTitle: string,
  submissionId: string,
  bountyAmount: number,
  currency: string
): Promise<void> {
  await createNotification({
    userId: workerId,
    type: 'submission_accepted',
    title: 'Submission Accepted!',
    body: `Your submission for "${taskTitle}" was accepted. ${currency} ${bountyAmount.toFixed(2)} has been released.`,
    data: { taskId, submissionId, bountyAmount, currency },
  });

  // Send email notification
  const { send, email } = await shouldSendEmail(workerId, 'submission_accepted');
  if (send && email) {
    const user = await prisma.user.findUnique({
      where: { id: workerId },
      select: { username: true },
    });
    const baseUrl = process.env.WEB_URL || 'https://field-network.com';
    await sendSubmissionAcceptedEmail(email, {
      workerName: user?.username || undefined,
      taskTitle,
      bountyAmount,
      currency,
      submissionUrl: `${baseUrl}/dashboard/worker/submissions/${submissionId}`,
    });
  }
}

/**
 * Notify worker when their submission is rejected
 */
export async function notifySubmissionRejected(
  workerId: string,
  taskId: string,
  taskTitle: string,
  submissionId: string,
  reasonCode: string,
  comment?: string
): Promise<void> {
  await createNotification({
    userId: workerId,
    type: 'submission_rejected',
    title: 'Submission Rejected',
    body: `Your submission for "${taskTitle}" was rejected. Reason: ${reasonCode}. You can dispute within 48 hours.`,
    data: { taskId, submissionId, reasonCode },
  });

  // Send email notification
  const { send, email } = await shouldSendEmail(workerId, 'submission_rejected');
  if (send && email) {
    const user = await prisma.user.findUnique({
      where: { id: workerId },
      select: { username: true },
    });
    const baseUrl = process.env.WEB_URL || 'https://field-network.com';
    await sendSubmissionRejectedEmail(email, {
      workerName: user?.username || undefined,
      taskTitle,
      reasonCode,
      comment,
      submissionUrl: `${baseUrl}/dashboard/worker/submissions/${submissionId}`,
    });
  }
}

/**
 * Notify parties when a dispute is opened
 */
export async function notifyDisputeOpened(
  userId: string,
  disputeId: string,
  taskTitle: string,
  isRequester: boolean
): Promise<void> {
  await createNotification({
    userId,
    type: 'dispute_opened',
    title: 'Dispute Opened',
    body: isRequester
      ? `A dispute has been opened for your task "${taskTitle}"`
      : `Your dispute for "${taskTitle}" has been submitted for review`,
    data: { disputeId },
  });

  // Send email notification
  const { send, email } = await shouldSendEmail(userId, 'dispute_opened');
  if (send && email) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { username: true },
    });
    const baseUrl = process.env.WEB_URL || 'https://field-network.com';
    await sendDisputeOpenedEmail(email, {
      recipientName: user?.username || undefined,
      taskTitle,
      isRequester,
      disputeUrl: `${baseUrl}/dashboard/disputes/${disputeId}`,
    });
  }
}

/**
 * Notify parties when a dispute is resolved
 */
export async function notifyDisputeResolved(
  userId: string,
  disputeId: string,
  taskTitle: string,
  resolutionType: string,
  isWorker: boolean
): Promise<void> {
  const resolutionMessages: Record<string, { worker: string; requester: string }> = {
    accept_pay: {
      worker: 'The dispute was resolved in your favor. Payment has been released.',
      requester: 'The dispute was resolved. Payment was released to the worker.',
    },
    reject_refund: {
      worker: 'The dispute was resolved. The submission was rejected.',
      requester: 'The dispute was resolved in your favor. Your funds have been returned.',
    },
    partial_pay: {
      worker: 'The dispute was resolved with a partial payment.',
      requester: 'The dispute was resolved with a partial refund.',
    },
    strike: {
      worker: 'The dispute was resolved. A strike was issued to your account.',
      requester: 'The dispute was resolved. Your funds have been returned.',
    },
  };

  const message = resolutionMessages[resolutionType]?.[isWorker ? 'worker' : 'requester']
    || 'The dispute has been resolved.';

  await createNotification({
    userId,
    type: 'dispute_resolved',
    title: 'Dispute Resolved',
    body: `${message} Task: "${taskTitle}"`,
    data: { disputeId, resolutionType },
  });

  // Send email notification
  const { send, email } = await shouldSendEmail(userId, 'dispute_resolved');
  if (send && email) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { username: true },
    });
    const baseUrl = process.env.WEB_URL || 'https://field-network.com';
    await sendDisputeResolvedEmail(email, {
      recipientName: user?.username || undefined,
      taskTitle,
      resolutionMessage: message,
      disputeUrl: `${baseUrl}/dashboard/disputes/${disputeId}`,
    });
  }
}

/**
 * Notify user when they earn a badge
 */
export async function notifyBadgeEarned(
  userId: string,
  badgeType: string,
  badgeTitle: string,
  badgeDescription: string
): Promise<void> {
  await createNotification({
    userId,
    type: 'badge_earned',
    title: 'Badge Earned!',
    body: `You earned the "${badgeTitle}" badge: ${badgeDescription}`,
    data: { badgeType, badgeTitle },
  });
}

/**
 * Notify user of streak milestone
 */
export async function notifyStreakMilestone(
  userId: string,
  streakCount: number
): Promise<void> {
  await createNotification({
    userId,
    type: 'streak_milestone',
    title: 'Streak Milestone!',
    body: `Congratulations! You've maintained a ${streakCount}-task acceptance streak.`,
    data: { streakCount },
  });
}

/**
 * Notify user of fee tier upgrade
 */
export async function notifyFeeTierUpgrade(
  userId: string,
  newTier: string,
  newRate: number
): Promise<void> {
  await createNotification({
    userId,
    type: 'fee_tier_upgrade',
    title: 'Fee Tier Upgraded!',
    body: `Your platform fee has been reduced to ${(newRate * 100).toFixed(1)}% (${newTier} tier).`,
    data: { newTier, newRate },
  });
}

/**
 * Notify parties when a dispute is escalated to a higher tier
 */
export async function notifyDisputeEscalated(
  userId: string,
  disputeId: string,
  taskTitle: string,
  newTier: number
): Promise<void> {
  const tierNames: Record<number, string> = {
    2: 'Community Jury Review',
    3: 'Admin Appeal',
  };

  const tierDescriptions: Record<number, string> = {
    2: 'A panel of 5 community jurors will review the evidence and vote. Results expected within 48 hours.',
    3: 'An administrator will review the appeal. Decision expected within 72 hours.',
  };

  await createNotification({
    userId,
    type: 'dispute_escalated',
    title: `Dispute Escalated to ${tierNames[newTier] || `Tier ${newTier}`}`,
    body: `The dispute for "${taskTitle}" has been escalated. ${tierDescriptions[newTier] || ''}`,
    data: { disputeId, tier: newTier },
  });
}

/**
 * Notify user when they are selected for jury duty
 */
export async function notifyJuryDuty(
  userId: string,
  disputeId: string,
  taskTitle: string,
  deadline: Date
): Promise<void> {
  const deadlineStr = deadline.toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

  await createNotification({
    userId,
    type: 'jury_duty',
    title: 'Jury Duty: Your Vote Needed',
    body: `You have been selected to serve on the jury for a dispute regarding "${taskTitle}". Please review the evidence and cast your vote by ${deadlineStr}.`,
    data: { disputeId, deadline: deadline.toISOString() },
  });
}
