'use client';

interface Evidence {
  id: string;
  dispute_id?: string;
  submitted_by: string;
  submitter: {
    id: string;
    email: string;
    username: string | null;
  };
  party: 'worker' | 'requester';
  type: 'text' | 'image' | 'document';
  description: string;
  storage_key: string | null;
  mime_type: string | null;
  size_bytes: number | null;
  download_url: string | null;
  created_at: string;
}

interface EvidenceTimelineProps {
  evidence: Evidence[];
  evidenceDeadline?: string | null;
  evidenceDeadlinePassed?: boolean;
  evidenceCount?: {
    total: number;
    worker: number;
    requester: number;
  };
  onViewImage?: (evidence: Evidence) => void;
  apiUrl?: string;
}

export function EvidenceTimeline({
  evidence,
  evidenceDeadline,
  evidenceDeadlinePassed,
  evidenceCount,
  onViewImage,
  apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000',
}: EvidenceTimelineProps) {
  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-GB', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const formatFileSize = (bytes: number | null) => {
    if (!bytes) return 'Unknown';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const getEvidenceIcon = (type: string) => {
    switch (type) {
      case 'image':
        return (
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
          </svg>
        );
      case 'document':
        return (
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
        );
      default:
        return (
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 8h10M7 12h4m1 8l-4-4H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-3l-4 4z" />
          </svg>
        );
    }
  };

  if (!evidence || evidence.length === 0) {
    return (
      <div className="glass rounded-lg border border-surface-200 p-6">
        <h2 className="text-lg font-semibold text-slate-800 mb-4">Evidence</h2>
        <div className="text-center py-8 text-slate-500">
          <svg className="w-12 h-12 mx-auto mb-3 text-slate-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
          <p>No evidence has been submitted yet</p>
          {evidenceDeadline && !evidenceDeadlinePassed && (
            <p className="text-sm mt-2">
              Deadline: {formatDate(evidenceDeadline)}
            </p>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="glass rounded-lg border border-surface-200 p-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-slate-800">Evidence Timeline</h2>
        {evidenceCount && (
          <div className="flex items-center gap-4 text-sm">
            <span className="text-slate-500">
              Worker: <span className="font-medium text-green-600">{evidenceCount.worker}</span>
            </span>
            <span className="text-slate-500">
              Requester: <span className="font-medium text-blue-600">{evidenceCount.requester}</span>
            </span>
          </div>
        )}
      </div>

      {/* Evidence deadline notice */}
      {evidenceDeadline && (
        <div className={`mb-4 p-3 rounded-lg border ${
          evidenceDeadlinePassed
            ? 'bg-red-50 border-red-200'
            : 'bg-blue-50 border-blue-200'
        }`}>
          <p className={`text-sm ${evidenceDeadlinePassed ? 'text-red-700' : 'text-blue-700'}`}>
            {evidenceDeadlinePassed
              ? 'Evidence submission deadline has passed'
              : `Evidence deadline: ${formatDate(evidenceDeadline)}`}
          </p>
        </div>
      )}

      {/* Evidence items */}
      <div className="space-y-4">
        {evidence.map((item, index) => (
          <div
            key={item.id}
            className={`relative pl-8 pb-4 ${
              index !== evidence.length - 1 ? 'border-l-2 border-slate-200 ml-2' : 'ml-2'
            }`}
          >
            {/* Timeline dot */}
            <div className={`absolute left-0 -translate-x-1/2 w-4 h-4 rounded-full border-2 ${
              item.party === 'worker'
                ? 'bg-green-100 border-green-500'
                : 'bg-blue-100 border-blue-500'
            }`}></div>

            <div className={`p-4 rounded-lg border ${
              item.party === 'worker'
                ? 'bg-green-50 border-green-200'
                : 'bg-blue-50 border-blue-200'
            }`}>
              {/* Header */}
              <div className="flex items-start justify-between mb-2">
                <div className="flex items-center gap-2">
                  <span className={`px-2 py-0.5 text-xs font-medium rounded ${
                    item.party === 'worker'
                      ? 'bg-green-200 text-green-800'
                      : 'bg-blue-200 text-blue-800'
                  }`}>
                    {item.party === 'worker' ? 'Worker' : 'Requester'}
                  </span>
                  <span className="text-sm text-slate-600">
                    {item.submitter.username || item.submitter.email}
                  </span>
                </div>
                <span className="text-xs text-slate-400">{formatDate(item.created_at)}</span>
              </div>

              {/* Description */}
              <p className="text-sm text-slate-700 whitespace-pre-wrap mb-3">{item.description}</p>

              {/* File attachment */}
              {item.type !== 'text' && item.storage_key && (
                <div className="flex items-center gap-3 p-3 bg-white/60 rounded-lg border border-slate-200">
                  <div className={`p-2 rounded ${
                    item.type === 'image' ? 'bg-purple-100 text-purple-600' : 'bg-red-100 text-red-600'
                  }`}>
                    {getEvidenceIcon(item.type)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-slate-700 truncate">
                      {item.type === 'image' ? 'Image attachment' : 'PDF document'}
                    </p>
                    <p className="text-xs text-slate-500">
                      {item.mime_type} - {formatFileSize(item.size_bytes)}
                    </p>
                  </div>
                  {item.type === 'image' && onViewImage && (
                    <button
                      onClick={() => onViewImage(item)}
                      className="px-3 py-1.5 text-xs font-medium text-slate-600 bg-white border border-slate-300 rounded hover:bg-slate-50"
                    >
                      View
                    </button>
                  )}
                  {item.download_url && (
                    <a
                      href={`${apiUrl}${item.download_url}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="px-3 py-1.5 text-xs font-medium text-white bg-field-500 rounded hover:bg-field-600"
                    >
                      Download
                    </a>
                  )}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
