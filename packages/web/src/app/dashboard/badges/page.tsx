'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api';
import { useAuthStore } from '@/lib/store';

interface TierThreshold {
  tier: string;
  threshold: number;
}

interface BadgeDefinition {
  type: string;
  name: string;
  description: string;
  category: string;
  icon_url: string | null;
  tiers: TierThreshold[];
}

interface EarnedBadge {
  badge_type: string;
  tier: string;
  title: string;
  description: string;
  icon_url: string | null;
  earned_at: string;
}

const TIER_ORDER: Record<string, number> = {
  bronze: 1,
  silver: 2,
  gold: 3,
  platinum: 4,
};

const TIER_STYLES: Record<string, { text: string; border: string; bg: string }> = {
  bronze: { text: 'text-orange-700', border: 'border-orange-300', bg: 'bg-orange-50' },
  silver: { text: 'text-ink-700', border: 'border-ink-300', bg: 'bg-ink-50' },
  gold: { text: 'text-yellow-700', border: 'border-yellow-300', bg: 'bg-yellow-50' },
  platinum: { text: 'text-purple-700', border: 'border-purple-300', bg: 'bg-purple-50' },
};

function tierRank(tier: string): number {
  return TIER_ORDER[tier] ?? 0;
}

function sortTiers(tiers: TierThreshold[]): TierThreshold[] {
  return [...(tiers || [])].sort((a, b) => tierRank(a.tier) - tierRank(b.tier));
}

export default function BadgesPage() {
  const { token } = useAuthStore();
  const [definitions, setDefinitions] = useState<BadgeDefinition[]>([]);
  const [earned, setEarned] = useState<EarnedBadge[]>([]);
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const loadBadges = async () => {
      try {
        api.setToken(token);
        const [defs, mine] = await Promise.all([api.getBadges(), api.getMyBadges()]);
        setDefinitions(defs.badges);
        setEarned(mine.badges);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load badges');
      } finally {
        setIsLoading(false);
      }
    };

    loadBadges();
  }, [token]);

  // Group earned badges by type, keeping the highest tier
  const highestEarnedByType = useMemo(() => {
    const map = new Map<string, EarnedBadge>();
    earned.forEach((badge) => {
      const existing = map.get(badge.badge_type);
      if (!existing || tierRank(badge.tier) > tierRank(existing.tier)) {
        map.set(badge.badge_type, badge);
      }
    });
    return map;
  }, [earned]);

  return (
    <div className="max-w-5xl mx-auto">
      <div className="flex flex-wrap items-center justify-between gap-4 mb-8">
        <div>
          <Link href="/dashboard" className="text-sm text-ink-500 hover:text-ink-700 mb-2 inline-block">
            &larr; Back to Dashboard
          </Link>
          <h1 className="text-2xl font-bold text-ink-900 tracking-tight">Badge Vault</h1>
          <p className="text-ink-500 mt-2">Every badge is a real signal of field performance.</p>
        </div>
      </div>

      {error && (
        <div className="mb-6 p-4 border border-signal-red/30 rounded-sm">
          <p className="text-sm text-signal-red">{error}</p>
        </div>
      )}

      {isLoading ? (
        <div className="bg-paper rounded-sm border border-ink-200 p-6 text-sm text-ink-500">
          Loading badge vault...
        </div>
      ) : definitions.length === 0 ? (
        <div className="bg-paper rounded-sm border border-ink-200 p-6 text-sm text-ink-500">
          No badges available yet. Check back after your next mission.
        </div>
      ) : (
        <div className="grid gap-6 md:grid-cols-2">
          {definitions.map((badge) => {
            const owned = highestEarnedByType.get(badge.type);
            const tiers = sortTiers(badge.tiers || []);
            const ownedTier = owned?.tier ?? null;
            const ownedRank = ownedTier ? tierRank(ownedTier) : 0;
            const nextTier = tiers.find((t) => tierRank(t.tier) > ownedRank);
            const currentTierDef = ownedTier ? tiers.find((t) => t.tier === ownedTier) : null;
            const tierStyle = ownedTier ? TIER_STYLES[ownedTier] : null;

            return (
              <div
                key={badge.type}
                className={`bg-paper rounded-sm border p-6 transition ${
                  owned ? 'border-field-500/30' : 'border-ink-200 opacity-90'
                }`}
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-center gap-3">
                    {badge.icon_url ? (
                      <div className="h-10 w-10 rounded-sm bg-field-50 overflow-hidden">
                        <img src={badge.icon_url} alt={badge.name} className="h-full w-full object-cover" />
                      </div>
                    ) : (
                      <div className="h-10 w-10 rounded-sm bg-field-50 text-field-600 flex items-center justify-center text-sm font-semibold">
                        {badge.name.slice(0, 1).toUpperCase()}
                      </div>
                    )}
                    <div>
                      <h2 className="text-lg font-semibold text-ink-900">{badge.name}</h2>
                      <p className="text-sm text-ink-500 mt-1">{badge.description}</p>
                    </div>
                  </div>
                  <div className="text-xs uppercase tracking-wider text-ink-300">{badge.category}</div>
                </div>

                {/* Tier ladder */}
                {tiers.length > 0 && (
                  <div className="mt-4 flex flex-wrap gap-1.5">
                    {tiers.map((t) => {
                      const reached = tierRank(t.tier) <= ownedRank;
                      const style = TIER_STYLES[t.tier] ?? TIER_STYLES.bronze;
                      return (
                        <span
                          key={t.tier}
                          className={`px-2 py-0.5 rounded-sm border text-xs capitalize ${
                            reached
                              ? `${style.text} ${style.border} ${style.bg}`
                              : 'text-ink-400 border-ink-200 bg-paper'
                          }`}
                          title={`Threshold: ${t.threshold}`}
                        >
                          {t.tier} - {t.threshold}
                        </span>
                      );
                    })}
                  </div>
                )}

                {/* Status row */}
                <div className="mt-4 flex items-center justify-between gap-3">
                  {owned ? (
                    <span
                      className={`px-3 py-1 rounded-sm text-xs border capitalize ${
                        tierStyle ? `${tierStyle.text} ${tierStyle.border} ${tierStyle.bg}` : ''
                      }`}
                    >
                      {ownedTier} - earned {new Date(owned.earned_at).toLocaleDateString()}
                    </span>
                  ) : (
                    <span className="px-3 py-1 rounded-sm text-xs border text-ink-500 border-ink-200">
                      Locked
                    </span>
                  )}
                  {nextTier ? (
                    <span className="text-xs text-ink-500">
                      Next: <span className="capitalize">{nextTier.tier}</span> at {nextTier.threshold}
                    </span>
                  ) : owned ? (
                    <span className="text-xs text-field-600">Max tier reached</span>
                  ) : null}
                </div>

                {/* Progress bar to next tier */}
                {nextTier && (
                  <div className="mt-3">
                    <div className="h-1.5 w-full bg-ink-100 rounded-sm overflow-hidden">
                      <div
                        className="h-full bg-field-500"
                        style={{
                          width: `${Math.min(
                            100,
                            currentTierDef
                              ? ((currentTierDef.threshold) /
                                  (nextTier.threshold || 1)) *
                                  100
                              : 0
                          )}%`,
                        }}
                      />
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
