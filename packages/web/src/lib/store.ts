import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { api } from './api';

interface Wallet {
  id: string;
  address: string;
  chain: string;
  chainId: number;
  isPrimary: boolean;
  label: string | null;
}

interface UserStats {
  tasksPosted: number;
  tasksCompleted: number;
  totalBountiesPaid: number;
  tasksClaimed: number;
  tasksDelivered: number;
  tasksAccepted: number;
  tasksRejected: number;
  totalEarned: number;
  reliabilityScore: number;
  disputeRate: number;
  currentStreak: number;
  longestStreak: number;
  repeatCustomers: number;
  emailVerified: boolean;
  walletVerified: boolean;
  identityVerified: boolean;
}

interface Badge {
  badgeType: string;
  tier: string;
  title: string;
  description: string;
  iconUrl: string | null;
  earnedAt: string;
}

interface User {
  id: string;
  email: string | null;
  username: string | null;
  role: 'user' | 'admin';
  // Profile fields
  bio: string | null;
  avatarUrl: string | null;
  ensName: string | null;
  ensAvatarUrl: string | null;
  location: string | null;
  website: string | null;
  twitterHandle: string | null;
  onboardingCompleted: boolean;
  savedAddresses: any[];
  // Wallet fields
  walletAddress?: string;
  wallets?: Wallet[];
  workerProfile?: any;
  // Reputation
  stats?: UserStats | null;
  badges?: Badge[];
}

interface AuthState {
  user: User | null;
  token: string | null;
  refreshToken: string | null;
  isLoading: boolean;
  error: string | null;

  // Email/password auth
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string) => Promise<void>;

  // Wallet auth (for use with useSiweAuth hook)
  setAuth: (token: string, refreshToken: string, user: any) => void;
  clearAuth: () => void;

  logout: () => void;
  loadUser: () => Promise<void>;
  clearError: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      user: null,
      token: null,
      refreshToken: null,
      isLoading: false,
      error: null,

      login: async (email: string, password: string) => {
        set({ isLoading: true, error: null });
        try {
          const result = await api.login(email, password);
          api.setToken(result.token);
          set({
            user: result.user as User,
            token: result.token,
            refreshToken: result.refreshToken,
            isLoading: false,
          });
        } catch (error) {
          set({
            error: error instanceof Error ? error.message : 'Login failed',
            isLoading: false,
          });
          throw error;
        }
      },

      register: async (email: string, password: string) => {
        set({ isLoading: true, error: null });
        try {
          const result = await api.register(email, password);
          api.setToken(result.token);
          set({
            user: result.user as User,
            token: result.token,
            refreshToken: result.refreshToken,
            isLoading: false,
          });
        } catch (error) {
          set({
            error: error instanceof Error ? error.message : 'Registration failed',
            isLoading: false,
          });
          throw error;
        }
      },

      setAuth: (token: string, refreshToken: string, user: any) => {
        api.setToken(token);
        set({
          token,
          refreshToken,
          user: {
            id: user.id,
            email: user.email,
            username: user.username,
            role: user.role,
            bio: null,
            avatarUrl: null,
            ensName: user.ens_name,
            ensAvatarUrl: user.ens_avatar_url,
            location: null,
            website: null,
            twitterHandle: null,
            onboardingCompleted: user.onboarding_completed ?? false,
            savedAddresses: [],
            walletAddress: user.wallet_address,
          },
          error: null,
        });
      },

      clearAuth: () => {
        api.setToken(null);
        set({ user: null, token: null, refreshToken: null, error: null });
      },

      logout: () => {
        api.setToken(null);
        set({ user: null, token: null, refreshToken: null, error: null });
      },

      loadUser: async () => {
        const token = get().token;
        if (!token) return;

        api.setToken(token);
        try {
          const userData = await api.getMe();
          set({
            user: {
              id: userData.id,
              email: userData.email,
              username: userData.username,
              role: userData.role as 'user' | 'admin',
              // Profile fields
              bio: userData.bio,
              avatarUrl: userData.avatar_url,
              ensName: userData.ens_name,
              ensAvatarUrl: userData.ens_avatar_url,
              location: userData.location,
              website: userData.website,
              twitterHandle: userData.twitter_handle,
              onboardingCompleted: userData.onboarding_completed ?? false,
              savedAddresses: userData.saved_addresses ?? [],
              // Wallets
              wallets: userData.wallets?.map((w: any) => ({
                id: w.id,
                address: w.address,
                chain: w.chain,
                chainId: w.chain_id,
                isPrimary: w.is_primary,
                label: w.label,
              })),
              workerProfile: userData.workerProfile,
              // Stats and badges
              stats: userData.stats ? {
                tasksPosted: userData.stats.tasks_posted,
                tasksCompleted: userData.stats.tasks_completed,
                totalBountiesPaid: userData.stats.total_bounties_paid,
                tasksClaimed: userData.stats.tasks_claimed,
                tasksDelivered: userData.stats.tasks_delivered,
                tasksAccepted: userData.stats.tasks_accepted,
                tasksRejected: userData.stats.tasks_rejected,
                totalEarned: userData.stats.total_earned,
                reliabilityScore: userData.stats.reliability_score,
                disputeRate: userData.stats.dispute_rate,
                currentStreak: userData.stats.current_streak,
                longestStreak: userData.stats.longest_streak,
                repeatCustomers: userData.stats.repeat_customers,
                emailVerified: userData.stats.email_verified,
                walletVerified: userData.stats.wallet_verified,
                identityVerified: userData.stats.identity_verified,
              } : null,
              badges: userData.badges?.map((b: any) => ({
                badgeType: b.badge_type,
                tier: b.tier,
                title: b.title,
                description: b.description,
                iconUrl: b.icon_url,
                earnedAt: b.earned_at,
              })) ?? [],
            },
          });
        } catch {
          set({ user: null, token: null, refreshToken: null });
        }
      },

      clearError: () => set({ error: null }),
    }),
    {
      name: 'field-network-auth',
      partialize: (state) => ({ token: state.token, refreshToken: state.refreshToken }),
    }
  )
);

// Task store for managing tasks
interface TaskState {
  tasks: any[];
  currentTask: any | null;
  isLoading: boolean;
  error: string | null;

  fetchTasks: (filters?: any) => Promise<void>;
  fetchTask: (taskId: string) => Promise<void>;
  createTask: (taskData: any) => Promise<string>;
  publishTask: (taskId: string) => Promise<void>;
  claimTask: (taskId: string) => Promise<void>;
  clearError: () => void;
}

export const useTaskStore = create<TaskState>((set, get) => ({
  tasks: [],
  currentTask: null,
  isLoading: false,
  error: null,

  fetchTasks: async (filters) => {
    set({ isLoading: true, error: null });
    try {
      const result = await api.getTasks(filters);
      set({ tasks: result.tasks, isLoading: false });
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : 'Failed to fetch tasks',
        isLoading: false,
      });
    }
  },

  fetchTask: async (taskId) => {
    set({ isLoading: true, error: null });
    try {
      const task = await api.getTask(taskId);
      set({ currentTask: task, isLoading: false });
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : 'Failed to fetch task',
        isLoading: false,
      });
    }
  },

  createTask: async (taskData) => {
    set({ isLoading: true, error: null });
    try {
      const result = await api.createTask(taskData);
      set({ isLoading: false });
      return result.id;
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : 'Failed to create task',
        isLoading: false,
      });
      throw error;
    }
  },

  publishTask: async (taskId) => {
    set({ isLoading: true, error: null });
    try {
      await api.publishTask(taskId);
      // Refresh task
      const task = await api.getTask(taskId);
      set({ currentTask: task, isLoading: false });
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : 'Failed to publish task',
        isLoading: false,
      });
      throw error;
    }
  },

  claimTask: async (taskId) => {
    set({ isLoading: true, error: null });
    try {
      await api.claimTask(taskId);
      // Refresh tasks
      await get().fetchTasks();
      set({ isLoading: false });
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : 'Failed to claim task',
        isLoading: false,
      });
      throw error;
    }
  },

  clearError: () => set({ error: null }),
}));
