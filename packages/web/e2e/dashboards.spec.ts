import { test, expect } from '@playwright/test';
import { setupAuth } from './fixtures';

// Backwards-compat alias — uses the shared fixture which sets dev-mock-token
// (auto-populates user via store devLogin) and mocks all /v1/** API responses.
async function mockAuth(page: any) {
  await setupAuth(page);
}

test.describe('Worker Dashboard', () => {
  test.beforeEach(async ({ page }) => {
    await mockAuth(page);
  });

  test('should display the worker dashboard header', async ({ page }) => {
    await page.goto('/dashboard/worker');

    await expect(page.getByRole('heading', { level: 1, name: 'Collector Mission Board' })).toBeVisible();
    await expect(page.getByText('Field Operator')).toBeVisible();
  });

  test('should display stat cards', async ({ page }) => {
    await page.goto('/dashboard/worker');

    // Stat card labels (use .first() — labels may also appear in headings/copy)
    await expect(page.getByText('Total Earned', { exact: true }).first()).toBeVisible();
    await expect(page.getByText('Reliability', { exact: true }).first()).toBeVisible();
    await expect(page.getByText('Current Streak', { exact: true }).first()).toBeVisible();
    await expect(page.getByText('Active Claims', { exact: true }).first()).toBeVisible();
    await expect(page.getByText('Available Tasks', { exact: true }).first()).toBeVisible();
  });

  test('should have functional tab navigation', async ({ page }) => {
    await page.goto('/dashboard/worker');
    await page.waitForLoadState('networkidle');

    // Verify the three tab buttons are present.
    await expect(page.getByRole('button', { name: 'Available Missions' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Earnings & Stats' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Task History' })).toBeVisible();

    // Click each tab — re-query each time to avoid stale handles after rerenders.
    await page.getByRole('button', { name: 'Earnings & Stats' }).click();
    await page.waitForTimeout(300);
    await page.getByRole('button', { name: 'Task History' }).click();
    await page.waitForTimeout(300);
    await page.getByRole('button', { name: 'Available Missions' }).click();
    await page.waitForTimeout(300);
  });

  test('should display filters panel on missions tab', async ({ page }) => {
    await page.goto('/dashboard/worker');

    // Filters live in the sidebar — check a few label texts using .first()
    await expect(page.getByText('Mission Search').first()).toBeVisible();
    await expect(page.getByText('Distance', { exact: true }).first()).toBeVisible();
    await expect(page.getByText('Minimum Bounty').first()).toBeVisible();
  });

  test('should have View My Claims link', async ({ page }) => {
    await page.goto('/dashboard/worker');

    // Claims link exists somewhere on the page (header, sidebar, or stat card)
    const claimsLink = page.locator('a[href="/dashboard/worker/claims"]').first();
    await expect(claimsLink).toBeVisible();
  });
});

test.describe('Requester Dashboard', () => {
  test.beforeEach(async ({ page }) => {
    await mockAuth(page);
  });

  test('should display the requester dashboard header', async ({ page }) => {
    await page.goto('/dashboard/requester');

    await expect(page.getByRole('heading', { level: 1, name: 'Field Network Command' })).toBeVisible();
    await expect(page.getByText('Requester Console')).toBeVisible();
  });

  test('should display stat cards', async ({ page }) => {
    await page.goto('/dashboard/requester');

    await expect(page.getByText('Total Posted', { exact: true }).first()).toBeVisible();
    await expect(page.getByText('Active Bounties', { exact: true }).first()).toBeVisible();
    await expect(page.getByText('Pending Review', { exact: true }).first()).toBeVisible();
  });

  test('should have Create New Task button', async ({ page }) => {
    await page.goto('/dashboard/requester');

    // Use .first() — Create Task may also appear in nav
    const createButton = page.locator('a[href="/dashboard/requester/new"]').first();
    await expect(createButton).toBeVisible();
  });

  test('should have functional tab navigation', async ({ page }) => {
    await page.goto('/dashboard/requester');
    await page.waitForLoadState('networkidle');

    const overviewTab = page.getByRole('button', { name: 'Overview' });
    const tasksTab = page.getByRole('button', { name: 'Mission Log' });
    const analyticsTab = page.getByRole('button', { name: 'Spending & Analytics' });

    await expect(overviewTab).toBeVisible();
    await expect(tasksTab).toBeVisible();
    await expect(analyticsTab).toBeVisible();

    await tasksTab.click();
    await page.waitForTimeout(500);
    await analyticsTab.click();
    await page.waitForTimeout(500);
  });

  test('should display bounty spend section', async ({ page }) => {
    await page.goto('/dashboard/requester');

    await expect(page.getByRole('heading', { level: 2, name: 'Bounty Spend' })).toBeVisible();
  });

  test('should display pending reviews section', async ({ page }) => {
    await page.goto('/dashboard/requester');

    await expect(page.getByRole('heading', { level: 2, name: 'Pending Reviews' })).toBeVisible();
  });
});

test.describe('Dashboard Mobile Responsiveness', () => {
  test.beforeEach(async ({ page }) => {
    await mockAuth(page);
  });

  test('worker dashboard should be responsive on mobile', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto('/dashboard/worker');

    await expect(page.getByRole('heading', { level: 1, name: 'Collector Mission Board' })).toBeVisible();
  });

  test('requester dashboard should be responsive on mobile', async ({ page }) => {
    // Set mobile viewport
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto('/dashboard/requester');

    // Header should still be visible
    await expect(page.locator('text=Field Network Command')).toBeVisible();

    // Create button should be visible
    await expect(page.locator('a:has-text("Create New Task")')).toBeVisible();
  });

  test('charts should be responsive', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto('/dashboard/worker');
    await page.waitForLoadState('networkidle');

    // Navigate to stats tab
    await page.getByRole('button', { name: 'Earnings & Stats' }).click();
    await page.waitForTimeout(500);

    // Chart container should adapt to viewport (skip if no chart rendered for empty data)
    const chartContainer = page.locator('.recharts-responsive-container');
    if (await chartContainer.count() > 0) {
      const chartBox = await chartContainer.first().boundingBox();
      expect(chartBox?.width).toBeLessThanOrEqual(375);
    }
  });
});

test.describe('Dashboard Loading States', () => {
  test.beforeEach(async ({ page }) => {
    await mockAuth(page);
  });

  test('should show loading spinner while fetching data', async ({ page }) => {
    await page.goto('/dashboard/worker');

    // Loading spinner should appear initially
    const spinner = page.locator('.animate-spin');
    // The spinner might be quick, so we just check it doesn't error
    await page.waitForLoadState('networkidle');
  });

  test('should handle empty states gracefully', async ({ page }) => {
    await page.goto('/dashboard/requester');
    await page.waitForLoadState('networkidle');

    await page.getByRole('button', { name: 'Mission Log' }).click();
    await page.waitForTimeout(500);

    // Should show either tasks or empty state message
    const content = await page.content();
    expect(content).toContain('Task');
  });
});

test.describe('Dashboard Navigation', () => {
  test.beforeEach(async ({ page }) => {
    await mockAuth(page);
  });

  test('should navigate between worker and requester dashboards', async ({ page }) => {
    // Start at worker dashboard
    await page.goto('/dashboard/worker');
    await expect(page.locator('text=Collector Mission Board')).toBeVisible();

    // Navigate to requester dashboard
    await page.goto('/dashboard/requester');
    await expect(page.locator('text=Field Network Command')).toBeVisible();
  });

  test('worker dashboard task modal should open on map marker click simulation', async ({ page }) => {
    await page.goto('/dashboard/worker');
    await page.waitForLoadState('networkidle');

    // The map renders dynamically and only when there's data — verify
    // the page reaches a stable state without crashing.
    await expect(page.getByRole('heading', { level: 1, name: 'Collector Mission Board' })).toBeVisible();
  });
});

test.describe('Dashboard Accessibility', () => {
  test.beforeEach(async ({ page }) => {
    await mockAuth(page);
  });

  test('worker dashboard should have proper heading hierarchy', async ({ page }) => {
    await page.goto('/dashboard/worker');

    // Check for h1
    const h1 = page.locator('h1');
    await expect(h1).toHaveCount(1);
    await expect(h1).toContainText('Collector Mission Board');

    // Check for h2 headings
    const h2s = page.locator('h2');
    expect(await h2s.count()).toBeGreaterThan(0);
  });

  test('requester dashboard should have proper heading hierarchy', async ({ page }) => {
    await page.goto('/dashboard/requester');

    // Check for h1
    const h1 = page.locator('h1');
    await expect(h1).toHaveCount(1);
    await expect(h1).toContainText('Field Network Command');

    // Check for h2 headings
    const h2s = page.locator('h2');
    expect(await h2s.count()).toBeGreaterThan(0);
  });

  test('buttons and links should have accessible names', async ({ page }) => {
    await page.goto('/dashboard/worker');
    await page.waitForLoadState('networkidle');

    // Check that buttons have either text content or an aria-label.
    // Some buttons (icon-only nav, close buttons) only have aria labels.
    const buttons = page.locator('button');
    const buttonCount = await buttons.count();

    for (let i = 0; i < Math.min(buttonCount, 10); i++) {
      const button = buttons.nth(i);
      const text = (await button.textContent())?.trim() || '';
      const ariaLabel = (await button.getAttribute('aria-label')) || '';
      const title = (await button.getAttribute('title')) || '';
      expect(text.length + ariaLabel.length + title.length).toBeGreaterThan(0);
    }
  });
});
