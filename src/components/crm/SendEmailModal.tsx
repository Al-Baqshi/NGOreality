import { useEffect, useMemo, useState } from 'react';
import { Send, Mail, User, Loader2 } from 'lucide-react';
import type { Organization, OutreachEmailTemplate, OutreachStatus } from '../../types';
import { draftOutreachEmailForOrg, sendOutreachForColumn, sendOutreachNow } from '../../lib/crmOutreach';
import { isMonitorApiConfigured } from '../../lib/monitorApi';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription, SheetClose } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

interface Props {
  open: boolean;
  onClose: () => void;
  organizations: Organization[];
  column: string;
  columnLabel: string;
  template: OutreachEmailTemplate;
  onSent: () => void;
}

export default function SendEmailModal({
  open,
  onClose,
  organizations,
  column,
  columnLabel,
  template,
  onSent,
}: Props) {
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [showDraft, setShowDraft] = useState(true);

  const monitorApiReady = isMonitorApiConfigured();

  const withEmail = useMemo(
    () => (organizations ?? []).filter((o) => o.email?.trim()),
    [organizations]
  );
  const withoutEmail = useMemo(
    () => (organizations ?? []).filter((o) => !o.email?.trim()),
    [organizations]
  );

  const previewName = withEmail[0]?.name ?? 'Your organisation';
  const defaultDraft = useMemo(
    () => draftOutreachEmailForOrg(template, previewName),
    [template, previewName]
  );

  useEffect(() => {
    if (open) {
      setSubject(defaultDraft.subject);
      setBody(defaultDraft.body);
      setShowDraft(true);
      setMessage(null);
    }
  }, [open, defaultDraft.subject, defaultDraft.body]);

  const handleSendNow = async () => {
    if (!withEmail.length) {
      setMessage('Select cards that have an email on file.');
      return;
    }
    if (
      !confirm(
        `Send ${withEmail.length} email(s) NOW for ${columnLabel}?\n\nThis will queue AND immediately deliver via the Monitor API. Requires VITE_MONITOR_API_URL and VITE_MONITOR_API_KEY to be configured.`
      )
    ) {
      return;
    }
    setBusy(true);
    setMessage(null);
    try {
      const result = await sendOutreachNow(withEmail, column as OutreachStatus, {
        subjectDraft: subject,
        bodyDraft: body,
      });

      const parts = [`Sent ${result.queued}`];
      if (result.skippedNoEmail) parts.push(`${result.skippedNoEmail} skipped (no email)`);
      if (result.errors.length) parts.push(result.errors.slice(0, 2).join('; '));
      if (result.flushError) parts.push(`Flush: ${result.flushError}`);
      setMessage(parts.join(' · '));
      onSent();
      setTimeout(() => onClose(), 2000);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Send failed');
    } finally {
      setBusy(false);
    }
  };

  if (!open) return null;

  return (
    <Sheet open={open} onOpenChange={onClose}>
      <SheetContent side="right" className="w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="flex items-center justify-between">
            <span>Send email</span>
            <SheetClose />
          </SheetTitle>
          <SheetDescription>
            {withEmail.length} recipient{withEmail.length !== 1 ? 's' : ''} · {columnLabel}
          </SheetDescription>
        </SheetHeader>

        <div className="space-y-4 py-4">
          {message && (
            <div className={`p-3 text-sm font-mono ${message.includes('failed') ? 'text-red-600' : 'text-teal'}`}>
              {message}
            </div>
          )}

          <div className="flex items-center gap-2 text-sm font-mono text-ink-400">
            <Mail size={14} />
            <span>{withEmail.length} ready</span>
            {withoutEmail.length > 0 && (
              <>
                <span className="text-amber-500">·</span>
                <span className="text-amber-500">{withoutEmail.length} missing email</span>
              </>
            )}
          </div>

          {withEmail.length > 0 && (
            <div className="max-h-32 overflow-y-auto border border-ink-200 dark:border-ink-700 rounded p-2 text-xs font-mono">
              {withEmail.slice(0, 10).map((o) => (
                <div key={o.id} className="truncate flex items-center gap-2">
                  <User size={12} />
                  <span>{o.name} → {o.email}</span>
                </div>
              ))}
              {withEmail.length > 10 && (
                <div className="text-ink-500">+{withEmail.length - 10} more</div>
              )}
            </div>
          )}

          <button
            type="button"
            onClick={() => setShowDraft((v) => !v)}
            className="text-sm underline text-ink-600 dark:text-ink-300 hover:text-teal"
          >
            {showDraft ? 'Hide message' : 'Edit message'}
          </button>

          {showDraft && (
            <div className="space-y-3">
              <div>
                <Label className="font-mono text-2xs uppercase tracking-wider">Subject</Label>
                <Input
                  className="mt-1 min-h-[44px]"
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  placeholder="Subject"
                />
              </div>
              <div>
                <Label className="font-mono text-2xs uppercase tracking-wider">
                  Body <span className="normal-case text-ink-500 text-xs">(use {'{name}'} per org)</span>
                </Label>
                <textarea
                  className="input-brutal w-full mt-1 min-h-[120px] font-mono text-sm"
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  placeholder="Message body..."
                  rows={6}
                />
              </div>
            </div>
          )}

          <div className="flex gap-2 pt-2">
            <Button
              variant="outline"
              onClick={onClose}
              disabled={busy}
              className="min-h-[44px] flex-1"
            >
              Cancel
            </Button>
            <Button
              variant="outline"
              onClick={handleSend}
              disabled={busy || withEmail.length === 0}
              className="min-h-[44px] flex-1"
            >
              <Send size={16} />
              Queue to {withEmail.length}
            </Button>
            {monitorApiReady && (
              <Button
                onClick={handleSendNow}
                disabled={busy || withEmail.length === 0}
                className="min-h-[44px] flex-1 bg-teal hover:bg-teal/90"
              >
                <Send size={16} />
                Send now to {withEmail.length}
              </Button>
            )}
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}