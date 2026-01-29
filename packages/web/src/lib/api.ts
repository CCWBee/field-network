import type { TaskStatus, SubmissionStatus, UserRole } from '@ground-truth/shared';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';

// Re-export shared types for consumers
export type { TaskStatus, SubmissionStatus, UserRole };

// Storage keys for tokens
const ACCESS_TOKEN_KEY = 'field_access_token';
const REFRESH_TOKEN_KEY = 'field_refresh_token';

// Event for session expiry (components can listen to this)
export const sessionExpiredEvent = typeof window !== 'undefined' ? new EventTarget() : null;

interface RequestOptions extends RequestInit {
  token?: string;
  skipRefresh?: boolean; // Skip token refresh on 401 (to prevent infinite loops)
}

class ApiClient {
  private baseUrl: string;
  private token: string | null = null;
  private refreshToken: string | null = null;
  private refreshPromise: Promise<boolean> | null = null;
  private onSessionExpired: (() => void) | null = null;

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl;
    // Load tokens from localStorage if available (client-side only)
    if (typeof window !== 'undefined') {
      this.token = localStorage.getItem(ACCESS_TOKEN_KEY);
      this.refreshToken = localStorage.getItem(REFRESH_TOKEN_KEY);
    }
  }

  setToken(token: string | null) {
    this.token = token;
    if (typeof window !== 'undefined') {
      if (token) {
        localStorage.setItem(ACCESS_TOKEN_KEY, token);
      } else {
        localStorage.removeItem(ACCESS_TOKEN_KEY);
      }
    }
  }

  setRefreshToken(refreshToken: string | null) {
    this.refreshToken = refreshToken;
    if (typeof window !== 'undefined') {
      if (refreshToken) {
        localStorage.setItem(REFRESH_TOKEN_KEY, refreshToken);
      } else {
        localStorage.removeItem(REFRESH_TOKEN_KEY);
      }
    }
  }

  /**
   * Set both tokens at once (useful after login)
   */
  setTokens(accessToken: string | null, refreshToken: string | null) {
    this.setToken(accessToken);
    this.setRefreshToken(refreshToken);
  }

  /**
   * Clear all tokens (for logout)
   */
  clearTokens() {
    this.setTokens(null, null);
  }

  /**
   * Get current access token
   */
  getToken(): string | null {
    return this.token;
  }

  /**
   * Get current refresh token
   */
  getRefreshToken(): string | null {
    return this.refreshToken;
  }

  /**
   * Check if user has tokens (may still be expired)
   */
  hasTokens(): boolean {
    return !!(this.token || this.refreshToken);
  }

  /**
   * Set callback for session expiry
   */
  onSessionExpiry(callback: () => void) {
    this.onSessionExpired = callback;
  }

  /**
   * Attempt to refresh the access token
   * Returns true if successful, false otherwise
   */
  private async tryRefreshToken(): Promise<boolean> {
    // If already refreshing, wait for that to complete
    if (this.refreshPromise) {
      return this.refreshPromise;
    }

    if (!this.refreshToken) {
      return false;
    }

    this.refreshPromise = (async () => {
      try {
        const response = await fetch(`${this.baseUrl}/v1/auth/refresh`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ refreshToken: this.refreshToken }),
        });

        if (!response.ok) {
          // Refresh failed - session is expired
          this.handleSessionExpired();
          return false;
        }

        const data = await response.json();
        this.setTokens(data.token, data.refreshToken);
        return true;
      } catch (error) {
        console.error('Token refresh failed:', error);
        this.handleSessionExpired();
        return false;
      } finally {
        this.refreshPromise = null;
      }
    })();

    return this.refreshPromise;
  }

  /**
   * Handle session expiry
   */
  private handleSessionExpired() {
    this.clearTokens();
    // Dispatch event for listeners
    if (sessionExpiredEvent) {
      sessionExpiredEvent.dispatchEvent(new CustomEvent('expired'));
    }
    // Call callback if set
    if (this.onSessionExpired) {
      this.onSessionExpired();
    }
  }

  private async request<T>(
    endpoint: string,
    options: RequestOptions = {}
  ): Promise<T> {
    const { token, skipRefresh, ...fetchOptions } = options;

    const headers: HeadersInit = {
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    };

    if (token || this.token) {
      (headers as Record<string, string>)['Authorization'] = `Bearer ${token || this.token}`;
    }

    const response = await fetch(`${this.baseUrl}${endpoint}`, {
      ...fetchOptions,
      headers,
    });

    // Handle 401 Unauthorized - try to refresh token
    if (response.status === 401 && !skipRefresh && !token) {
      const refreshed = await this.tryRefreshToken();
      if (refreshed) {
        // Retry the original request with new token
        return this.request<T>(endpoint, { ...options, skipRefresh: true });
      }
      // Refresh failed, throw the error
      const error = await response.json().catch(() => ({ error: 'Session expired' }));
      throw new Error(error.error || 'Session expired');
    }

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Unknown error' }));
      throw new Error(error.error || `HTTP ${response.status}`);
    }

    return response.json();
  }

  // Auth endpoints
  async register(email: string, password: string) {
    const result = await this.request<{
      user: { id: string; email: string; role: string };
      token: string;
      refreshToken: string;
    }>('/v1/auth/register', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });

    // Automatically store tokens after successful registration
    this.setTokens(result.token, result.refreshToken);
    return result;
  }

  async login(email: string, password: string) {
    const result = await this.request<{
      user: { id: string; email: string; role: string };
      token: string;
      refreshToken: string;
    }>('/v1/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });

    // Automatically store tokens after successful login
    this.setTokens(result.token, result.refreshToken);
    return result;
  }

  /**
   * Logout - invalidates tokens on server and clears local storage
   */
  async logout(): Promise<void> {
    try {
      // Send logout request with refresh token so server can invalidate both
      await this.request<{ message: string }>('/v1/auth/logout', {
        method: 'POST',
        body: JSON.stringify({ refreshToken: this.refreshToken }),
        skipRefresh: true, // Don't try to refresh on logout
      });
    } catch (error) {
      // Even if server request fails, clear local tokens
      console.warn('Logout request failed:', error);
    } finally {
      this.clearTokens();
    }
  }

  /**
   * Logout from all devices - invalidates all user tokens
   */
  async logoutAll(): Promise<void> {
    try {
      await this.request<{ message: string }>('/v1/auth/logout-all', {
        method: 'POST',
        skipRefresh: true,
      });
    } catch (error) {
      console.warn('Logout all request failed:', error);
    } finally {
      this.clearTokens();
    }
  }

  async getMe() {
    return this.request<{
      id: string;
      email: string | null;
      username: string | null;
      role: string;
      bio: string | null;
      avatar_url: string | null;
      ens_name: string | null;
      ens_avatar_url: string | null;
      location: string | null;
      website: string | null;
      twitter_handle: string | null;
      onboarding_completed: boolean;
      saved_addresses: any[];
      primary_wallet: string | null;
      wallets: Array<{
        id: string;
        address: string;
        chain: string;
        chain_id: number;
        is_primary: boolean;
        label: string | null;
      }>;
      workerProfile?: any;
      stats?: {
        tasks_posted: number;
        tasks_completed: number;
        total_bounties_paid: number;
        tasks_claimed: number;
        tasks_delivered: number;
        tasks_accepted: number;
        tasks_rejected: number;
        total_earned: number;
        reliability_score: number;
        dispute_rate: number;
        current_streak: number;
        longest_streak: number;
        repeat_customers: number;
        email_verified: boolean;
        wallet_verified: boolean;
        identity_verified: boolean;
      };
      badges: Array<{
        badge_type: string;
        tier: string;
        title: string;
        description: string;
        icon_url: string | null;
        earned_at: string;
      }>;
    }>('/v1/auth/me');
  }

  // SIWE authentication endpoints
  async getSiweNonce() {
    return this.request<{ nonce: string }>('/v1/auth/siwe/nonce');
  }

  async verifySiwe(data: {
    message: string;
    signature: string;
    role?: 'requester' | 'worker';
  }) {
    const result = await this.request<{
      user: {
        id: string;
        email: string | null;
        role: string;
        wallet_address: string;
        is_new_user: boolean;
      };
      token: string;
      refreshToken: string;
    }>('/v1/auth/siwe/verify', {
      method: 'POST',
      body: JSON.stringify(data),
    });

    // Automatically store tokens after successful SIWE verification
    this.setTokens(result.token, result.refreshToken);
    return result;
  }

  // Wallet management
  async linkWallet(data: { message: string; signature: string; label?: string }) {
    return this.request<{
      wallet: {
        id: string;
        address: string;
        chain: string;
        is_primary: boolean;
      };
    }>('/v1/auth/wallet/link', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async unlinkWallet(walletId: string) {
    return this.request<{ message: string }>(`/v1/auth/wallet/${walletId}`, {
      method: 'DELETE',
    });
  }

  async setPrimaryWallet(walletId: string) {
    return this.request<{ message: string }>(`/v1/auth/wallet/${walletId}/primary`, {
      method: 'PUT',
    });
  }

  // API tokens (delegated credentials)
  async getApiTokens() {
    return this.request<{
      tokens: Array<{
        id: string;
        api_key: string;
        name: string;
        scopes: string[];
        spend_cap_amount: number | null;
        spend_used: number;
        expires_at: string | null;
        last_used_at: string | null;
        created_at: string;
      }>;
    }>('/v1/auth/api-tokens');
  }

  async createApiToken(data: {
    name: string;
    scopes: string[];
    spend_cap_amount?: number;
    expires_in_days?: number;
  }) {
    return this.request<{
      token: {
        id: string;
        api_key: string;
        secret: string;
        name: string;
        scopes: string[];
        expires_at: string | null;
      };
      warning: string;
    }>('/v1/auth/api-tokens', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async revokeApiToken(tokenId: string) {
    return this.request<{ message: string }>(`/v1/auth/api-tokens/${tokenId}`, {
      method: 'DELETE',
    });
  }

  async getAvailableScopes() {
    return this.request<{
      available_scopes: string[];
      role: string;
    }>('/v1/auth/api-tokens/scopes');
  }

  // Task endpoints
  async getTasks(filters?: {
    status?: string;
    template?: string;
    min_bounty?: number;
    limit?: number;
  }) {
    const params = new URLSearchParams();
    if (filters) {
      Object.entries(filters).forEach(([key, value]) => {
        if (value !== undefined) params.append(key, String(value));
      });
    }
    return this.request<{ tasks: any[]; next_cursor: string | null }>(
      `/v1/tasks?${params}`
    );
  }

  async getTask(taskId: string) {
    return this.request<any>(`/v1/tasks/${taskId}`);
  }

  async createTask(taskData: any) {
    return this.request<{ id: string; status: string; created_at: string }>(
      '/v1/tasks',
      {
        method: 'POST',
        body: JSON.stringify(taskData),
      }
    );
  }

  async publishTask(taskId: string) {
    return this.request<{ id: string; status: string; published_at: string }>(
      `/v1/tasks/${taskId}/publish`,
      { method: 'POST' }
    );
  }

  async cancelTask(taskId: string, reason?: string) {
    return this.request<{ id: string; status: string }>(
      `/v1/tasks/${taskId}/cancel`,
      {
        method: 'POST',
        body: JSON.stringify({ reason }),
      }
    );
  }

  // Claim endpoints
  async getMyClaims() {
    return this.request<{ claims: any[] }>('/v1/claims');
  }

  async claimTask(taskId: string) {
    return this.request<{
      claim_id: string;
      task_id: string;
      claimed_at: string;
      claimed_until: string;
    }>(`/v1/tasks/${taskId}/claim`, { method: 'POST' });
  }

  async unclaimTask(taskId: string) {
    return this.request<{ message: string; task_id: string }>(
      `/v1/tasks/${taskId}/unclaim`,
      { method: 'POST' }
    );
  }

  // Submission endpoints
  async createSubmission(taskId: string) {
    return this.request<{
      submission_id: string;
      task_id: string;
      status: string;
    }>(`/v1/tasks/${taskId}/submissions`, { method: 'POST' });
  }

  async initArtefactUpload(submissionId: string, artefact: {
    type: string;
    filename: string;
    content_type: string;
    size_bytes: number;
  }) {
    return this.request<{
      artefact_id: string;
      upload_id: string;
      upload_url: string;
    }>(`/v1/submissions/${submissionId}/artefacts`, {
      method: 'POST',
      body: JSON.stringify(artefact),
    });
  }

  async finaliseSubmission(submissionId: string, captureClaims?: any) {
    return this.request<{
      submission_id: string;
      status: string;
      proof_bundle_hash: string;
      verification_score: number;
    }>(`/v1/submissions/${submissionId}/finalise`, {
      method: 'POST',
      body: JSON.stringify({ capture_claims: captureClaims }),
    });
  }

  async getSubmission(submissionId: string) {
    return this.request<any>(`/v1/submissions/${submissionId}`);
  }

  async acceptSubmission(submissionId: string, comment?: string) {
    return this.request<{ submission_id: string; status: string }>(
      `/v1/submissions/${submissionId}/accept`,
      {
        method: 'POST',
        body: JSON.stringify({ comment }),
      }
    );
  }

  async rejectSubmission(submissionId: string, reasonCode: string, comment?: string) {
    return this.request<{ submission_id: string; status: string }>(
      `/v1/submissions/${submissionId}/reject`,
      {
        method: 'POST',
        body: JSON.stringify({ reason_code: reasonCode, comment }),
      }
    );
  }

  // Profile endpoints
  async updateProfile(data: {
    username?: string;
    bio?: string;
    location?: string;
    website?: string;
    twitter_handle?: string;
  }) {
    return this.request<{
      id: string;
      username: string | null;
      bio: string | null;
      avatar_url: string | null;
      ens_name: string | null;
      location: string | null;
      website: string | null;
      twitter_handle: string | null;
      onboarding_completed: boolean;
    }>('/v1/profile', {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  }

  async completeOnboarding(data: {
    username: string;
    email?: string;
    bio?: string;
  }) {
    return this.request<{
      id: string;
      username: string;
      email: string | null;
      onboarding_completed: boolean;
    }>('/v1/profile/onboarding', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async checkUsername(username: string) {
    return this.request<{
      available: boolean;
      reason?: string;
    }>(`/v1/profile/check-username/${encodeURIComponent(username)}`);
  }

  async refreshENS() {
    return this.request<{
      ens_name: string | null;
      ens_avatar_url: string | null;
      suggested_username: string | null;
    }>('/v1/profile/refresh-ens', {
      method: 'POST',
    });
  }

  async getPublicProfile(usernameOrId: string) {
    return this.request<{
      id: string;
      username: string | null;
      bio: string | null;
      avatar_url: string | null;
      ens_name: string | null;
      location: string | null;
      website: string | null;
      twitter_handle: string | null;
      wallet_address: string | null;
      stats: any;
      badges: any[];
      member_since: string;
    }>(`/v1/profile/${encodeURIComponent(usernameOrId)}`);
  }

  // Admin endpoints
  async getAdminStats() {
    return this.request<{
      open_disputes: number;
      total_tasks: number;
      active_claims: number;
      active_workers: number;
      pending_submissions: number;
      total_users: number;
    }>('/v1/admin/stats');
  }

  async getAdminUsers(filters?: {
    status?: string;
    role?: string;
    query?: string;
    limit?: number;
    offset?: number;
  }) {
    const params = new URLSearchParams();
    if (filters) {
      Object.entries(filters).forEach(([key, value]) => {
        if (value !== undefined && value !== null && value !== '') {
          params.append(key, String(value));
        }
      });
    }
    return this.request<{
      users: Array<{
        id: string;
        email: string | null;
        username: string | null;
        role: string;
        status: string;
        ens_name: string | null;
        created_at: string;
        stats: {
          reliability_score: number;
          dispute_rate: number;
          tasks_completed: number;
          tasks_accepted: number;
          total_earned: number;
        } | null;
      }>;
      total: number;
      limit: number;
      offset: number;
    }>(`/v1/admin/users?${params.toString()}`);
  }

  async updateUserStatus(userId: string, status: 'active' | 'suspended' | 'banned') {
    return this.request<{ id: string; status: string }>(`/v1/admin/users/${userId}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status }),
    });
  }

  async getDisputes(filters?: { status?: string; limit?: number; offset?: number }) {
    const params = new URLSearchParams();
    if (filters) {
      Object.entries(filters).forEach(([key, value]) => {
        if (value !== undefined && value !== null && value !== '') {
          params.append(key, String(value));
        }
      });
    }
    return this.request<{
      disputes: any[];
      total: number;
      limit: number;
      offset: number;
    }>(`/v1/disputes?${params.toString()}`);
  }

  async getDispute(disputeId: string) {
    return this.request<any>(`/v1/disputes/${disputeId}`);
  }

  async resolveDispute(disputeId: string, data: {
    resolution_type: string;
    worker_payout_percent?: number;
    comment?: string;
  }) {
    return this.request<{ dispute_id: string; status: string }>(`/v1/disputes/${disputeId}/resolve`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async getResaleInventory(mine?: boolean) {
    const params = new URLSearchParams();
    if (mine) params.set('mine', 'true');
    return this.request<{
      items: Array<{
        task_id: string;
        title: string;
        location: { lat: number; lon: number; radius_m: number };
        bounty: { currency: string; amount: number };
        accepted_at: string;
        resale_available_at: string;
        status: 'exclusive' | 'resale_ready';
        royalty_rate: number;
      }>;
    }>(`/v1/marketplace/inventory?${params.toString()}`);
  }

  async getRoyaltySummary() {
    return this.request<{
      total_earned: number;
      pending: number;
      last_payout_at: string | null;
      items: Array<{
        task_id: string;
        amount: number;
        paid_at: string;
      }>;
    }>('/v1/marketplace/royalties');
  }

  async getBadges() {
    return this.request<{
      badges: Array<{
        type: string;
        name: string;
        description: string;
        category: string;
        icon_url: string | null;
        tiers: any[];
      }>;
    }>('/v1/badges');
  }

  async getMyBadges() {
    return this.request<{
      badges: Array<{
        badge_type: string;
        tier: string;
        title: string;
        description: string;
        icon_url: string | null;
        earned_at: string;
      }>;
    }>('/v1/badges/me');
  }

  // Stats endpoints
  async getWorkerStats() {
    return this.request<{
      summary: {
        tasks_claimed: number;
        tasks_delivered: number;
        tasks_accepted: number;
        tasks_rejected: number;
        total_earned: number;
        reliability_score: number;
        dispute_rate: number;
        current_streak: number;
        longest_streak: number;
        avg_completion_hours: number | null;
      };
      active: {
        claims: number;
        pending_submissions: number;
      };
      earnings_chart: Array<{
        month: string;
        label: string;
        amount: number;
      }>;
      completed_tasks: Array<{
        id: string;
        title: string;
        lat: number;
        lon: number;
        bounty: { amount: number; currency: string };
        template: string;
        completed_at: string | null;
      }>;
      recent_activity: Array<{
        submission_id: string;
        task_id: string;
        task_title: string;
        bounty: { amount: number; currency: string };
        status: string;
        updated_at: string;
      }>;
    }>('/v1/users/me/stats/worker');
  }

  async getRequesterStats() {
    return this.request<{
      summary: {
        tasks_posted: number;
        tasks_completed: number;
        total_bounties_paid: number;
        fulfillment_rate: number;
        avg_response_hours: number | null;
        repeat_workers: number;
      };
      tasks_by_status: {
        draft: number;
        posted: number;
        claimed: number;
        submitted: number;
        accepted: number;
        disputed: number;
        cancelled: number;
        expired: number;
      };
      pending_reviews: Array<{
        submission_id: string;
        task_id: string;
        task_title: string;
        bounty: { amount: number; currency: string };
        worker: { id: string; username: string | null };
        submitted_at: string | null;
      }>;
      spending_chart: Array<{
        month: string;
        label: string;
        amount: number;
      }>;
      tasks_map: Array<{
        id: string;
        title: string;
        status: string;
        lat: number;
        lon: number;
        bounty: { amount: number; currency: string };
        template: string;
        created_at: string;
      }>;
      template_usage: Array<{
        template: string;
        count: number;
      }>;
    }>('/v1/users/me/stats/requester');
  }

  // Fee endpoints
  async previewFees(amount: number, currency?: string) {
    const params = new URLSearchParams();
    params.set('amount', String(amount));
    if (currency) params.set('currency', currency);
    return this.request<{
      bounty_amount: number;
      platform_fee: {
        amount: number;
        rate: number;
        rate_percent: string;
        tier: string;
      };
      arbitration_fee: {
        amount: number;
        rate: number;
        rate_percent: string;
      };
      total_cost: number;
      worker_payout: number;
      currency: string;
    }>(`/v1/fees/preview?${params.toString()}`);
  }

  async getFeeTiers() {
    return this.request<{
      tiers: Array<{
        name: string;
        rate: number;
        rate_percent: string;
        requirements: {
          min_account_days: number;
          min_tasks_accepted: number;
          min_reliability: number;
        };
      }>;
    }>('/v1/fees/tiers');
  }

  async getMyFeeTier() {
    return this.request<{
      current_tier: {
        name: string;
        rate: number;
        rate_percent: string;
      };
      next_tier: {
        name: string;
        rate: number;
        rate_percent: string;
        savings_percent: string;
      } | null;
      progress: {
        account_days: { current: number; required: number; met: boolean };
        tasks_accepted: { current: number; required: number; met: boolean };
        reliability: { current: number; required: number; met: boolean };
      } | null;
    }>('/v1/fees/my-tier');
  }

  async getFeeHistory(options?: { limit?: number; offset?: number }) {
    const params = new URLSearchParams();
    if (options?.limit) params.set('limit', String(options.limit));
    if (options?.offset) params.set('offset', String(options.offset));
    return this.request<{
      entries: Array<{
        id: string;
        task_id: string | null;
        fee_type: string;
        amount: number;
        currency: string;
        created_at: string;
      }>;
      total: number;
      total_fees_paid: number;
      limit: number;
      offset: number;
    }>(`/v1/fees/history?${params.toString()}`);
  }

  // Admin fee endpoints
  async getAdminFeeConfigs() {
    return this.request<{
      configs: Array<{
        id: string;
        fee_type: string;
        name: string;
        description: string | null;
        tier_order: number;
        rate: number;
        rate_percent: string;
        min_fee: number | null;
        max_fee: number | null;
        requirements: {
          min_account_days: number;
          min_tasks_accepted: number;
          min_reliability: number;
        };
        is_active: boolean;
        created_at: string;
        updated_at: string;
      }>;
    }>('/v1/fees/admin/configs');
  }

  async updateFeeConfig(configId: string, updates: {
    name?: string;
    description?: string;
    rate?: number;
    min_fee?: number;
    max_fee?: number;
    min_account_days?: number;
    min_tasks_accepted?: number;
    min_reliability?: number;
    is_active?: boolean;
  }) {
    return this.request<{
      id: string;
      fee_type: string;
      name: string;
      rate: number;
      is_active: boolean;
      updated_at: string;
    }>(`/v1/fees/admin/configs/${configId}`, {
      method: 'PATCH',
      body: JSON.stringify(updates),
    });
  }

  async getAdminFeeStats(options?: { start_date?: string; end_date?: string }) {
    const params = new URLSearchParams();
    if (options?.start_date) params.set('start_date', options.start_date);
    if (options?.end_date) params.set('end_date', options.end_date);
    return this.request<{
      total_platform_fees: number;
      total_arbitration_fees: number;
      total_fees: number;
      fees_by_tier: Record<string, number>;
      transaction_count: number;
      period: {
        start: string | null;
        end: string | null;
      };
    }>(`/v1/fees/admin/stats?${params.toString()}`);
  }

  async seedFeeConfigs() {
    return this.request<{ message: string }>('/v1/fees/admin/seed', {
      method: 'POST',
    });
  }

  // Notification endpoints
  async getNotifications(options?: { limit?: number; offset?: number; unread_only?: boolean }) {
    const params = new URLSearchParams();
    if (options?.limit) params.set('limit', String(options.limit));
    if (options?.offset) params.set('offset', String(options.offset));
    if (options?.unread_only) params.set('unread_only', 'true');
    return this.request<{
      notifications: Array<{
        id: string;
        type: string;
        title: string;
        body: string;
        data: Record<string, any>;
        read: boolean;
        created_at: string;
      }>;
      total: number;
      unread_count: number;
      limit: number;
      offset: number;
    }>(`/v1/notifications?${params.toString()}`);
  }

  async getNotificationUnreadCount() {
    return this.request<{ unread_count: number }>('/v1/notifications/unread-count');
  }

  async markNotificationAsRead(notificationId: string) {
    return this.request<{ message: string }>(`/v1/notifications/${notificationId}/read`, {
      method: 'POST',
    });
  }

  async markAllNotificationsAsRead() {
    return this.request<{ message: string; count: number }>('/v1/notifications/read-all', {
      method: 'POST',
    });
  }

  async getNotificationPreferences() {
    return this.request<{
      preferences: Record<string, boolean>;
      available_types: string[];
    }>('/v1/notifications/preferences');
  }

  async updateNotificationPreferences(prefs: Record<string, boolean>) {
    return this.request<{
      preferences: Record<string, boolean>;
      message: string;
    }>('/v1/notifications/preferences', {
      method: 'PUT',
      body: JSON.stringify(prefs),
    });
  }

  // Reputation history endpoints
  async getMyReputationHistory(options?: { limit?: number; offset?: number }) {
    const params = new URLSearchParams();
    if (options?.limit) params.set('limit', String(options.limit));
    if (options?.offset) params.set('offset', String(options.offset));
    return this.request<{
      events: Array<{
        id: string;
        previous_score: number;
        new_score: number;
        score_change: number;
        reason: string;
        task_id: string | null;
        badge_type: string | null;
        metadata: Record<string, any>;
        created_at: string;
      }>;
      total: number;
      limit: number;
      offset: number;
    }>(`/v1/profile/me/reputation-history?${params.toString()}`);
  }

  async getPublicReputationHistory(usernameOrId: string, options?: { limit?: number; offset?: number }) {
    const params = new URLSearchParams();
    if (options?.limit) params.set('limit', String(options.limit));
    if (options?.offset) params.set('offset', String(options.offset));
    return this.request<{
      events: Array<{
        id: string;
        previous_score: number;
        new_score: number;
        score_change: number;
        reason: string;
        badge_type: string | null;
        created_at: string;
      }>;
      total: number;
      limit: number;
      offset: number;
    }>(`/v1/profile/${encodeURIComponent(usernameOrId)}/reputation-history?${params.toString()}`);
  }

  // Public user profile endpoints
  async getUserProfile(usernameOrId: string) {
    return this.request<{
      id: string;
      username: string | null;
      bio: string | null;
      avatar_url: string | null;
      ens_name: string | null;
      ens_avatar_url: string | null;
      location: string | null;
      website: string | null;
      twitter_handle: string | null;
      member_since: string;
      stats: {
        tasks_completed: number;
        tasks_posted: number;
        tasks_accepted: number;
        reliability_score: number;
        dispute_rate: number;
        current_streak: number;
        longest_streak: number;
        avg_response_time_hours: number | null;
        avg_delivery_time_hours: number | null;
        wallet_verified: boolean;
        identity_verified: boolean;
      } | null;
      rating: {
        average: number | null;
        count: number;
      };
      badges: Array<{
        badge_type: string;
        tier: string;
        title: string;
        description: string;
        icon_url: string | null;
        earned_at: string;
      }>;
    }>(`/v1/users/${encodeURIComponent(usernameOrId)}`);
  }

  async getUserStats(usernameOrId: string) {
    return this.request<{
      summary: {
        tasks_completed: number;
        tasks_posted: number;
        tasks_accepted: number;
        tasks_rejected: number;
        reliability_score: number;
        dispute_rate: number;
        current_streak: number;
        longest_streak: number;
        avg_response_time_hours: number | null;
        avg_delivery_time_hours: number | null;
      } | null;
      submission_breakdown: {
        accepted: number;
        rejected: number;
        pending: number;
        disputed: number;
      };
      activity_chart: Array<{
        month: string;
        label: string;
        tasks_completed: number;
      }>;
      member_since: string;
    }>(`/v1/users/${encodeURIComponent(usernameOrId)}/stats`);
  }

  async getUserBadges(usernameOrId: string) {
    return this.request<{
      badges: Array<{
        badge_type: string;
        tier: string;
        title: string;
        description: string;
        icon_url: string | null;
        category: string;
        earned_at: string;
      }>;
      summary: {
        total: number;
        by_tier: {
          platinum: number;
          gold: number;
          silver: number;
          bronze: number;
        };
      };
    }>(`/v1/users/${encodeURIComponent(usernameOrId)}/badges`);
  }

  async getUserReviews(usernameOrId: string, options?: { limit?: number; offset?: number; role?: 'requester' | 'worker' }) {
    const params = new URLSearchParams();
    if (options?.limit) params.set('limit', String(options.limit));
    if (options?.offset) params.set('offset', String(options.offset));
    if (options?.role) params.set('role', options.role);
    return this.request<{
      reviews: Array<{
        id: string;
        rating: number;
        comment: string | null;
        role: string;
        reviewer: {
          username: string | null;
          avatar_url: string | null;
        } | null;
        created_at: string;
      }>;
      summary: {
        average_rating: number | null;
        total_reviews: number;
        rating_breakdown: Record<number, number>;
      };
      total: number;
      limit: number;
      offset: number;
    }>(`/v1/users/${encodeURIComponent(usernameOrId)}/reviews?${params.toString()}`);
  }

  async submitReview(usernameOrId: string, data: { task_id: string; rating: number; comment?: string }) {
    return this.request<{
      id: string;
      rating: number;
      comment: string | null;
      role: string;
      created_at: string;
    }>(`/v1/users/${encodeURIComponent(usernameOrId)}/reviews`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async canReviewUser(usernameOrId: string, taskId: string) {
    return this.request<{
      can_review: boolean;
      reason?: string;
      role?: string;
    }>(`/v1/users/${encodeURIComponent(usernameOrId)}/can-review/${taskId}`);
  }
}

export const api = new ApiClient(API_BASE);
export default api;
