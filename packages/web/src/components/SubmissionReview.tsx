'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { Modal } from '@/components/ui';

interface SubmissionReviewProps {
  submissionId: string;
  // Inline data already loaded from the task fetch (artefacts list etc.)
  inlineArtefacts?: Array<{
    id: string;
    type: string;
    storage_key?: string;
    sha256?: string;
    dimensions?: { width: number; height: number };
    size_bytes?: number;
    gps_lat?: number;
    gps_lon?: number;
  }>;
}

interface FullSubmission {
  id: string;
  status: string;
  proof_bundle_hash?: string | null;
  verification_score?: number | null;
  verification_details?: Array<{
    name: string;
    status: 'passed' | 'failed' | 'warning' | string;
    description?: string;
    detail?: string;
  }>;
  flags?: string[];
  artefacts?: Array<{
    id: string;
    type: string;
    sha256?: string;
    dimensions?: { width: number; height: number };
    captured_at?: string;
  }>;
  finalised_at?: string | null;
  [key: string]: unknown;
}

interface ArtefactThumb {
  id: string;
  url?: string;
  loading: boolean;
  error?: string;
  type: string;
  size_bytes?: number;
  dimensions?: { width: number; height: number };
  hasGps?: boolean;
}

function formatBytes(bytes?: number): string {
  if (!bytes) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function CopyButton({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={() => {
        navigator.clipboard.writeText(value);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      }}
      className="text-xs text-field-500 hover:text-field-600 ml-2"
    >
      {copied ? 'copied' : 'copy'}
    </button>
  );
}

export default function SubmissionReview({ submissionId, inlineArtefacts }: SubmissionReviewProps) {
  const [submission, setSubmission] = useState<FullSubmission | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [thumbs, setThumbs] = useState<Record<string, ArtefactThumb>>({});
  const [modalUrl, setModalUrl] = useState<string | null>(null);
  const [showProofJson, setShowProofJson] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await api.getSubmission(submissionId);
        if (cancelled) return;
        setSubmission(data as unknown as FullSubmission);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load submission');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [submissionId]);

  // Lazy fetch download URLs once we know the artefacts
  useEffect(() => {
    const list = submission?.artefacts || inlineArtefacts || [];
    if (!list.length) return;

    list.forEach((a: any) => {
      setThumbs((prev) => {
        if (prev[a.id]) return prev;
        return {
          ...prev,
          [a.id]: {
            id: a.id,
            loading: true,
            type: a.type || 'photo',
            size_bytes: a.size_bytes,
            dimensions: a.dimensions,
            hasGps: !!(a.gps_lat || a.location?.lat),
          },
        };
      });

      api
        .getArtefactDownloadUrl(a.id)
        .then((res) => {
          setThumbs((prev) => ({
            ...prev,
            [a.id]: { ...prev[a.id], id: a.id, url: res.url, loading: false },
          }));
        })
        .catch((err) => {
          setThumbs((prev) => ({
            ...prev,
            [a.id]: {
              ...prev[a.id],
              id: a.id,
              loading: false,
              error: err instanceof Error ? err.message : 'Failed to load',
            },
          }));
        });
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [submission?.artefacts]);

  if (loading) {
    return (
      <div className="py-4 text-sm text-ink-500">Loading submission details...</div>
    );
  }

  if (error || !submission) {
    return (
      <div className="py-4 text-sm text-signal-red">{error || 'Failed to load'}</div>
    );
  }

  const artefacts = submission.artefacts || [];
  const checks = submission.verification_details || [];
  const flags = submission.flags || [];

  let proofBundle: any = null;
  const rawProof = (submission as any).proof_bundle;
  if (rawProof) {
    try {
      proofBundle = typeof rawProof === 'string' ? JSON.parse(rawProof) : rawProof;
    } catch {}
  }

  return (
    <div className="mt-4 pt-4 border-t border-ink-100 space-y-5">
      {/* Artefact Gallery */}
      <div>
        <h3 className="text-xs uppercase tracking-wider text-ink-500 mb-2">
          Artefacts ({artefacts.length})
        </h3>
        {artefacts.length === 0 ? (
          <p className="text-sm text-ink-500">No artefacts uploaded.</p>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            {artefacts.map((a: any) => {
              const thumb = thumbs[a.id];
              const isImage = (a.type || 'photo') === 'photo';
              return (
                <button
                  key={a.id}
                  type="button"
                  onClick={() => thumb?.url && setModalUrl(thumb.url)}
                  className="group relative aspect-square rounded-sm overflow-hidden border border-ink-200 bg-ink-50 hover:border-field-500 transition-colors text-left"
                >
                  {thumb?.loading && (
                    <div className="absolute inset-0 animate-pulse bg-ink-100" />
                  )}
                  {thumb?.url && isImage && (
                    <img
                      src={thumb.url}
                      alt={`Artefact ${a.id}`}
                      className="w-full h-full object-cover"
                      loading="lazy"
                    />
                  )}
                  {(!isImage || thumb?.error) && (
                    <div className="absolute inset-0 flex items-center justify-center text-ink-400 text-xs p-2 text-center">
                      {thumb?.error ? 'Preview unavailable' : a.type}
                    </div>
                  )}
                  <div className="absolute inset-x-0 bottom-0 p-1.5 bg-gradient-to-t from-black/70 to-transparent text-white text-[10px] font-mono tabular-nums opacity-0 group-hover:opacity-100 transition-opacity">
                    {a.dimensions?.width && a.dimensions?.height && (
                      <div>{a.dimensions.width}x{a.dimensions.height}</div>
                    )}
                    {thumb?.size_bytes && <div>{formatBytes(thumb.size_bytes)}</div>}
                  </div>
                  {(a.gps_lat || thumb?.hasGps) && (
                    <span className="absolute top-1 right-1 px-1 py-0.5 text-[9px] rounded-sm bg-field-500/90 text-white">
                      GPS
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Verification Breakdown */}
      <div>
        <h3 className="text-xs uppercase tracking-wider text-ink-500 mb-2">
          Verification ({submission.verification_score ?? 0}%)
        </h3>
        {checks.length === 0 ? (
          <p className="text-sm text-ink-500">No verification details available.</p>
        ) : (
          <ul className="space-y-1.5 text-sm">
            {checks.map((c, i) => {
              const passed = c.status === 'passed';
              const failed = c.status === 'failed';
              const colour = passed
                ? 'text-signal-green'
                : failed
                ? 'text-signal-red'
                : 'text-signal-amber';
              const symbol = passed ? '✓' : failed ? '✗' : '!';
              return (
                <li key={i} className="flex items-start gap-2">
                  <span className={`font-mono ${colour}`}>{symbol}</span>
                  <span className="flex-1">
                    <span className="text-ink-900 font-medium">{c.name}</span>
                    {(c.detail || c.description) && (
                      <span className="text-ink-500"> — {c.detail || c.description}</span>
                    )}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
        {flags.length > 0 && (
          <div className="mt-2 text-xs text-signal-amber">
            Flags: {flags.join(', ')}
          </div>
        )}
      </div>

      {/* Proof Bundle */}
      {submission.proof_bundle_hash && (
        <div>
          <h3 className="text-xs uppercase tracking-wider text-ink-500 mb-2">Proof Bundle</h3>
          <div className="text-xs text-ink-700 font-mono break-all">
            sha256: {submission.proof_bundle_hash.substring(0, 16)}...
            <CopyButton value={submission.proof_bundle_hash} />
          </div>
          {submission.finalised_at && (
            <div className="text-xs text-ink-500 mt-1">
              Finalised: {new Date(submission.finalised_at).toLocaleString()}
            </div>
          )}
          {proofBundle && (
            <button
              type="button"
              onClick={() => setShowProofJson((s) => !s)}
              className="text-xs text-field-500 hover:text-field-600 mt-1"
            >
              {showProofJson ? 'Hide' : 'Show'} full bundle
            </button>
          )}
          {showProofJson && proofBundle && (
            <pre className="mt-2 p-3 bg-ink-50 rounded-sm text-[10px] text-ink-700 overflow-auto max-h-60">
              {JSON.stringify(proofBundle, null, 2)}
            </pre>
          )}
        </div>
      )}

      {/* Image Modal */}
      <Modal
        isOpen={!!modalUrl}
        onClose={() => setModalUrl(null)}
        size="full"
        title="Artefact preview"
      >
        {modalUrl && (
          <img
            src={modalUrl}
            alt="Artefact full view"
            className="w-full h-auto max-h-[80vh] object-contain"
          />
        )}
      </Modal>
    </div>
  );
}
