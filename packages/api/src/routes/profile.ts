import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { prisma } from '../services/database';
import { authenticate } from '../middleware/auth';
import { ValidationError, NotFoundError } from '../middleware/errorHandler';
import { getENSProfile, suggestUsernameFromENS } from '../services/ens';
import { safeUrl, SavedAddressesSchema, safeJsonParse } from '../utils/validation';

const router = Router();

// ============================================================================
// PROFILE MANAGEMENT
// ============================================================================

const UpdateProfileSchema = z.object({
  username: z.string().min(3).max(30).regex(/^[a-zA-Z0-9_]+$/, 'Username can only contain letters, numbers, and underscores').optional(),
  bio: z.string().max(500).optional(),
  avatar_url: safeUrl.optional().nullable(),
  location: z.string().max(100).optional().nullable(),
  website: safeUrl.optional().nullable(),
  twitter_handle: z.string().max(50).regex(/^[a-zA-Z0-9_]*$/).optional().nullable(),
});

// PUT /v1/profile - Update current user's profile
router.put('/', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = UpdateProfileSchema.parse(req.body);
    const userId = req.user!.userId;

    // Check username uniqueness if being changed
    if (data.username) {
      const existingUser = await prisma.user.findFirst({
        where: {
          username: data.username,
          NOT: { id: userId },
        },
      });
      if (existingUser) {
        throw new ValidationError('Username already taken');
      }
    }

    const user = await prisma.user.update({
      where: { id: userId },
      data: {
        username: data.username,
        bio: data.bio,
        avatarUrl: data.avatar_url,
        location: data.location,
        website: data.website,
        twitterHandle: data.twitter_handle,
      },
      include: { workerProfile: true },
    });

    // Also update workerProfile displayName if username changed
    if (data.username && user.workerProfile) {
      await prisma.workerProfile.update({
        where: { userId },
        data: { displayName: data.username },
      });
    }

    res.json({
      id: user.id,
      username: user.username,
      bio: user.bio,
      avatar_url: user.avatarUrl,
      ens_name: user.ensName,
      ens_avatar_url: user.ensAvatarUrl,
      location: user.location,
      website: user.website,
      twitter_handle: user.twitterHandle,
      onboarding_completed: user.onboardingCompleted,
    });
  } catch (error) {
    next(error);
  }
});

// POST /v1/profile/onboarding - Complete onboarding with username + email
const OnboardingSchema = z.object({
  username: z.string().min(3).max(30).regex(/^[a-zA-Z0-9_]+$/, 'Username can only contain letters, numbers, and underscores'),
  email: z.string().email().optional(),
  bio: z.string().max(500).optional(),
});

router.post('/onboarding', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = OnboardingSchema.parse(req.body);
    const userId = req.user!.userId;

    const currentUser = await prisma.user.findUnique({
      where: { id: userId },
    });

    if (!currentUser) {
      throw new NotFoundError('User');
    }

    if (currentUser.onboardingCompleted) {
      throw new ValidationError('Onboarding already completed');
    }

    // Check username uniqueness
    const existingUsername = await prisma.user.findUnique({
      where: { username: data.username },
    });
    if (existingUsername && existingUsername.id !== userId) {
      throw new ValidationError('Username already taken');
    }

    // Check email uniqueness if provided
    if (data.email) {
      const existingEmail = await prisma.user.findUnique({
        where: { email: data.email },
      });
      if (existingEmail && existingEmail.id !== userId) {
        throw new ValidationError('Email already registered');
      }
    }

    const user = await prisma.user.update({
      where: { id: userId },
      data: {
        username: data.username,
        email: data.email || currentUser.email,
        bio: data.bio,
        onboardingCompleted: true,
      },
    });

    // Update workerProfile displayName
    await prisma.workerProfile.upsert({
      where: { userId },
      update: { displayName: data.username },
      create: {
        userId,
        displayName: data.username,
        radiusKm: 50,
        skills: '[]',
        kit: '[]',
        rating: 0,
        completedCount: 0,
        strikes: 0,
      },
    });

    res.json({
      id: user.id,
      username: user.username,
      email: user.email,
      onboarding_completed: user.onboardingCompleted,
    });
  } catch (error) {
    next(error);
  }
});

// GET /v1/profile/check-username/:username - Check if username is available
router.get('/check-username/:username', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { username } = req.params;

    if (!/^[a-zA-Z0-9_]{3,30}$/.test(username)) {
      res.json({ available: false, reason: 'Invalid username format' });
      return;
    }

    const existingUser = await prisma.user.findUnique({
      where: { username },
    });

    res.json({ available: !existingUser });
  } catch (error) {
    next(error);
  }
});

// POST /v1/profile/refresh-ens - Refresh ENS data from primary wallet
router.post('/refresh-ens', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user!.userId;

    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: { walletLinks: { where: { isPrimary: true } } },
    });

    if (!user) {
      throw new NotFoundError('User');
    }

    const primaryWallet = user.walletLinks[0];
    if (!primaryWallet) {
      throw new ValidationError('No primary wallet linked');
    }

    const ensProfile = await getENSProfile(primaryWallet.walletAddress);

    await prisma.user.update({
      where: { id: userId },
      data: {
        ensName: ensProfile.name,
        ensAvatarUrl: ensProfile.avatar,
      },
    });

    res.json({
      ens_name: ensProfile.name,
      ens_avatar_url: ensProfile.avatar,
      suggested_username: ensProfile.name ? suggestUsernameFromENS(ensProfile.name) : null,
    });
  } catch (error) {
    next(error);
  }
});

// ============================================================================
// PUBLIC PROFILES
// ============================================================================

// GET /v1/profile/:usernameOrId - Get public profile
router.get('/:usernameOrId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { usernameOrId } = req.params;

    // Try to find by username first, then by ID
    let user = await prisma.user.findFirst({
      where: {
        OR: [
          { username: usernameOrId },
          { id: usernameOrId },
        ],
        status: 'active',
      },
      include: {
        walletLinks: { where: { isPrimary: true } },
        stats: true,
        badges: true,
        workerProfile: true,
      },
    });

    if (!user) {
      throw new NotFoundError('User');
    }

    const primaryWallet = user.walletLinks[0];

    res.json({
      id: user.id,
      username: user.username,
      bio: user.bio,
      avatar_url: user.avatarUrl,
      ens_name: user.ensName,
      ens_avatar_url: user.ensAvatarUrl,
      location: user.location,
      website: user.website,
      twitter_handle: user.twitterHandle,
      wallet_address: primaryWallet?.walletAddress ?
        `${primaryWallet.walletAddress.slice(0, 6)}...${primaryWallet.walletAddress.slice(-4)}` : null,
      // Stats (public portion)
      stats: user.stats ? {
        tasks_posted: user.stats.tasksPosted,
        tasks_completed: user.stats.tasksCompleted,
        tasks_accepted: user.stats.tasksAccepted,
        total_earned: user.stats.totalEarned,
        reliability_score: user.stats.reliabilityScore,
        current_streak: user.stats.currentStreak,
        longest_streak: user.stats.longestStreak,
        wallet_verified: user.stats.walletVerified,
        identity_verified: user.stats.identityVerified,
      } : null,
      badges: user.badges.map(b => ({
        badge_type: b.badgeType,
        tier: b.tier,
        title: b.title,
        description: b.description,
        icon_url: b.iconUrl,
        earned_at: b.earnedAt.toISOString(),
      })),
      member_since: user.createdAt.toISOString(),
    });
  } catch (error) {
    next(error);
  }
});

// ============================================================================
// SAVED ADDRESSES
// ============================================================================

const SavedAddressSchema = z.object({
  label: z.string().min(1).max(100),
  lat: z.number().min(-90).max(90),
  lon: z.number().min(-180).max(180),
  address: z.string().optional(),
});

// GET /v1/profile/addresses - Get saved addresses
router.get('/me/addresses', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user!.userId },
    });

    if (!user) {
      throw new NotFoundError('User');
    }

    res.json({ addresses: safeJsonParse(user.savedAddresses, SavedAddressesSchema, []) });
  } catch (error) {
    next(error);
  }
});

// POST /v1/profile/addresses - Add saved address
router.post('/me/addresses', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = SavedAddressSchema.parse(req.body);

    const user = await prisma.user.findUnique({
      where: { id: req.user!.userId },
    });

    if (!user) {
      throw new NotFoundError('User');
    }

    const addresses = safeJsonParse(user.savedAddresses, SavedAddressesSchema, []);
    const newAddress = {
      id: crypto.randomUUID(),
      ...data,
      created_at: new Date().toISOString(),
    };
    addresses.push(newAddress);

    await prisma.user.update({
      where: { id: req.user!.userId },
      data: { savedAddresses: JSON.stringify(addresses) },
    });

    res.status(201).json({ address: newAddress });
  } catch (error) {
    next(error);
  }
});

// DELETE /v1/profile/addresses/:addressId - Remove saved address
router.delete('/me/addresses/:addressId', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { addressId } = req.params;

    const user = await prisma.user.findUnique({
      where: { id: req.user!.userId },
    });

    if (!user) {
      throw new NotFoundError('User');
    }

    const addresses = safeJsonParse(user.savedAddresses, SavedAddressesSchema, []);
    const filtered = addresses.filter((a) => a.id !== addressId);

    if (filtered.length === addresses.length) {
      throw new NotFoundError('Address');
    }

    await prisma.user.update({
      where: { id: req.user!.userId },
      data: { savedAddresses: JSON.stringify(filtered) },
    });

    res.json({ message: 'Address removed' });
  } catch (error) {
    next(error);
  }
});

export default router;
