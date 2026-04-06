'use client';

import { useState, useEffect } from 'react';
import { useAuthStore } from '@/lib/store';
import { api } from '@/lib/api';
import Link from 'next/link';

interface FeeConfig {
  id: string;
  fee_type: string;
  name: string;
  description: string | null;
  tier_order: number;
  rate: number;
  rate_percent: string;
  min_fee: number | null;
  max_fee: number | null;
  requirements: {
    min_account_days: number;
    min_tasks_accepted: number;
    min_reliability: number;
  };
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

interface FeeStats {
  total_platform_fees: number;
  total_arbitration_fees: number;
  total_fees: number;
  fees_by_tier: Record<string, number>;
  transaction_count: number;
  period: {
    start: string | null;
    end: string | null;
  };
}

export default function AdminFeesPage() {
  const { token, user } = useAuthStore();
  const [configs, setConfigs] = useState<FeeConfig[]>([]);
  const [stats, setStats] = useState<FeeStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [editingConfig, setEditingConfig] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<{
    name: string;
    rate: string;
    min_fee: string;
    max_fee: string;
    min_account_days: string;
    min_tasks_accepted: string;
    min_reliability: string;
  }>({
    name: '',
    rate: '',
    min_fee: '',
    max_fee: '',
    min_account_days: '',
    min_tasks_accepted: '',
    min_reliability: '',
  });

  // Load configs and stats
  useEffect(() => {
    const loadData = async () => {
      if (!token) return;

      setLoading(true);
      try {
        api.setToken(token);
        const [configsData, statsData] = await Promise.all([
          api.getAdminFeeConfigs(),
          api.getAdminFeeStats(),
        ]);
        setConfigs(configsData.configs);
        setStats(statsData);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load fee data');
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, [token]);

  const handleEdit = (config: FeeConfig) => {
    setEditingConfig(config.id);
    setEditForm({
      name: config.name,
      rate: (config.rate * 100).toString(),
      min_fee: config.min_fee?.toString() || '',
      max_fee: config.max_fee?.toString() || '',
      min_account_days: config.requirements.min_account_days.toString(),
      min_tasks_accepted: config.requirements.min_tasks_accepted.toString(),
      min_reliability: config.requirements.min_reliability.toString(),
    });
  };

  const handleSave = async () => {
    if (!editingConfig) return;

    setError(null);
    setSuccess(null);

    try {
      api.setToken(token);
      await api.updateFeeConfig(editingConfig, {
        name: editForm.name,
        rate: parseFloat(editForm.rate) / 100,
        min_fee: editForm.min_fee ? parseFloat(editForm.min_fee) : undefined,
        max_fee: editForm.max_fee ? parseFloat(editForm.max_fee) : undefined,
        min_account_days: parseInt(editForm.min_account_days),
        min_tasks_accepted: parseInt(editForm.min_tasks_accepted),
        min_reliability: parseFloat(editForm.min_reliability),
      });

      // Reload configs
      const configsData = await api.getAdminFeeConfigs();
      setConfigs(configsData.configs);
      setEditingConfig(null);
      setSuccess('Fee configuration updated successfully');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update fee configuration');
    }
  };

  const handleToggleActive = async (config: FeeConfig) => {
    try {
      api.setToken(token);
      await api.updateFeeConfig(config.id, {
        is_active: !config.is_active,
      });

      // Reload configs
      const configsData = await api.getAdminFeeConfigs();
      setConfigs(configsData.configs);
      setSuccess(`Fee tier ${config.is_active ? 'deactivated' : 'activated'}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to toggle fee configuration');
    }
  };

  const handleSeedConfigs = async () => {
    try {
      api.setToken(token);
      await api.seedFeeConfigs();
      const configsData = await api.getAdminFeeConfigs();
      setConfigs(configsData.configs);
      setSuccess('Default fee configurations seeded successfully');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to seed fee configurations');
    }
  };

  // Check if user is admin
  if (user?.role !== 'admin') {
    return (
      <div className="max-w-4xl mx-auto">
        <div className="bg-paper rounded-sm p-8 border border-ink-200 text-center">
          <h2 className="text-xl font-semibold text-ink-900 mb-2">Access Denied</h2>
          <p className="text-ink-700">You must be an administrator to view this page.</p>
          <Link href="/dashboard" className="mt-4 inline-block text-field-600 hover:text-field-700">
            Return to Dashboard
          </Link>
        </div>
      </div>
    );
  }

  const platformConfigs = configs.filter(c => c.fee_type === 'platform');
  const arbitrationConfig = configs.find(c => c.fee_type === 'arbitration');

  return (
    <div className="max-w-6xl mx-auto space-y-8">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-ink-900 tracking-tight">Fee Management</h1>
        <button
          onClick={handleSeedConfigs}
          className="px-4 py-2 text-sm border border-ink-200 text-ink-700 rounded-sm hover:bg-paper-warm transition-colors"
        >
          Seed Default Configs
        </button>
      </div>

      {/* Alerts */}
      {error && (
        <div className="p-4 bg-signal-red/10 border border-signal-red/20 text-signal-red rounded-sm">
          {error}
        </div>
      )}
      {success && (
        <div className="p-4 bg-signal-green/10 border border-signal-green/20 text-signal-green rounded-sm">
          {success}
        </div>
      )}

      {loading ? (
        <div className="bg-paper rounded-sm p-8 border border-ink-200 text-center">
          <p className="text-ink-700">Loading fee data...</p>
        </div>
      ) : (
        <>
          {/* Fee Statistics */}
          {stats && (
            <div className="bg-paper rounded-sm p-6 border border-ink-200">
              <h2 className="text-xs uppercase tracking-wider font-semibold text-ink-500 mb-4">Fee Statistics</h2>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="bg-paper rounded-sm p-4 border border-ink-200">
                  <p className="text-xs uppercase tracking-wider text-ink-500">Total Platform Fees</p>
                  <p className="text-2xl font-bold font-mono tabular-nums text-field-600">${stats.total_platform_fees.toFixed(2)}</p>
                </div>
                <div className="bg-paper rounded-sm p-4 border border-ink-200">
                  <p className="text-xs uppercase tracking-wider text-ink-500">Total Arbitration Fees</p>
                  <p className="text-2xl font-bold font-mono tabular-nums text-field-600">${stats.total_arbitration_fees.toFixed(2)}</p>
                </div>
                <div className="bg-paper rounded-sm p-4 border border-ink-200">
                  <p className="text-xs uppercase tracking-wider text-ink-500">Combined Total</p>
                  <p className="text-2xl font-bold font-mono tabular-nums text-field-600">${stats.total_fees.toFixed(2)}</p>
                </div>
                <div className="bg-paper rounded-sm p-4 border border-ink-200">
                  <p className="text-xs uppercase tracking-wider text-ink-500">Transaction Count</p>
                  <p className="text-2xl font-bold font-mono tabular-nums text-field-600">{stats.transaction_count}</p>
                </div>
              </div>

              {/* Fees by Tier */}
              {Object.keys(stats.fees_by_tier).length > 0 && (
                <div className="mt-6">
                  <h3 className="text-xs uppercase tracking-wider font-medium text-ink-500 mb-3">Fees by Tier</h3>
                  <div className="flex flex-wrap gap-3">
                    {Object.entries(stats.fees_by_tier).map(([tier, amount]) => (
                      <div key={tier} className="px-4 py-2 bg-paper-warm rounded-sm border border-ink-100">
                        <span className="text-sm font-medium text-ink-700">{tier}:</span>
                        <span className="ml-2 text-sm font-mono tabular-nums text-ink-700">${amount.toFixed(2)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Platform Fee Tiers */}
          <div className="bg-paper rounded-sm p-6 border border-ink-200">
            <h2 className="text-xs uppercase tracking-wider font-semibold text-ink-500 mb-4">Platform Fee Tiers</h2>
            {platformConfigs.length === 0 ? (
              <p className="text-ink-500">No platform fee tiers configured. Click "Seed Default Configs" to create them.</p>
            ) : (
              <div className="space-y-4">
                {platformConfigs.map((config) => (
                  <div
                    key={config.id}
                    className={`p-4 rounded-sm border ${config.is_active ? 'bg-white border-ink-200' : 'bg-paper-warm border-ink-100'}`}
                  >
                    {editingConfig === config.id ? (
                      <div className="space-y-4">
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                          <div>
                            <label className="block text-xs uppercase tracking-wider text-ink-500 mb-1">Tier Name</label>
                            <input
                              type="text"
                              value={editForm.name}
                              onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                              className="w-full px-3 py-2 border border-ink-200 rounded-sm text-sm text-ink-900"
                            />
                          </div>
                          <div>
                            <label className="block text-xs uppercase tracking-wider text-ink-500 mb-1">Rate (%)</label>
                            <input
                              type="number"
                              step="0.1"
                              value={editForm.rate}
                              onChange={(e) => setEditForm({ ...editForm, rate: e.target.value })}
                              className="w-full px-3 py-2 border border-ink-200 rounded-sm text-sm text-ink-900"
                            />
                          </div>
                          <div>
                            <label className="block text-xs uppercase tracking-wider text-ink-500 mb-1">Min Account Days</label>
                            <input
                              type="number"
                              value={editForm.min_account_days}
                              onChange={(e) => setEditForm({ ...editForm, min_account_days: e.target.value })}
                              className="w-full px-3 py-2 border border-ink-200 rounded-sm text-sm text-ink-900"
                            />
                          </div>
                          <div>
                            <label className="block text-xs uppercase tracking-wider text-ink-500 mb-1">Min Tasks Accepted</label>
                            <input
                              type="number"
                              value={editForm.min_tasks_accepted}
                              onChange={(e) => setEditForm({ ...editForm, min_tasks_accepted: e.target.value })}
                              className="w-full px-3 py-2 border border-ink-200 rounded-sm text-sm text-ink-900"
                            />
                          </div>
                          <div>
                            <label className="block text-xs uppercase tracking-wider text-ink-500 mb-1">Min Reliability (%)</label>
                            <input
                              type="number"
                              value={editForm.min_reliability}
                              onChange={(e) => setEditForm({ ...editForm, min_reliability: e.target.value })}
                              className="w-full px-3 py-2 border border-ink-200 rounded-sm text-sm text-ink-900"
                            />
                          </div>
                        </div>
                        <div className="flex space-x-2">
                          <button
                            onClick={handleSave}
                            className="px-3 py-1 text-sm bg-field-500 text-white rounded-sm hover:bg-field-600"
                          >
                            Save
                          </button>
                          <button
                            onClick={() => setEditingConfig(null)}
                            className="px-3 py-1 text-sm text-ink-500 hover:text-ink-900"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-center justify-between">
                        <div className="flex items-center space-x-6">
                          <div>
                            <p className="font-medium text-ink-900">{config.name}</p>
                            <p className="text-sm text-ink-500">{config.description}</p>
                          </div>
                          <div className="text-center">
                            <p className="text-2xl font-bold font-mono tabular-nums text-field-600">{config.rate_percent}</p>
                            <p className="text-xs uppercase tracking-wider text-ink-500">Platform Fee</p>
                          </div>
                          <div className="text-sm text-ink-700 space-y-1">
                            <p>Account: <span className="font-mono tabular-nums">{config.requirements.min_account_days}+</span> days</p>
                            <p>Tasks: <span className="font-mono tabular-nums">{config.requirements.min_tasks_accepted}+</span> accepted</p>
                            <p>Reliability: <span className="font-mono tabular-nums">{config.requirements.min_reliability}%+</span></p>
                          </div>
                        </div>
                        <div className="flex items-center space-x-3">
                          <span className={`px-2 py-1 text-xs rounded-sm ${config.is_active ? 'bg-signal-green/10 text-signal-green' : 'bg-ink-50 text-ink-500'}`}>
                            {config.is_active ? 'Active' : 'Inactive'}
                          </span>
                          <button
                            onClick={() => handleEdit(config)}
                            className="px-3 py-1 text-sm text-field-600 hover:text-field-700"
                          >
                            Edit
                          </button>
                          <button
                            onClick={() => handleToggleActive(config)}
                            className="px-3 py-1 text-sm text-ink-500 hover:text-ink-900"
                          >
                            {config.is_active ? 'Deactivate' : 'Activate'}
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Arbitration Fee */}
          <div className="bg-paper rounded-sm p-6 border border-ink-200">
            <h2 className="text-xs uppercase tracking-wider font-semibold text-ink-500 mb-4">Arbitration Fee</h2>
            {arbitrationConfig ? (
              <div className="p-4 bg-white rounded-sm border border-ink-200">
                {editingConfig === arbitrationConfig.id ? (
                  <div className="space-y-4">
                    <div className="grid grid-cols-3 gap-4">
                      <div>
                        <label className="block text-xs uppercase tracking-wider text-ink-500 mb-1">Rate (%)</label>
                        <input
                          type="number"
                          step="0.1"
                          value={editForm.rate}
                          onChange={(e) => setEditForm({ ...editForm, rate: e.target.value })}
                          className="w-full px-3 py-2 border border-ink-200 rounded-sm text-sm text-ink-900"
                        />
                      </div>
                      <div>
                        <label className="block text-xs uppercase tracking-wider text-ink-500 mb-1">Min Fee ($)</label>
                        <input
                          type="number"
                          step="0.01"
                          value={editForm.min_fee}
                          onChange={(e) => setEditForm({ ...editForm, min_fee: e.target.value })}
                          className="w-full px-3 py-2 border border-ink-200 rounded-sm text-sm text-ink-900"
                        />
                      </div>
                      <div>
                        <label className="block text-xs uppercase tracking-wider text-ink-500 mb-1">Max Fee ($)</label>
                        <input
                          type="number"
                          step="0.01"
                          value={editForm.max_fee}
                          onChange={(e) => setEditForm({ ...editForm, max_fee: e.target.value })}
                          className="w-full px-3 py-2 border border-ink-200 rounded-sm text-sm text-ink-900"
                        />
                      </div>
                    </div>
                    <div className="flex space-x-2">
                      <button
                        onClick={handleSave}
                        className="px-3 py-1 text-sm bg-field-500 text-white rounded-sm hover:bg-field-600"
                      >
                        Save
                      </button>
                      <button
                        onClick={() => setEditingConfig(null)}
                        className="px-3 py-1 text-sm text-ink-500 hover:text-ink-900"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-6">
                      <div>
                        <p className="font-medium text-ink-900">{arbitrationConfig.name}</p>
                        <p className="text-sm text-ink-500">{arbitrationConfig.description}</p>
                      </div>
                      <div className="text-center">
                        <p className="text-2xl font-bold font-mono tabular-nums text-field-600">{arbitrationConfig.rate_percent}</p>
                        <p className="text-xs uppercase tracking-wider text-ink-500">Arbitration Fee</p>
                      </div>
                      <div className="text-sm text-ink-700">
                        <p>Min: <span className="font-mono tabular-nums">${arbitrationConfig.min_fee?.toFixed(2) || '0.00'}</span></p>
                        <p>Max: <span className="font-mono tabular-nums">${arbitrationConfig.max_fee?.toFixed(2) || 'unlimited'}</span></p>
                      </div>
                    </div>
                    <button
                      onClick={() => handleEdit(arbitrationConfig)}
                      className="px-3 py-1 text-sm text-field-600 hover:text-field-700"
                    >
                      Edit
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <p className="text-ink-500">No arbitration fee configured. Click "Seed Default Configs" to create it.</p>
            )}
          </div>
        </>
      )}
    </div>
  );
}
