import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcrypt';

const prisma = new PrismaClient();

// Helper to hash passwords
async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 10);
}

// Helper to generate random coordinates around a center point
function randomCoord(lat: number, lon: number, radiusKm: number): { lat: number; lon: number } {
  const earthRadius = 6371; // km
  const maxAngle = radiusKm / earthRadius;

  const randomAngle = Math.random() * 2 * Math.PI;
  const randomRadius = Math.random() * maxAngle;

  const newLat = lat + randomRadius * Math.cos(randomAngle) * (180 / Math.PI);
  const newLon = lon + randomRadius * Math.sin(randomAngle) * (180 / Math.PI) / Math.cos(lat * Math.PI / 180);

  return { lat: newLat, lon: newLon };
}

async function main() {
  console.log('Seeding database...');

  // Clear existing data (in development only)
  if (process.env.NODE_ENV !== 'production') {
    console.log('Clearing existing data...');
    await prisma.notification.deleteMany();
    await prisma.reputationEvent.deleteMany();
    await prisma.feeConfig.deleteMany();
    await prisma.auditEvent.deleteMany();
    await prisma.webhookDelivery.deleteMany();
    await prisma.webhook.deleteMany();
    await prisma.chainEvent.deleteMany();
    await prisma.chainCursor.deleteMany();
    await prisma.ledgerEntry.deleteMany();
    await prisma.escrow.deleteMany();
    await prisma.disputeAuditLog.deleteMany();
    await prisma.dispute.deleteMany();
    await prisma.decision.deleteMany();
    await prisma.artefact.deleteMany();
    await prisma.submission.deleteMany();
    await prisma.taskClaim.deleteMany();
    await prisma.task.deleteMany();
    await prisma.taskTemplate.deleteMany();
    await prisma.apiToken.deleteMany();
    await prisma.userBadge.deleteMany();
    await prisma.badgeDefinition.deleteMany();
    await prisma.userStats.deleteMany();
    await prisma.siweNonce.deleteMany();
    await prisma.walletLink.deleteMany();
    await prisma.workerProfile.deleteMany();
    await prisma.user.deleteMany();
  }

  // =========================================================================
  // 1. CREATE USERS
  // =========================================================================
  console.log('Creating users...');

  const hashedPassword = await hashPassword('password123');

  // Admin user
  const adminUser = await prisma.user.create({
    data: {
      email: 'admin@fieldnetwork.io',
      passwordHash: hashedPassword,
      role: 'admin',
      username: 'admin',
      bio: 'Field Network administrator',
      onboardingCompleted: true,
      notificationPrefs: { email: true, push: true, disputes: true },
      uiSettings: { theme: 'light', compactMode: false },
      defaultRightsJson: {},
      savedAddresses: [],
    },
  });

  // Requester users (post tasks)
  const requester1 = await prisma.user.create({
    data: {
      email: 'alice@example.com',
      passwordHash: hashedPassword,
      role: 'requester',
      username: 'alice_requester',
      bio: 'Urban researcher interested in local infrastructure',
      location: 'London, UK',
      onboardingCompleted: true,
      notificationPrefs: { email: true, push: false },
      uiSettings: { theme: 'light' },
      defaultRightsJson: { exclusivityDays: 7 },
      savedAddresses: [{ label: 'Office', lat: 51.5074, lon: -0.1278 }],
    },
  });

  const requester2 = await prisma.user.create({
    data: {
      email: 'bob@example.com',
      passwordHash: hashedPassword,
      role: 'requester',
      username: 'bob_research',
      bio: 'Environmental consultant',
      location: 'Manchester, UK',
      onboardingCompleted: true,
      notificationPrefs: { email: true, push: true },
      uiSettings: { theme: 'light' },
      defaultRightsJson: {},
      savedAddresses: [],
    },
  });

  // Worker users (complete tasks)
  const worker1 = await prisma.user.create({
    data: {
      email: 'charlie@example.com',
      passwordHash: hashedPassword,
      role: 'worker',
      username: 'charlie_collector',
      bio: 'Professional field collector with 50+ completed tasks',
      location: 'London, UK',
      onboardingCompleted: true,
      notificationPrefs: { email: true, push: true },
      uiSettings: { theme: 'light' },
      defaultRightsJson: {},
      savedAddresses: [],
    },
  });

  const worker2 = await prisma.user.create({
    data: {
      email: 'diana@example.com',
      passwordHash: hashedPassword,
      role: 'worker',
      username: 'diana_photo',
      bio: 'Freelance photographer available for field work',
      location: 'Bristol, UK',
      onboardingCompleted: true,
      notificationPrefs: { email: false, push: true },
      uiSettings: { theme: 'light' },
      defaultRightsJson: {},
      savedAddresses: [],
    },
  });

  const worker3 = await prisma.user.create({
    data: {
      email: 'edward@example.com',
      passwordHash: hashedPassword,
      role: 'worker',
      username: 'ed_walker',
      bio: 'Part-time data collector',
      location: 'Birmingham, UK',
      onboardingCompleted: true,
      notificationPrefs: { email: true, push: false },
      uiSettings: { theme: 'light' },
      defaultRightsJson: {},
      savedAddresses: [],
    },
  });

  console.log(`Created ${6} users`);

  // =========================================================================
  // 2. CREATE WORKER PROFILES
  // =========================================================================
  console.log('Creating worker profiles...');

  await prisma.workerProfile.create({
    data: {
      userId: worker1.id,
      displayName: 'Charlie C.',
      radiusKm: 30,
      skills: ['photography', 'gps_verification', 'urban_survey'],
      kit: ['smartphone', 'tripod', 'measuring_tape'],
      rating: 4.8,
      completedCount: 47,
      strikes: 0,
    },
  });

  await prisma.workerProfile.create({
    data: {
      userId: worker2.id,
      displayName: 'Diana P.',
      radiusKm: 50,
      skills: ['professional_photography', 'night_photography', 'rural_survey'],
      kit: ['dslr_camera', 'drone', 'smartphone'],
      rating: 4.9,
      completedCount: 23,
      strikes: 0,
    },
  });

  await prisma.workerProfile.create({
    data: {
      userId: worker3.id,
      displayName: 'Edward W.',
      radiusKm: 20,
      skills: ['walking_survey', 'documentation'],
      kit: ['smartphone'],
      rating: 4.2,
      completedCount: 8,
      strikes: 1,
    },
  });

  // =========================================================================
  // 3. CREATE USER STATS
  // =========================================================================
  console.log('Creating user stats...');

  await prisma.userStats.createMany({
    data: [
      {
        userId: adminUser.id,
        reliabilityScore: 100,
        emailVerified: true,
        walletVerified: false,
      },
      {
        userId: requester1.id,
        tasksPosted: 15,
        tasksCompleted: 12,
        totalBountiesPaid: 450.00,
        avgResponseTimeHours: 4.5,
        reliabilityScore: 95,
        emailVerified: true,
      },
      {
        userId: requester2.id,
        tasksPosted: 8,
        tasksCompleted: 5,
        totalBountiesPaid: 200.00,
        avgResponseTimeHours: 8.0,
        reliabilityScore: 90,
        emailVerified: true,
      },
      {
        userId: worker1.id,
        tasksClaimed: 52,
        tasksDelivered: 50,
        tasksAccepted: 47,
        tasksRejected: 3,
        totalEarned: 1250.00,
        avgDeliveryTimeHours: 2.5,
        reliabilityScore: 94,
        currentStreak: 12,
        longestStreak: 15,
        emailVerified: true,
        walletVerified: true,
      },
      {
        userId: worker2.id,
        tasksClaimed: 25,
        tasksDelivered: 24,
        tasksAccepted: 23,
        tasksRejected: 1,
        totalEarned: 875.00,
        avgDeliveryTimeHours: 3.0,
        reliabilityScore: 96,
        currentStreak: 8,
        longestStreak: 10,
        emailVerified: true,
        walletVerified: true,
      },
      {
        userId: worker3.id,
        tasksClaimed: 12,
        tasksDelivered: 10,
        tasksAccepted: 8,
        tasksRejected: 2,
        totalEarned: 180.00,
        avgDeliveryTimeHours: 5.0,
        reliabilityScore: 75,
        currentStreak: 2,
        longestStreak: 4,
        emailVerified: true,
        walletVerified: false,
      },
    ],
  });

  // =========================================================================
  // 4. CREATE WALLET LINKS
  // =========================================================================
  console.log('Creating wallet links...');

  await prisma.walletLink.createMany({
    data: [
      {
        userId: worker1.id,
        walletAddress: '0x1234567890abcdef1234567890abcdef12345678',
        chain: 'base',
        chainId: 8453,
        isPrimary: true,
        label: 'Main Wallet',
        verifiedAt: new Date(),
      },
      {
        userId: worker2.id,
        walletAddress: '0xabcdef1234567890abcdef1234567890abcdef12',
        chain: 'base',
        chainId: 8453,
        isPrimary: true,
        label: 'Primary',
        verifiedAt: new Date(),
      },
      {
        userId: requester1.id,
        walletAddress: '0x9876543210fedcba9876543210fedcba98765432',
        chain: 'base',
        chainId: 8453,
        isPrimary: true,
        label: 'Business Wallet',
        verifiedAt: new Date(),
      },
    ],
  });

  // =========================================================================
  // 5. CREATE BADGE DEFINITIONS
  // =========================================================================
  console.log('Creating badge definitions...');

  await prisma.badgeDefinition.createMany({
    data: [
      {
        type: 'early_adopter',
        name: 'Early Adopter',
        description: 'Joined Field Network during the beta period',
        category: 'milestone',
        tiers: [{ tier: 'bronze', threshold: 1 }],
        isActive: true,
      },
      {
        type: 'tasks_completed',
        name: 'Task Master',
        description: 'Complete tasks to earn this badge',
        category: 'milestone',
        tiers: [
          { tier: 'bronze', threshold: 5 },
          { tier: 'silver', threshold: 25 },
          { tier: 'gold', threshold: 100 },
          { tier: 'platinum', threshold: 500 },
        ],
        isActive: true,
      },
      {
        type: 'streak',
        name: 'On Fire',
        description: 'Complete consecutive tasks without abandonment',
        category: 'streak',
        tiers: [
          { tier: 'bronze', threshold: 5 },
          { tier: 'silver', threshold: 15 },
          { tier: 'gold', threshold: 30 },
        ],
        isActive: true,
      },
      {
        type: 'earnings',
        name: 'Top Earner',
        description: 'Total earnings milestones',
        category: 'achievement',
        tiers: [
          { tier: 'bronze', threshold: 100 },
          { tier: 'silver', threshold: 500 },
          { tier: 'gold', threshold: 2500 },
          { tier: 'platinum', threshold: 10000 },
        ],
        isActive: true,
      },
      {
        type: 'reliable',
        name: 'Reliable Collector',
        description: 'Maintain high reliability score',
        category: 'achievement',
        tiers: [
          { tier: 'bronze', threshold: 90 },
          { tier: 'silver', threshold: 95 },
          { tier: 'gold', threshold: 98 },
        ],
        isActive: true,
      },
    ],
  });

  // =========================================================================
  // 6. CREATE USER BADGES
  // =========================================================================
  console.log('Creating user badges...');

  await prisma.userBadge.createMany({
    data: [
      {
        userId: worker1.id,
        badgeType: 'early_adopter',
        tier: 'bronze',
        title: 'Early Adopter',
        description: 'Joined during beta',
        metadata: { joinedAt: '2025-01-01' },
      },
      {
        userId: worker1.id,
        badgeType: 'tasks_completed',
        tier: 'silver',
        title: 'Task Master',
        description: 'Completed 25+ tasks',
        metadata: { count: 47 },
      },
      {
        userId: worker1.id,
        badgeType: 'streak',
        tier: 'silver',
        title: 'On Fire',
        description: '15 task streak',
        metadata: { streak: 15 },
      },
      {
        userId: worker2.id,
        badgeType: 'early_adopter',
        tier: 'bronze',
        title: 'Early Adopter',
        description: 'Joined during beta',
        metadata: {},
      },
      {
        userId: worker2.id,
        badgeType: 'reliable',
        tier: 'silver',
        title: 'Reliable Collector',
        description: '95%+ reliability',
        metadata: { score: 96 },
      },
    ],
  });

  // =========================================================================
  // 7. CREATE TASK TEMPLATE
  // =========================================================================
  console.log('Creating task templates...');

  const geoPhotoTemplate = await prisma.taskTemplate.create({
    data: {
      name: 'geo_photo_v1',
      version: '1.0',
      schemaJson: {
        type: 'geo_photo',
        required: ['photo', 'location'],
        properties: {
          photo: { type: 'image', minWidth: 1000, minHeight: 1000 },
          location: { type: 'gps', accuracy: 50 },
          bearing: { type: 'number', optional: true },
        },
      },
      isActive: true,
    },
  });

  // =========================================================================
  // 8. CREATE TASKS
  // =========================================================================
  console.log('Creating tasks...');

  const londonCenter = { lat: 51.5074, lon: -0.1278 };
  const manchesterCenter = { lat: 53.4808, lon: -2.2426 };

  const now = new Date();
  const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);
  const nextWeek = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
  const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);

  // Task 1: Posted (available)
  const task1 = await prisma.task.create({
    data: {
      requesterId: requester1.id,
      templateId: geoPhotoTemplate.id,
      template: 'geo_photo_v1',
      title: 'Photo of Big Ben Clock Tower',
      instructions: 'Take a clear daytime photo of Big Ben from street level. Include the full tower in frame. Ensure clock face is visible.',
      status: 'posted',
      locationLat: 51.5007,
      locationLon: -0.1246,
      radiusM: 200,
      timeStart: now,
      timeEnd: nextWeek,
      requirementsJson: {
        minWidth: 1920,
        minHeight: 1080,
        gpsRequired: true,
        maxDistance: 200,
      },
      bountyAmount: 25.00,
      currency: 'USDC',
      publishedAt: now,
    },
  });

  // Task 2: Posted (available)
  const task2 = await prisma.task.create({
    data: {
      requesterId: requester1.id,
      templateId: geoPhotoTemplate.id,
      template: 'geo_photo_v1',
      title: 'London Eye from South Bank',
      instructions: 'Capture the London Eye from the South Bank walkway. Must be taken during daylight hours.',
      status: 'posted',
      locationLat: 51.5033,
      locationLon: -0.1196,
      radiusM: 150,
      timeStart: now,
      timeEnd: nextWeek,
      requirementsJson: {
        minWidth: 1920,
        minHeight: 1080,
        gpsRequired: true,
      },
      bountyAmount: 20.00,
      currency: 'USDC',
      publishedAt: now,
    },
  });

  // Task 3: Claimed
  const task3 = await prisma.task.create({
    data: {
      requesterId: requester1.id,
      templateId: geoPhotoTemplate.id,
      template: 'geo_photo_v1',
      title: 'Tower Bridge Photograph',
      instructions: 'Photo of Tower Bridge from the north side of the Thames. Include both towers.',
      status: 'claimed',
      locationLat: 51.5055,
      locationLon: -0.0754,
      radiusM: 300,
      timeStart: now,
      timeEnd: tomorrow,
      requirementsJson: {
        minWidth: 1920,
        minHeight: 1080,
        gpsRequired: true,
      },
      bountyAmount: 30.00,
      currency: 'USDC',
      publishedAt: yesterday,
    },
  });

  // Task 4: Submitted (awaiting review)
  const task4 = await prisma.task.create({
    data: {
      requesterId: requester2.id,
      templateId: geoPhotoTemplate.id,
      template: 'geo_photo_v1',
      title: 'Piccadilly Circus Signs',
      instructions: 'Capture the illuminated advertising signs at Piccadilly Circus. Best taken after dark.',
      status: 'submitted',
      locationLat: 51.5099,
      locationLon: -0.1342,
      radiusM: 100,
      timeStart: yesterday,
      timeEnd: tomorrow,
      requirementsJson: {
        minWidth: 1920,
        minHeight: 1080,
        gpsRequired: true,
      },
      bountyAmount: 35.00,
      currency: 'USDC',
      publishedAt: yesterday,
    },
  });

  // Task 5: Accepted (completed)
  const task5 = await prisma.task.create({
    data: {
      requesterId: requester1.id,
      templateId: geoPhotoTemplate.id,
      template: 'geo_photo_v1',
      title: 'St Paul\'s Cathedral Dome',
      instructions: 'Photo of St Paul\'s Cathedral showing the dome clearly.',
      status: 'accepted',
      locationLat: 51.5138,
      locationLon: -0.0984,
      radiusM: 250,
      timeStart: new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000),
      timeEnd: yesterday,
      requirementsJson: {
        minWidth: 1920,
        minHeight: 1080,
        gpsRequired: true,
      },
      bountyAmount: 25.00,
      currency: 'USDC',
      publishedAt: new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000),
    },
  });

  // More tasks in various states...
  const task6 = await prisma.task.create({
    data: {
      requesterId: requester2.id,
      templateId: geoPhotoTemplate.id,
      template: 'geo_photo_v1',
      title: 'Manchester Town Hall',
      instructions: 'Photo of the Victorian Gothic Manchester Town Hall facade.',
      status: 'posted',
      locationLat: 53.4793,
      locationLon: -2.2444,
      radiusM: 150,
      timeStart: now,
      timeEnd: nextWeek,
      requirementsJson: {
        minWidth: 1920,
        minHeight: 1080,
        gpsRequired: true,
      },
      bountyAmount: 20.00,
      currency: 'USDC',
      publishedAt: now,
    },
  });

  const task7 = await prisma.task.create({
    data: {
      requesterId: requester2.id,
      templateId: geoPhotoTemplate.id,
      template: 'geo_photo_v1',
      title: 'Deansgate Streetscape',
      instructions: 'Street-level photo showing the shops and architecture on Deansgate.',
      status: 'posted',
      locationLat: 53.4790,
      locationLon: -2.2484,
      radiusM: 200,
      timeStart: now,
      timeEnd: nextWeek,
      requirementsJson: {
        minWidth: 1920,
        minHeight: 1080,
        gpsRequired: true,
      },
      bountyAmount: 15.00,
      currency: 'USDC',
      publishedAt: now,
    },
  });

  const task8 = await prisma.task.create({
    data: {
      requesterId: requester1.id,
      templateId: geoPhotoTemplate.id,
      template: 'geo_photo_v1',
      title: 'Disputed - Oxford Street Crowds',
      instructions: 'Photo showing pedestrian density on Oxford Street.',
      status: 'disputed',
      locationLat: 51.5152,
      locationLon: -0.1418,
      radiusM: 300,
      timeStart: new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000),
      timeEnd: yesterday,
      requirementsJson: {
        minWidth: 1920,
        minHeight: 1080,
        gpsRequired: true,
      },
      bountyAmount: 40.00,
      currency: 'USDC',
      publishedAt: new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000),
    },
  });

  // Draft task
  const task9 = await prisma.task.create({
    data: {
      requesterId: requester1.id,
      templateId: geoPhotoTemplate.id,
      template: 'geo_photo_v1',
      title: 'Draft - Canary Wharf Skyline',
      instructions: 'Photo of Canary Wharf business district skyline.',
      status: 'draft',
      locationLat: 51.5054,
      locationLon: -0.0235,
      radiusM: 500,
      timeStart: tomorrow,
      timeEnd: nextWeek,
      requirementsJson: {
        minWidth: 1920,
        minHeight: 1080,
        gpsRequired: true,
      },
      bountyAmount: 50.00,
      currency: 'USDC',
    },
  });

  // Expired task
  const task10 = await prisma.task.create({
    data: {
      requesterId: requester2.id,
      templateId: geoPhotoTemplate.id,
      template: 'geo_photo_v1',
      title: 'Expired - Trafalgar Square',
      instructions: 'Photo of Trafalgar Square with Nelson\'s Column.',
      status: 'expired',
      locationLat: 51.5080,
      locationLon: -0.1281,
      radiusM: 200,
      timeStart: new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000),
      timeEnd: new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000),
      requirementsJson: {
        minWidth: 1920,
        minHeight: 1080,
        gpsRequired: true,
      },
      bountyAmount: 25.00,
      currency: 'USDC',
      publishedAt: new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000),
      expiresAt: new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000),
    },
  });

  console.log(`Created 10 tasks`);

  // =========================================================================
  // 9. CREATE CLAIMS
  // =========================================================================
  console.log('Creating task claims...');

  // Active claim for task3
  await prisma.taskClaim.create({
    data: {
      taskId: task3.id,
      workerId: worker1.id,
      claimedAt: now,
      claimedUntil: new Date(now.getTime() + 4 * 60 * 60 * 1000), // 4 hours
      status: 'active',
    },
  });

  // Converted claim for task4 (submitted)
  await prisma.taskClaim.create({
    data: {
      taskId: task4.id,
      workerId: worker2.id,
      claimedAt: yesterday,
      claimedUntil: new Date(yesterday.getTime() + 4 * 60 * 60 * 1000),
      status: 'converted',
    },
  });

  // Converted claim for task5 (accepted)
  await prisma.taskClaim.create({
    data: {
      taskId: task5.id,
      workerId: worker1.id,
      claimedAt: new Date(now.getTime() - 6 * 24 * 60 * 60 * 1000),
      claimedUntil: new Date(now.getTime() - 6 * 24 * 60 * 60 * 1000 + 4 * 60 * 60 * 1000),
      status: 'converted',
    },
  });

  // Expired claim (worker abandoned)
  await prisma.taskClaim.create({
    data: {
      taskId: task1.id, // Was reclaimed
      workerId: worker3.id,
      claimedAt: new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000),
      claimedUntil: new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000 + 4 * 60 * 60 * 1000),
      status: 'expired',
    },
  });

  // =========================================================================
  // 10. CREATE SUBMISSIONS
  // =========================================================================
  console.log('Creating submissions...');

  // Submission for task4 (pending review)
  const submission1 = await prisma.submission.create({
    data: {
      taskId: task4.id,
      workerId: worker2.id,
      status: 'finalised',
      proofBundleJson: {
        version: '1.0',
        artefacts: ['artefact-uuid-1'],
        timestamp: yesterday.toISOString(),
      },
      proofBundleHash: 'sha256:abc123def456...',
      verificationJson: {
        gpsValid: true,
        distanceMeters: 45,
        imageDimensions: { width: 3840, height: 2160 },
        exifValid: true,
      },
      verificationScore: 95,
      flagsJson: [],
      finalisedAt: yesterday,
    },
  });

  // Submission for task5 (accepted)
  const submission2 = await prisma.submission.create({
    data: {
      taskId: task5.id,
      workerId: worker1.id,
      status: 'accepted',
      proofBundleJson: {
        version: '1.0',
        artefacts: ['artefact-uuid-2'],
        timestamp: new Date(now.getTime() - 5 * 24 * 60 * 60 * 1000).toISOString(),
      },
      proofBundleHash: 'sha256:def456ghi789...',
      verificationJson: {
        gpsValid: true,
        distanceMeters: 120,
        imageDimensions: { width: 4032, height: 3024 },
        exifValid: true,
      },
      verificationScore: 98,
      flagsJson: [],
      finalisedAt: new Date(now.getTime() - 5 * 24 * 60 * 60 * 1000),
    },
  });

  // Submission for task8 (disputed)
  const submission3 = await prisma.submission.create({
    data: {
      taskId: task8.id,
      workerId: worker3.id,
      status: 'disputed',
      proofBundleJson: {
        version: '1.0',
        artefacts: ['artefact-uuid-3'],
        timestamp: new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000).toISOString(),
      },
      proofBundleHash: 'sha256:ghi789jkl012...',
      verificationJson: {
        gpsValid: true,
        distanceMeters: 280,
        imageDimensions: { width: 1920, height: 1080 },
        exifValid: false,
      },
      verificationScore: 65,
      flagsJson: ['missing_exif', 'border_distance'],
      finalisedAt: new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000),
    },
  });

  // Rejected submission
  const submission4 = await prisma.submission.create({
    data: {
      taskId: task2.id,
      workerId: worker3.id,
      status: 'rejected',
      proofBundleJson: {
        version: '1.0',
        artefacts: ['artefact-uuid-4'],
        timestamp: new Date(now.getTime() - 4 * 24 * 60 * 60 * 1000).toISOString(),
      },
      proofBundleHash: 'sha256:jkl012mno345...',
      verificationJson: {
        gpsValid: false,
        distanceMeters: 850,
        imageDimensions: { width: 1280, height: 720 },
        exifValid: true,
      },
      verificationScore: 35,
      flagsJson: ['gps_too_far', 'low_resolution'],
      finalisedAt: new Date(now.getTime() - 4 * 24 * 60 * 60 * 1000),
    },
  });

  // Another accepted submission
  const submission5 = await prisma.submission.create({
    data: {
      taskId: task6.id,
      workerId: worker2.id,
      status: 'accepted',
      proofBundleJson: {
        version: '1.0',
        artefacts: ['artefact-uuid-5'],
        timestamp: new Date(now.getTime() - 1 * 24 * 60 * 60 * 1000).toISOString(),
      },
      proofBundleHash: 'sha256:mno345pqr678...',
      verificationJson: {
        gpsValid: true,
        distanceMeters: 35,
        imageDimensions: { width: 4032, height: 3024 },
        exifValid: true,
      },
      verificationScore: 99,
      flagsJson: [],
      finalisedAt: new Date(now.getTime() - 1 * 24 * 60 * 60 * 1000),
    },
  });

  console.log(`Created 5 submissions`);

  // =========================================================================
  // 11. CREATE DECISIONS
  // =========================================================================
  console.log('Creating decisions...');

  await prisma.decision.createMany({
    data: [
      {
        submissionId: submission2.id,
        actorId: requester1.id,
        decisionType: 'accept',
        comment: 'Excellent photo quality and positioning. Thank you!',
      },
      {
        submissionId: submission4.id,
        actorId: requester1.id,
        decisionType: 'reject',
        reasonCode: 'location_mismatch',
        comment: 'Photo was taken too far from the specified location.',
      },
      {
        submissionId: submission5.id,
        actorId: requester2.id,
        decisionType: 'accept',
        comment: 'Perfect capture of the Town Hall. Well done.',
      },
    ],
  });

  // =========================================================================
  // 12. CREATE DISPUTE
  // =========================================================================
  console.log('Creating disputes...');

  await prisma.dispute.create({
    data: {
      submissionId: submission3.id,
      openedBy: worker3.id,
      status: 'under_review',
      openedAt: new Date(now.getTime() - 1 * 24 * 60 * 60 * 1000),
    },
  });

  // =========================================================================
  // 13. CREATE ESCROWS
  // =========================================================================
  console.log('Creating escrows...');

  await prisma.escrow.createMany({
    data: [
      {
        taskId: task1.id,
        provider: 'mock',
        providerRef: 'mock-escrow-001',
        amount: 25.00,
        currency: 'USDC',
        status: 'funded',
        fundedAt: now,
        createdBy: requester1.id,
      },
      {
        taskId: task2.id,
        provider: 'mock',
        providerRef: 'mock-escrow-002',
        amount: 20.00,
        currency: 'USDC',
        status: 'funded',
        fundedAt: now,
        createdBy: requester1.id,
      },
      {
        taskId: task3.id,
        provider: 'mock',
        providerRef: 'mock-escrow-003',
        amount: 30.00,
        currency: 'USDC',
        status: 'locked',
        fundedAt: yesterday,
        createdBy: requester1.id,
      },
      {
        taskId: task4.id,
        provider: 'mock',
        providerRef: 'mock-escrow-004',
        amount: 35.00,
        currency: 'USDC',
        status: 'locked',
        fundedAt: yesterday,
        createdBy: requester2.id,
      },
      {
        taskId: task5.id,
        provider: 'mock',
        providerRef: 'mock-escrow-005',
        amount: 25.00,
        currency: 'USDC',
        status: 'released',
        fundedAt: new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000),
        releasedAt: new Date(now.getTime() - 5 * 24 * 60 * 60 * 1000),
        workerWallet: '0x1234567890abcdef1234567890abcdef12345678',
        createdBy: requester1.id,
      },
      {
        taskId: task8.id,
        provider: 'mock',
        providerRef: 'mock-escrow-008',
        amount: 40.00,
        currency: 'USDC',
        status: 'disputed',
        fundedAt: new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000),
        createdBy: requester1.id,
      },
    ],
  });

  // =========================================================================
  // 14. CREATE FEE CONFIGS
  // =========================================================================
  console.log('Creating fee configs...');

  await prisma.feeConfig.createMany({
    data: [
      {
        feeType: 'platform',
        name: 'Standard Rate',
        description: 'Default platform fee for new users',
        tierOrder: 0,
        minAccountDays: 0,
        minTasksAccepted: 0,
        minReliability: 0,
        rate: 0.10,
        minFee: 0.50,
        isActive: true,
      },
      {
        feeType: 'platform',
        name: 'Trusted Rate',
        description: 'Reduced fee for established users',
        tierOrder: 1,
        minAccountDays: 30,
        minTasksAccepted: 10,
        minReliability: 90,
        rate: 0.05,
        minFee: 0.25,
        isActive: true,
      },
      {
        feeType: 'arbitration',
        name: 'Dispute Filing Fee',
        description: 'Fee for opening a dispute (refunded if worker wins)',
        tierOrder: 0,
        rate: 0,
        minFee: 5.00,
        isActive: true,
      },
    ],
  });

  // =========================================================================
  // 15. CREATE NOTIFICATIONS
  // =========================================================================
  console.log('Creating notifications...');

  await prisma.notification.createMany({
    data: [
      {
        userId: worker1.id,
        type: 'badge_earned',
        title: 'New Badge Earned!',
        body: 'Congratulations! You earned the Task Master (Silver) badge.',
        data: { badgeType: 'tasks_completed', tier: 'silver' },
        read: false,
      },
      {
        userId: requester1.id,
        type: 'submission_received',
        title: 'New Submission',
        body: 'You have a new submission for "St Paul\'s Cathedral Dome"',
        data: { taskId: task5.id, submissionId: submission2.id },
        read: true,
        readAt: new Date(now.getTime() - 4 * 24 * 60 * 60 * 1000),
      },
      {
        userId: worker3.id,
        type: 'submission_rejected',
        title: 'Submission Rejected',
        body: 'Your submission for "London Eye from South Bank" was rejected.',
        data: { taskId: task2.id, submissionId: submission4.id, reason: 'location_mismatch' },
        read: true,
        readAt: new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000),
      },
      {
        userId: worker2.id,
        type: 'submission_accepted',
        title: 'Payment Received!',
        body: 'Your submission was accepted. $25.00 USDC has been released.',
        data: { taskId: task5.id, amount: 25.00 },
        read: false,
      },
    ],
  });

  // =========================================================================
  // 16. CREATE REPUTATION EVENTS
  // =========================================================================
  console.log('Creating reputation events...');

  await prisma.reputationEvent.createMany({
    data: [
      {
        userId: worker1.id,
        previousScore: 93,
        newScore: 94,
        reason: 'task_accepted',
        taskId: task5.id,
        submissionId: submission2.id,
        metadata: { bountyAmount: 25.00 },
      },
      {
        userId: worker3.id,
        previousScore: 80,
        newScore: 75,
        reason: 'task_rejected',
        taskId: task2.id,
        submissionId: submission4.id,
        metadata: { reasonCode: 'location_mismatch' },
      },
      {
        userId: worker1.id,
        previousScore: 94,
        newScore: 94,
        reason: 'badge_earned',
        badgeType: 'tasks_completed',
        metadata: { tier: 'silver', count: 25 },
      },
    ],
  });

  console.log('Database seeding completed!');
  console.log('\nTest accounts:');
  console.log('- Admin: admin@fieldnetwork.io / password123');
  console.log('- Requester: alice@example.com / password123');
  console.log('- Requester: bob@example.com / password123');
  console.log('- Worker: charlie@example.com / password123');
  console.log('- Worker: diana@example.com / password123');
  console.log('- Worker: edward@example.com / password123');
}

main()
  .catch((e) => {
    console.error('Seeding failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
