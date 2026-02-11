'use client';

import { useState, useEffect } from 'react';
import { useAuthStore } from '@/lib/store';
import { api } from '@/lib/api';

interface OnboardingModalProps {
  suggestedUsername?: string | null;
  onComplete: () => void;
}

export function OnboardingModal({ suggestedUsername, onComplete }: OnboardingModalProps) {
  const { user, loadUser } = useAuthStore();
  const [step, setStep] = useState(1);
  const [username, setUsername] = useState(suggestedUsername || '');
  const [email, setEmail] = useState('');
  const [bio, setBio] = useState('');
  const [isChecking, setIsChecking] = useState(false);
  const [isAvailable, setIsAvailable] = useState<boolean | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  // Debounced username check
  useEffect(() => {
    if (username.length < 3) {
      setIsAvailable(null);
      return;
    }

    const timer = setTimeout(async () => {
      setIsChecking(true);
      try {
        const result = await api.checkUsername(username);
        setIsAvailable(result.available);
        if (!result.available && result.reason) {
          setError(result.reason);
        } else {
          setError(null);
        }
      } catch {
        setIsAvailable(null);
      } finally {
        setIsChecking(false);
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [username]);

  const handleSubmit = async () => {
    if (!username || username.length < 3) {
      setError('Username must be at least 3 characters');
      return;
    }

    if (isAvailable === false) {
      setError('Username is not available');
      return;
    }

    setIsSaving(true);
    setError(null);

    try {
      await api.completeOnboarding({
        username,
        email: email || undefined,
        bio: bio || undefined,
      });
      await loadUser();
      onComplete();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to complete onboarding');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-paper rounded-sm shadow-xl max-w-md w-full overflow-hidden">
        {/* Header */}
        <div className="bg-field-500 p-6 text-white">
          <h2 className="text-xl font-bold">Welcome to Field Network</h2>
          <p className="text-field-100 mt-1">Let's set up your profile</p>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6">
          {/* Progress */}
          <div className="flex space-x-2">
            <div className={`flex-1 h-1 rounded-sm ${step >= 1 ? 'bg-field-500' : 'bg-ink-200'}`} />
            <div className={`flex-1 h-1 rounded-sm ${step >= 2 ? 'bg-field-500' : 'bg-ink-200'}`} />
          </div>

          {error && (
            <div className="p-3 bg-red-50 border border-red-200 text-red-700 rounded-sm text-sm">
              {error}
            </div>
          )}

          {step === 1 && (
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-ink-700 mb-2">
                  Choose your username
                </label>
                <div className="relative">
                  <input
                    type="text"
                    value={username}
                    onChange={(e) => setUsername(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ''))}
                    placeholder="username"
                    className="w-full px-4 py-3 border border-ink-200 rounded-sm focus:ring-2 focus:ring-field-500 focus:border-transparent"
                    autoFocus
                  />
                  <div className="absolute right-3 top-1/2 -translate-y-1/2">
                    {isChecking && (
                      <div className="w-5 h-5 border-2 border-field-500 border-t-transparent rounded-full animate-spin" />
                    )}
                    {!isChecking && isAvailable === true && (
                      <svg className="w-5 h-5 text-green-500" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                      </svg>
                    )}
                    {!isChecking && isAvailable === false && (
                      <svg className="w-5 h-5 text-red-500" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                      </svg>
                    )}
                  </div>
                </div>
                <p className="text-xs text-ink-500 mt-1">
                  Letters, numbers, and underscores only. This is how others will identify you.
                </p>
              </div>

              {user?.ensName && (
                <div className="p-3 bg-field-50 rounded-sm">
                  <p className="text-sm text-field-700">
                    <span className="font-medium">ENS detected:</span> {user.ensName}
                  </p>
                  <button
                    onClick={() => setUsername(user.ensName?.replace('.eth', '') || '')}
                    className="text-sm text-field-600 hover:text-field-700 underline mt-1"
                  >
                    Use ENS name as username
                  </button>
                </div>
              )}

              <button
                onClick={() => setStep(2)}
                disabled={!username || username.length < 3 || isAvailable === false}
                className="w-full py-3 bg-field-500 text-white rounded-sm font-medium hover:bg-field-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Continue
              </button>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-ink-700 mb-2">
                  Email address <span className="text-ink-300 font-normal">(optional)</span>
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  className="w-full px-4 py-3 border border-ink-200 rounded-sm focus:ring-2 focus:ring-field-500 focus:border-transparent"
                />
                <p className="text-xs text-ink-500 mt-1">
                  For notifications and account recovery. We'll never spam you.
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-ink-700 mb-2">
                  Short bio <span className="text-ink-300 font-normal">(optional)</span>
                </label>
                <textarea
                  value={bio}
                  onChange={(e) => setBio(e.target.value)}
                  placeholder="Tell others a bit about yourself..."
                  rows={3}
                  maxLength={200}
                  className="w-full px-4 py-3 border border-ink-200 rounded-sm focus:ring-2 focus:ring-field-500 focus:border-transparent resize-none"
                />
              </div>

              <div className="flex space-x-3">
                <button
                  onClick={() => setStep(1)}
                  className="flex-1 py-3 border border-ink-200 text-ink-700 rounded-sm font-medium hover:bg-ink-50 transition-colors"
                >
                  Back
                </button>
                <button
                  onClick={handleSubmit}
                  disabled={isSaving}
                  className="flex-1 py-3 bg-field-500 text-white rounded-sm font-medium hover:bg-field-600 transition-colors disabled:opacity-50"
                >
                  {isSaving ? 'Setting up...' : 'Complete Setup'}
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 pb-6">
          <p className="text-xs text-center text-ink-500">
            By continuing, you agree to our Terms of Service and Privacy Policy.
          </p>
        </div>
      </div>
    </div>
  );
}

export default OnboardingModal;
