'use client';

interface AutoScoreCheck {
  name: string;
  passed: boolean;
  score: number;
  weight: number;
  details?: string;
}

interface AutoScoreResult {
  totalScore: number;
  checks: AutoScoreCheck[];
  recommendation: 'worker_wins' | 'requester_wins' | 'escalate';
  timestamp: string;
}

interface AutoScoreBreakdownProps {
  autoScoreResult: AutoScoreResult;
  className?: string;
}

export function AutoScoreBreakdown({ autoScoreResult, className = '' }: AutoScoreBreakdownProps) {
  const getRecommendationLabel = (recommendation: string) => {
    switch (recommendation) {
      case 'worker_wins':
        return { text: 'Worker Favored', className: 'bg-green-200 text-green-800' };
      case 'requester_wins':
        return { text: 'Requester Favored', className: 'bg-red-200 text-red-800' };
      default:
        return { text: 'Escalate Recommended', className: 'bg-yellow-200 text-yellow-800' };
    }
  };

  const getScoreColor = (score: number) => {
    if (score >= 80) return 'text-green-600';
    if (score <= 20) return 'text-red-600';
    return 'text-yellow-600';
  };

  const getProgressColor = (score: number) => {
    if (score >= 80) return 'bg-green-500';
    if (score <= 20) return 'bg-red-500';
    return 'bg-yellow-500';
  };

  const recommendation = getRecommendationLabel(autoScoreResult.recommendation);

  return (
    <div className={`glass rounded-lg border border-purple-200 bg-purple-50 p-4 ${className}`}>
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-purple-800">Tier 1 Automated Analysis</h3>
        <span className={`px-2 py-0.5 text-xs font-medium rounded ${recommendation.className}`}>
          {recommendation.text}
        </span>
      </div>

      <div className="mb-3">
        <div className="flex items-center justify-between text-sm mb-1">
          <span className="text-purple-700">Overall Score</span>
          <span className={`font-bold ${getScoreColor(autoScoreResult.totalScore)}`}>
            {autoScoreResult.totalScore.toFixed(1)}%
          </span>
        </div>
        <div className="w-full bg-purple-200 rounded-full h-2">
          <div
            className={`h-2 rounded-full ${getProgressColor(autoScoreResult.totalScore)}`}
            style={{ width: `${autoScoreResult.totalScore}%` }}
          ></div>
        </div>
      </div>

      <div className="space-y-2">
        {autoScoreResult.checks.map((check, i) => (
          <div key={i} className="flex items-center justify-between text-xs">
            <div className="flex items-center gap-2">
              {check.passed ? (
                <svg className="w-4 h-4 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              ) : (
                <svg className="w-4 h-4 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              )}
              <span className="text-purple-700">{check.name.replace(/_/g, ' ')}</span>
              {check.details && (
                <span className="text-purple-500 text-xs">({check.details})</span>
              )}
            </div>
            <span className="text-purple-600">{check.score.toFixed(0)}% (w:{check.weight})</span>
          </div>
        ))}
      </div>
    </div>
  );
}
