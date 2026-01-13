'use client';

import { useState, useEffect } from 'react';
import { useAuthStore } from '@/lib/store';
import { api } from '@/lib/api';

export default function ProfilePage() {
  const { user, loadUser } = useAuthStore();
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [formData, setFormData] = useState({
    username: '',
    bio: '',
    location: '',
    website: '',
    twitter_handle: '',
  });

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

  return (
    <div className="max-w-4xl mx-auto space-y-8">
      {/* Header */}
      <div className="flex justify-between items-start">
        <h1 className="text-2xl font-bold text-slate-800">My Profile</h1>
        {!isEditing && (
          <button
            onClick={() => setIsEditing(true)}
            className="px-4 py-2 text-sm bg-field-500 text-white rounded-lg hover:bg-field-600 transition-colors"
          >
            Edit Profile
          </button>
        )}
      </div>

      {/* Alerts */}
      {error && (
        <div className="p-4 bg-red-50 border border-red-200 text-red-700 rounded-lg">
          {error}
        </div>
      )}
      {success && (
        <div className="p-4 bg-green-50 border border-green-200 text-green-700 rounded-lg">
          {success}
        </div>
      )}

      {/* Profile Card */}
      <div className="glass rounded-xl p-6 border border-surface-200">
        <div className="flex items-start space-x-6">
          {/* Avatar */}
          <div className="flex-shrink-0">
            {avatarUrl ? (
              <img
                src={avatarUrl}
                alt="Avatar"
                className="w-24 h-24 rounded-full object-cover border-2 border-surface-200"
              />
            ) : (
              <div className="w-24 h-24 rounded-full bg-field-100 flex items-center justify-center text-field-600 font-bold text-3xl">
                {displayName[0].toUpperCase()}
              </div>
            )}
          </div>

          {/* Info */}
          <div className="flex-1 space-y-4">
            {isEditing ? (
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Username</label>
                  <input
                    type="text"
                    value={formData.username}
                    onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                    placeholder="Choose a username"
                    className="w-full px-3 py-2 border border-surface-300 rounded-lg focus:ring-2 focus:ring-field-500 focus:border-transparent"
                  />
                  <p className="text-xs text-slate-500 mt-1">Letters, numbers, and underscores only</p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Bio</label>
                  <textarea
                    value={formData.bio}
                    onChange={(e) => setFormData({ ...formData, bio: e.target.value })}
                    placeholder="Tell others about yourself"
                    rows={3}
                    maxLength={500}
                    className="w-full px-3 py-2 border border-surface-300 rounded-lg focus:ring-2 focus:ring-field-500 focus:border-transparent resize-none"
                  />
                  <p className="text-xs text-slate-500 mt-1">{formData.bio.length}/500 characters</p>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Location</label>
                    <input
                      type="text"
                      value={formData.location}
                      onChange={(e) => setFormData({ ...formData, location: e.target.value })}
                      placeholder="City, Country"
                      className="w-full px-3 py-2 border border-surface-300 rounded-lg focus:ring-2 focus:ring-field-500 focus:border-transparent"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Twitter</label>
                    <div className="flex">
                      <span className="inline-flex items-center px-3 bg-slate-100 border border-r-0 border-surface-300 rounded-l-lg text-slate-500">@</span>
                      <input
                        type="text"
                        value={formData.twitter_handle}
                        onChange={(e) => setFormData({ ...formData, twitter_handle: e.target.value })}
                        placeholder="username"
                        className="flex-1 px-3 py-2 border border-surface-300 rounded-r-lg focus:ring-2 focus:ring-field-500 focus:border-transparent"
                      />
                    </div>
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Website</label>
                  <input
                    type="url"
                    value={formData.website}
                    onChange={(e) => setFormData({ ...formData, website: e.target.value })}
                    placeholder="https://your-website.com"
                    className="w-full px-3 py-2 border border-surface-300 rounded-lg focus:ring-2 focus:ring-field-500 focus:border-transparent"
                  />
                </div>
                <div className="flex space-x-3">
                  <button
                    onClick={handleSave}
                    disabled={isSaving}
                    className="px-4 py-2 bg-field-500 text-white rounded-lg hover:bg-field-600 transition-colors disabled:opacity-50"
                  >
                    {isSaving ? 'Saving...' : 'Save Changes'}
                  </button>
                  <button
                    onClick={() => setIsEditing(false)}
                    className="px-4 py-2 text-slate-600 hover:text-slate-800 transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <>
                <div>
                  <h2 className="text-xl font-semibold text-slate-800 flex items-center space-x-2">
                    <span>{displayName}</span>
                    {user?.ensName && user?.username && (
                      <span className="text-sm font-normal text-field-600">{user.ensName}</span>
                    )}
                  </h2>
                  {user?.bio && <p className="text-slate-600 mt-1">{user.bio}</p>}
                </div>

                <div className="flex flex-wrap gap-4 text-sm text-slate-600">
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
                    <a href={user.website} target="_blank" rel="noopener noreferrer" className="flex items-center space-x-1 text-field-600 hover:text-field-700">
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                      </svg>
                      <span>Website</span>
                    </a>
                  )}
                  {user?.twitterHandle && (
                    <a href={`https://twitter.com/${user.twitterHandle}`} target="_blank" rel="noopener noreferrer" className="flex items-center space-x-1 text-field-600 hover:text-field-700">
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
      <div className="glass rounded-xl p-6 border border-surface-200">
        <h3 className="text-lg font-semibold text-slate-800 mb-4">Wallet & ENS</h3>
        <div className="space-y-4">
          {primaryWallet && (
            <div className="flex items-center justify-between p-3 bg-slate-50 rounded-lg">
              <div>
                <p className="text-sm font-medium text-slate-700">Primary Wallet</p>
                <p className="text-sm text-slate-500 font-mono">{primaryWallet.address}</p>
              </div>
              {user?.stats?.walletVerified && (
                <span className="px-2 py-1 text-xs bg-green-100 text-green-700 rounded-full">Verified</span>
              )}
            </div>
          )}

          {user?.ensName ? (
            <div className="flex items-center justify-between p-3 bg-field-50 rounded-lg">
              <div>
                <p className="text-sm font-medium text-slate-700">ENS Name</p>
                <p className="text-sm text-field-600 font-medium">{user.ensName}</p>
              </div>
              <button
                onClick={handleRefreshENS}
                className="text-sm text-field-600 hover:text-field-700"
              >
                Refresh
              </button>
            </div>
          ) : primaryWallet && (
            <button
              onClick={handleRefreshENS}
              className="w-full p-3 border border-dashed border-surface-300 rounded-lg text-sm text-slate-600 hover:bg-slate-50 transition-colors"
            >
              Check for ENS name
            </button>
          )}
        </div>
      </div>

      {/* Stats */}
      {user?.stats && (
        <div className="glass rounded-xl p-6 border border-surface-200">
          <h3 className="text-lg font-semibold text-slate-800 mb-4">Activity & Reputation</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="text-center p-4 bg-slate-50 rounded-lg">
              <p className="text-2xl font-bold text-field-600">{user.stats.tasksPosted}</p>
              <p className="text-sm text-slate-600">Tasks Posted</p>
            </div>
            <div className="text-center p-4 bg-slate-50 rounded-lg">
              <p className="text-2xl font-bold text-field-600">{user.stats.tasksAccepted}</p>
              <p className="text-sm text-slate-600">Deliveries Accepted</p>
            </div>
            <div className="text-center p-4 bg-slate-50 rounded-lg">
              <p className="text-2xl font-bold text-field-600">{user.stats.reliabilityScore}%</p>
              <p className="text-sm text-slate-600">Reliability</p>
            </div>
            <div className="text-center p-4 bg-slate-50 rounded-lg">
              <p className="text-2xl font-bold text-field-600">{user.stats.currentStreak}</p>
              <p className="text-sm text-slate-600">Current Streak</p>
            </div>
          </div>

          <div className="mt-6 grid grid-cols-2 gap-4 text-sm">
            <div className="flex justify-between">
              <span className="text-slate-600">Total Earned</span>
              <span className="font-medium text-slate-800">${user.stats.totalEarned.toFixed(2)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-600">Total Paid</span>
              <span className="font-medium text-slate-800">${user.stats.totalBountiesPaid.toFixed(2)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-600">Longest Streak</span>
              <span className="font-medium text-slate-800">{user.stats.longestStreak} tasks</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-600">Repeat Customers</span>
              <span className="font-medium text-slate-800">{user.stats.repeatCustomers}</span>
            </div>
          </div>
        </div>
      )}

      {/* Badges */}
      {user?.badges && user.badges.length > 0 && (
        <div className="glass rounded-xl p-6 border border-surface-200">
          <h3 className="text-lg font-semibold text-slate-800 mb-4">Badges & Achievements</h3>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            {user.badges.map((badge, i) => (
              <div key={i} className="flex items-center space-x-3 p-3 bg-slate-50 rounded-lg">
                <div className="w-10 h-10 rounded-full bg-field-100 flex items-center justify-center text-field-600">
                  {badge.iconUrl ? (
                    <img src={badge.iconUrl} alt="" className="w-6 h-6" />
                  ) : (
                    <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M5 2a1 1 0 011 1v1h1a1 1 0 010 2H6v1a1 1 0 01-2 0V6H3a1 1 0 010-2h1V3a1 1 0 011-1zm0 10a1 1 0 011 1v1h1a1 1 0 110 2H6v1a1 1 0 11-2 0v-1H3a1 1 0 110-2h1v-1a1 1 0 011-1zM12 2a1 1 0 01.967.744L14.146 7.2 17.5 9.134a1 1 0 010 1.732l-3.354 1.935-1.18 4.455a1 1 0 01-1.933 0L9.854 12.8 6.5 10.866a1 1 0 010-1.732l3.354-1.935 1.18-4.455A1 1 0 0112 2z" clipRule="evenodd" />
                    </svg>
                  )}
                </div>
                <div>
                  <p className="font-medium text-slate-800">{badge.title}</p>
                  <p className="text-xs text-slate-500">{badge.tier}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Verification Status */}
      <div className="glass rounded-xl p-6 border border-surface-200">
        <h3 className="text-lg font-semibold text-slate-800 mb-4">Verification Status</h3>
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-slate-600">Email Verified</span>
            {user?.stats?.emailVerified ? (
              <span className="flex items-center text-green-600">
                <svg className="w-5 h-5 mr-1" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                </svg>
                Verified
              </span>
            ) : (
              <button className="text-sm text-field-600 hover:text-field-700">Verify Email</button>
            )}
          </div>
          <div className="flex items-center justify-between">
            <span className="text-slate-600">Wallet Verified</span>
            {user?.stats?.walletVerified ? (
              <span className="flex items-center text-green-600">
                <svg className="w-5 h-5 mr-1" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                </svg>
                Verified
              </span>
            ) : (
              <span className="text-sm text-slate-400">Connect wallet</span>
            )}
          </div>
          <div className="flex items-center justify-between">
            <span className="text-slate-600">Identity Verified (KYC)</span>
            {user?.stats?.identityVerified ? (
              <span className="flex items-center text-green-600">
                <svg className="w-5 h-5 mr-1" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                </svg>
                Verified
              </span>
            ) : (
              <span className="text-sm text-slate-400">Optional</span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
