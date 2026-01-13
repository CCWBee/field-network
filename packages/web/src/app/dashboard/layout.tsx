'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuthStore } from '@/lib/store';
import { OnboardingModal } from '@/components/OnboardingModal';

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const { user, token, logout, loadUser } = useAuthStore();
  const [showOnboarding, setShowOnboarding] = useState(false);

  useEffect(() => {
    if (!token) {
      router.push('/login');
      return;
    }
    loadUser();
  }, [token, router, loadUser]);

  // Show onboarding modal if user hasn't completed it
  useEffect(() => {
    if (user && user.onboardingCompleted === false && !user.username) {
      setShowOnboarding(true);
    }
  }, [user]);

  if (!token) {
    return (
      <div className="min-h-screen bg-surface flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-field-500"></div>
      </div>
    );
  }

  const handleLogout = () => {
    logout();
    router.push('/');
  };

  return (
    <div className="min-h-screen bg-surface bg-gradient-mesh">
      {/* Navigation */}
      <nav className="glass border-b border-surface-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16">
            <div className="flex items-center space-x-8">
              <Link href="/dashboard" className="text-xl font-bold text-gradient">
                Field Network
              </Link>
              {/* All users can post and collect */}
              <Link
                href="/dashboard/requester"
                className="text-slate-600 hover:text-field-600 transition-colors"
              >
                My Tasks
              </Link>
              <Link
                href="/dashboard/requester/new"
                className="text-slate-600 hover:text-field-600 transition-colors"
              >
                Create Task
              </Link>
              <Link
                href="/dashboard/worker"
                className="text-slate-600 hover:text-field-600 transition-colors"
              >
                Browse Tasks
              </Link>
              <Link
                href="/dashboard/worker/claims"
                className="text-slate-600 hover:text-field-600 transition-colors"
              >
                My Claims
              </Link>
              {user?.role === 'admin' && (
                <Link
                  href="/dashboard/admin"
                  className="text-slate-600 hover:text-field-600 transition-colors"
                >
                  Admin
                </Link>
              )}
            </div>
            <div className="flex items-center space-x-4">
              <Link
                href="/dashboard/profile"
                className="flex items-center space-x-2 hover:opacity-80 transition-opacity"
              >
                {/* Avatar */}
                {(user?.ensAvatarUrl || user?.avatarUrl) ? (
                  <img
                    src={user.ensAvatarUrl || user.avatarUrl || ''}
                    alt="Avatar"
                    className="w-8 h-8 rounded-full object-cover border border-surface-200"
                  />
                ) : (
                  <div className="w-8 h-8 rounded-full bg-field-100 flex items-center justify-center text-field-600 font-medium text-sm">
                    {(user?.username || user?.ensName || user?.email || 'U')[0].toUpperCase()}
                  </div>
                )}
                {/* Display name */}
                <span className="text-sm text-slate-700 font-medium">
                  {user?.username || user?.ensName || user?.email || (user?.wallets?.[0]?.address
                    ? `${user.wallets[0].address.slice(0, 6)}...${user.wallets[0].address.slice(-4)}`
                    : 'User')}
                </span>
              </Link>
              <Link
                href="/dashboard/settings"
                className="text-slate-500 hover:text-field-600 text-sm transition-colors"
              >
                Settings
              </Link>
              <button
                onClick={handleLogout}
                className="text-slate-500 hover:text-red-600 text-sm transition-colors"
              >
                Logout
              </button>
            </div>
          </div>
        </div>
      </nav>

      {/* Main content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {children}
      </main>

      {/* Onboarding modal for new users */}
      {showOnboarding && (
        <OnboardingModal
          suggestedUsername={user?.ensName?.replace('.eth', '')}
          onComplete={() => setShowOnboarding(false)}
        />
      )}
    </div>
  );
}
