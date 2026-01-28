/**
 * Task Lifecycle E2E Test
 *
 * Tests the complete flow: create task -> fund -> claim -> upload artefact ->
 * submit -> accept -> download via signed URL.
 *
 * This test verifies the storage integration works end-to-end.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { createHash } from 'crypto';
import app from '../../src/index';
import { prisma } from '../../src/services/database';
import { resetStorageProvider, createStorageProvider } from '../../src/services/storage';

// Test image data (1x1 red PNG)
const TEST_IMAGE_BASE64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
const TEST_IMAGE_BUFFER = Buffer.from(TEST_IMAGE_BASE64, 'base64');
const TEST_IMAGE_HASH = createHash('sha256').update(TEST_IMAGE_BUFFER).digest('hex');

describe('Task Lifecycle E2E', () => {
  let requesterToken: string;
  let workerToken: string;
  let requesterId: string;
  let workerId: string;
  let taskId: string;
  let submissionId: string;
  let artefactId: string;
  let storageKey: string;

  const TEMP_STORAGE_DIR = path.join(os.tmpdir(), 'field-network-e2e-test');

  beforeAll(async () => {
    // Set up local storage for testing
    process.env.STORAGE_PROVIDER = 'local';
    process.env.STORAGE_DIR = TEMP_STORAGE_DIR;
    resetStorageProvider();

    // Clean up test storage
    if (fs.existsSync(TEMP_STORAGE_DIR)) {
      fs.rmSync(TEMP_STORAGE_DIR, { recursive: true });
    }
    fs.mkdirSync(TEMP_STORAGE_DIR, { recursive: true });

    // Create test users
    const requesterResult = await request(app)
      .post('/v1/auth/register')
      .send({
        email: `requester-${Date.now()}@test.com`,
        password: 'TestPassword123!',
      });

    if (requesterResult.status === 201) {
      requesterToken = requesterResult.body.token;
      requesterId = requesterResult.body.user.id;
    } else {
      throw new Error(`Failed to create requester: ${JSON.stringify(requesterResult.body)}`);
    }

    const workerResult = await request(app)
      .post('/v1/auth/register')
      .send({
        email: `worker-${Date.now()}@test.com`,
        password: 'TestPassword123!',
      });

    if (workerResult.status === 201) {
      workerToken = workerResult.body.token;
      workerId = workerResult.body.user.id;
    } else {
      throw new Error(`Failed to create worker: ${JSON.stringify(workerResult.body)}`);
    }
  });

  afterAll(async () => {
    // Clean up test data
    if (taskId) {
      await prisma.task.delete({ where: { id: taskId } }).catch(() => {});
    }

    // Clean up test storage
    if (fs.existsSync(TEMP_STORAGE_DIR)) {
      fs.rmSync(TEMP_STORAGE_DIR, { recursive: true });
    }

    resetStorageProvider();
  });

  describe('Complete Task Flow', () => {
    it('Step 1: Requester creates a task', async () => {
      const taskData = {
        title: 'E2E Test Task',
        instructions: 'Take a photo of the test location',
        location_lat: 51.5074,
        location_lon: -0.1278,
        radius_m: 100,
        time_start: new Date().toISOString(),
        time_end: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
        bounty_amount: 10.00,
        currency: 'USDC',
        requirements_json: JSON.stringify({
          photos: { count: 1, min_width_px: 640, min_height_px: 480 },
        }),
      };

      const response = await request(app)
        .post('/v1/tasks')
        .set('Authorization', `Bearer ${requesterToken}`)
        .send(taskData);

      expect(response.status).toBe(201);
      expect(response.body.task_id).toBeDefined();
      taskId = response.body.task_id;
    });

    it('Step 2: Requester publishes the task', async () => {
      const response = await request(app)
        .post(`/v1/tasks/${taskId}/publish`)
        .set('Authorization', `Bearer ${requesterToken}`);

      expect(response.status).toBe(200);
      expect(response.body.status).toBe('posted');
    });

    it('Step 3: Worker claims the task', async () => {
      const response = await request(app)
        .post(`/v1/claims/${taskId}`)
        .set('Authorization', `Bearer ${workerToken}`);

      expect(response.status).toBe(201);
      expect(response.body.claim_id).toBeDefined();
    });

    it('Step 4: Worker creates a submission', async () => {
      const response = await request(app)
        .post(`/v1/submissions/${taskId}/submissions`)
        .set('Authorization', `Bearer ${workerToken}`);

      expect(response.status).toBe(201);
      expect(response.body.submission_id).toBeDefined();
      submissionId = response.body.submission_id;
    });

    it('Step 5: Worker initiates artefact upload', async () => {
      const response = await request(app)
        .post(`/v1/submissions/${submissionId}/artefacts`)
        .set('Authorization', `Bearer ${workerToken}`)
        .send({
          type: 'photo',
          filename: 'test-photo.png',
          content_type: 'image/png',
          size_bytes: TEST_IMAGE_BUFFER.length,
        });

      expect(response.status).toBe(201);
      expect(response.body.artefact_id).toBeDefined();
      expect(response.body.upload_url).toBeDefined();
      expect(response.body.storage_key).toBeDefined();

      artefactId = response.body.artefact_id;
      storageKey = response.body.storage_key;
    });

    it('Step 6: Worker uploads the file', async () => {
      // Direct upload using the artefact ID
      const response = await request(app)
        .put(`/v1/uploads/${artefactId}`)
        .set('Authorization', `Bearer ${workerToken}`)
        .set('Content-Type', 'multipart/form-data')
        .attach('file', TEST_IMAGE_BUFFER, {
          filename: 'test-photo.png',
          contentType: 'image/png',
        });

      expect(response.status).toBe(200);
      expect(response.body.artefact_id).toBe(artefactId);
      expect(response.body.sha256).toBeDefined();
    });

    it('Step 7: Worker finalizes the submission', async () => {
      const response = await request(app)
        .post(`/v1/submissions/${submissionId}/finalise`)
        .set('Authorization', `Bearer ${workerToken}`)
        .send({
          capture_claims: {
            device: 'test-device',
            timestamp: new Date().toISOString(),
          },
        });

      expect(response.status).toBe(200);
      expect(response.body.status).toBe('finalised');
      expect(response.body.proof_bundle_hash).toBeDefined();
    });

    it('Step 8: Requester can view the submission', async () => {
      const response = await request(app)
        .get(`/v1/submissions/${submissionId}`)
        .set('Authorization', `Bearer ${requesterToken}`);

      expect(response.status).toBe(200);
      expect(response.body.status).toBe('finalised');
      expect(response.body.artefacts).toHaveLength(1);
    });

    it('Step 9: Requester can get artefact metadata', async () => {
      const response = await request(app)
        .get(`/v1/artefacts/${artefactId}`)
        .set('Authorization', `Bearer ${requesterToken}`);

      expect(response.status).toBe(200);
      expect(response.body.id).toBe(artefactId);
      expect(response.body.type).toBe('photo');
    });

    it('Step 10: Requester can get signed download URL', async () => {
      const response = await request(app)
        .get(`/v1/artefacts/${artefactId}/url`)
        .set('Authorization', `Bearer ${requesterToken}`);

      expect(response.status).toBe(200);
      expect(response.body.url).toBeDefined();
      expect(response.body.expires_at).toBeDefined();
    });

    it('Step 11: Requester can download the file directly', async () => {
      const response = await request(app)
        .get(`/v1/uploads/${artefactId}`)
        .set('Authorization', `Bearer ${requesterToken}`);

      expect(response.status).toBe(200);
      expect(response.headers['content-type']).toContain('image/png');
    });

    it('Step 12: Requester accepts the submission', async () => {
      const response = await request(app)
        .post(`/v1/submissions/${submissionId}/accept`)
        .set('Authorization', `Bearer ${requesterToken}`)
        .send({ comment: 'Great work!' });

      expect(response.status).toBe(200);
      expect(response.body.status).toBe('accepted');
    });

    it('Step 13: Task status is now accepted', async () => {
      const response = await request(app)
        .get(`/v1/tasks/${taskId}`)
        .set('Authorization', `Bearer ${requesterToken}`);

      expect(response.status).toBe(200);
      expect(response.body.status).toBe('accepted');
    });

    it('Step 14: Worker can still download their submission', async () => {
      const response = await request(app)
        .get(`/v1/artefacts/${artefactId}/download`)
        .set('Authorization', `Bearer ${workerToken}`);

      // Should either return the file or redirect to signed URL
      expect([200, 302]).toContain(response.status);
    });
  });

  describe('Access Control', () => {
    it('should deny access to artefacts for unauthorized users', async () => {
      // Create a new user who has no relation to the task
      const otherUserResult = await request(app)
        .post('/v1/auth/register')
        .send({
          email: `other-${Date.now()}@test.com`,
          password: 'TestPassword123!',
        });

      const otherToken = otherUserResult.body.token;

      const response = await request(app)
        .get(`/v1/artefacts/${artefactId}`)
        .set('Authorization', `Bearer ${otherToken}`);

      expect(response.status).toBe(404);
    });

    it('should require authentication for downloads', async () => {
      const response = await request(app)
        .get(`/v1/artefacts/${artefactId}/download`);

      expect(response.status).toBe(401);
    });
  });

  describe('Error Handling', () => {
    it('should return 404 for non-existent artefact', async () => {
      const response = await request(app)
        .get('/v1/artefacts/nonexistent-id')
        .set('Authorization', `Bearer ${requesterToken}`);

      expect(response.status).toBe(404);
    });

    it('should return 404 for non-existent download', async () => {
      const response = await request(app)
        .get('/v1/artefacts/nonexistent-id/download')
        .set('Authorization', `Bearer ${requesterToken}`);

      expect(response.status).toBe(404);
    });
  });
});

describe('Storage Health Check', () => {
  it('should report healthy storage', async () => {
    const response = await request(app)
      .get('/v1/storage/health');

    expect(response.status).toBe(200);
    expect(response.body.healthy).toBe(true);
    expect(response.body.provider).toBeDefined();
  });
});
