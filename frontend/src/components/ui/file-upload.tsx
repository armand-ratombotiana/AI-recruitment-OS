'use client';

import { useState, useRef, useCallback, DragEvent, ChangeEvent } from 'react';
import { Upload, X, File as FileIcon, AlertCircle, CheckCircle2 } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface UploadedFile {
  id: string;
  file: File;
  progress: number;
  status: 'pending' | 'uploading' | 'success' | 'error';
  error?: string;
  previewUrl?: string;
}

interface FileUploadProps {
  accept?: string;
  multiple?: boolean;
  maxSize?: number;
  maxFiles?: number;
  onFilesSelected?: (files: File[]) => void;
  onUpload?: (file: File, onProgress: (p: number) => void) => Promise<void>;
  onRemove?: (file: File) => void;
  value?: UploadedFile[];
  disabled?: boolean;
  className?: string;
  label?: string;
  description?: string;
}

function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function getId() {
  return `f-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

export function FileUpload({
  accept,
  multiple = false,
  maxSize = 10 * 1024 * 1024,
  maxFiles = 5,
  onFilesSelected,
  onUpload,
  onRemove,
  value: controlled,
  disabled = false,
  className,
  label = 'Upload files',
  description = 'Drag and drop or click to browse',
}: FileUploadProps) {
  const [internal, setInternal] = useState<UploadedFile[]>([]);
  const [dragActive, setDragActive] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const isControlled = controlled !== undefined;
  const files = isControlled ? controlled : internal;
  const updateFiles = (updater: UploadedFile[] | ((prev: UploadedFile[]) => UploadedFile[])) => {
    if (isControlled) return;
    setInternal((prev) => (typeof updater === 'function' ? updater(prev) : updater));
  };

  const validate = (incoming: FileList | File[]): File[] => {
    const arr = Array.from(incoming);
    if (!multiple && arr.length > 1) {
      setError('Only one file allowed');
      return [];
    }
    if (multiple && files.length + arr.length > maxFiles) {
      setError(`Maximum ${maxFiles} files`);
      return [];
    }
    const valid: File[] = [];
    for (const f of arr) {
      if (f.size > maxSize) {
        setError(`"${f.name}" exceeds ${formatSize(maxSize)}`);
        continue;
      }
      if (accept) {
        const patterns = accept.split(',').map((p) => p.trim());
        const ok = patterns.some((p) => {
          if (p.startsWith('.')) return f.name.toLowerCase().endsWith(p.toLowerCase());
          if (p.endsWith('/*')) return f.type.startsWith(p.replace('/*', '/'));
          return f.type === p;
        });
        if (!ok) {
          setError(`"${f.name}" type not allowed`);
          continue;
        }
      }
      valid.push(f);
    }
    if (valid.length > 0) setError(null);
    return valid;
  };

  const handleFiles = useCallback(
    (incoming: FileList | File[]) => {
      const valid = validate(incoming);
      if (valid.length === 0) return;
      const newUploads: UploadedFile[] = valid.map((f) => ({
        id: getId(),
        file: f,
        progress: 0,
        status: onUpload ? 'uploading' : 'pending',
        previewUrl: f.type.startsWith('image/') ? URL.createObjectURL(f) : undefined,
      }));
      updateFiles([...files, ...newUploads]);
      onFilesSelected?.(valid);
      if (onUpload) {
        newUploads.forEach((u) => {
          onUpload(u.file, (p) => {
            updateFiles((prev) =>
              prev.map((f2) =>
                f2.id === u.id ? { ...f2, progress: p, status: p >= 100 ? 'success' : 'uploading' } : f2
              )
            );
          })
            .then(() => {
              updateFiles((prev) =>
                prev.map((f2) =>
                  f2.id === u.id ? { ...f2, progress: 100, status: 'success' } : f2
                )
              );
            })
            .catch((err) => {
              updateFiles((prev) =>
                prev.map((f2) =>
                  f2.id === u.id
                    ? { ...f2, status: 'error', error: err?.message ?? 'Upload failed' }
                    : f2
                )
              );
            });
        });
      }
    },
    [files, multiple, maxFiles, maxSize, accept, onFilesSelected, onUpload, isControlled]
  );

  const handleRemove = (id: string) => {
    const target = files.find((f) => f.id === id);
    if (target?.previewUrl) URL.revokeObjectURL(target.previewUrl);
    onRemove?.(target!.file);
    updateFiles(files.filter((f) => f.id !== id));
  };

  const handleDrag = (e: DragEvent<HTMLDivElement>, active: boolean) => {
    e.preventDefault();
    e.stopPropagation();
    if (!disabled) setDragActive(active);
  };

  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (disabled) return;
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleFiles(e.dataTransfer.files);
    }
  };

  const handleChange = (e: ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) handleFiles(e.target.files);
    e.target.value = '';
  };

  return (
    <div className={cn('w-full', className)}>
      <div
        onDragEnter={(e) => handleDrag(e, true)}
        onDragOver={(e) => handleDrag(e, true)}
        onDragLeave={(e) => handleDrag(e, false)}
        onDrop={handleDrop}
        onClick={() => !disabled && inputRef.current?.click()}
        onKeyDown={(e) => {
          if (!disabled && (e.key === 'Enter' || e.key === ' ')) {
            e.preventDefault();
            inputRef.current?.click();
          }
        }}
        role="button"
        tabIndex={disabled ? -1 : 0}
        aria-disabled={disabled || undefined}
        aria-label={label}
        className={cn(
          'flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed p-6 text-center transition-colors',
          'focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500',
          disabled
            ? 'cursor-not-allowed border-gray-200 bg-gray-50 opacity-60'
            : 'cursor-pointer hover:border-blue-400 hover:bg-blue-50/30',
          dragActive ? 'border-blue-500 bg-blue-50' : 'border-gray-300',
          error && 'border-red-300 bg-red-50/30'
        )}
      >
        <Upload
          className={cn(
            'h-8 w-8',
            dragActive ? 'text-blue-500' : 'text-gray-400'
          )}
          aria-hidden="true"
        />
        <p className="text-sm font-medium text-gray-700">{label}</p>
        <p className="text-xs text-gray-500">{description}</p>
        <p className="text-xs text-gray-400">
          {accept && `Accepted: ${accept}`}
          {accept && ' · '}
          Max {formatSize(maxSize)}
          {multiple && ` · Up to ${maxFiles} files`}
        </p>
        <input
          ref={inputRef}
          type="file"
          accept={accept}
          multiple={multiple}
          onChange={handleChange}
          disabled={disabled}
          className="sr-only"
          aria-label={label}
        />
      </div>

      {error && (
        <div
          role="alert"
          className="mt-2 flex items-center gap-2 text-sm text-red-600"
        >
          <AlertCircle className="h-4 w-4" aria-hidden="true" />
          {error}
        </div>
      )}

      {files.length > 0 && (
        <ul className="mt-4 space-y-2" role="list">
          {files.map((f) => (
            <li
              key={f.id}
              className="flex items-center gap-3 rounded-lg border border-gray-200 bg-white p-3"
            >
              {f.previewUrl ? (
                <img
                  src={f.previewUrl}
                  alt=""
                  className="h-12 w-12 rounded-md object-cover"
                />
              ) : (
                <div className="flex h-12 w-12 items-center justify-center rounded-md bg-gray-100">
                  <FileIcon className="h-5 w-5 text-gray-500" aria-hidden="true" />
                </div>
              )}
              <div className="flex-1 min-w-0">
                <p className="truncate text-sm font-medium text-gray-900">
                  {f.file.name}
                </p>
                <p className="text-xs text-gray-500">
                  {formatSize(f.file.size)}
                  {f.status === 'uploading' && ` · ${f.progress}%`}
                  {f.status === 'success' && ' · Uploaded'}
                  {f.status === 'error' && ` · ${f.error}`}
                </p>
                {f.status === 'uploading' && (
                  <div
                    className="mt-1 h-1 w-full overflow-hidden rounded-full bg-gray-200"
                    role="progressbar"
                    aria-valuenow={f.progress}
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-label={`Uploading ${f.file.name}`}
                  >
                    <div
                      className="h-full bg-blue-600 transition-all"
                      style={{ width: `${f.progress}%` }}
                    />
                  </div>
                )}
              </div>
              <div className="flex items-center gap-1">
                {f.status === 'success' && (
                  <CheckCircle2
                    className="h-5 w-5 text-green-500"
                    aria-label="Upload complete"
                  />
                )}
                {f.status === 'error' && (
                  <AlertCircle
                    className="h-5 w-5 text-red-500"
                    aria-label="Upload failed"
                  />
                )}
                <button
                  type="button"
                  onClick={() => handleRemove(f.id)}
                  aria-label={`Remove ${f.file.name}`}
                  className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                >
                  <X className="h-4 w-4" aria-hidden="true" />
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
