'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { useAuthStore } from '@/lib/store';

interface ApiToken {
  id: string;
  api_key: string;
  name: string;
  scopes: string[];
  spend_cap_amount: number | null;
  spend_used: number;
  expires_at: string | null;
  last_used_at: string | null;
  created_at: string;
}

interface NewTokenResult {
  api_key: string;
  secret: string;
  name: string;
}

export default function SettingsPage() {
  const { token, user, loadUser } = useAuthStore();
  const [apiTokens, setApiTokens] = useState<ApiToken[]>([]);
  const [availableScopes, setAvailableScopes] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');

  // New token form
  const [showNewToken, setShowNewToken] = useState(false);
  const [newTokenName, setNewTokenName] = useState('');
  const [selectedScopes, setSelectedScopes] = useState<string[]>([]);
  const [spendCap, setSpendCap] = useState('');
  const [expiryDays, setExpiryDays] = useState('30');
  const [isCreating, setIsCreating] = useState(false);
  const [newTokenResult, setNewTokenResult] = useState<NewTokenResult | null>(null);

  useEffect(() => {
    loadData();
  }, [token]);

  const loadData = async () => {
    if (!token) return;
    api.setToken(token);

    try {
      const [tokensRes, scopesRes] = await Promise.all([
        api.getApiTokens(),
        api.getAvailableScopes(),
      ]);
      setApiTokens(tokensRes.tokens);
      setAvailableScopes(scopesRes.available_scopes);
      await loadUser();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load data');
    } finally {
      setIsLoading(false);
    }
  };

  const handleCreateToken = async () => {
    if (!newTokenName.trim()) {
      setError('Token name is required');
      return;
    }
    if (selectedScopes.length === 0) {
      setError('Select at least one scope');
      return;
    }

    setIsCreating(true);
    setError('');

    try {
      api.setToken(token);
      const result = await api.createApiToken({
        name: newTokenName,
        scopes: selectedScopes,
        spend_cap_amount: spendCap ? parseFloat(spendCap) : undefined,
        expires_in_days: parseInt(expiryDays),
      });

      setNewTokenResult({
        api_key: result.token.api_key,
        secret: result.token.secret,
        name: result.token.name,
      });
      setShowNewToken(false);
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create token');
    } finally {
      setIsCreating(false);
    }
  };

  const handleRevokeToken = async (tokenId: string) => {
    if (!confirm('Are you sure you want to revoke this token?')) return;

    try {
      api.setToken(token);
      await api.revokeApiToken(tokenId);
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to revoke token');
    }
  };

  const toggleScope = (scope: string) => {
    setSelectedScopes(prev =>
      prev.includes(scope)
        ? prev.filter(s => s !== scope)
        : [...prev, scope]
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
    <div className="max-w-4xl mx-auto">
      <h1 className="text-2xl font-bold text-ink-900 tracking-tight mb-8">Settings</h1>

      {error && (
        <div className="mb-6 p-4 border border-signal-red/30 rounded-sm">
          <p className="text-sm text-signal-red">{error}</p>
        </div>
      )}

      {/* New Token Secret Display */}
      {newTokenResult && (
        <div className="mb-6 p-4 border border-signal-green/30 rounded-sm">
          <h3 className="font-medium text-signal-green mb-2">Token Created: {newTokenResult.name}</h3>
          <p className="text-sm text-signal-green mb-2">Save these credentials - the secret cannot be shown again!</p>
          <div className="bg-paper p-3 rounded-sm border border-ink-200 font-mono text-sm">
            <div><span className="text-ink-500">API Key:</span> {newTokenResult.api_key}</div>
            <div><span className="text-ink-500">Secret:</span> {newTokenResult.secret}</div>
          </div>
          <button
            onClick={() => setNewTokenResult(null)}
            className="mt-3 text-sm text-signal-green hover:underline"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Wallet Section */}
      <div className="bg-paper rounded-sm p-6 mb-6 border border-ink-200">
        <h2 className="text-lg font-medium text-ink-900 mb-4">Connected Wallets</h2>

        {user?.wallets && user.wallets.length > 0 ? (
          <div className="space-y-3">
            {user.wallets.map((wallet) => (
              <div key={wallet.id} className="flex items-center justify-between p-3 bg-ink-50 rounded-sm">
                <div>
                  <code className="text-sm text-ink-900">{wallet.address}</code>
                  <div className="text-xs text-ink-500 mt-1">
                    {wallet.chain} (Chain ID: {wallet.chainId})
                    {wallet.isPrimary && <span className="ml-2 text-field-500 font-medium">Primary</span>}
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-ink-500">No wallets connected</p>
        )}
      </div>

      {/* API Tokens Section */}
      <div className="bg-paper rounded-sm p-6 border border-ink-200">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-lg font-medium text-ink-900">API Tokens</h2>
          <button
            onClick={() => setShowNewToken(!showNewToken)}
            className="px-4 py-2 bg-field-500 text-white text-sm rounded-sm hover:bg-field-600"
          >
            {showNewToken ? 'Cancel' : 'Create Token'}
          </button>
        </div>

        {/* Create Token Form */}
        {showNewToken && (
          <div className="mb-6 p-4 bg-ink-50 rounded-sm">
            <div className="space-y-4">
              <div>
                <label className="block text-xs uppercase tracking-wider text-ink-500">Token Name</label>
                <input
                  type="text"
                  value={newTokenName}
                  onChange={(e) => setNewTokenName(e.target.value)}
                  placeholder="My CLI Tool"
                  className="mt-1 block w-full px-3 py-2 border border-ink-200 rounded-sm text-ink-900"
                />
              </div>

              <div>
                <label className="block text-xs uppercase tracking-wider text-ink-500 mb-2">Scopes</label>
                <div className="flex flex-wrap gap-2">
                  {availableScopes.map((scope) => (
                    <button
                      key={scope}
                      type="button"
                      onClick={() => toggleScope(scope)}
                      className={`px-3 py-1 text-sm rounded-sm border ${
                        selectedScopes.includes(scope)
                          ? 'bg-field-50 border-field-500/20 text-field-600'
                          : 'bg-paper border-ink-200 text-ink-700 hover:border-ink-300'
                      }`}
                    >
                      {scope}
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs uppercase tracking-wider text-ink-500">Spend Cap (USDC)</label>
                  <input
                    type="number"
                    value={spendCap}
                    onChange={(e) => setSpendCap(e.target.value)}
                    placeholder="Optional"
                    className="mt-1 block w-full px-3 py-2 border border-ink-200 rounded-sm text-ink-900"
                  />
                </div>
                <div>
                  <label className="block text-xs uppercase tracking-wider text-ink-500">Expires In (days)</label>
                  <select
                    value={expiryDays}
                    onChange={(e) => setExpiryDays(e.target.value)}
                    className="mt-1 block w-full px-3 py-2 border border-ink-200 rounded-sm text-ink-900"
                  >
                    <option value="7">7 days</option>
                    <option value="30">30 days</option>
                    <option value="90">90 days</option>
                    <option value="365">1 year</option>
                  </select>
                </div>
              </div>

              <button
                onClick={handleCreateToken}
                disabled={isCreating}
                className="w-full py-2 bg-field-500 text-white rounded-sm hover:bg-field-600 disabled:opacity-50"
              >
                {isCreating ? 'Creating...' : 'Create Token'}
              </button>
            </div>
          </div>
        )}

        {/* Token List */}
        {apiTokens.length > 0 ? (
          <div className="space-y-3">
            {apiTokens.map((t) => (
              <div key={t.id} className="p-4 border border-ink-200 rounded-sm">
                <div className="flex justify-between items-start">
                  <div>
                    <h4 className="font-medium text-ink-900">{t.name}</h4>
                    <code className="text-xs text-ink-500">{t.api_key}</code>
                  </div>
                  <button
                    onClick={() => handleRevokeToken(t.id)}
                    className="text-sm text-signal-red hover:underline"
                  >
                    Revoke
                  </button>
                </div>
                <div className="mt-2 flex flex-wrap gap-1">
                  {t.scopes.map((scope) => (
                    <span key={scope} className="px-2 py-0.5 bg-ink-50 text-ink-700 text-xs rounded-sm border border-ink-200">
                      {scope}
                    </span>
                  ))}
                </div>
                <div className="mt-2 text-xs text-ink-500">
                  {t.spend_cap_amount && (
                    <span className="mr-4 font-mono tabular-nums">
                      Spend: ${t.spend_used.toFixed(2)} / ${t.spend_cap_amount.toFixed(2)}
                    </span>
                  )}
                  {t.expires_at && (
                    <span className="mr-4">
                      Expires: {new Date(t.expires_at).toLocaleDateString()}
                    </span>
                  )}
                  {t.last_used_at && (
                    <span>Last used: {new Date(t.last_used_at).toLocaleString()}</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-ink-500">No API tokens created yet</p>
        )}
      </div>
    </div>
  );
}
