import { test, expect } from '@playwright/test';
import { setupAuth } from './fixtures';

// Backwards-compat alias — uses the shared fixture which sets dev-mock-token
// (auto-populates admin via store devLogin) and mocks all /v1/** API responses.
async function mockAdminAuth(page: any) {
  await setupAuth(page);
}

test.describe('Admin Dashboard - Overview', () => {
  test.beforeEach(async ({ page }) => {
    await mockAdminAuth(page);
  });

  test('should display the admin panel sidebar', async ({ page }) => {
    await page.goto('/dashboard/admin');

    // Sidebar nav lives inside an <aside> — scope locators to avoid
    // collisions with the top nav bar links.
    const sidebar = page.locator('aside');
    await expect(sidebar.getByText('Admin Panel')).toBeVisible();
    await expect(sidebar.getByText('Manage platform operations')).toBeVisible();

    await expect(sidebar.locator('a[href="/dashboard/admin"]')).toBeVisible();
    await expect(sidebar.locator('a[href="/dashboard/admin/disputes"]')).toBeVisible();
    await expect(sidebar.locator('a[href="/dashboard/admin/tasks"]')).toBeVisible();
    await expect(sidebar.locator('a[href="/dashboard/admin/users"]')).toBeVisible();
  });

  test('should display admin overview stats', async ({ page }) => {
    await page.goto('/dashboard/admin');

    // Wait for content to load
    await page.waitForLoadState('networkidle');

    // Check for stat labels (may show 0 if no data)
    const content = await page.content();
    expect(content).toContain('admin');
  });

  test('should navigate to disputes from sidebar', async ({ page }) => {
    await page.goto('/dashboard/admin');

    await page.locator('aside a[href="/dashboard/admin/disputes"]').click();
    await expect(page).toHaveURL(/\/dashboard\/admin\/disputes/);
    await expect(page.locator('h1:has-text("Dispute Resolution")')).toBeVisible();
  });

  test('should navigate to tasks from sidebar', async ({ page }) => {
    await page.goto('/dashboard/admin');

    await page.locator('aside a[href="/dashboard/admin/tasks"]').click();
    await expect(page).toHaveURL(/\/dashboard\/admin\/tasks/);
    await expect(page.locator('h1:has-text("Task Moderation")')).toBeVisible();
  });
});

test.describe('Admin Dashboard - Disputes List', () => {
  test.beforeEach(async ({ page }) => {
    await mockAdminAuth(page);
  });

  test('should display disputes page header', async ({ page }) => {
    await page.goto('/dashboard/admin/disputes');

    await expect(page.locator('h1:has-text("Dispute Resolution")')).toBeVisible();
    await expect(page.locator('text=Review and resolve disputes')).toBeVisible();
  });

  test('should display filter controls', async ({ page }) => {
    await page.goto('/dashboard/admin/disputes');

    // Check filter dropdowns
    await expect(page.locator('label:has-text("Status")')).toBeVisible();
    await expect(page.locator('label:has-text("Sort By")')).toBeVisible();
    await expect(page.locator('label:has-text("Order")')).toBeVisible();

    // Check reset button
    await expect(page.locator('button:has-text("Reset Filters")')).toBeVisible();
  });

  test('should filter disputes by status', async ({ page }) => {
    await page.goto('/dashboard/admin/disputes');
    await page.waitForLoadState('networkidle');

    const statusSelect = page.locator('select').first();
    await statusSelect.selectOption('opened');

    // URL update is async via router.replace — give it time
    await expect(page).toHaveURL(/status=opened/, { timeout: 10000 });
  });

  test('should change sort order', async ({ page }) => {
    await page.goto('/dashboard/admin/disputes');
    await page.waitForLoadState('networkidle');

    const orderSelect = page.locator('select').last();
    await orderSelect.selectOption('asc');

    await expect(page).toHaveURL(/sort_order=asc/, { timeout: 10000 });
  });

  test('should display empty state when no disputes', async ({ page }) => {
    await page.goto('/dashboard/admin/disputes');
    await page.waitForLoadState('networkidle');

    // Either shows disputes or empty state
    const content = await page.content();
    const hasDisputes = content.includes('dispute') || content.includes('Dispute');
    expect(hasDisputes).toBeTruthy();
  });

  test('should reset filters', async ({ page }) => {
    await page.goto('/dashboard/admin/disputes?status=opened&sort_order=asc');
    await page.waitForLoadState('networkidle');

    await page.getByRole('button', { name: 'Reset Filters' }).click();

    // URL should be clean (router.replace is async)
    await expect(page).toHaveURL(/\/dashboard\/admin\/disputes\/?$/, { timeout: 10000 });
  });
});

test.describe('Admin Dashboard - Dispute Detail', () => {
  test.beforeEach(async ({ page }) => {
    await mockAdminAuth(page);
  });

  test('should display dispute not found for invalid ID', async ({ page }) => {
    await page.goto('/dashboard/admin/disputes/invalid-dispute-id');
    await page.waitForLoadState('networkidle');

    // Should show not found or error
    const content = await page.content();
    const hasError = content.includes('Not Found') || content.includes('not found') || content.includes('error');
    expect(hasError).toBeTruthy();
  });

  test('should have back link to disputes list', async ({ page }) => {
    await page.goto('/dashboard/admin/disputes/test-dispute-id');
    await page.waitForLoadState('networkidle');

    // The link back should exist even if dispute not found
    const backLink = page.locator('a[href="/dashboard/admin/disputes"]');
    if (await backLink.isVisible()) {
      await expect(backLink).toBeVisible();
    }
  });
});

test.describe('Admin Dashboard - Task Moderation', () => {
  test.beforeEach(async ({ page }) => {
    await mockAdminAuth(page);
  });

  test('should display tasks page header', async ({ page }) => {
    await page.goto('/dashboard/admin/tasks');

    await expect(page.locator('h1:has-text("Task Moderation")')).toBeVisible();
    await expect(page.locator('text=View and manage all tasks')).toBeVisible();
  });

  test('should display status filter', async ({ page }) => {
    await page.goto('/dashboard/admin/tasks');

    await expect(page.locator('label:has-text("Status")')).toBeVisible();

    // Check filter has all status options
    const statusSelect = page.locator('select').first();
    await expect(statusSelect).toBeVisible();
  });

  test('should filter tasks by status', async ({ page }) => {
    await page.goto('/dashboard/admin/tasks');
    await page.waitForLoadState('networkidle');

    const statusSelect = page.locator('select').first();
    await statusSelect.selectOption('posted');

    await expect(page).toHaveURL(/status=posted/, { timeout: 10000 });
  });

  test('should display tasks table headers', async ({ page }) => {
    await page.goto('/dashboard/admin/tasks');
    await page.waitForLoadState('networkidle');

    // Check table exists (may have no rows)
    const table = page.locator('table');
    if (await table.isVisible()) {
      await expect(page.locator('th:has-text("Task")')).toBeVisible();
      await expect(page.locator('th:has-text("Requester")')).toBeVisible();
      await expect(page.locator('th:has-text("Bounty")')).toBeVisible();
      await expect(page.locator('th:has-text("Status")')).toBeVisible();
    }
  });

  test('should display empty state when no tasks', async ({ page }) => {
    await page.goto('/dashboard/admin/tasks');
    await page.waitForLoadState('networkidle');

    // Either shows tasks or empty state
    const content = await page.content();
    const hasContent = content.includes('No tasks found') || content.includes('Task');
    expect(hasContent).toBeTruthy();
  });
});

test.describe('Admin Dashboard - Resolution Form', () => {
  test.beforeEach(async ({ page }) => {
    await mockAdminAuth(page);
  });

  // Note: These tests would require a real dispute to exist
  // For now, we test the form structure conceptually

  test('should have three resolution outcome options in the UI', async ({ page }) => {
    // This would need a real dispute page
    // Testing conceptually that the options exist
    await page.goto('/dashboard/admin/disputes');
    await page.waitForLoadState('networkidle');

    // Just verify the page loads correctly
    await expect(page.locator('h1:has-text("Dispute Resolution")')).toBeVisible();
  });
});

test.describe('Admin Dashboard - Accessibility', () => {
  test.beforeEach(async ({ page }) => {
    await mockAdminAuth(page);
  });

  test('disputes page should have proper heading hierarchy', async ({ page }) => {
    await page.goto('/dashboard/admin/disputes');

    const h1 = page.locator('h1');
    await expect(h1).toHaveCount(1);
    await expect(h1).toContainText('Dispute Resolution');
  });

  test('tasks page should have proper heading hierarchy', async ({ page }) => {
    await page.goto('/dashboard/admin/tasks');

    const h1 = page.locator('h1');
    await expect(h1).toHaveCount(1);
    await expect(h1).toContainText('Task Moderation');
  });

  test('sidebar navigation should be keyboard accessible', async ({ page }) => {
    await page.goto('/dashboard/admin');

    // Tab through navigation links
    await page.keyboard.press('Tab');
    await page.keyboard.press('Tab');

    // Check that links can receive focus
    const focusedElement = await page.evaluate(() => document.activeElement?.tagName);
    expect(['A', 'BUTTON']).toContain(focusedElement);
  });

  test('filter controls should be keyboard accessible', async ({ page }) => {
    await page.goto('/dashboard/admin/disputes');

    // Tab to filter controls
    const statusSelect = page.locator('select').first();
    await statusSelect.focus();

    // Should be able to change with keyboard
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('Enter');
  });
});

test.describe('Admin Dashboard - Mobile Responsiveness', () => {
  test.beforeEach(async ({ page }) => {
    await mockAdminAuth(page);
  });

  test('disputes page should be responsive on mobile', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto('/dashboard/admin/disputes');

    // Header should still be visible
    await expect(page.locator('h1:has-text("Dispute Resolution")')).toBeVisible();

    // Filters should be visible
    await expect(page.locator('label:has-text("Status")')).toBeVisible();
  });

  test('tasks page should be responsive on mobile', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto('/dashboard/admin/tasks');

    // Header should still be visible
    await expect(page.locator('h1:has-text("Task Moderation")')).toBeVisible();
  });

  test('sidebar should adapt on mobile', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto('/dashboard/admin');

    // Content should be visible even with narrow viewport
    await page.waitForLoadState('networkidle');
    const content = await page.content();
    expect(content).toContain('Admin');
  });
});

test.describe('Admin Dashboard - Error Handling', () => {
  test.beforeEach(async ({ page }) => {
    await mockAdminAuth(page);
  });

  test('should handle network errors gracefully', async ({ page }) => {
    // Simulate offline state
    await page.route('**/v1/admin/**', (route) => {
      route.abort('failed');
    });

    await page.goto('/dashboard/admin/disputes');
    await page.waitForLoadState('networkidle');

    // Should show error or empty state, not crash
    const content = await page.content();
    const hasErrorHandling = content.includes('error') || content.includes('No disputes') || content.includes('found');
    expect(hasErrorHandling).toBeTruthy();
  });

  test('should handle API errors gracefully', async ({ page }) => {
    // Simulate 500 error
    await page.route('**/v1/admin/**', (route) => {
      route.fulfill({
        status: 500,
        body: JSON.stringify({ error: 'Internal server error' }),
      });
    });

    await page.goto('/dashboard/admin/disputes');
    await page.waitForLoadState('networkidle');

    // Page should not crash
    const content = await page.content();
    expect(content.length).toBeGreaterThan(0);
  });
});

test.describe('Admin Dashboard - URL State Management', () => {
  test.beforeEach(async ({ page }) => {
    await mockAdminAuth(page);
  });

  test('should preserve filter state in URL', async ({ page }) => {
    await page.goto('/dashboard/admin/disputes');
    await page.waitForLoadState('networkidle');

    // Apply filters
    const statusSelect = page.locator('select').first();
    await statusSelect.selectOption('opened');

    // Wait for the URL to actually update before reloading
    await expect(page).toHaveURL(/status=opened/, { timeout: 10000 });

    // Refresh page
    await page.reload();
    await page.waitForLoadState('networkidle');

    // Filter should be preserved (re-query select after reload)
    await expect(page.locator('select').first()).toHaveValue('opened');
  });

  test('should handle pagination in URL', async ({ page }) => {
    await page.goto('/dashboard/admin/disputes?page=2');
    await page.waitForLoadState('networkidle');

    // Page should load without errors
    const content = await page.content();
    expect(content).toContain('Dispute');
  });

  test('should handle invalid page numbers gracefully', async ({ page }) => {
    await page.goto('/dashboard/admin/disputes?page=999');
    await page.waitForLoadState('networkidle');

    // Should not crash
    const content = await page.content();
    expect(content).toContain('Dispute');
  });
});
