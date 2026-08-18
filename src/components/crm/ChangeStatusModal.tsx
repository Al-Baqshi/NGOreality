import { Loader2 } from 'lucide-react';
import { useState, useEffect } from 'react';
import { OUTREACH_KANBAN_STATUSES, OUTREACH_STATUS_LABELS, type OutreachStatus } from '../../types';
import { setOutreachStatus, markRegisteredInbound } from '../../lib/crmOutreach';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription, SheetClose } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';

interface Props {
  open: boolean;
  onClose: () => void;
  organizations: { id: string; name: string }[];
  currentStatus: string;
  onChanged: () => void;
}

export default function ChangeStatusModal({
  open,
  onClose,
  organizations,
  currentStatus,
  onChanged,
}: Props) {
  const [newStatus, setNewStatus] = useState<OutreachStatus>('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setNewStatus('');
      setMessage(null);
    }
  }, [open]);

  const handleChange = async () => {
    if (!newStatus) {
      setMessage('Select a new status');
      return;
    }
    if (newStatus === currentStatus) {
      setMessage('Already in that status');
      return;
    }

    setBusy(true);
    setMessage(null);
    try {
      if (newStatus === 'registered') {
        for (const org of organizations) {
          await markRegisteredInbound(org.id);
        }
      } else {
        const ids = organizations.map((o) => o.id);
        await setOutreachStatus(ids, newStatus);
      }
      onChanged();
      setMessage(`Moved ${organizations.length} to ${OUTREACH_STATUS_LABELS[newStatus]}`);
      setTimeout(() => onClose(), 1500);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Change failed');
    } finally {
      setBusy(false);
    }
  };

  if (!open) return null;

  return (
    <Sheet open={open} onOpenChange={onClose}>
      <SheetContent side="right" className="w-full max-w-md">
        <SheetHeader>
          <SheetTitle className="flex items-center justify-between">
            <span>Change status</span>
            <SheetClose />
          </SheetTitle>
          <SheetDescription>
            {organizations.length} organization{organizations.length !== 1 ? 's' : ''} selected
          </SheetDescription>
        </SheetHeader>

        <div className="space-y-4 py-4">
          {message && (
            <div className={`p-3 text-sm ${message.includes('failed') ? 'text-red-600' : 'text-teal'}`}>
              {message}
            </div>
          )}

          <div>
            <label className="block font-mono text-2xs uppercase tracking-wider mb-2">
              New status
            </label>
            <select
              value={newStatus}
              onChange={(e) => setNewStatus(e.target.value as OutreachStatus)}
              className="w-full min-h-[44px] px-3 py-2 border-2 border-ink-950 dark:border-border bg-white dark:bg-ink-900 text-ink-950 dark:text-white rounded focus:outline-none focus:ring-2 focus:ring-teal"
            >
              <option value="">Select status…</option>
              {OUTREACH_KANBAN_STATUSES.filter((s) => s !== currentStatus).map((s) => (
                <option key={s} value={s}>
                  {OUTREACH_STATUS_LABELS[s]}
                </option>
              ))}
              <option value="registered">
                {OUTREACH_STATUS_LABELS.registered}
              </option>
            </select>
          </div>

          <div className="flex gap-2 pt-2">
            <Button variant="outline" onClick={onClose} disabled={busy} className="min-h-[44px] flex-1">
              Cancel
            </Button>
            <Button onClick={handleChange} disabled={busy || !newStatus} className="min-h-[44px] flex-1">
              {busy ? <Loader2 size={16} className="animate-spin" /> : 'Change'}
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}