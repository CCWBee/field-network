'use client';

import { useState } from 'react';
import Link from 'next/link';

interface Review {
  id: string;
  rating: number;
  comment: string | null;
  role: string;
  reviewer: {
    username: string | null;
    avatar_url: string | null;
  } | null;
  created_at: string;
}

interface ReviewSummary {
  average_rating: number | null;
  total_reviews: number;
  rating_breakdown: Record<number, number>;
}

interface ReviewListProps {
  reviews: Review[];
  summary?: ReviewSummary;
  onLoadMore?: () => void;
  hasMore?: boolean;
  isLoading?: boolean;
  showSummary?: boolean;
  className?: string;
}

function StarRating({ rating, size = 'sm' }: { rating: number; size?: 'sm' | 'md' | 'lg' }) {
  const sizes = {
    sm: 'w-3.5 h-3.5',
    md: 'w-4 h-4',
    lg: 'w-5 h-5',
  };

  return (
    <div className="flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map((star) => (
        <svg
          key={star}
          className={`${sizes[size]} ${
            star <= rating ? 'text-yellow-400 fill-current' : 'text-slate-300'
          }`}
          viewBox="0 0 20 20"
          fill="currentColor"
        >
          <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
        </svg>
      ))}
    </div>
  );
}

function RatingBreakdown({ breakdown, total }: { breakdown: Record<number, number>; total: number }) {
  return (
    <div className="space-y-1">
      {[5, 4, 3, 2, 1].map((rating) => {
        const count = breakdown[rating] || 0;
        const percentage = total > 0 ? (count / total) * 100 : 0;

        return (
          <div key={rating} className="flex items-center gap-2 text-xs">
            <span className="w-3 text-slate-500">{rating}</span>
            <svg className="w-3 h-3 text-yellow-400 fill-current" viewBox="0 0 20 20">
              <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
            </svg>
            <div className="flex-1 h-1.5 bg-slate-200 rounded-full overflow-hidden">
              <div
                className="h-full bg-yellow-400 rounded-full transition-all"
                style={{ width: `${percentage}%` }}
              />
            </div>
            <span className="w-6 text-right text-slate-400">{count}</span>
          </div>
        );
      })}
    </div>
  );
}

function ReviewCard({ review }: { review: Review }) {
  const reviewerName = review.reviewer?.username || 'Anonymous';
  const reviewerAvatar = review.reviewer?.avatar_url;
  const date = new Date(review.created_at).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });

  return (
    <div className="p-4 bg-white rounded-lg border border-surface-200">
      <div className="flex items-start gap-3">
        {/* Avatar */}
        {reviewerAvatar ? (
          <img
            src={reviewerAvatar}
            alt={reviewerName}
            className="w-10 h-10 rounded-full object-cover"
          />
        ) : (
          <div className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center text-slate-500 font-medium">
            {reviewerName[0]?.toUpperCase() || '?'}
          </div>
        )}

        <div className="flex-1">
          {/* Header */}
          <div className="flex items-center justify-between mb-1">
            <div className="flex items-center gap-2">
              {review.reviewer?.username ? (
                <Link
                  href={`/users/${review.reviewer.username}`}
                  className="font-medium text-slate-800 hover:text-field-600"
                >
                  {reviewerName}
                </Link>
              ) : (
                <span className="font-medium text-slate-800">{reviewerName}</span>
              )}
              <span className={`text-xs px-1.5 py-0.5 rounded ${
                review.role === 'requester'
                  ? 'bg-blue-50 text-blue-600'
                  : 'bg-green-50 text-green-600'
              }`}>
                {review.role === 'requester' ? 'Task Poster' : 'Worker'}
              </span>
            </div>
            <span className="text-xs text-slate-400">{date}</span>
          </div>

          {/* Rating */}
          <div className="mb-2">
            <StarRating rating={review.rating} />
          </div>

          {/* Comment */}
          {review.comment && (
            <p className="text-sm text-slate-600 leading-relaxed">{review.comment}</p>
          )}
        </div>
      </div>
    </div>
  );
}

export default function ReviewList({
  reviews,
  summary,
  onLoadMore,
  hasMore = false,
  isLoading = false,
  showSummary = true,
  className = '',
}: ReviewListProps) {
  if (reviews.length === 0 && !summary) {
    return (
      <div className={`rounded-lg border border-dashed border-surface-300 p-6 text-center ${className}`}>
        <div className="w-12 h-12 mx-auto mb-3 rounded-full bg-slate-100 flex items-center justify-center">
          <svg className="w-6 h-6 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
          </svg>
        </div>
        <p className="text-sm text-slate-500">No reviews yet</p>
        <p className="text-xs text-slate-400 mt-1">Reviews will appear after completed tasks</p>
      </div>
    );
  }

  return (
    <div className={className}>
      {/* Summary */}
      {showSummary && summary && summary.total_reviews > 0 && (
        <div className="mb-6 p-4 bg-slate-50 rounded-lg">
          <div className="flex items-start gap-6">
            {/* Average Rating */}
            <div className="text-center">
              <div className="text-4xl font-bold text-slate-800">
                {summary.average_rating?.toFixed(1) || '-'}
              </div>
              <StarRating rating={summary.average_rating || 0} size="md" />
              <p className="text-xs text-slate-500 mt-1">
                {summary.total_reviews} {summary.total_reviews === 1 ? 'review' : 'reviews'}
              </p>
            </div>

            {/* Breakdown */}
            <div className="flex-1">
              <RatingBreakdown
                breakdown={summary.rating_breakdown}
                total={summary.total_reviews}
              />
            </div>
          </div>
        </div>
      )}

      {/* Reviews List */}
      <div className="space-y-3">
        {reviews.map((review) => (
          <ReviewCard key={review.id} review={review} />
        ))}
      </div>

      {/* Load More */}
      {hasMore && (
        <div className="mt-4 text-center">
          <button
            onClick={onLoadMore}
            disabled={isLoading}
            className="px-4 py-2 text-sm text-field-600 hover:text-field-700 disabled:opacity-50"
          >
            {isLoading ? 'Loading...' : 'Load more reviews'}
          </button>
        </div>
      )}
    </div>
  );
}
