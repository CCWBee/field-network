'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api';
import { useAuthStore } from '@/lib/store';
import BadgeShowcase from '@/components/BadgeShowcase';
import ReviewList from '@/components/ReviewList';
import ReputationMeter from '@/components/ReputationMeter';

interface UserProfile {
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
}

interface Review {
  id: string;
  rating: number;
  comment: string | null;
  role: string;
  reviewer: {
    username: string | null;
    avatar_url: string | null;
  } | null;
  created_at: string;
}

interface ReviewSummary {
  average_rating: number | null;
  total_reviews: number;
  rating_breakdown: Record<number, number>;
}

export default function PublicProfileView({ username }: { username: string }) {
  const { user: currentUser } = useAuthStore();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [reviewSummary, setReviewSummary] = useState<ReviewSummary | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'overview' | 'badges' | 'reviews'>('overview');
  const [reviewsOffset, setReviewsOffset] = useState(0);
  const [hasMoreReviews, setHasMoreReviews] = useState(false);
  const [loadingMoreReviews, setLoadingMoreReviews] = useState(false);

  const isOwnProfile = currentUser && profile && currentUser.id === profile.id;

  useEffect(() => {
    const fetchProfile = async () => {
      setIsLoading(true);
      setError(null);

      try {
        const [profileData, reviewsData] = await Promise.all([
          api.getUserProfile(username),
          api.getUserReviews(username, { limit: 10 }),
        ]);

        setProfile(profileData);
        setReviews(reviewsData.reviews);
        setReviewSummary(reviewsData.summary);
        setHasMoreReviews(reviewsData.total > reviewsData.reviews.length);
        setReviewsOffset(reviewsData.reviews.length);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load profile');
      } finally {
        setIsLoading(false);
      }
    };

    fetchProfile();
  }, [username]);

  const loadMoreReviews = async () => {
    if (loadingMoreReviews || !hasMoreReviews) return;

    setLoadingMoreReviews(true);
    try {
      const data = await api.getUserReviews(username, {
        limit: 10,
        offset: reviewsOffset,
      });

      setReviews((prev) => [...prev, ...data.reviews]);
      setReviewsOffset((prev) => prev + data.reviews.length);
      setHasMoreReviews(data.total > reviewsOffset + data.reviews.length);
    } catch (err) {
      console.error('Failed to load more reviews:', err);
    } finally {
      setLoadingMoreReviews(false);
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-paper flex items-center justify-center">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-field-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-ink-700">Loading profile...</p>
        </div>
      </div>
    );
  }

  if (error || !profile) {
    return (
      <div className="min-h-screen bg-paper flex items-center justify-center">
        <div className="text-center max-w-md">
          <div className="w-16 h-16 mx-auto mb-4 rounded-sm bg-signal-red/10 border border-signal-red/30 flex items-center justify-center">
            <svg className="w-8 h-8 text-signal-red" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </div>
          <h1 className="text-xl font-semibold text-ink-900 mb-2">Profile Not Found</h1>
          <p className="text-ink-700 mb-4">{error || 'This user does not exist or has been deactivated.'}</p>
          <Link
            href="/"
            className="inline-block px-4 py-2 bg-field-500 text-white rounded-sm hover:bg-field-600 transition-colors"
          >
            Return Home
          </Link>
        </div>
      </div>
    );
  }

  const displayName = profile.username || profile.ens_name || 'Anonymous';
  const avatarUrl = profile.ens_avatar_url || profile.avatar_url;
  const memberSince = new Date(profile.member_since).toLocaleDateString('en-US', {
    month: 'long',
    year: 'numeric',
  });

  return (
    <div className="min-h-screen bg-paper">
      {/* Header */}
      <header className="bg-paper border-b border-ink-200">
        <div className="max-w-5xl mx-auto px-4 py-4 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2">
            <span className="text-lg font-semibold text-field-500">Field Network</span>
          </Link>
          <div className="flex items-center gap-4">
            {currentUser ? (
              <Link
                href="/dashboard"
                className="text-sm text-ink-700 hover:text-field-500"
              >
                Dashboard
              </Link>
            ) : (
              <Link
                href="/login"
                className="px-4 py-2 text-sm bg-field-500 text-white rounded-sm hover:bg-field-600 transition-colors"
              >
                Sign In
              </Link>
            )}
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-8">
        {/* Profile Header */}
        <div className="bg-paper rounded-sm p-6 border border-ink-200 mb-6">
          <div className="flex flex-col md:flex-row gap-6">
            {/* Avatar */}
            <div className="flex-shrink-0">
              {avatarUrl ? (
                <img
                  src={avatarUrl}
                  alt={displayName}
                  className="w-24 h-24 md:w-32 md:h-32 rounded-full object-cover border-2 border-ink-200"
                />
              ) : (
                <div className="w-24 h-24 md:w-32 md:h-32 rounded-full bg-field-50 flex items-center justify-center text-field-500 font-bold text-4xl border-2 border-ink-200">
                  {displayName[0]?.toUpperCase() || '?'}
                </div>
              )}
            </div>

            {/* Info */}
            <div className="flex-1">
              <div className="flex items-start justify-between mb-2">
                <div>
                  <h1 className="text-2xl font-bold text-ink-900 tracking-tight">{displayName}</h1>
                  {profile.ens_name && profile.username && (
                    <p className="text-field-500 text-sm">{profile.ens_name}</p>
                  )}
                </div>
                {isOwnProfile && (
                  <Link
                    href="/dashboard/profile"
                    className="px-3 py-1.5 text-sm border border-ink-200 rounded-sm text-ink-700 hover:bg-ink-50 transition-colors"
                  >
                    Edit Profile
                  </Link>
                )}
              </div>

              {profile.bio && (
                <p className="text-ink-700 mb-3">{profile.bio}</p>
              )}

              {/* Meta Info */}
              <div className="flex flex-wrap gap-4 text-sm text-ink-500">
                {profile.location && (
                  <span className="flex items-center gap-1">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                    </svg>
                    {profile.location}
                  </span>
                )}
                <span className="flex items-center gap-1">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                  Member since {memberSince}
                </span>
                {profile.website && (
                  <a
                    href={profile.website}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1 text-field-500 hover:text-field-600"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                    </svg>
                    Website
                  </a>
                )}
                {profile.twitter_handle && (
                  <a
                    href={`https://twitter.com/${profile.twitter_handle}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1 text-field-500 hover:text-field-600"
                  >
                    <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
                    </svg>
                    @{profile.twitter_handle}
                  </a>
                )}
              </div>

              {/* Verification Badges */}
              <div className="flex items-center gap-2 mt-3">
                {profile.stats?.wallet_verified && (
                  <span className="flex items-center gap-1 px-2 py-1 text-signal-green border border-signal-green/30 rounded-sm text-xs">
                    <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                    </svg>
                    Wallet Verified
                  </span>
                )}
                {profile.stats?.identity_verified && (
                  <span className="flex items-center gap-1 px-2 py-1 text-signal-blue border border-signal-blue/30 rounded-sm text-xs">
                    <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                    </svg>
                    ID Verified
                  </span>
                )}
              </div>
            </div>

            {/* Rating & CTA */}
            <div className="flex flex-col items-center gap-4">
              {profile.rating.count > 0 && (
                <div className="text-center">
                  <div className="text-3xl font-bold font-mono tabular-nums text-ink-900">
                    {profile.rating.average?.toFixed(1) || '-'}
                  </div>
                  <div className="flex items-center justify-center">
                    {[1, 2, 3, 4, 5].map((star) => (
                      <svg
                        key={star}
                        className={`w-4 h-4 ${
                          star <= (profile.rating.average ?? 0)
                            ? 'text-signal-amber fill-current'
                            : 'text-ink-300'
                        }`}
                        viewBox="0 0 20 20"
                        fill="currentColor"
                      >
                        <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                      </svg>
                    ))}
                  </div>
                  <p className="text-xs text-ink-500 mt-1">{profile.rating.count} reviews</p>
                </div>
              )}

              {!isOwnProfile && currentUser && (
                <Link
                  href={`/dashboard/requester/new?assign=${profile.username}`}
                  className="px-4 py-2 bg-field-500 text-white rounded-sm hover:bg-field-600 transition-colors text-sm whitespace-nowrap"
                >
                  Work with {displayName}
                </Link>
              )}
            </div>
          </div>
        </div>

        {/* Stats Grid */}
        {profile.stats && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            <div className="bg-paper rounded-sm p-4 border border-ink-200 text-center">
              <p className="text-2xl font-bold font-mono tabular-nums text-field-500">{profile.stats.tasks_accepted}</p>
              <p className="text-sm text-ink-700">Tasks Completed</p>
            </div>
            <div className="bg-paper rounded-sm p-4 border border-ink-200 text-center">
              <p className="text-2xl font-bold font-mono tabular-nums text-field-500">{profile.stats.current_streak}</p>
              <p className="text-sm text-ink-700">Current Streak</p>
            </div>
            <div className="bg-paper rounded-sm p-4 border border-ink-200 text-center">
              <p className="text-2xl font-bold font-mono tabular-nums text-field-500">{profile.stats.dispute_rate.toFixed(1)}%</p>
              <p className="text-sm text-ink-700">Dispute Rate</p>
            </div>
            <div className="bg-paper rounded-sm p-4 border border-ink-200">
              <ReputationMeter
                score={profile.stats.reliability_score}
                size="sm"
                showLabel={true}
                showPercentage={true}
              />
            </div>
          </div>
        )}

        {/* Tabs */}
        <div className="border-b border-ink-200 mb-6">
          <nav className="flex gap-6">
            {[
              { id: 'overview', label: 'Overview' },
              { id: 'badges', label: `Badges (${profile.badges.length})` },
              { id: 'reviews', label: `Reviews (${reviewSummary?.total_reviews || 0})` },
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as typeof activeTab)}
                className={`pb-3 text-sm font-medium border-b-2 transition-colors ${
                  activeTab === tab.id
                    ? 'border-field-500 text-field-500'
                    : 'border-transparent text-ink-500 hover:text-ink-700'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </nav>
        </div>

        {/* Tab Content */}
        {activeTab === 'overview' && (
          <div className="grid md:grid-cols-2 gap-6">
            {/* Additional Stats */}
            {profile.stats && (
              <div className="bg-paper rounded-sm p-6 border border-ink-200">
                <h3 className="text-lg font-semibold text-ink-900 mb-4">Performance</h3>
                <div className="space-y-4">
                  <div className="flex justify-between">
                    <span className="text-ink-700">Tasks Posted</span>
                    <span className="font-medium font-mono tabular-nums text-ink-900">{profile.stats.tasks_posted}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-ink-700">Longest Streak</span>
                    <span className="font-medium font-mono tabular-nums text-ink-900">{profile.stats.longest_streak} tasks</span>
                  </div>
                  {profile.stats.avg_delivery_time_hours && (
                    <div className="flex justify-between">
                      <span className="text-ink-700">Avg Delivery Time</span>
                      <span className="font-medium font-mono tabular-nums text-ink-900">
                        {profile.stats.avg_delivery_time_hours < 24
                          ? `${profile.stats.avg_delivery_time_hours.toFixed(1)} hours`
                          : `${(profile.stats.avg_delivery_time_hours / 24).toFixed(1)} days`}
                      </span>
                    </div>
                  )}
                  {profile.stats.avg_response_time_hours && (
                    <div className="flex justify-between">
                      <span className="text-ink-700">Avg Response Time</span>
                      <span className="font-medium font-mono tabular-nums text-ink-900">
                        {profile.stats.avg_response_time_hours < 24
                          ? `${profile.stats.avg_response_time_hours.toFixed(1)} hours`
                          : `${(profile.stats.avg_response_time_hours / 24).toFixed(1)} days`}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Featured Badges */}
            <div className="bg-paper rounded-sm p-6 border border-ink-200">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-ink-900">Badges</h3>
                {profile.badges.length > 4 && (
                  <button
                    onClick={() => setActiveTab('badges')}
                    className="text-sm text-field-500 hover:text-field-600"
                  >
                    View all
                  </button>
                )}
              </div>
              <BadgeShowcase
                badges={profile.badges}
                maxDisplay={4}
                size="sm"
              />
            </div>
          </div>
        )}

        {activeTab === 'badges' && (
          <div className="bg-paper rounded-sm p-6 border border-ink-200">
            <BadgeShowcase
              badges={profile.badges}
              showAll={true}
              size="lg"
            />
          </div>
        )}

        {activeTab === 'reviews' && (
          <div className="bg-paper rounded-sm p-6 border border-ink-200">
            <ReviewList
              reviews={reviews}
              summary={reviewSummary || undefined}
              onLoadMore={loadMoreReviews}
              hasMore={hasMoreReviews}
              isLoading={loadingMoreReviews}
              showSummary={true}
            />
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="border-t border-ink-200 mt-12 py-6">
        <div className="max-w-5xl mx-auto px-4 text-center text-sm text-ink-500">
          <p>Field Network - Decentralized Real-World Data</p>
        </div>
      </footer>
    </div>
  );
}
