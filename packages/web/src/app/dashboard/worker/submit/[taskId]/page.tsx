'use client';

import { useEffect, useState, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { api } from '@/lib/api';
import { useAuthStore } from '@/lib/store';
import { useToast } from '@/components/ui';
import BearingInput from '@/components/BearingInput';

interface UploadedFile {
  id: string;
  file: File;
  preview: string;
  artefactId?: string;
  status: 'pending' | 'uploading' | 'uploaded' | 'error';
  progress: number;
  error?: string;
}

export default function SubmitTaskPage() {
  const params = useParams();
  const router = useRouter();
  const { token } = useAuthStore();
  const toast = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [task, setTask] = useState<any>(null);
  const [submission, setSubmission] = useState<any>(null);
  const [files, setFiles] = useState<UploadedFile[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');

  const [captureClaims, setCaptureClaims] = useState({
    declared_captured_at: new Date().toISOString(),
    declared_bearing: 0,
  });

  // Revoke all object URLs on unmount to prevent memory leaks
  useEffect(() => {
    return () => {
      files.forEach(f => {
        if (f.preview) URL.revokeObjectURL(f.preview);
      });
    };
  }, [files]);

  useEffect(() => {
    fetchTask();
  }, [token, params.taskId]);

  const fetchTask = async () => {
    try {
      api.setToken(token);
      const data = await api.getTask(params.taskId as string);
      setTask(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load task');
    } finally {
      setIsLoading(false);
    }
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = Array.from(e.target.files || []);
    const newFiles: UploadedFile[] = selectedFiles.map(file => ({
      id: Math.random().toString(36).substr(2, 9),
      file,
      preview: URL.createObjectURL(file),
      status: 'pending',
      progress: 0,
    }));
    setFiles(prev => [...prev, ...newFiles]);
  };

  const removeFile = (id: string) => {
    setFiles(prev => {
      const file = prev.find(f => f.id === id);
      if (file) {
        URL.revokeObjectURL(file.preview);
      }
      return prev.filter(f => f.id !== id);
    });
  };

  const handleSubmit = async () => {
    if (files.length === 0) {
      setError('Please upload at least one photo');
      return;
    }

    const requiredCount = task?.requirements?.photos?.count || 1;
    if (files.length < requiredCount) {
      setError(`Please upload at least ${requiredCount} photos`);
      return;
    }

    setIsSubmitting(true);
    setError('');

    try {
      api.setToken(token);

      // Reuse existing submission if a previous attempt got partway through
      let subResult = submission;
      if (!subResult) {
        subResult = await api.createSubmission(params.taskId as string);
        setSubmission(subResult);
      }

      // Only upload files that haven't already been uploaded successfully
      const toUpload = files.filter(f => f.status !== 'uploaded');
      let uploadFailed = false;

      for (const uploadFile of toUpload) {
        setFiles(prev =>
          prev.map(f =>
            f.id === uploadFile.id ? { ...f, status: 'uploading', progress: 0, error: undefined } : f
          )
        );

        try {
          const initResult = await api.initArtefactUpload(subResult.submission_id, {
            type: 'photo',
            filename: uploadFile.file.name,
            content_type: uploadFile.file.type,
            size_bytes: uploadFile.file.size,
          });

          await api.uploadArtefact(
            initResult.upload_url,
            uploadFile.file,
            {},
            (percent) => {
              setFiles(prev =>
                prev.map(f =>
                  f.id === uploadFile.id ? { ...f, progress: percent } : f
                )
              );
            }
          );

          setFiles(prev =>
            prev.map(f =>
              f.id === uploadFile.id
                ? { ...f, status: 'uploaded', progress: 100, artefactId: initResult.artefact_id }
                : f
            )
          );
        } catch (err) {
          uploadFailed = true;
          setFiles(prev =>
            prev.map(f =>
              f.id === uploadFile.id
                ? { ...f, status: 'error', error: err instanceof Error ? err.message : 'Upload failed' }
                : f
            )
          );
        }
      }

      if (uploadFailed) {
        const msg = 'One or more files failed to upload. Click Submit again to retry the failed uploads.';
        setError(msg);
        toast.error('Upload failed', msg);
        setIsSubmitting(false);
        return;
      }

      // Finalise submission
      await api.finaliseSubmission(subResult.submission_id, captureClaims);

      // Revoke all preview URLs before navigating away
      files.forEach(f => {
        if (f.preview) URL.revokeObjectURL(f.preview);
      });

      toast.success('Submission sent!', 'Awaiting verification');
      // Success - redirect
      router.push('/dashboard/worker/claims');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to submit';
      setError(message);
      toast.error('Upload failed', message);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-field-500"></div>
      </div>
    );
  }

  if (!task) {
    return (
      <div className="text-center py-12">
        <p className="text-ink-500">{error || 'Task not found'}</p>
        <Link href="/dashboard/worker/claims" className="text-field-500 hover:text-field-600 mt-4 inline-block">
          Back to claims
        </Link>
      </div>
    );
  }

  const requiredCount = task.requirements?.photos?.count || 1;

  return (
    <div className="max-w-3xl mx-auto">
      <div className="mb-8">
        <Link href="/dashboard/worker/claims" className="text-sm text-ink-500 hover:text-ink-700 mb-2 inline-block">
          &larr; Back to claims
        </Link>
        <h1 className="text-2xl font-bold text-ink-900 tracking-tight">Submit: {task.title}</h1>
      </div>

      {error && (
        <div className="mb-6 p-4 border border-signal-red/30 rounded-sm">
          <p className="text-sm text-signal-red">{error}</p>
        </div>
      )}

      {/* Task Summary */}
      <div className="bg-signal-blue/10 border border-signal-blue/30 rounded-sm p-4 mb-6">
        <h2 className="font-medium text-ink-900 mb-2">Requirements</h2>
        <ul className="text-sm text-ink-700 space-y-1">
          <li>Upload {requiredCount} photo(s)</li>
          <li>Minimum resolution: {task.requirements?.photos?.min_width_px}x{task.requirements?.photos?.min_height_px}</li>
          {task.requirements?.bearing?.required && (
            <li>Camera direction: {task.requirements.bearing.target_deg}&deg; (&plusmn;{task.requirements.bearing.tolerance_deg}&deg;)</li>
          )}
          <li>Location: within {task.location?.radius_m}m of target</li>
        </ul>
      </div>

      {/* Instructions */}
      <div className="bg-paper rounded-sm border border-ink-200 p-6 mb-6">
        <h2 className="font-medium text-ink-900 mb-2">Instructions</h2>
        <p className="text-ink-700 whitespace-pre-wrap">{task.instructions}</p>
      </div>

      {/* File Upload */}
      <div className="bg-paper rounded-sm border border-ink-200 p-6 mb-6">
        <h2 className="font-medium text-ink-900 mb-4">Upload Photos</h2>

        <input
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/png"
          multiple
          onChange={handleFileSelect}
          className="hidden"
        />

        <div
          onClick={() => fileInputRef.current?.click()}
          className="border-2 border-dashed border-ink-200 rounded-sm p-8 text-center cursor-pointer hover:border-field-400 transition-colors"
        >
          <svg className="mx-auto h-12 w-12 text-ink-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
          </svg>
          <p className="mt-2 text-sm text-ink-700">Click to select photos</p>
          <p className="text-xs text-ink-300 mt-1">JPEG or PNG, max 10MB each</p>
        </div>

        {/* Uploaded Files Preview */}
        {files.length > 0 && (
          <div className="mt-4 grid grid-cols-2 sm:grid-cols-3 gap-4">
            {files.map((file) => (
              <div key={file.id} className="relative group">
                <img
                  src={file.preview}
                  alt={file.file.name}
                  className="w-full h-32 object-cover rounded-sm"
                />
                <div className="absolute inset-0 bg-black bg-opacity-40 rounded-sm flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      removeFile(file.id);
                    }}
                    className="p-2 bg-signal-red text-white rounded-sm"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
                {file.status === 'uploading' && (
                  <div className="absolute inset-0 bg-white bg-opacity-75 rounded-sm flex flex-col items-center justify-center">
                    <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-field-500"></div>
                    <div className="mt-2 text-xs font-mono text-ink-700">Uploading {file.progress}%</div>
                  </div>
                )}
                {file.status === 'error' && file.error && (
                  <div className="absolute bottom-0 left-0 right-0 bg-signal-red/90 text-white text-xs px-1 py-0.5 truncate" title={file.error}>
                    {file.error}
                  </div>
                )}
                {file.status === 'uploaded' && (
                  <div className="absolute top-2 right-2 bg-signal-green text-white rounded-sm p-1">
                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                    </svg>
                  </div>
                )}
                {file.status === 'error' && (
                  <div className="absolute top-2 right-2 bg-signal-red text-white rounded-sm p-1">
                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        <p className="mt-4 text-sm text-ink-500">
          {files.length} of {requiredCount} required photos uploaded
        </p>
      </div>

      {/* Capture Claims */}
      {task.requirements?.bearing?.required && (
        <div className="bg-paper rounded-sm border border-ink-200 p-6 mb-6">
          <h2 className="font-medium text-ink-900 mb-4">Capture Details</h2>
          <div className="flex flex-col items-center sm:items-start">
            <BearingInput
              label="Camera Bearing"
              value={captureClaims.declared_bearing}
              onChange={(deg) => setCaptureClaims(prev => ({ ...prev, declared_bearing: deg }))}
              tolerance={task.requirements.bearing.tolerance_deg}
              targetBearing={task.requirements.bearing.target_deg}
              size={180}
            />
            <p className="mt-3 text-xs text-ink-500 text-center sm:text-left">
              Target: {task.requirements.bearing.target_deg}&deg; (&plusmn;{task.requirements.bearing.tolerance_deg}&deg;). Aim your camera within the highlighted cone.
            </p>
          </div>
        </div>
      )}

      {/* Safety Notes */}
      {task.policy?.safety_notes && (
        <div className="bg-signal-amber/10 border border-signal-amber/30 rounded-sm p-4 mb-6">
          <h3 className="text-sm font-medium text-ink-900 mb-2">Safety Reminder</h3>
          <p className="text-sm text-ink-700">{task.policy.safety_notes}</p>
        </div>
      )}

      {/* Submit Button */}
      <div className="flex justify-end space-x-3">
        <Link
          href="/dashboard/worker/claims"
          className="px-4 py-2 border border-ink-200 text-ink-700 rounded-sm hover:bg-ink-50"
        >
          Cancel
        </Link>
        <button
          onClick={handleSubmit}
          disabled={isSubmitting || files.length < requiredCount}
          className="px-6 py-2 bg-field-500 text-white rounded-sm hover:bg-field-600 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isSubmitting ? 'Submitting...' : 'Submit for Review'}
        </button>
      </div>
    </div>
  );
}
