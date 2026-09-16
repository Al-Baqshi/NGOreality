import { useRef, useState } from 'react';
import { ImageUp, Loader2, Trash2 } from 'lucide-react';
import { ORG_LOGO_MIME_TYPES, uploadOrgLogo } from '../../lib/orgLogo';
import { cn } from '@/lib/utils';

type LogoUploadFieldProps = {
  id: string;
  organizationId: string;
  value: string;
  onChange: (url: string) => void;
  invalid?: boolean;
  describedBy?: string;
};

/**
 * Logo picker: upload a file (stored in the org-logos bucket) or paste a link
 * to a logo that already lives on the organisation's website.
 */
export default function LogoUploadField({
  id,
  organizationId,
  value,
  onChange,
  invalid,
  describedBy,
}: LogoUploadFieldProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState('');
  const [showUrl, setShowUrl] = useState(false);
  const [previewBroken, setPreviewBroken] = useState(false);

  const handleFile = async (file: File | undefined) => {
    if (!file) return;
    setUploadError('');
    setUploading(true);
    const { url, error } = await uploadOrgLogo(organizationId, file);
    setUploading(false);
    if (inputRef.current) inputRef.current.value = '';
    if (error || !url) {
      setUploadError(error ?? 'Upload failed. Try again.');
      return;
    }
    setPreviewBroken(false);
    onChange(url);
  };

  return (
    <div className="space-y-2">
      <div
        className={cn(
          'flex flex-col gap-3 border-2 border-dashed p-3 sm:flex-row sm:items-center',
          invalid ? 'border-accent bg-accent-light/30' : 'border-ink-300 dark:border-border',
        )}
      >
        <div className="flex size-20 shrink-0 items-center justify-center border-2 border-ink-200 bg-white dark:border-border">
          {value && !previewBroken ? (
            <img
              src={value}
              alt="Organisation logo preview"
              className="max-h-full max-w-full object-contain"
              onError={() => setPreviewBroken(true)}
            />
          ) : (
            <ImageUp size={24} className="text-ink-400" aria-hidden />
          )}
        </div>
        <div className="min-w-0 flex-1 space-y-2">
          <input
            ref={inputRef}
            id={id}
            type="file"
            accept={ORG_LOGO_MIME_TYPES.join(',')}
            className="sr-only"
            onChange={(e) => void handleFile(e.target.files?.[0])}
            aria-invalid={invalid}
            aria-describedby={describedBy}
          />
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className="btn-brutal-outline inline-flex min-h-[44px] items-center gap-2 px-4 text-xs"
              onClick={() => inputRef.current?.click()}
              disabled={uploading}
            >
              {uploading ? <Loader2 size={14} className="animate-spin" aria-hidden /> : <ImageUp size={14} aria-hidden />}
              {uploading ? 'Uploading…' : value ? 'Replace logo' : 'Upload logo'}
            </button>
            {value ? (
              <button
                type="button"
                className="inline-flex min-h-[44px] items-center gap-1 px-2 text-xs text-ink-500 hover:text-accent"
                onClick={() => onChange('')}
                disabled={uploading}
              >
                <Trash2 size={14} aria-hidden /> Remove
              </button>
            ) : null}
          </div>
          <p className="font-mono text-2xs text-ink-500">
            PNG, JPG or WebP · max 2 MB · square or wide logo on a plain background works best
          </p>
          {previewBroken && value ? (
            <p className="text-xs text-accent">This logo link does not load as an image.</p>
          ) : null}
        </div>
      </div>

      {uploadError ? (
        <p className="text-xs text-accent" role="alert">
          {uploadError}
        </p>
      ) : null}

      {showUrl ? (
        <input
          type="url"
          inputMode="url"
          className="input-brutal w-full text-base"
          value={value}
          onChange={(e) => {
            setPreviewBroken(false);
            onChange(e.target.value);
          }}
          placeholder="https://example.org/logo.png"
          aria-label="Logo link"
        />
      ) : (
        <button
          type="button"
          className="font-mono text-2xs uppercase tracking-wider text-ink-500 underline hover:text-ink-950"
          onClick={() => setShowUrl(true)}
        >
          Or paste a link to your logo
        </button>
      )}
    </div>
  );
}
