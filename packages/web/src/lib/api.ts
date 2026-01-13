const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';

interface RequestOptions extends RequestInit {
  token?: string;
}

class ApiClient {
  private baseUrl: string;
  private token: string | null = null;

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl;
  }

  setToken(token: string | null) {
    this.token = token;
  }

  private async request<T>(
    endpoint: string,
    options: RequestOptions = {}
  ): Promise<T> {
    const { token, ...fetchOptions } = options;

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

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Unknown error' }));
      throw new Error(error.error || `HTTP ${response.status}`);
    }

    return response.json();
  }

  // Auth endpoints
  async register(email: string, password: string) {
    return this.request<{
      user: { id: string; email: string; role: string };
      token: string;
      refreshToken: string;
    }>('/v1/auth/register', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
  }

  async login(email: string, password: string) {
    return this.request<{
      user: { id: string; email: string; role: string };
      token: string;
      refreshToken: string;
    }>('/v1/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
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
    return this.request<{
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
}

export const api = new ApiClient(API_BASE);
export default api;
