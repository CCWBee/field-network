/**
 * GDPR Data Export & Deletion Service
 *
 * Provides:
 *   GET  /api/users/me/data-export  - JSON dump of all user data
 *   DELETE /api/users/me             - Soft-delete: anonymize PII, revoke tokens
 *
 * Does NOT delete task/submission records (needed for other users' history)
 * but strips PII from them.
 */

import { prisma } from './database';
import { blacklistAllUserTokens } from './tokenBlacklist';
import { createHash } from 'crypto';

/**
 * Export all data associated with a user.
 */
export async function exportUserData(userId: string) {
  const user = await prisma.user.findUniqueOrThrow({
    where: { id: userId },
    include: {
      workerProfile: true,
      walletLinks: true,
      stats: true,
      badges: true,
      tasks: {
        select: {
          id: true,
          title: true,
          status: true,
          bountyAmount: true,
          currency: true,
          createdAt: true,
        },
      },
      submissions: {
        select: {
          id: true,
          taskId: true,
          status: true,
          createdAt: true,
        },
      },
      taskClaims: {
        select: {
          id: true,
          taskId: true,
          status: true,
          claimedAt: true,
        },
      },
      escrowsCreated: {
        select: {
          id: true,
          taskId: true,
          amount: true,
          currency: true,
          status: true,
          createdAt: true,
        },
      },
      decisions: {
        select: {
          id: true,
          submissionId: true,
          decisionType: true,
          createdAt: true,
        },
      },
    },
  });

  // Fetch reputation events
  const reputationEvents = await prisma.reputationEvent.findMany({
    where: { userId },
    select: {
      id: true,
      previousScore: true,
      newScore: true,
      reason: true,
      createdAt: true,
    },
    orderBy: { createdAt: 'desc' },
  });

  // Fetch ledger entries
  const ledgerEntries = await prisma.ledgerEntry.findMany({
    where: { counterpartyId: userId },
    select: {
      id: true,
      taskId: true,
      entryType: true,
      amount: true,
      currency: true,
      direction: true,
      createdAt: true,
    },
    orderBy: { createdAt: 'desc' },
  });

  // Fetch stakes
  const stakes = await prisma.stake.findMany({
    where: { workerId: userId },
    select: {
      id: true,
      taskId: true,
      amount: true,
      bountyAmount: true,
      status: true,
      stakePercentage: true,
      createdAt: true,
    },
  });

  // Fetch reviews (given and received)
  const reviewsGiven = await prisma.review.findMany({
    where: { reviewerId: userId },
    select: {
      id: true,
      taskId: true,
      rating: true,
      comment: true,
      role: true,
      createdAt: true,
    },
  });

  const reviewsReceived = await prisma.review.findMany({
    where: { revieweeId: userId },
    select: {
      id: true,
      taskId: true,
      rating: true,
      role: true,
      createdAt: true,
    },
  });

  return {
    exportedAt: new Date().toISOString(),
    user: {
      id: user.id,
      email: user.email,
      username: user.username,
      role: user.role,
      bio: user.bio,
      location: user.location,
      website: user.website,
      twitterHandle: user.twitterHandle,
      createdAt: user.createdAt,
    },
    workerProfile: user.workerProfile,
    wallets: user.walletLinks.map(w => ({
      address: w.walletAddress,
      chain: w.chain,
      isPrimary: w.isPrimary,
      createdAt: w.createdAt,
    })),
    stats: user.stats,
    badges: user.badges,
    tasks: user.tasks,
    submissions: user.submissions,
    claims: user.taskClaims,
    escrows: user.escrowsCreated,
    decisions: user.decisions,
    reputationEvents,
    ledgerEntries,
    stakes,
    reviewsGiven,
    reviewsReceived,
  };
}

/**
 * Soft-delete a user: anonymize PII, revoke all tokens.
 *
 * Does NOT delete task/submission/escrow records — they are needed for
 * other users' history — but strips PII from them.
 */
export async function deleteUserData(userId: string): Promise<void> {
  const anonHash = createHash('sha256').update(userId).digest('hex').slice(0, 12);

  await prisma.$transaction([
    // Anonymize user record
    prisma.user.update({
      where: { id: userId },
      data: {
        email: null,
        passwordHash: null,
        username: null,
        bio: null,
        avatarUrl: null,
        ensName: null,
        ensAvatarUrl: null,
        location: null,
        website: null,
        twitterHandle: null,
        status: 'deleted',
        notificationPrefs: '{}',
        uiSettings: '{}',
        defaultRightsJson: '{}',
        savedAddresses: '[]',
      },
    }),

    // Anonymize worker profile
    prisma.workerProfile.updateMany({
      where: { userId },
      data: {
        displayName: `Deleted User ${anonHash}`,
        skills: '[]',
        kit: '[]',
      },
    }),

    // Delete wallet links (contain addresses)
    prisma.walletLink.deleteMany({
      where: { userId },
    }),

    // Revoke all API tokens
    prisma.apiToken.updateMany({
      where: { userId },
      data: { revokedAt: new Date() },
    }),

    // Delete SIWE nonces
    prisma.siweNonce.deleteMany({
      where: { userId },
    }),

    // Clear notification preferences
    prisma.notification.deleteMany({
      where: { userId },
    }),
  ]);

  // Blacklist all JWT tokens
  await blacklistAllUserTokens(userId, 'gdpr_deletion');
}
