import { useEffect, useState } from 'react';
import { Loader2, Save, X } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { FormField } from '../ui';
import {
  CATEGORIES,
  OUTREACH_KANBAN_STATUSES,
  OUTREACH_STATUS_LABELS,
  type OutreachStatus,
} from '../../types';

/**
 * Quick lead entry for the outreach pipeline.
 *
 * The full organisation form (/organizations/new) is built for onboarding a
 * customer — registry ids, mission statement, verification criteria. Adding a
 * test lead or a name from a phone call needs five fields and a starting
 * column, so that is all this asks for. The row lands as a listed non-customer
 * with the chosen outreach stage, which is exactly the population the board
 * and the worklist query.
 */

type NewLeadDialogProps = {
  open: boolean;
  onClose: () => void;
  /** Called after a successful insert, with the new organisation's id. */
  onCreated: (id: string) => void;
  /** Pre-select the board column the lead should start in. */
  initialStage?: OutreachStatus;
};

const EMPTY_FORM = {
  name: '',
  email: '',
  website_url: '',
  phone: '',
  category: '',
  location: '',
};

function slugify(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
}

export default function NewLeadDialog({
  open,
  onClose,
  onCreated,
  initialStage = 'not_contacted',
}: NewLeadDialogProps) {
  const [form, setForm] = useState(EMPTY_FORM);
  const [stage, setStage] = useState<OutreachStatus>(initialStage);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setForm(EMPTY_FORM);
      setStage(initialStage);
      setError(null);
    }
  }, [open, initialStage]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  const insertLead = async (slug: string) =>
    supabase
      .from('organizations')
      .insert({
        name: form.name.trim(),
        slug,
        email: form.email.trim(),
        phone: form.phone.trim(),
        website_url: form.website_url.trim(),
        category: form.category,
        location: form.location.trim(),
        description: '',
        mission_statement: '',
        status: 'listed',
        is_customer: false,
        verification_level: 'none',
        outreach_status: stage,
      })
      .select('id')
      .maybeSingle();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) return;
    setBusy(true);
    setError(null);
    try {
      let { data, error: insertError } = await insertLead(slugify(form.name));
      // Slug collision — same charity name already listed. Retry once with a
      // suffix rather than surfacing a constraint error the operator can't act on.
      if (insertError?.code === '23505') {
        ({ data, error: insertError } = await insertLead(
          `${slugify(form.name)}-${Math.random().toString(36).slice(2, 7)}`,
        ));
      }
      if (insertError) throw new Error(insertError.message);
      if (!data) throw new Error('The lead was not created.');

      await supabase.from('activity_log').insert({
        organization_id: data.id,
        action: 'created',
        description: `Lead added manually — starts in "${OUTREACH_STATUS_LABELS[stage]}"`,
        performed_by: 'staff',
      });

      onCreated(data.id);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create the lead.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink-950/60 p-4 backdrop-blur-sm"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Add a lead"
        className="card-brutal w-full max-w-lg max-h-[90vh] overflow-y-auto bg-white p-5 dark:bg-card"
      >
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold tracking-tight">Add a lead</h2>
            <p className="mt-0.5 text-xs text-ink-500 dark:text-muted-foreground">
              Goes straight into the outreach pipeline. Use the full form for customer onboarding.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="flex size-9 shrink-0 items-center justify-center rounded-md text-ink-500 transition-colors hover:bg-ink-50 hover:text-ink-950 dark:hover:bg-muted dark:hover:text-foreground"
          >
            <X size={18} />
          </button>
        </div>

        {error && (
          <div className="mb-4 border-3 border-accent bg-accent-light px-3 py-2 text-sm text-accent">{error}</div>
        )}

        <form onSubmit={handleSubmit} className="space-y-3">
          <FormField label="Organisation name *">
            <input
              className="input-brutal w-full text-base"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              required
              autoFocus
            />
          </FormField>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <FormField label="Email">
              <input
                className="input-brutal w-full text-base"
                type="email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
              />
            </FormField>
            <FormField label="Phone">
              <input
                className="input-brutal w-full text-base"
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
              />
            </FormField>
          </div>

          <FormField label="Website URL">
            <input
              className="input-brutal w-full text-base"
              placeholder="https://…"
              value={form.website_url}
              onChange={(e) => setForm({ ...form, website_url: e.target.value })}
            />
          </FormField>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <FormField label="Category">
              <select
                className="input-brutal w-full text-base"
                value={form.category}
                onChange={(e) => setForm({ ...form, category: e.target.value })}
              >
                <option value="">Select category</option>
                {CATEGORIES.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </FormField>
            <FormField label="Location">
              <input
                className="input-brutal w-full text-base"
                value={form.location}
                onChange={(e) => setForm({ ...form, location: e.target.value })}
              />
            </FormField>
          </div>

          <FormField label="Start in column">
            <select
              className="input-brutal w-full text-base"
              value={stage}
              onChange={(e) => setStage(e.target.value as OutreachStatus)}
            >
              {OUTREACH_KANBAN_STATUSES.map((s) => (
                <option key={s} value={s}>{OUTREACH_STATUS_LABELS[s]}</option>
              ))}
            </select>
          </FormField>

          <div className="flex items-center justify-end gap-2 pt-2">
            <button type="button" onClick={onClose} className="btn-brutal-outline min-h-[44px] text-sm">
              Cancel
            </button>
            <button
              type="submit"
              disabled={busy || !form.name.trim()}
              className="btn-brutal min-h-[44px] inline-flex items-center gap-2 text-sm disabled:opacity-50"
            >
              {busy ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />}
              Create lead
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
