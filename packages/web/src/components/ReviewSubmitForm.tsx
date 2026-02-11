'use client';

import { useState } from 'react';
import { api } from '@/lib/api';

interface ReviewSubmitFormProps {
  userId: string;
  username: string | null;
  taskId: string;
  role: 'requester' | 'worker';
  onSuccess?: () => void;
  onCancel?: () => void;
}

export default function ReviewSubmitForm({
  userId,
  username,
  taskId,
  role,
  onSuccess,
  onCancel,
}: ReviewSubmitFormProps) {
  const [rating, setRating] = useState(0);
  const [hoverRating, setHoverRating] = useState(0);
  const [comment, setComment] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const displayName = username || 'this user';
  const roleLabel = role === 'requester' ? 'task poster' : 'collector';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (rating === 0) {
      setError('Please select a rating');
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      await api.submitReview(userId, {
        task_id: taskId,
        rating,
        comment: comment.trim() || undefined,
      });
      onSuccess?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to submit review');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <p className="text-sm text-ink-700 mb-3">
          How was your experience working with {displayName} as a {roleLabel}?
        </p>

        {/* Star Rating */}
        <div className="flex items-center gap-1 mb-2">
          {[1, 2, 3, 4, 5].map((star) => (
            <button
              key={star}
              type="button"
              onClick={() => setRating(star)}
              onMouseEnter={() => setHoverRating(star)}
              onMouseLeave={() => setHoverRating(0)}
              className="p-1 focus:outline-none focus:ring-2 focus:ring-field-500 rounded"
            >
              <svg
                className={`w-8 h-8 transition-colors ${
                  star <= (hoverRating || rating)
                    ? 'text-signal-amber fill-current'
                    : 'text-ink-300'
                }`}
                viewBox="0 0 20 20"
                fill="currentColor"
              >
                <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
              </svg>
            </button>
          ))}
          <span className="ml-2 text-sm text-ink-500">
            {rating > 0 && (
              <>
                {rating === 1 && 'Poor'}
                {rating === 2 && 'Fair'}
                {rating === 3 && 'Good'}
                {rating === 4 && 'Very Good'}
                {rating === 5 && 'Excellent'}
              </>
            )}
          </span>
        </div>
      </div>

      {/* Comment */}
      <div>
        <label htmlFor="comment" className="block text-sm font-medium text-ink-700 mb-1">
          Comment (optional)
        </label>
        <textarea
          id="comment"
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          rows={3}
          maxLength={1000}
          placeholder="Share your experience..."
          className="w-full px-3 py-2 border border-ink-200 rounded-sm focus:ring-2 focus:ring-field-500 focus:border-field-500 resize-none"
        />
        <p className="text-xs text-ink-500 mt-1"><span className="font-mono tabular-nums">{comment.length}</span>/1000 characters</p>
      </div>

      {error && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-sm text-sm text-red-600">
          {error}
        </div>
      )}

      <div className="flex gap-3">
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="flex-1 px-4 py-2 border border-ink-200 text-ink-700 rounded-sm hover:bg-ink-50 transition-colors"
          >
            Cancel
          </button>
        )}
        <button
          type="submit"
          disabled={isSubmitting || rating === 0}
          className="flex-1 px-4 py-2 bg-field-500 text-white rounded-sm hover:bg-field-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isSubmitting ? 'Submitting...' : 'Submit Review'}
        </button>
      </div>
    </form>
  );
}
