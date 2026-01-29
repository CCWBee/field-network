'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuthStore } from '@/lib/store';
import { OnboardingModal } from '@/components/OnboardingModal';
import { MobileNav, Spinner } from '@/components/ui';

const navItems = [
  {
    href: '/dashboard/requester',
    label: 'My Tasks',
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
      </svg>
    ),
  },
  {
    href: '/dashboard/requester/new',
    label: 'Create Task',
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
      </svg>
    ),
  },
  {
    href: '/dashboard/worker',
    label: 'Browse Tasks',
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
      </svg>
    ),
  },
  {
    href: '/dashboard/worker/claims',
    label: 'My Claims',
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
  },
  {
    href: '/dashboard/badges',
    label: 'Badges',
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4M7.835 4.697a3.42 3.42 0 001.946-.806 3.42 3.42 0 014.438 0 3.42 3.42 0 001.946.806 3.42 3.42 0 013.138 3.138 3.42 3.42 0 00.806 1.946 3.42 3.42 0 010 4.438 3.42 3.42 0 00-.806 1.946 3.42 3.42 0 01-3.138 3.138 3.42 3.42 0 00-1.946.806 3.42 3.42 0 01-4.438 0 3.42 3.42 0 00-1.946-.806 3.42 3.42 0 01-3.138-3.138 3.42 3.42 0 00-.806-1.946 3.42 3.42 0 010-4.438 3.42 3.42 0 00.806-1.946 3.42 3.42 0 013.138-3.138z" />
      </svg>
    ),
  },
  {
    href: '/dashboard/profile',
    label: 'Profile',
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
      </svg>
    ),
  },
  {
    href: '/dashboard/settings',
    label: 'Settings',
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
      </svg>
    ),
  },
];

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
        <Spinner size="lg" />
      </div>
    );
  }

  const handleLogout = () => {
    logout();
    router.push('/');
  };

  // Add admin link if user is admin
  const allNavItems = user?.role === 'admin'
    ? [...navItems.slice(0, 5), {
        href: '/dashboard/admin',
        label: 'Admin',
        icon: (
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
          </svg>
        ),
      }, ...navItems.slice(5)]
    : navItems;

  return (
    <div className="min-h-screen bg-surface bg-gradient-mesh">
      {/* Navigation */}
      <nav className="glass border-b border-surface-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16">
            <div className="flex items-center space-x-8">
              {/* Mobile menu button */}
              <MobileNav
                items={allNavItems}
                footer={
                  <button
                    onClick={handleLogout}
                    className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-red-600 hover:bg-red-50 transition-colors"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                    </svg>
                    Logout
                  </button>
                }
              />

              <Link href="/dashboard" className="text-xl font-bold text-gradient">
                Field Network
              </Link>

              {/* Desktop navigation */}
              <div className="hidden lg:flex items-center space-x-6">
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
                <Link
                  href="/dashboard/badges"
                  className="text-slate-600 hover:text-field-600 transition-colors"
                >
                  Badges
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
            </div>

            {/* Desktop right side */}
            <div className="hidden lg:flex items-center space-x-4">
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

            {/* Mobile right side - just avatar */}
            <div className="lg:hidden flex items-center">
              <Link
                href="/dashboard/profile"
                className="flex items-center hover:opacity-80 transition-opacity"
              >
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
              </Link>
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
