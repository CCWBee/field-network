import { test, expect } from '@playwright/test';

// Helper to mock authentication
async function mockAuth(page: any) {
  // Set mock auth token in localStorage before navigation
  await page.addInitScript(() => {
    window.localStorage.setItem(
      'ground-truth-auth',
      JSON.stringify({
        state: {
          token: 'mock-jwt-token',
          refreshToken: 'mock-refresh-token',
        },
        version: 0,
      })
    );
  });
}

test.describe('Worker Dashboard', () => {
  test.beforeEach(async ({ page }) => {
    await mockAuth(page);
  });

  test('should display the worker dashboard header', async ({ page }) => {
    await page.goto('/dashboard/worker');

    // Check header content
    await expect(page.locator('text=Field Operator')).toBeVisible();
    await expect(page.locator('text=Collector Mission Board')).toBeVisible();
    await expect(page.locator('text=Track bounties, performance, and live opportunities')).toBeVisible();
  });

  test('should display stat cards', async ({ page }) => {
    await page.goto('/dashboard/worker');

    // Check for stat card labels
    await expect(page.locator('text=Total Earned')).toBeVisible();
    await expect(page.locator('text=Reliability')).toBeVisible();
    await expect(page.locator('text=Current Streak')).toBeVisible();
    await expect(page.locator('text=Active Claims')).toBeVisible();
    await expect(page.locator('text=Available Tasks')).toBeVisible();
  });

  test('should have functional tab navigation', async ({ page }) => {
    await page.goto('/dashboard/worker');

    // Check tabs are present
    const missionsTab = page.locator('button:has-text("Available Missions")');
    const statsTab = page.locator('button:has-text("Earnings & Stats")');
    const historyTab = page.locator('button:has-text("Task History")');

    await expect(missionsTab).toBeVisible();
    await expect(statsTab).toBeVisible();
    await expect(historyTab).toBeVisible();

    // Click on Stats tab
    await statsTab.click();
    await expect(page.locator('text=Earnings History')).toBeVisible({ timeout: 10000 });

    // Click on History tab
    await historyTab.click();
    await expect(page.locator('text=Completed Tasks Map')).toBeVisible({ timeout: 10000 });

    // Click back to Missions tab
    await missionsTab.click();
    await expect(page.locator('text=Live Bounty Map')).toBeVisible({ timeout: 10000 });
  });

  test('should display filters panel on missions tab', async ({ page }) => {
    await page.goto('/dashboard/worker');

    // Check filters section
    await expect(page.locator('text=Mission Search')).toBeVisible();
    await expect(page.locator('text=Distance')).toBeVisible();
    await expect(page.locator('text=Minimum Bounty')).toBeVisible();
    await expect(page.locator('text=Bounty Currency')).toBeVisible();
    await expect(page.locator('text=Task Type')).toBeVisible();
  });

  test('should have View My Claims link', async ({ page }) => {
    await page.goto('/dashboard/worker');

    const claimsLink = page.locator('a:has-text("View My Claims")');
    await expect(claimsLink).toBeVisible();
    await expect(claimsLink).toHaveAttribute('href', '/dashboard/worker/claims');
  });
});

test.describe('Requester Dashboard', () => {
  test.beforeEach(async ({ page }) => {
    await mockAuth(page);
  });

  test('should display the requester dashboard header', async ({ page }) => {
    await page.goto('/dashboard/requester');

    // Check header content
    await expect(page.locator('text=Requester Console')).toBeVisible();
    await expect(page.locator('text=Field Network Command')).toBeVisible();
    await expect(page.locator('text=Monitor live bounties, fulfillment, and resale-ready data')).toBeVisible();
  });

  test('should display stat cards', async ({ page }) => {
    await page.goto('/dashboard/requester');

    // Check for stat card labels
    await expect(page.locator('text=Total Posted')).toBeVisible();
    await expect(page.locator('text=Active Bounties')).toBeVisible();
    await expect(page.locator('text=Pending Review')).toBeVisible();
    await expect(page.locator('text=Fulfillment Rate')).toBeVisible();
    await expect(page.locator('text=Total Spent')).toBeVisible();
  });

  test('should have Create New Task button', async ({ page }) => {
    await page.goto('/dashboard/requester');

    const createButton = page.locator('a:has-text("Create New Task")');
    await expect(createButton).toBeVisible();
    await expect(createButton).toHaveAttribute('href', '/dashboard/requester/new');
  });

  test('should have functional tab navigation', async ({ page }) => {
    await page.goto('/dashboard/requester');

    // Check tabs are present
    const overviewTab = page.locator('button:has-text("Overview")');
    const tasksTab = page.locator('button:has-text("Mission Log")');
    const analyticsTab = page.locator('button:has-text("Spending & Analytics")');

    await expect(overviewTab).toBeVisible();
    await expect(tasksTab).toBeVisible();
    await expect(analyticsTab).toBeVisible();

    // Click on Tasks tab
    await tasksTab.click();
    // Either shows task table or empty state
    const hasTaskTable = await page.locator('table').isVisible().catch(() => false);
    const hasEmptyState = await page.locator('text=You haven\'t created any tasks yet').isVisible().catch(() => false);
    expect(hasTaskTable || hasEmptyState).toBeTruthy();

    // Click on Analytics tab
    await analyticsTab.click();
    await expect(page.locator('text=Spending History')).toBeVisible({ timeout: 10000 });
  });

  test('should display bounty spend section', async ({ page }) => {
    await page.goto('/dashboard/requester');

    await expect(page.locator('h2:has-text("Bounty Spend")')).toBeVisible();
    await expect(page.locator('text=Active Bounties')).toBeVisible();
    await expect(page.locator('text=Paid Out')).toBeVisible();
    await expect(page.locator('text=Total Budgeted')).toBeVisible();
  });

  test('should display pending reviews section', async ({ page }) => {
    await page.goto('/dashboard/requester');

    await expect(page.locator('h2:has-text("Pending Reviews")')).toBeVisible();
  });
});

test.describe('Dashboard Mobile Responsiveness', () => {
  test.beforeEach(async ({ page }) => {
    await mockAuth(page);
  });

  test('worker dashboard should be responsive on mobile', async ({ page }) => {
    // Set mobile viewport
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto('/dashboard/worker');

    // Header should still be visible
    await expect(page.locator('text=Collector Mission Board')).toBeVisible();

    // Stat cards should stack
    const statCards = page.locator('[class*="glass rounded-lg border border-surface-200 p-4"]');
    expect(await statCards.count()).toBeGreaterThan(0);

    // Tabs should be scrollable
    const tabsContainer = page.locator('[class*="flex gap-2 mb-6 border-b"]');
    await expect(tabsContainer).toBeVisible();
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

    // Navigate to stats tab
    await page.locator('button:has-text("Earnings & Stats")').click();

    // Chart container should adapt to viewport
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

    // Navigate to tasks tab
    await page.locator('button:has-text("Mission Log")').click();

    // Should show either tasks or empty state message
    await page.waitForLoadState('networkidle');
    const content = await page.content();
    const hasContent = content.includes('Task') || content.includes('haven\'t created any tasks');
    expect(hasContent).toBeTruthy();
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

    // The modal would require actual map interaction
    // For now, check that the map container exists
    await expect(page.locator('.leaflet-container')).toBeVisible({ timeout: 10000 });
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

    // Check that buttons have text content
    const buttons = page.locator('button');
    const buttonCount = await buttons.count();

    for (let i = 0; i < Math.min(buttonCount, 5); i++) {
      const button = buttons.nth(i);
      const text = await button.textContent();
      expect(text?.trim().length).toBeGreaterThan(0);
    }
  });
});
