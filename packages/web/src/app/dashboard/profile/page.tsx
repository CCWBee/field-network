'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useAuthStore } from '@/lib/store';
import { api } from '@/lib/api';
import ReputationChart from '@/components/ReputationChart';

interface FeeTierInfo {
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
}

interface FeeHistoryEntry {
  id: string;
  task_id: string | null;
  fee_type: string;
  amount: number;
  currency: string;
  created_at: string;
}

export default function ProfilePage() {
  const { user, loadUser, token } = useAuthStore();
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [feeTier, setFeeTier] = useState<FeeTierInfo | null>(null);
  const [feeHistory, setFeeHistory] = useState<FeeHistoryEntry[]>([]);
  const [totalFeesPaid, setTotalFeesPaid] = useState(0);
  const [feeLoading, setFeeLoading] = useState(false);

  const [formData, setFormData] = useState({
    username: '',
    bio: '',
    location: '',
    website: '',
    twitter_handle: '',
  });

  // Notification preferences
  const [notificationPrefs, setNotificationPrefs] = useState<Record<string, boolean>>({});
  const [isLoadingPrefs, setIsLoadingPrefs] = useState(false);
  const [prefsSuccess, setPrefsSuccess] = useState<string | null>(null);

  useEffect(() => {
    if (user) {
      setFormData({
        username: user.username || '',
        bio: user.bio || '',
        location: user.location || '',
        website: user.website || '',
        twitter_handle: user.twitterHandle || '',
      });
    }
  }, [user]);

  // Load fee tier and history
  useEffect(() => {
    const loadFeeData = async () => {
      if (!token) return;

      setFeeLoading(true);
      try {
        api.setToken(token);
        const [tierData, historyData] = await Promise.all([
          api.getMyFeeTier(),
          api.getFeeHistory({ limit: 5 }),
        ]);
        setFeeTier(tierData);
        setFeeHistory(historyData.entries);
        setTotalFeesPaid(historyData.total_fees_paid);
      } catch (err) {
        console.error('Failed to load fee data:', err);
      } finally {
        setFeeLoading(false);
      }
    };

    loadFeeData();
  }, [token]);

  // Load notification preferences
  useEffect(() => {
    const loadNotificationPrefs = async () => {
      if (!token) return;

      try {
        api.setToken(token);
        const result = await api.getNotificationPreferences();
        setNotificationPrefs(result.preferences);
      } catch (err) {
        console.error('Failed to load notification preferences:', err);
      }
    };

    loadNotificationPrefs();
  }, [token]);

  const handleSave = async () => {
    setIsSaving(true);
    setError(null);
    setSuccess(null);

    try {
      await api.updateProfile(formData);
      await loadUser();
      setSuccess('Profile updated successfully');
      setIsEditing(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update profile');
    } finally {
      setIsSaving(false);
    }
  };

  const handleNotificationPrefChange = async (key: string, value: boolean) => {
    setIsLoadingPrefs(true);
    setPrefsSuccess(null);

    try {
      const result = await api.updateNotificationPreferences({ [key]: value });
      setNotificationPrefs(result.preferences);
      setPrefsSuccess('Notification preferences updated');
      setTimeout(() => setPrefsSuccess(null), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update preferences');
    } finally {
      setIsLoadingPrefs(false);
    }
  };

  const handleRefreshENS = async () => {
    setError(null);
    try {
      const result = await api.refreshENS();
      await loadUser();
      if (result.ens_name) {
        setSuccess(`ENS updated: ${result.ens_name}`);
      } else {
        setSuccess('No ENS name found for this wallet');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to refresh ENS');
    }
  };

  const primaryWallet = user?.wallets?.find(w => w.isPrimary) || user?.wallets?.[0];
  const displayName = user?.username || user?.ensName || user?.email?.split('@')[0] || 'Anonymous';
  const avatarUrl = user?.ensAvatarUrl || user?.avatarUrl;
  const reliabilityScore = user?.stats?.reliabilityScore ?? 0;
  const disputeRate = user?.stats?.disputeRate ?? 0;
  const lifetimeEarned = user?.stats?.totalEarned ?? 0;
  const totalAccepted = user?.stats?.tasksAccepted ?? 0;
  const ranks = [
    { min: 95, label: 'Prime Operator' },
    { min: 85, label: 'Vector Elite' },
    { min: 70, label: 'Field Specialist' },
    { min: 0, label: 'Rookie' },
  ];
  const rank = ranks.find((tier) => reliabilityScore >= tier.min)?.label ?? 'Rookie';

  return (
    <div className="max-w-4xl mx-auto space-y-8">
      {/* Header */}
      <div className="flex justify-between items-start">
        <div>
          <h1 className="text-2xl font-bold text-ink-900 tracking-tight">My Profile</h1>
          {user?.username && (
            <Link
              href={`/users/${user.username}`}
              className="text-sm text-field-500 hover:text-field-600 flex items-center gap-1 mt-1"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
              </svg>
              View public profile
            </Link>
          )}
        </div>
        {!isEditing && (
          <button
            onClick={() => setIsEditing(true)}
            className="px-4 py-2 text-sm bg-field-500 text-white rounded-sm hover:bg-field-600 transition-colors"
          >
            Edit Profile
          </button>
        )}
      </div>

      {/* Alerts */}
      {error && (
        <div className="p-4 border border-signal-red/30 text-signal-red rounded-sm">
          {error}
        </div>
      )}
      {success && (
        <div className="p-4 border border-signal-green/30 text-signal-green rounded-sm">
          {success}
        </div>
      )}

      {/* Field ID */}
      <div className="bg-paper rounded-sm p-6 border border-ink-200">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-wider text-ink-300">Field ID</p>
            <h2 className="text-2xl font-semibold text-ink-900">{rank}</h2>
            <p className="text-sm text-ink-500 mt-1">Reliability drives access tiers, fee reductions, and priority claims.</p>
          </div>
          <div className="flex items-center gap-6">
            <div className="text-center">
              <p className="text-xs uppercase tracking-wider text-ink-300">Reliability</p>
              <p className="text-2xl font-semibold font-mono tabular-nums text-ink-900">{reliabilityScore.toFixed(0)}%</p>
            </div>
            <div className="text-center">
              <p className="text-xs uppercase tracking-wider text-ink-300">Dispute Rate</p>
              <p className="text-2xl font-semibold font-mono tabular-nums text-ink-900">{disputeRate.toFixed(1)}%</p>
            </div>
            <div className="text-center">
              <p className="text-xs uppercase tracking-wider text-ink-300">Accepted</p>
              <p className="text-2xl font-semibold font-mono tabular-nums text-ink-900">{totalAccepted}</p>
            </div>
            <div className="text-center">
              <p className="text-xs uppercase tracking-wider text-ink-300">Lifetime Earned</p>
              <p className="text-2xl font-semibold font-mono tabular-nums text-ink-900">USDC {lifetimeEarned.toFixed(2)}</p>
            </div>
          </div>
        </div>
        {user?.badges?.length ? (
          <div className="mt-6 flex flex-wrap gap-3">
            {user.badges.slice(0, 4).map((badge, i) => (
              <div key={`${badge.badgeType}-${i}`} className="flex items-center gap-2 px-3 py-2 rounded-sm bg-ink-50 text-xs text-ink-700 border border-ink-200">
                <span className="text-field-500">*</span>
                {badge.title}
              </div>
            ))}
          </div>
        ) : (
          <div className="mt-6 rounded-sm border border-dashed border-ink-200 p-4 text-sm text-ink-500">
            Badges will appear as you complete missions, resolve disputes cleanly, and maintain streaks.
          </div>
        )}
      </div>

      {/* Fee Tier & Progress */}
      <div className="bg-paper rounded-sm p-6 border border-ink-200">
        <h3 className="text-lg font-semibold text-ink-900 mb-4">Fee Tier & Progress</h3>
        {feeLoading ? (
          <p className="text-sm text-ink-500">Loading fee information...</p>
        ) : feeTier ? (
          <div className="space-y-6">
            {/* Current Tier */}
            <div className="flex items-center justify-between p-4 bg-field-50 rounded-sm">
              <div>
                <p className="text-xs uppercase tracking-wider text-ink-500">Current Fee Tier</p>
                <p className="text-xl font-semibold text-ink-900">{feeTier.current_tier.name}</p>
              </div>
              <div className="text-right">
                <p className="text-xs uppercase tracking-wider text-ink-500">Platform Fee Rate</p>
                <p className="text-2xl font-bold font-mono tabular-nums text-field-500">{feeTier.current_tier.rate_percent}</p>
              </div>
            </div>

            {/* Next Tier Progress */}
            {feeTier.next_tier && feeTier.progress && (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium text-ink-700">
                    Progress to {feeTier.next_tier.name} tier
                  </p>
                  <p className="text-sm text-field-500">
                    Save {feeTier.next_tier.savings_percent} on fees
                  </p>
                </div>

                {/* Account Age Progress */}
                <div className="space-y-1">
                  <div className="flex justify-between text-xs text-ink-500">
                    <span>Account Age</span>
                    <span className="font-mono tabular-nums">{feeTier.progress.account_days.current} / {feeTier.progress.account_days.required} days</span>
                  </div>
                  <div className="h-2 bg-ink-200 rounded-sm overflow-hidden">
                    <div
                      className={`h-full rounded-sm transition-all ${feeTier.progress.account_days.met ? 'bg-signal-green' : 'bg-field-500'}`}
                      style={{ width: `${Math.min(100, (feeTier.progress.account_days.current / feeTier.progress.account_days.required) * 100)}%` }}
                    />
                  </div>
                </div>

                {/* Tasks Accepted Progress */}
                <div className="space-y-1">
                  <div className="flex justify-between text-xs text-ink-500">
                    <span>Tasks Accepted</span>
                    <span className="font-mono tabular-nums">{feeTier.progress.tasks_accepted.current} / {feeTier.progress.tasks_accepted.required}</span>
                  </div>
                  <div className="h-2 bg-ink-200 rounded-sm overflow-hidden">
                    <div
                      className={`h-full rounded-sm transition-all ${feeTier.progress.tasks_accepted.met ? 'bg-signal-green' : 'bg-field-500'}`}
                      style={{ width: `${Math.min(100, (feeTier.progress.tasks_accepted.current / feeTier.progress.tasks_accepted.required) * 100)}%` }}
                    />
                  </div>
                </div>

                {/* Reliability Progress */}
                <div className="space-y-1">
                  <div className="flex justify-between text-xs text-ink-500">
                    <span>Reliability Score</span>
                    <span className="font-mono tabular-nums">{feeTier.progress.reliability.current.toFixed(0)}% / {feeTier.progress.reliability.required}%</span>
                  </div>
                  <div className="h-2 bg-ink-200 rounded-sm overflow-hidden">
                    <div
                      className={`h-full rounded-sm transition-all ${feeTier.progress.reliability.met ? 'bg-signal-green' : 'bg-field-500'}`}
                      style={{ width: `${Math.min(100, (feeTier.progress.reliability.current / feeTier.progress.reliability.required) * 100)}%` }}
                    />
                  </div>
                </div>
              </div>
            )}

            {!feeTier.next_tier && (
              <div className="p-3 border border-signal-green/30 rounded-sm">
                <p className="text-sm text-signal-green">
                  Congratulations! You have reached the highest fee tier ({feeTier.current_tier.name}).
                </p>
              </div>
            )}
          </div>
        ) : (
          <p className="text-sm text-ink-500">Unable to load fee tier information</p>
        )}
      </div>

      {/* Fee History */}
      <div className="bg-paper rounded-sm p-6 border border-ink-200">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-ink-900">Fee History</h3>
          <div className="text-right">
            <p className="text-xs uppercase tracking-wider text-ink-500">Total Fees Paid</p>
            <p className="text-lg font-semibold font-mono tabular-nums text-ink-900">USDC {totalFeesPaid.toFixed(2)}</p>
          </div>
        </div>

        {feeHistory.length > 0 ? (
          <div className="space-y-2">
            {feeHistory.map((entry) => (
              <div key={entry.id} className="flex items-center justify-between p-3 bg-ink-50 rounded-sm">
                <div>
                  <p className="text-sm font-medium text-ink-700">
                    {entry.fee_type === 'platform' ? 'Platform Fee' : 'Arbitration Fee'}
                  </p>
                  <p className="text-xs text-ink-500">
                    {new Date(entry.created_at).toLocaleDateString()}
                    {entry.task_id && ` - Task ${entry.task_id.slice(0, 8)}...`}
                  </p>
                </div>
                <p className="text-sm font-medium font-mono tabular-nums text-ink-900">
                  {entry.currency} {entry.amount.toFixed(2)}
                </p>
              </div>
            ))}
          </div>
        ) : (
          <div className="p-4 border border-dashed border-ink-200 rounded-sm text-center">
            <p className="text-sm text-ink-500">No fee transactions yet</p>
          </div>
        )}
      </div>

      {/* Profile Card */}
      <div className="bg-paper rounded-sm p-6 border border-ink-200">
        <div className="flex items-start space-x-6">
          {/* Avatar */}
          <div className="flex-shrink-0">
            {avatarUrl ? (
              <img
                src={avatarUrl}
                alt="Avatar"
                className="w-24 h-24 rounded-full object-cover border-2 border-ink-200"
              />
            ) : (
              <div className="w-24 h-24 rounded-full bg-field-50 flex items-center justify-center text-field-500 font-bold text-3xl">
                {displayName[0].toUpperCase()}
              </div>
            )}
          </div>

          {/* Info */}
          <div className="flex-1 space-y-4">
            {isEditing ? (
              <div className="space-y-4">
                <div>
                  <label className="block text-xs uppercase tracking-wider text-ink-500 mb-1">Username</label>
                  <input
                    type="text"
                    value={formData.username}
                    onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                    placeholder="Choose a username"
                    className="w-full px-3 py-2 border border-ink-200 rounded-sm focus:ring-2 focus:ring-field-500 focus:border-transparent"
                  />
                  <p className="text-xs text-ink-500 mt-1">Letters, numbers, and underscores only</p>
                </div>
                <div>
                  <label className="block text-xs uppercase tracking-wider text-ink-500 mb-1">Bio</label>
                  <textarea
                    value={formData.bio}
                    onChange={(e) => setFormData({ ...formData, bio: e.target.value })}
                    placeholder="Tell others about yourself"
                    rows={3}
                    maxLength={500}
                    className="w-full px-3 py-2 border border-ink-200 rounded-sm focus:ring-2 focus:ring-field-500 focus:border-transparent resize-none"
                  />
                  <p className="text-xs text-ink-500 mt-1">{formData.bio.length}/500 characters</p>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs uppercase tracking-wider text-ink-500 mb-1">Location</label>
                    <input
                      type="text"
                      value={formData.location}
                      onChange={(e) => setFormData({ ...formData, location: e.target.value })}
                      placeholder="City, Country"
                      className="w-full px-3 py-2 border border-ink-200 rounded-sm focus:ring-2 focus:ring-field-500 focus:border-transparent"
                    />
                  </div>
                  <div>
                    <label className="block text-xs uppercase tracking-wider text-ink-500 mb-1">Twitter</label>
                    <div className="flex">
                      <span className="inline-flex items-center px-3 bg-ink-50 border border-r-0 border-ink-200 rounded-l-sm text-ink-500">@</span>
                      <input
                        type="text"
                        value={formData.twitter_handle}
                        onChange={(e) => setFormData({ ...formData, twitter_handle: e.target.value })}
                        placeholder="username"
                        className="flex-1 px-3 py-2 border border-ink-200 rounded-r-sm focus:ring-2 focus:ring-field-500 focus:border-transparent"
                      />
                    </div>
                  </div>
                </div>
                <div>
                  <label className="block text-xs uppercase tracking-wider text-ink-500 mb-1">Website</label>
                  <input
                    type="url"
                    value={formData.website}
                    onChange={(e) => setFormData({ ...formData, website: e.target.value })}
                    placeholder="https://your-website.com"
                    className="w-full px-3 py-2 border border-ink-200 rounded-sm focus:ring-2 focus:ring-field-500 focus:border-transparent"
                  />
                </div>
                <div className="flex space-x-3">
                  <button
                    onClick={handleSave}
                    disabled={isSaving}
                    className="px-4 py-2 bg-field-500 text-white rounded-sm hover:bg-field-600 transition-colors disabled:opacity-50"
                  >
                    {isSaving ? 'Saving...' : 'Save Changes'}
                  </button>
                  <button
                    onClick={() => setIsEditing(false)}
                    className="px-4 py-2 text-ink-700 hover:text-ink-900 transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <>
                <div>
                  <h2 className="text-xl font-semibold text-ink-900 flex items-center space-x-2">
                    <span>{displayName}</span>
                    {user?.ensName && user?.username && (
                      <span className="text-sm font-normal text-field-500">{user.ensName}</span>
                    )}
                  </h2>
                  {user?.bio && <p className="text-ink-700 mt-1">{user.bio}</p>}
                </div>

                <div className="flex flex-wrap gap-4 text-sm text-ink-700">
                  {user?.location && (
                    <span className="flex items-center space-x-1">
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                      </svg>
                      <span>{user.location}</span>
                    </span>
                  )}
                  {user?.website && (
                    <a href={user.website} target="_blank" rel="noopener noreferrer" className="flex items-center space-x-1 text-field-500 hover:text-field-600">
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                      </svg>
                      <span>Website</span>
                    </a>
                  )}
                  {user?.twitterHandle && (
                    <a href={`https://twitter.com/${user.twitterHandle}`} target="_blank" rel="noopener noreferrer" className="flex items-center space-x-1 text-field-500 hover:text-field-600">
                      <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
                      </svg>
                      <span>@{user.twitterHandle}</span>
                    </a>
                  )}
                  {user?.email && (
                    <span className="flex items-center space-x-1">
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                      </svg>
                      <span>{user.email}</span>
                    </span>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Wallet & ENS */}
      <div className="bg-paper rounded-sm p-6 border border-ink-200">
        <h3 className="text-lg font-semibold text-ink-900 mb-4">Wallet & ENS</h3>
        <div className="space-y-4">
          {primaryWallet && (
            <div className="flex items-center justify-between p-3 bg-ink-50 rounded-sm">
              <div>
                <p className="text-sm font-medium text-ink-700">Primary Wallet</p>
                <p className="text-sm text-ink-500 font-mono">{primaryWallet.address}</p>
              </div>
              {user?.stats?.walletVerified && (
                <span className="px-2 py-1 text-xs text-signal-green border border-signal-green/30 rounded-sm">Verified</span>
              )}
            </div>
          )}

          {user?.ensName ? (
            <div className="flex items-center justify-between p-3 bg-field-50 rounded-sm">
              <div>
                <p className="text-sm font-medium text-ink-700">ENS Name</p>
                <p className="text-sm text-field-500 font-medium">{user.ensName}</p>
              </div>
              <button
                onClick={handleRefreshENS}
                className="text-sm text-field-500 hover:text-field-600"
              >
                Refresh
              </button>
            </div>
          ) : primaryWallet && (
            <button
              onClick={handleRefreshENS}
              className="w-full p-3 border border-dashed border-ink-200 rounded-sm text-sm text-ink-700 hover:bg-ink-50 transition-colors"
            >
              Check for ENS name
            </button>
          )}
        </div>
      </div>

      {/* Stats */}
      {user?.stats && (
        <div className="bg-paper rounded-sm p-6 border border-ink-200">
          <h3 className="text-lg font-semibold text-ink-900 mb-4">Activity & Reputation</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="text-center p-4 bg-ink-50 rounded-sm">
              <p className="text-2xl font-bold font-mono tabular-nums text-field-500">{user.stats.tasksPosted}</p>
              <p className="text-sm text-ink-700">Tasks Posted</p>
            </div>
            <div className="text-center p-4 bg-ink-50 rounded-sm">
              <p className="text-2xl font-bold font-mono tabular-nums text-field-500">{user.stats.tasksAccepted}</p>
              <p className="text-sm text-ink-700">Deliveries Accepted</p>
            </div>
            <div className="text-center p-4 bg-ink-50 rounded-sm">
              <p className="text-2xl font-bold font-mono tabular-nums text-field-500">{user.stats.reliabilityScore}%</p>
              <p className="text-sm text-ink-700">Reliability</p>
            </div>
            <div className="text-center p-4 bg-ink-50 rounded-sm">
              <p className="text-2xl font-bold font-mono tabular-nums text-field-500">{user.stats.currentStreak}</p>
              <p className="text-sm text-ink-700">Current Streak</p>
            </div>
          </div>

          <div className="mt-6 grid grid-cols-2 gap-4 text-sm">
            <div className="flex justify-between">
              <span className="text-ink-700">Total Earned</span>
              <span className="font-medium font-mono tabular-nums text-ink-900">${user.stats.totalEarned.toFixed(2)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-ink-700">Total Paid</span>
              <span className="font-medium font-mono tabular-nums text-ink-900">${user.stats.totalBountiesPaid.toFixed(2)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-ink-700">Longest Streak</span>
              <span className="font-medium font-mono tabular-nums text-ink-900">{user.stats.longestStreak} tasks</span>
            </div>
            <div className="flex justify-between">
              <span className="text-ink-700">Repeat Customers</span>
              <span className="font-medium font-mono tabular-nums text-ink-900">{user.stats.repeatCustomers}</span>
            </div>
          </div>
        </div>
      )}

      {/* Badges */}
      {user?.badges && user.badges.length > 0 && (
        <div className="bg-paper rounded-sm p-6 border border-ink-200">
          <h3 className="text-lg font-semibold text-ink-900 mb-4">Badges & Achievements</h3>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            {user.badges.map((badge, i) => (
              <div key={i} className="flex items-center space-x-3 p-3 bg-ink-50 rounded-sm">
                <div className="w-10 h-10 rounded-sm bg-field-50 border border-field-500/20 flex items-center justify-center text-field-500">
                  {badge.iconUrl ? (
                    <img src={badge.iconUrl} alt="" className="w-6 h-6" />
                  ) : (
                    <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M5 2a1 1 0 011 1v1h1a1 1 0 010 2H6v1a1 1 0 01-2 0V6H3a1 1 0 010-2h1V3a1 1 0 011-1zm0 10a1 1 0 011 1v1h1a1 1 0 110 2H6v1a1 1 0 11-2 0v-1H3a1 1 0 110-2h1v-1a1 1 0 011-1zM12 2a1 1 0 01.967.744L14.146 7.2 17.5 9.134a1 1 0 010 1.732l-3.354 1.935-1.18 4.455a1 1 0 01-1.933 0L9.854 12.8 6.5 10.866a1 1 0 010-1.732l3.354-1.935 1.18-4.455A1 1 0 0112 2z" clipRule="evenodd" />
                    </svg>
                  )}
                </div>
                <div>
                  <p className="font-medium text-ink-900">{badge.title}</p>
                  <p className="text-xs text-ink-500">{badge.tier}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Verification Status */}
      <div className="bg-paper rounded-sm p-6 border border-ink-200">
        <h3 className="text-lg font-semibold text-ink-900 mb-4">Verification Status</h3>
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-ink-700">Email Verified</span>
            {user?.stats?.emailVerified ? (
              <span className="flex items-center text-signal-green">
                <svg className="w-5 h-5 mr-1" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                </svg>
                Verified
              </span>
            ) : (
              <button className="text-sm text-field-500 hover:text-field-600">Verify Email</button>
            )}
          </div>
          <div className="flex items-center justify-between">
            <span className="text-ink-700">Wallet Verified</span>
            {user?.stats?.walletVerified ? (
              <span className="flex items-center text-signal-green">
                <svg className="w-5 h-5 mr-1" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                </svg>
                Verified
              </span>
            ) : (
              <span className="text-sm text-ink-300">Connect wallet</span>
            )}
          </div>
          <div className="flex items-center justify-between">
            <span className="text-ink-700">Identity Verified (KYC)</span>
            {user?.stats?.identityVerified ? (
              <span className="flex items-center text-signal-green">
                <svg className="w-5 h-5 mr-1" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                </svg>
                Verified
              </span>
            ) : (
              <span className="text-sm text-ink-300">Optional</span>
            )}
          </div>
        </div>
      </div>

      {/* Reputation History Chart */}
      <ReputationChart />

      {/* Notification Preferences */}
      <div className="bg-paper rounded-sm p-6 border border-ink-200">
        <h3 className="text-lg font-semibold text-ink-900 mb-4">Notification Preferences</h3>
        {prefsSuccess && (
          <div className="mb-4 p-3 border border-signal-green/30 text-signal-green rounded-sm text-sm">
            {prefsSuccess}
          </div>
        )}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium text-ink-700">Task Claimed</p>
              <p className="text-sm text-ink-500">When someone claims your posted task</p>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={notificationPrefs.task_claimed ?? true}
                onChange={(e) => handleNotificationPrefChange('task_claimed', e.target.checked)}
                disabled={isLoadingPrefs}
                className="sr-only peer"
              />
              <div className="w-11 h-6 bg-ink-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-field-300 rounded-full peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-ink-200 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-field-500"></div>
            </label>
          </div>
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium text-ink-700">Submission Received</p>
              <p className="text-sm text-ink-500">When a worker submits work for your task</p>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={notificationPrefs.submission_received ?? true}
                onChange={(e) => handleNotificationPrefChange('submission_received', e.target.checked)}
                disabled={isLoadingPrefs}
                className="sr-only peer"
              />
              <div className="w-11 h-6 bg-ink-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-field-300 rounded-full peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-ink-200 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-field-500"></div>
            </label>
          </div>
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium text-ink-700">Submission Accepted</p>
              <p className="text-sm text-ink-500">When your work is accepted and payment released</p>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={notificationPrefs.submission_accepted ?? true}
                onChange={(e) => handleNotificationPrefChange('submission_accepted', e.target.checked)}
                disabled={isLoadingPrefs}
                className="sr-only peer"
              />
              <div className="w-11 h-6 bg-ink-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-field-300 rounded-full peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-ink-200 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-field-500"></div>
            </label>
          </div>
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium text-ink-700">Submission Rejected</p>
              <p className="text-sm text-ink-500">When your work is rejected</p>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={notificationPrefs.submission_rejected ?? true}
                onChange={(e) => handleNotificationPrefChange('submission_rejected', e.target.checked)}
                disabled={isLoadingPrefs}
                className="sr-only peer"
              />
              <div className="w-11 h-6 bg-ink-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-field-300 rounded-full peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-ink-200 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-field-500"></div>
            </label>
          </div>
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium text-ink-700">Dispute Updates</p>
              <p className="text-sm text-ink-500">When disputes are opened or resolved</p>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={notificationPrefs.dispute_resolved ?? true}
                onChange={(e) => {
                  handleNotificationPrefChange('dispute_opened', e.target.checked);
                  handleNotificationPrefChange('dispute_resolved', e.target.checked);
                }}
                disabled={isLoadingPrefs}
                className="sr-only peer"
              />
              <div className="w-11 h-6 bg-ink-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-field-300 rounded-full peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-ink-200 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-field-500"></div>
            </label>
          </div>
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium text-ink-700">Badge Earned</p>
              <p className="text-sm text-ink-500">When you earn a new badge or achievement</p>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={notificationPrefs.badge_earned ?? true}
                onChange={(e) => handleNotificationPrefChange('badge_earned', e.target.checked)}
                disabled={isLoadingPrefs}
                className="sr-only peer"
              />
              <div className="w-11 h-6 bg-ink-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-field-300 rounded-full peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-ink-200 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-field-500"></div>
            </label>
          </div>
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium text-ink-700">Fee Tier Upgrades</p>
              <p className="text-sm text-ink-500">When you qualify for a lower fee tier</p>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={notificationPrefs.fee_tier_upgrade ?? true}
                onChange={(e) => handleNotificationPrefChange('fee_tier_upgrade', e.target.checked)}
                disabled={isLoadingPrefs}
                className="sr-only peer"
              />
              <div className="w-11 h-6 bg-ink-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-field-300 rounded-full peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-ink-200 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-field-500"></div>
            </label>
          </div>
        </div>
      </div>
    </div>
  );
}
