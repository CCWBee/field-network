import { Router, Request, Response, NextFunction } from 'express';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { randomBytes, createHash } from 'crypto';
import { z } from 'zod';
import { SiweMessage, generateNonce } from 'siwe';
import { prisma } from '../services/database';
import { generateToken, generateRefreshToken, authenticate } from '../middleware/auth';
import { ValidationError, UnauthorizedError, NotFoundError } from '../middleware/errorHandler';
import { getENSProfile, suggestUsernameFromENS } from '../services/ens';

const router = Router();

// SIWE Nonce expiry (10 minutes)
const NONCE_EXPIRY_MS = 10 * 60 * 1000;

const RegisterSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  role: z.enum(['requester', 'worker', 'user']).default('user'),
  displayName: z.string().min(2).max(100).optional(),
  username: z.string().min(3).max(30).regex(/^[a-zA-Z0-9_]+$/, 'Username can only contain letters, numbers, and underscores').optional(),
});

const LoginSchema = z.object({
  email: z.string().email(),
  password: z.string(),
});

// POST /v1/auth/register
router.post('/register', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = RegisterSchema.parse(req.body);

    const existingUser = await prisma.user.findUnique({
      where: { email: data.email },
    });

    if (existingUser) {
      throw new ValidationError('Email already registered');
    }

    // Check username uniqueness if provided
    if (data.username) {
      const existingUsername = await prisma.user.findUnique({
        where: { username: data.username },
      });
      if (existingUsername) {
        throw new ValidationError('Username already taken');
      }
    }

    const passwordHash = await bcrypt.hash(data.password, 12);
    const displayName = data.displayName || data.username || data.email.split('@')[0];

    const user = await prisma.user.create({
      data: {
        email: data.email,
        passwordHash,
        username: data.username,
        role: 'user', // Unified accounts - everyone can post and collect
        status: 'active',
        onboardingCompleted: !!data.username, // Complete if username provided
        workerProfile: {
          create: {
            displayName,
            radiusKm: 50,
            skills: '[]',
            kit: '[]',
            rating: 0,
            completedCount: 0,
            strikes: 0,
          },
        },
        stats: {
          create: {
            emailVerified: false,
            walletVerified: false,
          },
        },
      },
      include: {
        workerProfile: true,
        stats: true,
      },
    });

    const token = generateToken({
      userId: user.id,
      email: user.email ?? undefined,
      role: user.role as 'requester' | 'worker' | 'admin',
      scopes: getDefaultScopes(user.role),
    });

    const refreshToken = generateRefreshToken(user.id);

    res.status(201).json({
      user: {
        id: user.id,
        email: user.email,
        username: user.username,
        role: user.role,
        onboarding_completed: user.onboardingCompleted,
      },
      token,
      refreshToken,
    });
  } catch (error) {
    next(error);
  }
});

// POST /v1/auth/login
router.post('/login', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = LoginSchema.parse(req.body);

    const user = await prisma.user.findUnique({
      where: { email: data.email },
    });

    if (!user || user.status !== 'active') {
      throw new UnauthorizedError('Invalid email or password');
    }

    // Wallet-only users can't use password login
    if (!user.passwordHash) {
      throw new UnauthorizedError('This account uses wallet authentication');
    }

    const validPassword = await bcrypt.compare(data.password, user.passwordHash);
    if (!validPassword) {
      throw new UnauthorizedError('Invalid email or password');
    }

    const token = generateToken({
      userId: user.id,
      email: user.email ?? undefined,
      role: user.role as 'requester' | 'worker' | 'admin',
      scopes: getDefaultScopes(user.role),
    });

    const refreshToken = generateRefreshToken(user.id);

    res.json({
      user: {
        id: user.id,
        email: user.email,
        username: user.username,
        role: user.role,
        onboarding_completed: user.onboardingCompleted,
      },
      token,
      refreshToken,
    });
  } catch (error) {
    next(error);
  }
});

// POST /v1/auth/refresh
router.post('/refresh', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { refreshToken } = req.body;

    if (!refreshToken) {
      throw new ValidationError('Refresh token required');
    }

    // Verify refresh token
    let payload: { userId: string; type: string };
    try {
      payload = jwt.verify(refreshToken, process.env.JWT_SECRET || 'dev-secret-change-in-production') as any;
    } catch {
      throw new UnauthorizedError('Invalid or expired refresh token');
    }

    if (payload.type !== 'refresh') {
      throw new UnauthorizedError('Invalid token type');
    }

    // Get user
    const user = await prisma.user.findUnique({
      where: { id: payload.userId },
      include: { walletLinks: { where: { isPrimary: true } } },
    });

    if (!user || user.status !== 'active') {
      throw new UnauthorizedError('User not found or inactive');
    }

    // Generate new tokens
    const primaryWallet = user.walletLinks[0];
    const token = generateToken({
      userId: user.id,
      email: user.email || undefined,
      role: user.role as 'requester' | 'worker' | 'admin',
      scopes: getDefaultScopes(user.role),
      walletAddress: primaryWallet?.walletAddress,
    });

    const newRefreshToken = generateRefreshToken(user.id);

    res.json({
      token,
      refreshToken: newRefreshToken,
    });
  } catch (error) {
    next(error);
  }
});

// POST /v1/auth/logout
router.post('/logout', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    // TODO: Invalidate token/session
    res.json({ message: 'Logged out successfully' });
  } catch (error) {
    next(error);
  }
});

// GET /v1/auth/me
router.get('/me', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user!.userId },
      include: { workerProfile: true, walletLinks: true, stats: true, badges: true },
    });

    if (!user) {
      throw new UnauthorizedError('User not found');
    }

    res.json({
      id: user.id,
      email: user.email,
      username: user.username,
      role: user.role,
      // Profile fields
      bio: user.bio,
      avatar_url: user.avatarUrl,
      ens_name: user.ensName,
      ens_avatar_url: user.ensAvatarUrl,
      location: user.location,
      website: user.website,
      twitter_handle: user.twitterHandle,
      onboarding_completed: user.onboardingCompleted,
      saved_addresses: JSON.parse(user.savedAddresses),
      // Wallets
      primary_wallet: user.primaryWalletId,
      wallets: user.walletLinks.map(w => ({
        id: w.id,
        address: w.walletAddress,
        chain: w.chain,
        chain_id: w.chainId,
        is_primary: w.isPrimary,
        label: w.label,
        verified_at: w.verifiedAt?.toISOString(),
      })),
      // Legacy worker profile
      workerProfile: user.workerProfile,
      // Stats and reputation
      stats: user.stats ? {
        tasks_posted: user.stats.tasksPosted,
        tasks_completed: user.stats.tasksCompleted,
        total_bounties_paid: user.stats.totalBountiesPaid,
        tasks_claimed: user.stats.tasksClaimed,
        tasks_delivered: user.stats.tasksDelivered,
        tasks_accepted: user.stats.tasksAccepted,
        tasks_rejected: user.stats.tasksRejected,
        total_earned: user.stats.totalEarned,
        reliability_score: user.stats.reliabilityScore,
        dispute_rate: user.stats.disputeRate,
        current_streak: user.stats.currentStreak,
        longest_streak: user.stats.longestStreak,
        repeat_customers: user.stats.repeatCustomers,
        email_verified: user.stats.emailVerified,
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
      created_at: user.createdAt.toISOString(),
    });
  } catch (error) {
    next(error);
  }
});

// ============================================================================
// SIWE (Sign-In with Ethereum) ENDPOINTS
// ============================================================================

// GET /v1/auth/siwe/nonce - Get a nonce for SIWE signing
router.get('/siwe/nonce', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const nonce = generateNonce();
    const domain = req.get('host') || 'localhost:3000';

    // Store nonce with expiry
    await prisma.siweNonce.create({
      data: {
        nonce,
        domain,
        expiresAt: new Date(Date.now() + NONCE_EXPIRY_MS),
      },
    });

    // Clean up expired nonces
    await prisma.siweNonce.deleteMany({
      where: { expiresAt: { lt: new Date() } },
    });

    res.json({ nonce });
  } catch (error) {
    next(error);
  }
});

const SiweVerifySchema = z.object({
  message: z.string(),
  signature: z.string(),
  role: z.enum(['requester', 'worker']).optional(),
});

// POST /v1/auth/siwe/verify - Verify SIWE signature and login/register
router.post('/siwe/verify', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { message, signature, role } = SiweVerifySchema.parse(req.body);

    // Parse and verify the SIWE message
    const siweMessage = new SiweMessage(message);
    const fields = await siweMessage.verify({ signature });

    if (!fields.success) {
      throw new UnauthorizedError('Invalid signature');
    }

    const address = fields.data.address.toLowerCase();
    const chainId = fields.data.chainId;

    // Check nonce validity
    const nonceRecord = await prisma.siweNonce.findUnique({
      where: { nonce: fields.data.nonce },
    });

    if (!nonceRecord || nonceRecord.usedAt || nonceRecord.expiresAt < new Date()) {
      throw new UnauthorizedError('Invalid or expired nonce');
    }

    // Mark nonce as used
    await prisma.siweNonce.update({
      where: { id: nonceRecord.id },
      data: { usedAt: new Date() },
    });

    // Find existing wallet link
    let walletLink = await prisma.walletLink.findUnique({
      where: { walletAddress_chain: { walletAddress: address, chain: 'base' } },
      include: { user: true },
    });

    let user;
    let isNewUser = false;
    let suggestedUsername: string | null = null;
    let ensProfile = { name: null as string | null, avatar: null as string | null };

    if (walletLink) {
      // Existing user - login
      user = walletLink.user;

      if (user.status !== 'active') {
        throw new UnauthorizedError('Account suspended');
      }

      // Update verification timestamp
      await prisma.walletLink.update({
        where: { id: walletLink.id },
        data: { verifiedAt: new Date() },
      });

      // Refresh ENS data if not set (async, don't block login)
      if (!user.ensName) {
        getENSProfile(address).then(async (profile) => {
          if (profile.name) {
            await prisma.user.update({
              where: { id: user!.id },
              data: {
                ensName: profile.name,
                ensAvatarUrl: profile.avatar,
              },
            });
          }
        }).catch(() => {}); // Fail silently
      }
    } else {
      // New user - register with unified account
      isNewUser = true;

      // Fetch ENS profile for new user (we await this for new users to get suggested username)
      try {
        ensProfile = await getENSProfile(address);
      } catch {
        // ENS fetch failed, continue without it
      }

      const displayName = ensProfile.name || `${address.slice(0, 6)}...${address.slice(-4)}`;
      suggestedUsername = ensProfile.name ? suggestUsernameFromENS(ensProfile.name) : null;

      user = await prisma.user.create({
        data: {
          role: 'user', // Unified accounts - everyone can post and collect
          status: 'active',
          ensName: ensProfile.name,
          ensAvatarUrl: ensProfile.avatar,
          onboardingCompleted: false, // Need to pick username
          walletLinks: {
            create: {
              walletAddress: address,
              chain: 'base',
              chainId: chainId,
              isPrimary: true,
              verifiedAt: new Date(),
            },
          },
          workerProfile: {
            create: {
              displayName,
              radiusKm: 50,
              skills: '[]',
              kit: '[]',
              rating: 0,
              completedCount: 0,
              strikes: 0,
            },
          },
          stats: {
            create: {
              walletVerified: true,
              emailVerified: false,
            },
          },
        },
        include: { walletLinks: true },
      });

      // Set primary wallet
      await prisma.user.update({
        where: { id: user.id },
        data: { primaryWalletId: user.walletLinks[0].id },
      });
    }

    const token = generateToken({
      userId: user.id,
      email: user.email || undefined,
      role: user.role as 'requester' | 'worker' | 'admin',
      scopes: getDefaultScopes(user.role),
      walletAddress: address,
    });

    const refreshToken = generateRefreshToken(user.id);

    res.json({
      user: {
        id: user.id,
        email: user.email,
        username: user.username,
        role: user.role,
        wallet_address: address,
        ens_name: user.ensName || ensProfile.name,
        ens_avatar_url: user.ensAvatarUrl || ensProfile.avatar,
        is_new_user: isNewUser,
        onboarding_completed: user.onboardingCompleted,
        suggested_username: suggestedUsername,
      },
      token,
      refreshToken,
    });
  } catch (error) {
    next(error);
  }
});

// POST /v1/auth/wallet/link - Link additional wallet to existing account
router.post('/wallet/link', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { message, signature, label } = z.object({
      message: z.string(),
      signature: z.string(),
      label: z.string().optional(),
    }).parse(req.body);

    const siweMessage = new SiweMessage(message);
    const fields = await siweMessage.verify({ signature });

    if (!fields.success) {
      throw new UnauthorizedError('Invalid signature');
    }

    const address = fields.data.address.toLowerCase();
    const chainId = fields.data.chainId;

    // Check if wallet is already linked
    const existing = await prisma.walletLink.findUnique({
      where: { walletAddress_chain: { walletAddress: address, chain: 'base' } },
    });

    if (existing) {
      throw new ValidationError('Wallet already linked to an account');
    }

    // Create wallet link
    const walletLink = await prisma.walletLink.create({
      data: {
        userId: req.user!.userId,
        walletAddress: address,
        chain: 'base',
        chainId: chainId,
        isPrimary: false,
        label: label,
        verifiedAt: new Date(),
      },
    });

    res.status(201).json({
      wallet: {
        id: walletLink.id,
        address: walletLink.walletAddress,
        chain: walletLink.chain,
        chain_id: walletLink.chainId,
        is_primary: walletLink.isPrimary,
        label: walletLink.label,
      },
    });
  } catch (error) {
    next(error);
  }
});

// DELETE /v1/auth/wallet/:walletId - Unlink wallet from account
router.delete('/wallet/:walletId', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { walletId } = req.params;

    const wallet = await prisma.walletLink.findUnique({
      where: { id: walletId },
      include: { user: { include: { walletLinks: true } } },
    });

    if (!wallet || wallet.userId !== req.user!.userId) {
      throw new NotFoundError('Wallet');
    }

    // Don't allow removing the only wallet if no email/password set
    if (wallet.user.walletLinks.length === 1 && !wallet.user.email) {
      throw new ValidationError('Cannot remove only wallet from wallet-only account');
    }

    // If removing primary wallet, set another as primary
    if (wallet.isPrimary && wallet.user.walletLinks.length > 1) {
      const nextWallet = wallet.user.walletLinks.find(w => w.id !== walletId);
      if (nextWallet) {
        await prisma.$transaction([
          prisma.walletLink.update({
            where: { id: nextWallet.id },
            data: { isPrimary: true },
          }),
          prisma.user.update({
            where: { id: wallet.userId },
            data: { primaryWalletId: nextWallet.id },
          }),
        ]);
      }
    }

    await prisma.walletLink.delete({ where: { id: walletId } });

    res.json({ message: 'Wallet unlinked' });
  } catch (error) {
    next(error);
  }
});

// PUT /v1/auth/wallet/:walletId/primary - Set wallet as primary
router.put('/wallet/:walletId/primary', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { walletId } = req.params;

    const wallet = await prisma.walletLink.findUnique({
      where: { id: walletId },
    });

    if (!wallet || wallet.userId !== req.user!.userId) {
      throw new NotFoundError('Wallet');
    }

    await prisma.$transaction([
      // Unset current primary
      prisma.walletLink.updateMany({
        where: { userId: req.user!.userId, isPrimary: true },
        data: { isPrimary: false },
      }),
      // Set new primary
      prisma.walletLink.update({
        where: { id: walletId },
        data: { isPrimary: true },
      }),
      // Update user's primaryWalletId
      prisma.user.update({
        where: { id: req.user!.userId },
        data: { primaryWalletId: walletId },
      }),
    ]);

    res.json({ message: 'Primary wallet updated' });
  } catch (error) {
    next(error);
  }
});

// ============================================================================
// DELEGATED API CREDENTIALS (Polymarket L2 style)
// ============================================================================

const AVAILABLE_SCOPES = [
  'tasks:read', 'tasks:write', 'tasks:publish',
  'claims:write',
  'submissions:read', 'submissions:write',
  'decisions:accept', 'decisions:reject',
  'escrow:fund', 'escrow:release',
] as const;

const CreateApiTokenSchema = z.object({
  name: z.string().min(1).max(100),
  scopes: z.array(z.string()),
  spend_cap_amount: z.number().positive().optional(),
  spend_cap_currency: z.string().default('USDC'),
  expires_in_days: z.number().int().positive().max(365).optional(),
  signature: z.string().optional(), // Wallet signature for minting proof
});

// GET /v1/auth/api-tokens - List API tokens
router.get('/api-tokens', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const tokens = await prisma.apiToken.findMany({
      where: { userId: req.user!.userId, revokedAt: null },
      orderBy: { createdAt: 'desc' },
    });

    res.json({
      tokens: tokens.map(t => ({
        id: t.id,
        api_key: t.apiKey,
        name: t.name,
        scopes: JSON.parse(t.scopes),
        spend_cap_amount: t.spendCapAmount,
        spend_cap_currency: t.spendCapCurrency,
        spend_used: t.spendUsed,
        expires_at: t.expiresAt?.toISOString(),
        last_used_at: t.lastUsedAt?.toISOString(),
        created_at: t.createdAt.toISOString(),
      })),
    });
  } catch (error) {
    next(error);
  }
});

// POST /v1/auth/api-tokens - Create delegated API token
router.post('/api-tokens', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = CreateApiTokenSchema.parse(req.body);

    // Validate scopes - user can only grant scopes they have
    const userScopes = getDefaultScopes(req.user!.role);
    const invalidScopes = data.scopes.filter(s => !userScopes.includes(s));
    if (invalidScopes.length > 0) {
      throw new ValidationError(`Cannot grant scopes: ${invalidScopes.join(', ')}`);
    }

    // Generate API key and secret
    const apiKey = `gt_${randomBytes(16).toString('hex')}`;
    const secret = randomBytes(32).toString('hex');
    const tokenHash = createHash('sha256').update(secret).digest('hex');

    // Calculate expiry
    const expiresAt = data.expires_in_days
      ? new Date(Date.now() + data.expires_in_days * 24 * 60 * 60 * 1000)
      : null;

    const token = await prisma.apiToken.create({
      data: {
        userId: req.user!.userId,
        apiKey,
        tokenHash,
        name: data.name,
        scopes: JSON.stringify(data.scopes),
        spendCapAmount: data.spend_cap_amount,
        spendCapCurrency: data.spend_cap_currency,
        mintedWithSig: data.signature,
        expiresAt,
      },
    });

    // Return the secret only once - it cannot be retrieved again
    res.status(201).json({
      token: {
        id: token.id,
        api_key: apiKey,
        secret: secret, // Only returned on creation
        name: token.name,
        scopes: data.scopes,
        spend_cap_amount: token.spendCapAmount,
        spend_cap_currency: token.spendCapCurrency,
        expires_at: token.expiresAt?.toISOString(),
        created_at: token.createdAt.toISOString(),
      },
      warning: 'Save the secret now. It cannot be retrieved again.',
    });
  } catch (error) {
    next(error);
  }
});

// DELETE /v1/auth/api-tokens/:tokenId - Revoke API token
router.delete('/api-tokens/:tokenId', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { tokenId } = req.params;

    const token = await prisma.apiToken.findUnique({
      where: { id: tokenId },
    });

    if (!token || token.userId !== req.user!.userId) {
      throw new NotFoundError('API token');
    }

    if (token.revokedAt) {
      throw new ValidationError('Token already revoked');
    }

    await prisma.apiToken.update({
      where: { id: tokenId },
      data: { revokedAt: new Date() },
    });

    res.json({ message: 'Token revoked' });
  } catch (error) {
    next(error);
  }
});

// GET /v1/auth/api-tokens/scopes - List available scopes
router.get('/api-tokens/scopes', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userScopes = getDefaultScopes(req.user!.role);

    res.json({
      available_scopes: AVAILABLE_SCOPES.filter(s => userScopes.includes(s)),
      role: req.user!.role,
    });
  } catch (error) {
    next(error);
  }
});

function getDefaultScopes(role: string): string[] {
  // All users can both post tasks AND collect - unified accounts
  const baseScopes = [
    'tasks:read', 'tasks:write', 'tasks:publish',
    'claims:write',
    'submissions:read', 'submissions:write',
    'decisions:accept', 'decisions:reject',
    'escrow:fund',
  ];

  if (role === 'admin') {
    return [...baseScopes, 'escrow:release', 'admin:resolve_disputes'];
  }

  return baseScopes;
}

export default router;
