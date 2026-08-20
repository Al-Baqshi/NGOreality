import { supabase } from './supabase';
import { NGO_BANK_ACCOUNT } from '../config/billing';
import {
  MEMBERSHIP_ANNUAL_CENTS,
  MONITORING_MONTHLY_CENTS,
  PRICING_CURRENCY,
  VERIFICATION_ANNUAL_CENTS,
} from '../config/pricing';
import { LANDING_STANDARDS_PACKAGE_CENTS } from '../config/customerProducts';
import { activateMembershipBenefits, isMembershipProduct } from './membershipBenefits';
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
  if (productType === 'landing_standards_package') {
    return { period_start: paidAt.toISOString(), period_end: null as string | null };
  }
  const start = new Date(paidAt);
  const end = new Date(paidAt);
  if (productType === 'monitoring_monthly') {
    end.setMonth(end.getMonth() + 1);
  } else {
    end.setFullYear(end.getFullYear() + 1);
  }
  return { period_start: start.toISOString(), period_end: end.toISOString() };
}

function amountForProduct(productType: PaymentProductType, amountCents?: number): number {
  if (amountCents != null) return amountCents;
  if (productType === 'monitoring_monthly') return MONITORING_MONTHLY_CENTS;
  if (productType === 'membership_annual') return MEMBERSHIP_ANNUAL_CENTS;
  if (productType === 'landing_standards_package') return LANDING_STANDARDS_PACKAGE_CENTS;
  return VERIFICATION_ANNUAL_CENTS;
}

export function isLandingPackageProduct(productType: string): boolean {
  return productType === 'landing_standards_package';
}

async function markLandingPackagePaid(organizationId: string, recordedBy?: string) {
  await supabase
    .from('ngo_setup_requests')
    .update({
      status: 'in_review',
      updated_at: new Date().toISOString(),
    })
    .eq('organization_id', organizationId)
    .eq('request_kind', 'landing_standards')
    .in('status', ['pending', 'in_review']);

  await supabase.from('activity_log').insert({
    organization_id: organizationId,
    action: 'landing_package_paid',
    description: 'Trust landing page package marked paid — ready for staff fulfillment',
    performed_by: recordedBy ?? 'staff',
  });
}

export async function recordPayment(input: {
  organizationId: string;
  productType: PaymentProductType;
  paymentMethod: 'bank_transfer' | 'stripe' | 'manual' | 'paymark';
  status?: PaymentStatus;
  amountCents?: number;
  notes?: string;
  bankTransferReference?: string;
  stripeCheckoutSessionId?: string;
  recordedBy?: string;
}): Promise<{ payment: OrganizationPayment | null; error: string | null; message?: string }> {
  const paidAt = new Date();
  const status = input.status ?? 'paid';
  const productType =
    input.productType === 'verification_annual' ? 'membership_annual' : input.productType;
  const amountCents = amountForProduct(productType, input.amountCents);

  const reference = await ensurePaymentReference(input.organizationId);
  const bankRef =
    input.bankTransferReference?.trim() ||
    (input.paymentMethod === 'bank_transfer' ? reference : '');

  const periods =
    status === 'paid' ? periodForProduct(productType, paidAt) : { period_start: null, period_end: null };

  const { data, error } = await supabase
    .from('organization_payments')
    .insert({
      organization_id: input.organizationId,
      product_type: productType,
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
      description: `${productType} marked paid (${(amountCents / 100).toFixed(2)} ${PRICING_CURRENCY})`,
      performed_by: input.recordedBy ?? 'staff',
      metadata: { payment_id: data?.id, method: input.paymentMethod },
    });

    if (isMembershipProduct(productType)) {
      const benefits = await activateMembershipBenefits({
        organizationId: input.organizationId,
        paidAt,
        recordedBy: input.recordedBy,
      });
      return {
        payment: data as OrganizationPayment,
        error: benefits.error,
        message: benefits.message,
      };
    }

    if (isLandingPackageProduct(productType)) {
      await markLandingPackagePaid(input.organizationId, input.recordedBy);
      return {
        payment: data as OrganizationPayment,
        error: null,
        message: 'Landing package recorded — fulfill via Setup requests.',
      };
    }

    if (productType === 'monitoring_monthly') {
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
          notes: 'Legacy monitoring-only payment',
        });
      }
      await supabase
        .from('website_monitors')
        .update({
          tier: 'paid_live',
          check_interval_minutes: 60,
          updated_at: paidAt.toISOString(),
        })
        .eq('organization_id', input.organizationId);
    }
  }

  return { payment: data as OrganizationPayment, error: null };
}

/** Create a pending bank-transfer payment the NGO can settle with their NGR reference. */
export async function createPendingBankPayment(input: {
  organizationId: string;
  productType: PaymentProductType;
  notes?: string;
  recordedBy?: string;
}): Promise<{ payment: OrganizationPayment | null; reference: string; error: string | null }> {
  const productType =
    input.productType === 'verification_annual' ? 'membership_annual' : input.productType;
  const amountCents = amountForProduct(productType);
  const reference = await ensurePaymentReference(input.organizationId);

  const { data: existing } = await supabase
    .from('organization_payments')
    .select('*')
    .eq('organization_id', input.organizationId)
    .eq('product_type', productType)
    .eq('status', 'pending')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (existing) {
    return { payment: existing as OrganizationPayment, reference, error: null };
  }

  const { data, error } = await supabase
    .from('organization_payments')
    .insert({
      organization_id: input.organizationId,
      product_type: productType,
      amount_cents: amountCents,
      currency: PRICING_CURRENCY,
      status: 'pending',
      payment_method: 'bank_transfer',
      bank_transfer_reference: reference,
      paid_at: null,
      period_start: null,
      period_end: null,
      notes: input.notes ?? '',
      recorded_by: input.recordedBy ?? 'ngo_portal',
    })
    .select()
    .maybeSingle();

  if (error) return { payment: null, reference, error: error.message };
  return { payment: data as OrganizationPayment, reference, error: null };
}

/** Bank transfer instructions shown in CRM */
export const BANK_TRANSFER_INSTRUCTIONS = {
  accountName: NGO_BANK_ACCOUNT.accountName,
  accountNumber: NGO_BANK_ACCOUNT.accountNumber || '(set VITE_BANK_ACCOUNT_NUMBER in env)',
  referenceHint: 'Use payment reference exactly as shown (NGR-…)',
};

export function hasActiveMembershipPayment(
  payments: OrganizationPayment[],
  now = new Date(),
): boolean {
  return payments.some(
    (p) =>
      isMembershipProduct(p.product_type) &&
      p.status === 'paid' &&
      p.period_end &&
      new Date(p.period_end) > now,
  );
}
