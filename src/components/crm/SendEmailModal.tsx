import { useEffect, useMemo, useState } from 'react';
import { Send, Mail, Loader2, X, AlertTriangle, CheckCircle2, ChevronDown, ChevronRight } from 'lucide-react';
import { Link } from 'react-router-dom';
import type { Organization, OutreachEmailTemplate, OutreachStatus } from '../../types';
import { draftOutreachEmailForOrg, sendOutreachForColumn, sendOutreachNow } from '../../lib/crmOutreach';
import { isMonitorApiConfigured } from '../../lib/monitorApi';
import { useConfirm } from '../../contexts/ConfirmContext';

interface Props {
  open: boolean;
  onClose: () => void;
  organizations: Organization[];
  column: string;
  columnLabel: string;
  template: OutreachEmailTemplate;
  onSent: () => void;
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
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
  const confirm = useConfirm();
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [showDraft, setShowDraft] = useState(true);
  const [showAllRecipients, setShowAllRecipients] = useState(false);

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

  const visibleRecipients = showAllRecipients ? withEmail : withEmail.slice(0, 6);
  const hiddenRecipientCount = withEmail.length - visibleRecipients.length;
  const messageFailed = Boolean(message && /fail/i.test(message));

  useEffect(() => {
    if (open) {
      setSubject(defaultDraft.subject);
      setBody(defaultDraft.body);
      setShowDraft(true);
      setShowAllRecipients(false);
      setMessage(null);
    }
  }, [open, defaultDraft.subject, defaultDraft.body]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !busy) onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, busy, onClose]);

  const handleSend = async () => {
    if (!withEmail.length) {
      setMessage('Select cards that have an email on file.');
      return;
    }
    const ok = await confirm({
      title: 'Queue emails?',
      description: `Queue ${withEmail.length} email${withEmail.length === 1 ? '' : 's'} for ${columnLabel}?\n\nRecipients use the address on each card. Delivery happens from Email notifications.`,
      confirmLabel: 'Queue',
    });
    if (!ok) return;
    setBusy(true);
    setMessage(null);
    try {
      const result = await sendOutreachForColumn(withEmail, column as OutreachStatus, {
        subjectDraft: subject,
        bodyDraft: body,
      });

      const parts = [`Queued ${result.queued} — open Email notifications to deliver`];
      if (result.skippedNoEmail) parts.push(`${result.skippedNoEmail} skipped (no email)`);
      if (result.errors.length) parts.push(result.errors.slice(0, 2).join('; '));
      setMessage(parts.join(' · '));
      onSent();
      setTimeout(() => onClose(), 2000);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Send failed');
    } finally {
      setBusy(false);
    }
  };

  const handleSendNow = async () => {
    if (!withEmail.length) {
      setMessage('Select cards that have an email on file.');
      return;
    }
    const ok = await confirm({
      title: 'Send emails now?',
      description: `Send ${withEmail.length} email${withEmail.length === 1 ? '' : 's'} now for ${columnLabel}?\n\nThey will be queued and delivered immediately.`,
      confirmLabel: 'Send now',
    });
    if (!ok) return;
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
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink-950/60 p-4 backdrop-blur-sm"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !busy) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="send-email-title"
        className="card-brutal flex w-full max-w-xl max-h-[90vh] flex-col overflow-hidden bg-white dark:bg-card"
      >
        <div className="flex items-start justify-between gap-3 border-b-3 border-ink-950 px-5 py-4 dark:border-border">
          <div className="flex min-w-0 items-start gap-3">
            <div className="flex size-10 shrink-0 items-center justify-center bg-gold text-ink-950">
              <Mail size={18} aria-hidden />
            </div>
            <div className="min-w-0">
              <h2 id="send-email-title" className="text-lg font-bold tracking-tight">
                Send email
              </h2>
              <p className="mt-0.5 text-sm text-ink-500 dark:text-muted-foreground">
                {withEmail.length} recipient{withEmail.length !== 1 ? 's' : ''} · {columnLabel}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            aria-label="Close"
            className="flex size-9 shrink-0 items-center justify-center text-ink-500 transition-colors hover:bg-ink-50 hover:text-ink-950 disabled:opacity-40 dark:hover:bg-muted dark:hover:text-foreground"
          >
            <X size={18} />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4 space-y-4">
          {message && (
            <div
              className={`border-3 px-3 py-2 text-sm ${
                messageFailed
                  ? 'border-accent bg-accent-light text-accent'
                  : 'border-teal bg-teal/10 text-teal'
              }`}
            >
              {message}
            </div>
          )}

          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1.5 border-2 border-teal bg-teal/10 px-2.5 py-1 text-xs font-semibold text-teal">
              <CheckCircle2 size={13} aria-hidden />
              {withEmail.length} ready
            </span>
            {withoutEmail.length > 0 && (
              <span className="inline-flex items-center gap-1.5 border-2 border-amber-400 bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-800 dark:border-amber-600 dark:bg-amber-950/40 dark:text-amber-100">
                <AlertTriangle size={13} aria-hidden />
                {withoutEmail.length} missing email
              </span>
            )}
          </div>

          {withEmail.length > 0 && (
            <section>
              <p className="label-brutal mb-2">Recipients</p>
              <ul className="divide-y-2 divide-ink-100 overflow-hidden border-3 border-ink-200 dark:divide-border dark:border-border">
                {visibleRecipients.map((o) => (
                  <li key={o.id} className="flex items-center gap-3 bg-white px-3 py-2.5 dark:bg-card">
                    <span className="flex size-8 shrink-0 items-center justify-center bg-ink-950 text-2xs font-bold tracking-wide text-white">
                      {initials(o.name)}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold leading-tight">{o.name}</p>
                      <p className="truncate text-xs text-ink-500 dark:text-muted-foreground">{o.email}</p>
                    </div>
                  </li>
                ))}
              </ul>
              {hiddenRecipientCount > 0 && (
                <button
                  type="button"
                  onClick={() => setShowAllRecipients(true)}
                  className="mt-2 text-sm font-semibold text-teal hover:underline"
                >
                  Show {hiddenRecipientCount} more
                </button>
              )}
            </section>
          )}

          {withoutEmail.length > 0 && (
            <p className="text-xs text-ink-500 dark:text-muted-foreground">
              {withoutEmail.length === 1
                ? `${withoutEmail[0].name} has no email on file and will be skipped.`
                : `${withoutEmail.length} organisations have no email on file and will be skipped.`}
            </p>
          )}

          <section>
            <button
              type="button"
              onClick={() => setShowDraft((v) => !v)}
              className="flex w-full items-center justify-between gap-2 py-1 text-left"
            >
              <span className="label-brutal mb-0">Message</span>
              {showDraft ? <ChevronDown size={16} className="text-ink-400" /> : <ChevronRight size={16} className="text-ink-400" />}
            </button>

            {showDraft && (
              <div className="mt-3 space-y-3">
                <label className="block">
                  <span className="label-brutal">Subject</span>
                  <input
                    className="input-brutal w-full min-h-[44px] font-sans text-sm"
                    value={subject}
                    onChange={(e) => setSubject(e.target.value)}
                    placeholder="Subject"
                  />
                </label>
                <label className="block">
                  <span className="label-brutal flex flex-wrap items-center gap-2">
                    Body
                    <span className="normal-case tracking-normal font-sans font-medium text-ink-400">
                      Inserts {'{name}'} for each organisation
                    </span>
                  </span>
                  <textarea
                    className="input-brutal mt-0 w-full min-h-[160px] resize-y font-sans text-sm leading-relaxed"
                    value={body}
                    onChange={(e) => setBody(e.target.value)}
                    placeholder="Message body…"
                    rows={8}
                  />
                </label>
              </div>
            )}
          </section>

          <Link
            to="/email-notifications"
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-ink-500 hover:text-teal"
          >
            <Mail size={13} aria-hidden />
            Open email queue
          </Link>
        </div>

        <div className="flex flex-col-reverse gap-2 border-t-3 border-ink-950 px-5 py-4 sm:flex-row sm:items-center dark:border-border">
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="btn-brutal-outline min-h-[44px] flex-1 text-sm disabled:opacity-50 sm:flex-none"
          >
            Cancel
          </button>
          <div className="flex flex-1 flex-col gap-2 sm:flex-row sm:justify-end">
            <button
              type="button"
              onClick={() => void handleSend()}
              disabled={busy || withEmail.length === 0}
              className="btn-brutal-outline min-h-[44px] inline-flex items-center justify-center gap-2 text-sm disabled:opacity-50"
            >
              {busy ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />}
              Queue to {withEmail.length}
            </button>
            {monitorApiReady && (
              <button
                type="button"
                onClick={() => void handleSendNow()}
                disabled={busy || withEmail.length === 0}
                className="btn-brutal-gold min-h-[44px] inline-flex items-center justify-center gap-2 text-sm disabled:opacity-50"
              >
                {busy ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />}
                Send now to {withEmail.length}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
