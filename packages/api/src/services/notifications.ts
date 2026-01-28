import { prisma } from './database';

// Notification types
export type NotificationType =
  | 'task_claimed'
  | 'submission_received'
  | 'submission_accepted'
  | 'submission_rejected'
  | 'dispute_opened'
  | 'dispute_resolved'
  | 'badge_earned'
  | 'streak_milestone'
  | 'claim_expiring'
  | 'fee_tier_upgrade';

// Default notification preferences
export const DEFAULT_NOTIFICATION_PREFS: Record<NotificationType, boolean> = {
  task_claimed: true,
  submission_received: true,
  submission_accepted: true,
  submission_rejected: true,
  dispute_opened: true,
  dispute_resolved: true,
  badge_earned: true,
  streak_milestone: true,
  claim_expiring: true,
  fee_tier_upgrade: true,
};

interface NotificationData {
  userId: string;
  type: NotificationType;
  title: string;
  body: string;
  data?: Record<string, any>;
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
    const prefs = JSON.parse(user.notificationPrefs);
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
      data: JSON.stringify(data.data || {}),
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
      data: JSON.parse(n.data),
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
}

/**
 * Notify requester when a submission is received
 */
export async function notifySubmissionReceived(
  requesterId: string,
  taskId: string,
  taskTitle: string,
  submissionId: string,
  workerName: string
): Promise<void> {
  await createNotification({
    userId: requesterId,
    type: 'submission_received',
    title: 'Submission Received',
    body: `${workerName} submitted work for "${taskTitle}"`,
    data: { taskId, submissionId },
  });
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
}

/**
 * Notify worker when their submission is rejected
 */
export async function notifySubmissionRejected(
  workerId: string,
  taskId: string,
  taskTitle: string,
  submissionId: string,
  reasonCode: string
): Promise<void> {
  await createNotification({
    userId: workerId,
    type: 'submission_rejected',
    title: 'Submission Rejected',
    body: `Your submission for "${taskTitle}" was rejected. Reason: ${reasonCode}. You can dispute within 48 hours.`,
    data: { taskId, submissionId, reasonCode },
  });
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
