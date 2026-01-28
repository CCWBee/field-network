'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import { useAuthStore } from '@/lib/store';

// Helper to get default dates
function getDefaultDates() {
  const today = new Date();
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const nextWeek = new Date(today);
  nextWeek.setDate(nextWeek.getDate() + 7);
  return {
    startDate: tomorrow.toISOString().split('T')[0],
    endDate: nextWeek.toISOString().split('T')[0],
  };
}

interface FeePreview {
  bounty_amount: number;
  platform_fee: {
    amount: number;
    rate: number;
    rate_percent: string;
    tier: string;
  };
  arbitration_fee: {
    amount: number;
    rate: number;
    rate_percent: string;
  };
  total_cost: number;
  worker_payout: number;
  currency: string;
}

export default function CreateTaskPage() {
  const router = useRouter();
  const { token } = useAuthStore();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [step, setStep] = useState(1);
  const [feePreview, setFeePreview] = useState<FeePreview | null>(null);
  const [feeLoading, setFeeLoading] = useState(false);

  // Get default dates once at initialization
  const defaultDates = getDefaultDates();

  // Form state - initialized with proper defaults
  const [formData, setFormData] = useState({
    title: '',
    instructions: '',
    lat: 51.5074,
    lon: -0.1278,
    radius_m: 50,
    startDate: defaultDates.startDate,
    startTime: '09:00',
    endDate: defaultDates.endDate,
    endTime: '17:00',
    photoCount: 2,
    minWidth: 3000,
    minHeight: 2000,
    bearingRequired: false,
    bearingTarget: 0,
    bearingTolerance: 25,
    bountyAmount: 15,
    currency: 'GBP',
    exclusivityDays: 30,
    allowResale: true,
    safetyNotes: 'Do not trespass. Photos must be from public land.',
  });

  const updateForm = (field: string, value: any) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  // Debounced fee preview fetch
  const fetchFeePreview = useCallback(async (amount: number) => {
    if (!token || amount <= 0) return;

    setFeeLoading(true);
    try {
      api.setToken(token);
      const preview = await api.previewFees(amount);
      setFeePreview(preview);
    } catch (err) {
      console.error('Failed to fetch fee preview:', err);
    } finally {
      setFeeLoading(false);
    }
  }, [token]);

  // Fetch fee preview when bounty amount changes and on step 4
  useEffect(() => {
    if (step === 4 && formData.bountyAmount > 0) {
      const timer = setTimeout(() => {
        fetchFeePreview(formData.bountyAmount);
      }, 300); // Debounce
      return () => clearTimeout(timer);
    }
  }, [formData.bountyAmount, step, fetchFeePreview]);

  const handleSubmit = async (publish: boolean) => {
    setIsLoading(true);
    setError('');

    // Validate required fields
    if (!formData.title || formData.title.length < 5) {
      setError('Title must be at least 5 characters');
      setIsLoading(false);
      setStep(1);
      return;
    }
    if (!formData.instructions || formData.instructions.length < 10) {
      setError('Instructions must be at least 10 characters');
      setIsLoading(false);
      setStep(1);
      return;
    }

    try {
      api.setToken(token);

      const taskData = {
        template: 'geo_photo_v1',
        title: formData.title,
        instructions: formData.instructions,
        location: {
          type: 'point' as const,
          lat: formData.lat,
          lon: formData.lon,
          radius_m: formData.radius_m,
        },
        time_window: {
          start_iso: new Date(`${formData.startDate}T${formData.startTime}:00Z`).toISOString(),
          end_iso: new Date(`${formData.endDate}T${formData.endTime}:00Z`).toISOString(),
        },
        requirements: {
          photos: {
            count: formData.photoCount,
            min_width_px: formData.minWidth,
            min_height_px: formData.minHeight,
            format_allow: ['jpg', 'jpeg', 'png'],
            no_filters: true,
          },
          bearing: formData.bearingRequired ? {
            required: true,
            target_deg: formData.bearingTarget,
            tolerance_deg: formData.bearingTolerance,
          } : { required: false },
          freshness: {
            must_be_captured_within_task_window: true,
          },
        },
        assurance: {
          mode: 'single' as const,
          quorum: null,
        },
        bounty: {
          currency: formData.currency,
          amount: formData.bountyAmount,
        },
        rights: {
          exclusivity_days: formData.exclusivityDays,
          allow_resale_after_exclusivity: formData.allowResale,
        },
        policy: {
          safety_notes: formData.safetyNotes,
        },
      };

      const result = await api.createTask(taskData);

      if (publish) {
        await api.publishTask(result.id);
      }

      router.push('/dashboard/requester');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create task');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="max-w-3xl mx-auto">
      <h1 className="text-2xl font-bold text-slate-900 mb-8">Create New Task</h1>

      {error && (
        <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-md">
          <p className="text-sm text-red-600">{error}</p>
        </div>
      )}

      {/* Progress Steps */}
      <div className="flex items-center mb-8">
        {[1, 2, 3, 4].map((s) => (
          <div key={s} className="flex items-center">
            <div
              className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium ${
                s <= step ? 'bg-field-500 text-white' : 'bg-slate-200 text-slate-600'
              }`}
            >
              {s}
            </div>
            {s < 4 && (
              <div
                className={`w-16 h-1 ${s < step ? 'bg-field-500' : 'bg-slate-200'}`}
              />
            )}
          </div>
        ))}
      </div>

      <div className="glass rounded-lg border border-surface-200 p-6">
        {/* Step 1: Basic Info */}
        {step === 1 && (
          <div className="space-y-6">
            <h2 className="text-lg font-medium">Basic Information</h2>
            <div>
              <label className="block text-sm font-medium text-slate-700">Task Title</label>
              <input
                type="text"
                value={formData.title}
                onChange={(e) => updateForm('title', e.target.value)}
                placeholder="e.g., Photo at site entrance"
                className="mt-1 block w-full px-3 py-2 border border-surface-300 rounded-md shadow-sm focus:ring-field-500 focus:border-field-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700">Instructions</label>
              <textarea
                value={formData.instructions}
                onChange={(e) => updateForm('instructions', e.target.value)}
                rows={4}
                placeholder="Describe what the worker should capture..."
                className="mt-1 block w-full px-3 py-2 border border-surface-300 rounded-md shadow-sm focus:ring-field-500 focus:border-field-500"
              />
            </div>
          </div>
        )}

        {/* Step 2: Location */}
        {step === 2 && (
          <div className="space-y-6">
            <h2 className="text-lg font-medium">Location</h2>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700">Latitude</label>
                <input
                  type="number"
                  step="0.0001"
                  value={formData.lat}
                  onChange={(e) => updateForm('lat', parseFloat(e.target.value))}
                  className="mt-1 block w-full px-3 py-2 border border-surface-300 rounded-md shadow-sm focus:ring-field-500 focus:border-field-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700">Longitude</label>
                <input
                  type="number"
                  step="0.0001"
                  value={formData.lon}
                  onChange={(e) => updateForm('lon', parseFloat(e.target.value))}
                  className="mt-1 block w-full px-3 py-2 border border-surface-300 rounded-md shadow-sm focus:ring-field-500 focus:border-field-500"
                />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700">
                Radius (meters) - {formData.radius_m}m
              </label>
              <input
                type="range"
                min="10"
                max="500"
                value={formData.radius_m}
                onChange={(e) => updateForm('radius_m', parseInt(e.target.value))}
                className="mt-1 block w-full"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700">Start Date</label>
                <input
                  type="date"
                  value={formData.startDate}
                  onChange={(e) => updateForm('startDate', e.target.value)}
                  className="mt-1 block w-full px-3 py-2 border border-surface-300 rounded-md shadow-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700">Start Time</label>
                <input
                  type="time"
                  value={formData.startTime}
                  onChange={(e) => updateForm('startTime', e.target.value)}
                  className="mt-1 block w-full px-3 py-2 border border-surface-300 rounded-md shadow-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700">End Date</label>
                <input
                  type="date"
                  value={formData.endDate}
                  onChange={(e) => updateForm('endDate', e.target.value)}
                  className="mt-1 block w-full px-3 py-2 border border-surface-300 rounded-md shadow-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700">End Time</label>
                <input
                  type="time"
                  value={formData.endTime}
                  onChange={(e) => updateForm('endTime', e.target.value)}
                  className="mt-1 block w-full px-3 py-2 border border-surface-300 rounded-md shadow-sm"
                />
              </div>
            </div>
          </div>
        )}

        {/* Step 3: Requirements */}
        {step === 3 && (
          <div className="space-y-6">
            <h2 className="text-lg font-medium">Photo Requirements</h2>
            <div className="grid grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700">Number of Photos</label>
                <input
                  type="number"
                  min="1"
                  max="20"
                  value={formData.photoCount}
                  onChange={(e) => updateForm('photoCount', parseInt(e.target.value))}
                  className="mt-1 block w-full px-3 py-2 border border-surface-300 rounded-md shadow-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700">Min Width (px)</label>
                <input
                  type="number"
                  value={formData.minWidth}
                  onChange={(e) => updateForm('minWidth', parseInt(e.target.value))}
                  className="mt-1 block w-full px-3 py-2 border border-surface-300 rounded-md shadow-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700">Min Height (px)</label>
                <input
                  type="number"
                  value={formData.minHeight}
                  onChange={(e) => updateForm('minHeight', parseInt(e.target.value))}
                  className="mt-1 block w-full px-3 py-2 border border-surface-300 rounded-md shadow-sm"
                />
              </div>
            </div>
            <div>
              <label className="flex items-center">
                <input
                  type="checkbox"
                  checked={formData.bearingRequired}
                  onChange={(e) => updateForm('bearingRequired', e.target.checked)}
                  className="rounded border-surface-300 text-field-600"
                />
                <span className="ml-2 text-sm text-slate-700">Require specific camera direction</span>
              </label>
            </div>
            {formData.bearingRequired && (
              <div className="grid grid-cols-2 gap-4 ml-6">
                <div>
                  <label className="block text-sm font-medium text-slate-700">Target Bearing (degrees)</label>
                  <input
                    type="number"
                    min="0"
                    max="360"
                    value={formData.bearingTarget}
                    onChange={(e) => updateForm('bearingTarget', parseInt(e.target.value))}
                    className="mt-1 block w-full px-3 py-2 border border-surface-300 rounded-md shadow-sm"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700">Tolerance (degrees)</label>
                  <input
                    type="number"
                    min="1"
                    max="180"
                    value={formData.bearingTolerance}
                    onChange={(e) => updateForm('bearingTolerance', parseInt(e.target.value))}
                    className="mt-1 block w-full px-3 py-2 border border-surface-300 rounded-md shadow-sm"
                  />
                </div>
              </div>
            )}
            <div>
              <label className="block text-sm font-medium text-slate-700">Safety Notes</label>
              <textarea
                value={formData.safetyNotes}
                onChange={(e) => updateForm('safetyNotes', e.target.value)}
                rows={2}
                className="mt-1 block w-full px-3 py-2 border border-surface-300 rounded-md shadow-sm"
              />
            </div>
          </div>
        )}

        {/* Step 4: Pricing & Rights */}
        {step === 4 && (
          <div className="space-y-6">
            <h2 className="text-lg font-medium">Pricing & Rights</h2>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700">Bounty Amount</label>
                <div className="mt-1 flex">
                  <select
                    value={formData.currency}
                    onChange={(e) => updateForm('currency', e.target.value)}
                    className="px-3 py-2 border border-r-0 border-surface-300 rounded-l-md bg-slate-50"
                  >
                    <option value="GBP">GBP</option>
                    <option value="USD">USD</option>
                    <option value="EUR">EUR</option>
                  </select>
                  <input
                    type="number"
                    min="1"
                    step="0.50"
                    value={formData.bountyAmount}
                    onChange={(e) => updateForm('bountyAmount', parseFloat(e.target.value))}
                    className="flex-1 px-3 py-2 border border-surface-300 rounded-r-md"
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700">Exclusivity Period (days)</label>
                <input
                  type="number"
                  min="0"
                  max="365"
                  value={formData.exclusivityDays}
                  onChange={(e) => updateForm('exclusivityDays', parseInt(e.target.value))}
                  className="mt-1 block w-full px-3 py-2 border border-surface-300 rounded-md shadow-sm"
                />
              </div>
            </div>
            <div>
              <label className="flex items-center">
                <input
                  type="checkbox"
                  checked={formData.allowResale}
                  onChange={(e) => updateForm('allowResale', e.target.checked)}
                  className="rounded border-surface-300 text-field-600"
                />
                <span className="ml-2 text-sm text-slate-700">Allow data resale after exclusivity period</span>
              </label>
            </div>

            {/* Fee Breakdown */}
            <div className="bg-field-50 border border-field-200 p-4 rounded-lg mt-6">
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-medium text-slate-900">Fee Breakdown</h3>
                {feeLoading && (
                  <span className="text-xs text-slate-500">Calculating...</span>
                )}
              </div>
              {feePreview ? (
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-slate-600">Worker Bounty</span>
                    <span className="text-slate-900">{formData.currency} {feePreview.bounty_amount.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-600">
                      Platform Fee ({feePreview.platform_fee.rate_percent})
                      <span className="ml-1 text-xs text-field-600">({feePreview.platform_fee.tier} tier)</span>
                    </span>
                    <span className="text-slate-900">{formData.currency} {feePreview.platform_fee.amount.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-600">
                      Arbitration Reserve ({feePreview.arbitration_fee.rate_percent})
                    </span>
                    <span className="text-slate-900">{formData.currency} {feePreview.arbitration_fee.amount.toFixed(2)}</span>
                  </div>
                  <div className="border-t border-field-200 pt-2 mt-2">
                    <div className="flex justify-between font-medium">
                      <span className="text-slate-900">Total Cost</span>
                      <span className="text-field-600">{formData.currency} {feePreview.total_cost.toFixed(2)}</span>
                    </div>
                  </div>
                  <p className="text-xs text-slate-500 mt-2">
                    Worker receives the full bounty ({formData.currency} {feePreview.worker_payout.toFixed(2)}).
                    Fees are charged separately to requesters.
                  </p>
                </div>
              ) : (
                <p className="text-sm text-slate-500">Enter a bounty amount to see fee breakdown</p>
              )}
            </div>

            {/* Summary */}
            <div className="bg-slate-50 p-4 rounded-lg mt-6">
              <h3 className="font-medium text-slate-900 mb-2">Task Summary</h3>
              <dl className="grid grid-cols-2 gap-2 text-sm">
                <dt className="text-slate-500">Title:</dt>
                <dd className="text-slate-900">{formData.title || '-'}</dd>
                <dt className="text-slate-500">Location:</dt>
                <dd className="text-slate-900">{formData.lat.toFixed(4)}, {formData.lon.toFixed(4)}</dd>
                <dt className="text-slate-500">Photos Required:</dt>
                <dd className="text-slate-900">{formData.photoCount}</dd>
                <dt className="text-slate-500">Worker Bounty:</dt>
                <dd className="text-slate-900 font-medium">{formData.currency} {formData.bountyAmount.toFixed(2)}</dd>
                {feePreview && (
                  <>
                    <dt className="text-slate-500">Total Cost:</dt>
                    <dd className="text-field-600 font-medium">{formData.currency} {feePreview.total_cost.toFixed(2)}</dd>
                  </>
                )}
              </dl>
            </div>
          </div>
        )}

        {/* Navigation */}
        <div className="flex justify-between mt-8 pt-6 border-t">
          {step > 1 ? (
            <button
              onClick={() => setStep(step - 1)}
              className="px-4 py-2 border border-surface-300 rounded-md text-slate-700 hover:bg-slate-50"
            >
              Previous
            </button>
          ) : (
            <div />
          )}
          {step < 4 ? (
            <button
              onClick={() => setStep(step + 1)}
              className="px-4 py-2 bg-field-500 text-white rounded-md hover:bg-field-600"
            >
              Next
            </button>
          ) : (
            <div className="space-x-3">
              <button
                onClick={() => handleSubmit(false)}
                disabled={isLoading}
                className="px-4 py-2 border border-surface-300 rounded-md text-slate-700 hover:bg-slate-50 disabled:opacity-50"
              >
                Save as Draft
              </button>
              <button
                onClick={() => handleSubmit(true)}
                disabled={isLoading}
                className="px-4 py-2 bg-field-500 text-white rounded-md hover:bg-field-600 disabled:opacity-50"
              >
                {isLoading ? 'Publishing...' : 'Publish Task'}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
