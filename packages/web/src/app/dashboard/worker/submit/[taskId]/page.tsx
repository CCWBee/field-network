'use client';

import { useEffect, useState, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { api } from '@/lib/api';
import { useAuthStore } from '@/lib/store';

interface UploadedFile {
  id: string;
  file: File;
  preview: string;
  artefactId?: string;
  status: 'pending' | 'uploading' | 'uploaded' | 'error';
  error?: string;
}

export default function SubmitTaskPage() {
  const params = useParams();
  const router = useRouter();
  const { token } = useAuthStore();
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

      // Create submission
      const subResult = await api.createSubmission(params.taskId as string);
      setSubmission(subResult);

      // Upload each file
      for (const uploadFile of files) {
        setFiles(prev =>
          prev.map(f =>
            f.id === uploadFile.id ? { ...f, status: 'uploading' } : f
          )
        );

        try {
          // Init upload
          const initResult = await api.initArtefactUpload(subResult.submission_id, {
            type: 'photo',
            filename: uploadFile.file.name,
            content_type: uploadFile.file.type,
            size_bytes: uploadFile.file.size,
          });

          // In a real app, we'd upload to the signed URL here
          // For now, we mark as uploaded
          setFiles(prev =>
            prev.map(f =>
              f.id === uploadFile.id
                ? { ...f, status: 'uploaded', artefactId: initResult.artefact_id }
                : f
            )
          );
        } catch (err) {
          setFiles(prev =>
            prev.map(f =>
              f.id === uploadFile.id
                ? { ...f, status: 'error', error: err instanceof Error ? err.message : 'Upload failed' }
                : f
            )
          );
        }
      }

      // Finalise submission
      await api.finaliseSubmission(subResult.submission_id, captureClaims);

      // Success - redirect
      router.push('/dashboard/worker/claims');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to submit');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-field-600"></div>
      </div>
    );
  }

  if (!task) {
    return (
      <div className="text-center py-12">
        <p className="text-slate-500">{error || 'Task not found'}</p>
        <Link href="/dashboard/worker/claims" className="text-field-600 hover:text-field-500 mt-4 inline-block">
          Back to claims
        </Link>
      </div>
    );
  }

  const requiredCount = task.requirements?.photos?.count || 1;

  return (
    <div className="max-w-3xl mx-auto">
      <div className="mb-8">
        <Link href="/dashboard/worker/claims" className="text-sm text-slate-500 hover:text-slate-700 mb-2 inline-block">
          &larr; Back to claims
        </Link>
        <h1 className="text-2xl font-bold text-slate-900">Submit: {task.title}</h1>
      </div>

      {error && (
        <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-md">
          <p className="text-sm text-red-600">{error}</p>
        </div>
      )}

      {/* Task Summary */}
      <div className="bg-blue-50 rounded-lg p-4 mb-6">
        <h2 className="font-medium text-blue-900 mb-2">Requirements</h2>
        <ul className="text-sm text-blue-800 space-y-1">
          <li>Upload {requiredCount} photo(s)</li>
          <li>Minimum resolution: {task.requirements?.photos?.min_width_px}x{task.requirements?.photos?.min_height_px}</li>
          {task.requirements?.bearing?.required && (
            <li>Camera direction: {task.requirements.bearing.target_deg}&deg; (&plusmn;{task.requirements.bearing.tolerance_deg}&deg;)</li>
          )}
          <li>Location: within {task.location?.radius_m}m of target</li>
        </ul>
      </div>

      {/* Instructions */}
      <div className="glass rounded-lg border border-surface-200 p-6 mb-6">
        <h2 className="font-medium text-slate-900 mb-2">Instructions</h2>
        <p className="text-slate-600 whitespace-pre-wrap">{task.instructions}</p>
      </div>

      {/* File Upload */}
      <div className="glass rounded-lg border border-surface-200 p-6 mb-6">
        <h2 className="font-medium text-slate-900 mb-4">Upload Photos</h2>

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
          className="border-2 border-dashed border-surface-300 rounded-lg p-8 text-center cursor-pointer hover:border-field-400 transition-colors"
        >
          <svg className="mx-auto h-12 w-12 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
          </svg>
          <p className="mt-2 text-sm text-slate-600">Click to select photos</p>
          <p className="text-xs text-slate-400 mt-1">JPEG or PNG, max 10MB each</p>
        </div>

        {/* Uploaded Files Preview */}
        {files.length > 0 && (
          <div className="mt-4 grid grid-cols-3 gap-4">
            {files.map((file) => (
              <div key={file.id} className="relative group">
                <img
                  src={file.preview}
                  alt={file.file.name}
                  className="w-full h-32 object-cover rounded-lg"
                />
                <div className="absolute inset-0 bg-black bg-opacity-40 rounded-lg flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      removeFile(file.id);
                    }}
                    className="p-2 bg-red-600 text-white rounded-full"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
                {file.status === 'uploading' && (
                  <div className="absolute inset-0 bg-white bg-opacity-75 rounded-lg flex items-center justify-center">
                    <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-field-600"></div>
                  </div>
                )}
                {file.status === 'uploaded' && (
                  <div className="absolute top-2 right-2 bg-green-500 text-white rounded-full p-1">
                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                    </svg>
                  </div>
                )}
                {file.status === 'error' && (
                  <div className="absolute top-2 right-2 bg-red-500 text-white rounded-full p-1">
                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        <p className="mt-4 text-sm text-slate-500">
          {files.length} of {requiredCount} required photos uploaded
        </p>
      </div>

      {/* Capture Claims */}
      {task.requirements?.bearing?.required && (
        <div className="glass rounded-lg border border-surface-200 p-6 mb-6">
          <h2 className="font-medium text-slate-900 mb-4">Capture Details</h2>
          <div>
            <label className="block text-sm font-medium text-slate-700">Camera Bearing (degrees)</label>
            <input
              type="number"
              min="0"
              max="360"
              value={captureClaims.declared_bearing}
              onChange={(e) => setCaptureClaims(prev => ({ ...prev, declared_bearing: parseInt(e.target.value) }))}
              className="mt-1 block w-full px-3 py-2 border border-surface-300 rounded-md shadow-sm"
            />
            <p className="mt-1 text-xs text-slate-500">
              Target: {task.requirements.bearing.target_deg}&deg; (&plusmn;{task.requirements.bearing.tolerance_deg}&deg;)
            </p>
          </div>
        </div>
      )}

      {/* Safety Notes */}
      {task.policy?.safety_notes && (
        <div className="bg-yellow-50 rounded-lg p-4 mb-6">
          <h3 className="text-sm font-medium text-yellow-800 mb-2">Safety Reminder</h3>
          <p className="text-sm text-yellow-700">{task.policy.safety_notes}</p>
        </div>
      )}

      {/* Submit Button */}
      <div className="flex justify-end space-x-3">
        <Link
          href="/dashboard/worker/claims"
          className="px-4 py-2 border border-surface-300 text-slate-700 rounded-md hover:bg-slate-50"
        >
          Cancel
        </Link>
        <button
          onClick={handleSubmit}
          disabled={isSubmitting || files.length < requiredCount}
          className="px-6 py-2 bg-field-500 text-white rounded-md hover:bg-field-600 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isSubmitting ? 'Submitting...' : 'Submit for Review'}
        </button>
      </div>
    </div>
  );
}
