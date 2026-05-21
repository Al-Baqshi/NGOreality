import { supabase } from './supabase';
import {
  MONITORING_MONTHLY_CENTS,
  PRICING_CURRENCY,
  VERIFICATION_ANNUAL_CENTS,
} from '../config/pricing';
import type { OrganizationPayment, PaymentProductType, PaymentStatus } from '../types';

export function paymentReferenceFromOrgId(orgId: string): string {
  return `NGR-${orgId.replace(/-/g, '').slice(0, 8).toUpperCase()}`;
}

export async function ensurePaymentReference(orgId: string): Promise<string> {
  const { data: org } = await supabase
    .from('organizations')
    .select('payment_reference')
    .eq('id', orgId)
    .maybeSingle();

  if (org?.payment_reference) return org.payment_reference;

  const reference = paymentReferenceFromOrgId(orgId);
  await supabase
    .from('organizations')
    .update({ payment_reference: reference, updated_at: new Date().toISOString() })
    .eq('id', orgId);

  return reference;
}

function periodForProduct(productType: PaymentProductType, paidAt: Date) {
  const start = new Date(paidAt);
  const end = new Date(paidAt);
  if (productType === 'verification_annual') {
    end.setFullYear(end.getFullYear() + 1);
  } else {
    end.setMonth(end.getMonth() + 1);
  }
  return { period_start: start.toISOString(), period_end: end.toISOString() };
}

export async function recordPayment(input: {
  organizationId: string;
  productType: PaymentProductType;
  paymentMethod: 'bank_transfer' | 'stripe' | 'manual';
  status?: PaymentStatus;
  amountCents?: number;
  notes?: string;
  bankTransferReference?: string;
  stripeCheckoutSessionId?: string;
  recordedBy?: string;
}): Promise<{ payment: OrganizationPayment | null; error: string | null }> {
  const paidAt = new Date();
  const status = input.status ?? 'paid';
  const amountCents =
    input.amountCents ??
    (input.productType === 'verification_annual'
      ? VERIFICATION_ANNUAL_CENTS
      : MONITORING_MONTHLY_CENTS);

  const reference = await ensurePaymentReference(input.organizationId);
  const bankRef =
    input.bankTransferReference?.trim() ||
    (input.paymentMethod === 'bank_transfer' ? reference : '');

  const periods =
    status === 'paid' ? periodForProduct(input.productType, paidAt) : { period_start: null, period_end: null };

  const { data, error } = await supabase
    .from('organization_payments')
    .insert({
      organization_id: input.organizationId,
      product_type: input.productType,
      amount_cents: amountCents,
      currency: PRICING_CURRENCY,
      status,
      payment_method: input.paymentMethod,
      bank_transfer_reference: bankRef,
      stripe_checkout_session_id: input.stripeCheckoutSessionId ?? null,
      paid_at: status === 'paid' ? paidAt.toISOString() : null,
      period_start: periods.period_start,
      period_end: periods.period_end,
      notes: input.notes ?? '',
      recorded_by: input.recordedBy ?? 'staff',
    })
    .select()
    .maybeSingle();

  if (error) return { payment: null, error: error.message };

  if (status === 'paid') {
    await supabase.from('activity_log').insert({
      organization_id: input.organizationId,
      action: 'payment_recorded',
      description: `${input.productType} marked paid (${(amountCents / 100).toFixed(2)} ${PRICING_CURRENCY})`,
      performed_by: input.recordedBy ?? 'staff',
      metadata: { payment_id: data?.id, method: input.paymentMethod },
    });

    if (input.productType === 'monitoring_monthly') {
      const { count } = await supabase
        .from('service_engagements')
        .select('id', { count: 'exact', head: true })
        .eq('organization_id', input.organizationId)
        .eq('engagement_type', 'monitoring')
        .in('status', ['lead', 'active']);

      if (!count) {
        await supabase.from('service_engagements').insert({
          organization_id: input.organizationId,
          engagement_type: 'monitoring',
          status: 'active',
          fee_cents: MONITORING_MONTHLY_CENTS,
          currency: PRICING_CURRENCY,
          started_at: paidAt.toISOString(),
          notes: 'Created from monitoring payment',
        });
      }
    }
  }

  return { payment: data as OrganizationPayment, error: null };
}

/** Bank transfer instructions shown in CRM */
export const BANK_TRANSFER_INSTRUCTIONS = {
  accountName: 'NGOreality Ltd',
  accountNumber: '(configure in CRM settings / env)',
  referenceHint: 'Use payment reference exactly as shown (NGR-…)',
};
