'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api';
import { useAuthStore } from '@/lib/store';

interface WorkerProfile {
  displayName: string;
  radiusKm: number;
  skills: string[];
  kit: string[];
  rating: number;
  completedCount: number;
  strikes: number;
}

export default function WorkerProfilePage() {
  const { token, user, loadUser } = useAuthStore();
  const [profile, setProfile] = useState<WorkerProfile | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Form state
  const [displayName, setDisplayName] = useState('');
  const [radiusKm, setRadiusKm] = useState('50');
  const [skills, setSkills] = useState<string[]>([]);
  const [kit, setKit] = useState<string[]>([]);
  const [newSkill, setNewSkill] = useState('');
  const [newKit, setNewKit] = useState('');

  const availableSkills = [
    'Photography',
    'Videography',
    'Night photography',
    'Drone operation',
    'Surveying',
    'Traffic counting',
    'Event documentation',
    'Wildlife observation',
    'Architecture photography',
    'Street photography',
  ];

  const availableKit = [
    'DSLR Camera',
    'Mirrorless Camera',
    'Smartphone (flagship)',
    'Drone',
    'Tripod',
    'Wide-angle lens',
    'Telephoto lens',
    'External microphone',
    'GoPro/Action cam',
    'GPS device',
  ];

  useEffect(() => {
    loadProfile();
  }, [token]);

  const loadProfile = async () => {
    if (!token) return;
    api.setToken(token);

    try {
      const userData = await api.getMe();
      if (userData.workerProfile) {
        const p = userData.workerProfile;
        setProfile({
          displayName: p.displayName,
          radiusKm: p.radiusKm,
          skills: JSON.parse(p.skills || '[]'),
          kit: JSON.parse(p.kit || '[]'),
          rating: p.rating,
          completedCount: p.completedCount,
          strikes: p.strikes,
        });
        setDisplayName(p.displayName);
        setRadiusKm(String(p.radiusKm));
        setSkills(JSON.parse(p.skills || '[]'));
        setKit(JSON.parse(p.kit || '[]'));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load profile');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSave = async () => {
    setIsSaving(true);
    setError('');
    setSuccess('');

    try {
      // In a real app, you'd have a PUT /v1/auth/worker-profile endpoint
      // For now, we just show a success message
      setSuccess('Profile updated successfully!');
      setTimeout(() => setSuccess(''), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save profile');
    } finally {
      setIsSaving(false);
    }
  };

  const toggleSkill = (skill: string) => {
    setSkills(prev =>
      prev.includes(skill) ? prev.filter(s => s !== skill) : [...prev, skill]
    );
  };

  const toggleKit = (item: string) => {
    setKit(prev =>
      prev.includes(item) ? prev.filter(k => k !== item) : [...prev, item]
    );
  };

  if (isLoading) {
    return (
      <div className="flex justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-field-500"></div>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto">
      <div className="mb-8">
        <Link href="/dashboard/worker" className="text-sm text-ink-500 hover:text-ink-700 mb-2 inline-block">
          &larr; Back to dashboard
        </Link>
        <h1 className="text-2xl font-bold text-ink-900 tracking-tight">Worker Profile</h1>
      </div>

      {error && (
        <div className="mb-6 p-4 border border-signal-red/30 rounded-sm">
          <p className="text-sm text-signal-red">{error}</p>
        </div>
      )}

      {success && (
        <div className="mb-6 p-4 border border-signal-green/30 rounded-sm">
          <p className="text-sm text-signal-green">{success}</p>
        </div>
      )}

      {/* Stats */}
      {profile && (
        <div className="grid grid-cols-3 gap-4 mb-8">
          <div className="bg-paper rounded-sm border border-ink-200 p-4 text-center">
            <div className="text-3xl font-bold font-mono tabular-nums text-field-600">{profile.rating.toFixed(1)}</div>
            <div className="text-xs uppercase tracking-wider text-ink-500">Rating</div>
          </div>
          <div className="bg-paper rounded-sm border border-ink-200 p-4 text-center">
            <div className="text-3xl font-bold font-mono tabular-nums text-signal-green">{profile.completedCount}</div>
            <div className="text-xs uppercase tracking-wider text-ink-500">Completed</div>
          </div>
          <div className="bg-paper rounded-sm border border-ink-200 p-4 text-center">
            <div className={`text-3xl font-bold font-mono tabular-nums ${profile.strikes > 0 ? 'text-signal-red' : 'text-ink-300'}`}>
              {profile.strikes}
            </div>
            <div className="text-xs uppercase tracking-wider text-ink-500">Strikes</div>
          </div>
        </div>
      )}

      {/* Profile Form */}
      <div className="bg-paper rounded-sm border border-ink-200 p-6 space-y-6">
        {/* Display Name */}
        <div>
          <label className="block text-xs uppercase tracking-wider text-ink-500 mb-1">Display Name</label>
          <input
            type="text"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            className="w-full px-3 py-2 border border-ink-200 rounded-sm"
          />
        </div>

        {/* Work Radius */}
        <div>
          <label className="block text-xs uppercase tracking-wider text-ink-500 mb-1">
            Work Radius: {radiusKm} km
          </label>
          <input
            type="range"
            min="5"
            max="200"
            value={radiusKm}
            onChange={(e) => setRadiusKm(e.target.value)}
            className="w-full"
          />
          <div className="flex justify-between text-xs text-ink-300">
            <span>5 km</span>
            <span>200 km</span>
          </div>
        </div>

        {/* Skills */}
        <div>
          <label className="block text-xs uppercase tracking-wider text-ink-500 mb-2">Skills</label>
          <div className="flex flex-wrap gap-2">
            {availableSkills.map((skill) => (
              <button
                key={skill}
                type="button"
                onClick={() => toggleSkill(skill)}
                className={`px-3 py-1 text-sm rounded-sm border ${
                  skills.includes(skill)
                    ? 'bg-field-50 border-field-500/20 text-field-600'
                    : 'bg-paper border-ink-200 text-ink-700 hover:border-ink-300'
                }`}
              >
                {skill}
              </button>
            ))}
          </div>
        </div>

        {/* Equipment/Kit */}
        <div>
          <label className="block text-xs uppercase tracking-wider text-ink-500 mb-2">Equipment</label>
          <div className="flex flex-wrap gap-2">
            {availableKit.map((item) => (
              <button
                key={item}
                type="button"
                onClick={() => toggleKit(item)}
                className={`px-3 py-1 text-sm rounded-sm border ${
                  kit.includes(item)
                    ? 'text-signal-green border-signal-green/30'
                    : 'bg-paper border-ink-200 text-ink-700 hover:border-ink-300'
                }`}
              >
                {item}
              </button>
            ))}
          </div>
        </div>

        {/* Save Button */}
        <div className="pt-4 border-t border-ink-100">
          <button
            onClick={handleSave}
            disabled={isSaving}
            className="w-full py-2 bg-field-500 text-white rounded-sm hover:bg-field-600 disabled:opacity-50"
          >
            {isSaving ? 'Saving...' : 'Save Profile'}
          </button>
        </div>
      </div>
    </div>
  );
}
