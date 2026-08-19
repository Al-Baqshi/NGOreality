import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Mail, Send } from 'lucide-react';
import type { Organization, OutreachEmailTemplate, OutreachStatus } from '../../types';
import { draftOutreachEmailForOrg, sendOutreachForColumn, sendOutreachNow } from '../../lib/crmOutreach';
import { isMonitorApiConfigured } from '../../lib/monitorApi';
import { useConfirm } from '../../contexts/ConfirmContext';

type Props = {
  column: OutreachStatus;
  columnLabel: string;
  template: OutreachEmailTemplate;
  selectedOrgs: Organization[];
  busy: boolean;
  setBusy: (v: boolean) => void;
  onSent: () => void;
  onMessage: (msg: string | null) => void;
};

const orgs = selectedOrgs ?? [];
const monitorApiReady = isMonitorApiConfigured();

export default function OutreachSendPanel({
  column,
  columnLabel,
  template,
  selectedOrgs: _selectedOrgs,
  busy,
  setBusy,
  onSent,
  onMessage,
}: Props) {
  const confirm = useConfirm();
  const selectionKey = orgs.map((o) => o.id).join(',');
  const previewName = orgs[0]?.name ?? 'Your organisation';
  const defaultDraft = useMemo(
    () => draftOutreachEmailForOrg(template, previewName),
    [template, previewName, selectionKey],
  );

  const [subject, setSubject] = useState(defaultDraft.subject);
  const [body, setBody] = useState(defaultDraft.body);
  const [showDraft, setShowDraft] = useState(true);

  useEffect(() => {
    setSubject(defaultDraft.subject);
    setBody(defaultDraft.body);
  }, [defaultDraft.subject, defaultDraft.body]);

  const withEmail = orgs.filter((o) => o.email?.trim());
  const withoutEmail = orgs.filter((o) => !o.email?.trim());

  const handleSend = async () => {
    if (!withEmail.length) {
      onMessage('Select cards that have an email on file.');
      return;
    }
    const ok = await confirm({
      title: 'Queue emails?',
      description: `Send (queue) ${withEmail.length} email(s) for ${columnLabel}?\n\nRecipients use the address on each card. Delivery happens from Email notifications — not when you drag cards.`,
      confirmLabel: 'Queue',
    });
    if (!ok) return;
    setBusy(true);
    onMessage(null);
    try {
      const result = await sendOutreachForColumn(withEmail, column, {
        subjectDraft: subject,
        bodyDraft: body,
      });

      const parts = [`Queued ${result.queued} — open Email notifications to deliver`];
      if (result.skippedNoEmail) parts.push(`${result.skippedNoEmail} skipped (no email)`);
      if (result.errors.length) parts.push(result.errors.slice(0, 2).join('; '));
      onMessage(parts.join(' · '));
      onSent();
    } catch (err) {
      onMessage(err instanceof Error ? err.message : 'Send failed');
    } finally {
      setBusy(false);
    }
  };

  const handleSendNow = async () => {
    if (!withEmail.length) {
      onMessage('Select cards that have an email on file.');
      return;
    }
    const ok = await confirm({
      title: 'Send emails now?',
      description: `Send ${withEmail.length} email(s) NOW for ${columnLabel}?\n\nThis will queue AND immediately deliver via the Monitor API.`,
      confirmLabel: 'Send now',
    });
    if (!ok) return;
    setBusy(true);
    onMessage(null);
    try {
      const result = await sendOutreachNow(withEmail, column, {
        subjectDraft: subject,
        bodyDraft: body,
      });

      const parts = [`Sent ${result.queued}`];
      if (result.skippedNoEmail) parts.push(`${result.skippedNoEmail} skipped (no email)`);
      if (result.errors.length) parts.push(result.errors.slice(0, 2).join('; '));
      if (result.flushError) parts.push(`Flush: ${result.flushError}`);
      onMessage(parts.join(' · '));
      onSent();
    } catch (err) {
      onMessage(err instanceof Error ? err.message : 'Send failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-2 border-t border-ink-100 dark:border-ink-800 pt-2">
      <p className="text-2xs text-ink-300 leading-snug">
        Dragging only <strong className="text-white">moves</strong> cards. Select recipients, edit the message, then{' '}
        <strong className="text-white">Send</strong>.
      </p>

      {orgs.length === 0 ? (
        <p className="font-mono text-2xs text-amber-200/90">Select one or more cards in this column to send.</p>
      ) : (
        <>
          <p className="font-mono text-2xs text-ink-300">
            {withEmail.length} ready · {withoutEmail.length} missing email on card
          </p>
          {withEmail.length > 0 && (
            <ul className="max-h-20 overflow-y-auto font-mono text-2xs text-ink-400 space-y-0.5 border border-ink-700 p-1.5">
              {withEmail.slice(0, 8).map((o) => (
                <li key={o.id} className="truncate">
                  {o.name} → {o.email}
                </li>
              ))}
              {withEmail.length > 8 && <li>+{withEmail.length - 8} more</li>}
            </ul>
          )}

          <button
            type="button"
            className="text-2xs underline text-ink-400"
            onClick={() => setShowDraft((v) => !v)}
          >
            {showDraft ? 'Hide' : 'Edit'} message
          </button>
          {showDraft && (
            <div className="space-y-1.5">
              <label className="block">
                <span className="font-mono text-2xs text-ink-400 uppercase">Subject</span>
                <input
                  className="input-brutal w-full text-2xs mt-0.5 min-h-[36px] bg-ink-900 text-white border-ink-600"
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                />
              </label>
              <label className="block">
                <span className="font-mono text-2xs text-ink-400 uppercase">
                  Body <span className="normal-case text-ink-500">(use {'{name}'} per org)</span>
                </span>
                <textarea
                  className="input-brutal w-full text-2xs mt-0.5 min-h-[100px] bg-ink-900 text-white border-ink-600 font-mono"
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  rows={6}
                />
              </label>
            </div>
          )}

          <button
            type="button"
            disabled={busy || withEmail.length === 0}
            onClick={handleSend}
            className="btn-brutal-accent w-full text-2xs py-2 min-h-[44px] flex items-center justify-center gap-1.5 disabled:opacity-50"
          >
            <Send size={14} />
            Queue to {withEmail.length} selected
          </button>
          {monitorApiReady && (
            <button
              type="button"
              disabled={busy || withEmail.length === 0}
              onClick={handleSendNow}
              className="btn-brutal-teal w-full text-2xs py-2 min-h-[44px] flex items-center justify-center gap-1.5 disabled:opacity-50"
            >
              <Send size={14} />
              Send now to {withEmail.length} selected
            </button>
          )}
        </>
      )}

      <Link to="/email-notifications" className="inline-flex items-center gap-1 font-mono text-2xs text-ink-400 hover:text-teal">
        <Mail size={12} /> Deliver from email queue
      </Link>
    </div>
  );
}
