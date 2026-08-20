/**
 * Bank transfer reconciliation.
 *
 * Members pay by transfer quoting an NGR- reference. Nothing tells us the money
 * arrived — we read it off a bank statement. This turns "a line on a statement"
 * into "an active membership" in one step, and makes the matching explicit
 * rather than something done by eye against two browser tabs.
 */

import { supabase } from './supabase';
import { activateMembershipBenefits, isMembershipProduct } from './membershipBenefits';
import type { OrganizationPayment } from '../types';

export interface PendingPayment extends OrganizationPayment {
  organizations: { name: string; payment_reference: string | null } | null;
}

/**
 * Payments awaiting a bank transfer, oldest first — the oldest has been waiting
 * longest for its badge, so it is the one to clear next.
 */
export async function listPendingPayments(limit = 100): Promise<PendingPayment[]> {
  const { data, error } = await supabase
    .from('organization_payments')
    .select('*, organizations(name, payment_reference)')
    .eq('status', 'pending')
    .order('created_at', { ascending: true })
    .limit(limit);

  if (error || !data) return [];
  return data as PendingPayment[];
}

/**
 * Normalises a reference for comparison.
 *
 * A treasurer typing an NGR- code into a banking app produces "ngr abcd1234",
 * "NGR-ABCD1234", or "NGRABCD1234" depending on the bank's field rules — some
 * strip punctuation, some uppercase, some truncate. Comparing raw strings means
 * a payment that WAS correctly referenced looks unmatched, and a charity waits
 * days for a badge it already paid for.
 */
export function normaliseReference(input: string): string {
  return input.toUpperCase().replace(/[^A-Z0-9]/g, '');
}

export type MatchConfidence = 'exact' | 'partial' | 'none';

export interface ReferenceMatch {
  payment: PendingPayment;
  confidence: MatchConfidence;
}

/**
 * Finds the pending payment a bank reference belongs to.
 *
 * 'partial' means the normalised bank reference CONTAINS the payment reference
 * — common, because banks prepend their own text. It is surfaced rather than
 * auto-accepted: a human confirms before money is treated as received.
 */
export function matchReference(
  bankReference: string,
  pending: PendingPayment[],
): ReferenceMatch[] {
  const needle = normaliseReference(bankReference);
  if (needle.length < 4) return [];

  const matches: ReferenceMatch[] = [];

  for (const payment of pending) {
    const candidates = [
      payment.bank_transfer_reference,
      payment.organizations?.payment_reference,
    ].filter((r): r is string => Boolean(r && r.trim()));

    let best: MatchConfidence = 'none';
    for (const candidate of candidates) {
      const ref = normaliseReference(candidate);
      if (!ref) continue;
      if (ref === needle) {
        best = 'exact';
        break;
      }
      if (needle.includes(ref) || ref.includes(needle)) {
        best = 'partial';
      }
    }

    if (best !== 'none') matches.push({ payment, confidence: best });
  }

  // Exact matches first; a partial should never be picked over an exact one.
  return matches.sort((a, b) => (a.confidence === 'exact' ? -1 : b.confidence === 'exact' ? 1 : 0));
}

export interface ReconcileResult {
  error: string | null;
  message?: string;
}

/**
 * Marks a pending payment as received and activates what it bought.
 *
 * Deliberately updates only rows still 'pending'. If two staff clear the same
 * transfer at once, the second update affects nothing and reports it, rather
 * than extending the membership by a second year.
 */
export async function reconcilePayment(input: {
  paymentId: string;
  organizationId: string;
  productType: string;
  bankReference: string;
  amountCents: number;
  note?: string;
  recordedBy?: string;
}): Promise<ReconcileResult> {
  const paidAt = new Date();

  const { data, error } = await supabase
    .from('organization_payments')
    .update({
      status: 'paid',
      paid_at: paidAt.toISOString(),
      bank_transfer_reference: input.bankReference.trim(),
      notes: input.note?.trim()
        ? `${input.note.trim()} (reconciled from bank transfer)`
        : 'Reconciled from bank transfer',
      recorded_by: input.recordedBy ?? 'staff',
    })
    .eq('id', input.paymentId)
    .eq('status', 'pending')
    .select('id')
    .maybeSingle();

  if (error) return { error: error.message };
  if (!data) {
    return {
      error: null,
      message: 'Already reconciled by someone else — nothing changed.',
    };
  }

  await supabase.from('activity_log').insert({
    organization_id: input.organizationId,
    action: 'payment_reconciled',
    description: `Bank transfer matched (${(input.amountCents / 100).toFixed(2)} NZD, ref ${input.bankReference.trim()})`,
    performed_by: input.recordedBy ?? 'staff',
    metadata: { payment_id: input.paymentId, bank_reference: input.bankReference.trim() },
  });

  // Activating benefits is what the charity is actually waiting for: membership
  // period, badge eligibility, and hourly monitoring.
  if (isMembershipProduct(input.productType as never)) {
    const benefits = await activateMembershipBenefits({
      organizationId: input.organizationId,
      paidAt,
    });
    if (benefits?.error) {
      return {
        error: null,
        message: `Payment recorded, but activating membership failed: ${benefits.error}`,
      };
    }
    return { error: null, message: 'Payment recorded and membership activated.' };
  }

  if (input.productType === 'landing_standards_package') {
    await supabase
      .from('ngo_setup_requests')
      .update({
        status: 'in_review',
        updated_at: new Date().toISOString(),
      })
      .eq('organization_id', input.organizationId)
      .eq('request_kind', 'landing_standards')
      .in('status', ['pending', 'in_review']);

    await supabase.from('activity_log').insert({
      organization_id: input.organizationId,
      action: 'landing_package_paid',
      description: 'Trust landing page package reconciled — ready for staff fulfillment',
      performed_by: input.recordedBy ?? 'staff',
    });

    return { error: null, message: 'Payment recorded — fulfill landing package via Setup requests.' };
  }

  return { error: null, message: 'Payment recorded.' };
}
