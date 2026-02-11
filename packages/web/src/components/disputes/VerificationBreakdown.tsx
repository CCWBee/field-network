'use client';

interface VerificationCheck {
  check: string;
  passed: boolean;
  message: string;
  actual?: string | number;
  expected?: string | number;
}

interface VerificationBreakdownProps {
  checks: VerificationCheck[];
  score: number;
  className?: string;
  compact?: boolean;
}

export function VerificationBreakdown({
  checks,
  score,
  className = '',
  compact = false,
}: VerificationBreakdownProps) {
  const getScoreColor = (score: number) => {
    if (score >= 80) return 'text-green-600';
    if (score >= 50) return 'text-yellow-600';
    return 'text-red-600';
  };

  const getProgressColor = (score: number) => {
    if (score >= 80) return 'bg-green-500';
    if (score >= 50) return 'bg-yellow-500';
    return 'bg-red-500';
  };

  const formatCheckName = (name: string) => {
    return name
      .replace(/_/g, ' ')
      .replace(/\b\w/g, (c) => c.toUpperCase());
  };

  if (compact) {
    return (
      <div className={`text-sm ${className}`}>
        <div className="flex items-center gap-2 mb-2">
          <span className="text-ink-500">Verification:</span>
          <span className={`font-mono tabular-nums font-semibold ${getScoreColor(score)}`}>{score}%</span>
        </div>
        <div className="flex flex-wrap gap-1">
          {checks.map((check, i) => (
            <span
              key={i}
              className={`px-2 py-0.5 text-xs rounded-sm border ${
                check.passed
                  ? 'text-signal-green border-signal-green/30'
                  : 'text-signal-red border-signal-red/30'
              }`}
              title={check.message}
            >
              {check.passed ? '✓' : '✗'} {formatCheckName(check.check)}
            </span>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className={`bg-paper rounded-sm border border-ink-200 p-4 ${className}`}>
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-ink-700">Verification Breakdown</h3>
        <div className="flex items-center gap-2">
          <span className="text-sm text-ink-500">Score:</span>
          <span className={`text-lg font-mono tabular-nums font-bold ${getScoreColor(score)}`}>{score}%</span>
        </div>
      </div>

      <div className="w-full bg-ink-200 rounded-sm h-2 mb-4">
        <div
          className={`h-2 rounded-sm ${getProgressColor(score)}`}
          style={{ width: `${score}%` }}
        ></div>
      </div>

      <div className="space-y-3">
        {checks.map((check, i) => (
          <div key={i} className="flex items-start gap-3">
            <div className={`flex-shrink-0 w-5 h-5 rounded-full flex items-center justify-center ${
              check.passed ? 'bg-green-100' : 'bg-red-100'
            }`}>
              {check.passed ? (
                <svg className="w-3 h-3 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                </svg>
              ) : (
                <svg className="w-3 h-3 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M6 18L18 6M6 6l12 12" />
                </svg>
              )}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between">
                <span className={`text-sm font-medium ${check.passed ? 'text-green-700' : 'text-red-700'}`}>
                  {formatCheckName(check.check)}
                </span>
              </div>
              <p className="text-xs text-ink-500 mt-0.5">{check.message}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
