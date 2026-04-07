import type { Page, Route } from '@playwright/test';

/**
 * Test fixtures for E2E tests.
 *
 * Strategy:
 * 1. Set Zustand persist localStorage to use 'dev-mock-token'. The store's
 *    loadUser() detects this token and auto-populates a mock admin user via
 *    devLogin() — no API call needed.
 * 2. Intercept all /v1/** API requests with safe default responses that
 *    match the real API shape so pages don't crash on undefined property
 *    access. Tests that need specific data can override individual routes.
 */

export async function setupAuth(page: Page) {
  // 1. Pre-populate Zustand persist storage with the dev token. The store's
  //    loadUser() will see 'dev-mock-token' and call devLogin() to fill in
  //    the mock admin user without hitting any API.
  await page.addInitScript(() => {
    window.localStorage.setItem(
      'field-network-auth',
      JSON.stringify({
        state: {
          token: 'dev-mock-token',
          refreshToken: 'dev-mock-refresh',
        },
        version: 0,
      })
    );
    window.localStorage.setItem('field_access_token', 'dev-mock-token');
    window.localStorage.setItem('field_refresh_token', 'dev-mock-refresh');
  });

  // 2. Mock all API responses with safe defaults
  await mockApi(page);
}

/** Mock API responses with empty/default data so pages render cleanly. */
async function mockApi(page: Page) {
  await page.route('**/v1/**', (route: Route) => {
    const url = route.request().url();
    const method = route.request().method();
    const path = new URL(url).pathname;

    const json = (body: unknown, status = 200) =>
      route.fulfill({
        status,
        contentType: 'application/json',
        body: JSON.stringify(body),
      });

    // ── Auth ───────────────────────────────────────────────
    if (path.includes('/v1/auth/me')) {
      return json({
        id: 'dev-user-001',
        email: 'dev@field-network.local',
        username: 'dev_user',
        role: 'admin',
        onboarding_completed: true,
        wallets: [],
        saved_addresses: [],
        stats: null,
        badges: [],
      });
    }

    // ── Worker stats ───────────────────────────────────────
    if (path.includes('/v1/users/me/stats/worker')) {
      return json({
        summary: {
          tasks_claimed: 0,
          tasks_delivered: 0,
          tasks_accepted: 0,
          tasks_rejected: 0,
          total_earned: 0,
          reliability_score: 100,
          dispute_rate: 0,
          current_streak: 0,
          longest_streak: 0,
          avg_completion_hours: null,
        },
        active: { claims: 0, pending_submissions: 0 },
        earnings_chart: [],
        completed_tasks: [],
        recent_activity: [],
      });
    }

    // ── Requester stats ────────────────────────────────────
    if (path.includes('/v1/users/me/stats/requester')) {
      return json({
        summary: {
          tasks_posted: 0,
          tasks_completed: 0,
          total_bounties_paid: 0,
          fulfillment_rate: 0,
          avg_response_hours: null,
          repeat_workers: 0,
        },
        tasks_by_status: {
          draft: 0,
          posted: 0,
          claimed: 0,
          submitted: 0,
          accepted: 0,
          disputed: 0,
          cancelled: 0,
          expired: 0,
        },
        pending_reviews: [],
        spending_chart: [],
        tasks_map: [],
        template_usage: [],
      });
    }

    // ── Admin stats ────────────────────────────────────────
    if (path.includes('/v1/admin/stats') || path.match(/\/v1\/admin\/?$/)) {
      return json({
        open_disputes: 0,
        total_tasks: 0,
        active_workers: 0,
        total_users: 0,
        recent_disputes: [],
        recent_tasks: [],
      });
    }

    // ── Disputes ───────────────────────────────────────────
    if (path.includes('/v1/admin/disputes') || path.includes('/v1/disputes')) {
      return json({
        disputes: [],
        total: 0,
        page: 1,
        limit: 20,
        total_pages: 0,
      });
    }

    // ── Tasks ──────────────────────────────────────────────
    if (path.includes('/v1/admin/tasks')) {
      return json({
        tasks: [],
        total: 0,
        page: 1,
        limit: 25,
        total_pages: 0,
      });
    }
    if (path.match(/\/v1\/tasks\/?$/) || path.match(/\/v1\/tasks\?/)) {
      return json({ tasks: [], next_cursor: null });
    }

    // ── Users (admin) ──────────────────────────────────────
    if (path.includes('/v1/admin/users')) {
      return json({ users: [], total: 0 });
    }

    // ── Fees ───────────────────────────────────────────────
    if (path.includes('/v1/admin/fees') || path.includes('/v1/fees')) {
      return json({
        configs: [],
        tiers: [],
        stats: {
          total_platform_fees: 0,
          total_arbitration_fees: 0,
          transaction_count: 0,
        },
      });
    }

    // ── Notifications ──────────────────────────────────────
    if (path.includes('/v1/notifications')) {
      return json({ notifications: [], unread_count: 0 });
    }

    // ── Claims ─────────────────────────────────────────────
    if (path.includes('/v1/claims')) {
      return json({ claims: [] });
    }

    // ── Badges ─────────────────────────────────────────────
    if (path.includes('/v1/badges/me')) {
      return json({ badges: [] });
    }
    if (path.includes('/v1/badges')) {
      return json({ badges: [] });
    }

    // ── Profile ────────────────────────────────────────────
    if (path.includes('/v1/profile/me/addresses')) {
      return json({ addresses: [] });
    }
    if (path.includes('/v1/profile')) {
      return json({});
    }

    // ── Marketplace / resale inventory ─────────────────────
    if (path.includes('/v1/marketplace/royalties')) {
      return json({ total_earned: 0, pending: 0, last_payout_at: null });
    }
    if (path.includes('/v1/marketplace') || path.includes('/v1/resale')) {
      return json({ items: [] });
    }

    // ── Submissions ────────────────────────────────────────
    if (path.includes('/v1/submissions')) {
      return json({ submissions: [] });
    }

    // ── Reputation history ─────────────────────────────────
    if (path.includes('/reputation-history')) {
      return json({ events: [], total: 0 });
    }

    // GET fallback — empty object
    if (method === 'GET') {
      return json({});
    }
    // Mutation fallback — success
    return json({ success: true });
  });
}
