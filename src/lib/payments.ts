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
import { captureEmptyMutation, captureError } from './errorReporting';
import type { OrganizationPayment, PaymentProductType, PaymentStatus } from '../types';

export function paymentReferenceFromOrgId(orgId: string): string {
  return `NGR-${orgId.replace(/-/g, '').slice(0, 8).toUpperCase()}`;
}

export async function ensurePaymentReference(orgId: string): Promise<string> {
  const { data: org, error: readError } = await supabase
    .from('organizations')
    .select('payment_reference')
    .eq('id', orgId)
    .maybeSingle();

  if (readError) {
    throw new Error(captureError(readError, { where: 'ensurePaymentReference.read' }));
  }
  if (!org) {
    throw new Error(
      captureError(new Error('Organisation not found — cannot allocate a payment reference.'), {
        where: 'ensurePaymentReference.missing',
      }),
    );
  }
  if (org.payment_reference) return org.payment_reference;

  const reference = paymentReferenceFromOrgId(orgId);
  const { data: written, error: writeError } = await supabase
    .from('organizations')
    .update({ payment_reference: reference, updated_at: new Date().toISOString() })
    .eq('id', orgId)
    .select('id');
  if (writeError) {
    throw new Error(captureError(writeError, { where: 'ensurePaymentReference.write' }));
  }
  if (!written?.length) {
    throw new Error(
      captureEmptyMutation('ensurePaymentReference.writeEmpty', 'Payment reference could not be saved.'),
    );
  }

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
  const { error: setupError } = await supabase
    .from('ngo_setup_requests')
    .update({
      status: 'in_review',
      updated_at: new Date().toISOString(),
    })
    .eq('organization_id', organizationId)
    .eq('request_kind', 'landing_standards')
    .in('status', ['pending', 'in_review']);
  if (setupError) captureError(setupError, { where: 'markLandingPackagePaid.setupRequest' });

  const { error: logError } = await supabase.from('activity_log').insert({
    organization_id: organizationId,
    action: 'landing_package_paid',
    description: 'Trust landing page package marked paid — ready for staff fulfillment',
    performed_by: recordedBy ?? 'staff',
  });
  if (logError) captureError(logError, { where: 'markLandingPackagePaid.activityLog' });
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

  let reference: string;
  try {
    reference = await ensurePaymentReference(input.organizationId);
  } catch (err) {
    return {
      payment: null,
      error: err instanceof Error ? err.message : 'Could not allocate a payment reference.',
    };
  }
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

  if (error) {
    return { payment: null, error: captureError(error, { where: 'recordPayment.insert' }) };
  }
  if (!data) {
    return {
      payment: null,
      error: captureError(new Error('Payment was saved but the record could not be loaded. Refresh before recording again.'), {
        where: 'recordPayment.insertEmpty',
      }),
    };
  }

  if (status === 'paid') {
    const { error: logError } = await supabase.from('activity_log').insert({
      organization_id: input.organizationId,
      action: 'payment_recorded',
      description: `${productType} marked paid (${(amountCents / 100).toFixed(2)} ${PRICING_CURRENCY})`,
      performed_by: input.recordedBy ?? 'staff',
      metadata: { payment_id: data?.id, method: input.paymentMethod },
    });
    if (logError) captureError(logError, { where: 'recordPayment.activityLog' });

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
      const { count, error: countError } = await supabase
        .from('service_engagements')
        .select('id', { count: 'exact', head: true })
        .eq('organization_id', input.organizationId)
        .eq('engagement_type', 'monitoring')
        .in('status', ['lead', 'active']);
      if (countError) captureError(countError, { where: 'recordPayment.monitoringCount' });

      if (!count) {
        const { error: engError } = await supabase.from('service_engagements').insert({
          organization_id: input.organizationId,
          engagement_type: 'monitoring',
          status: 'active',
          fee_cents: MONITORING_MONTHLY_CENTS,
          currency: PRICING_CURRENCY,
          started_at: paidAt.toISOString(),
          notes: 'Legacy monitoring-only payment',
        });
        if (engError) captureError(engError, { where: 'recordPayment.monitoringEngagement' });
      }
      const { error: monitorError } = await supabase
        .from('website_monitors')
        .update({
          tier: 'paid_live',
          check_interval_minutes: 60,
          updated_at: paidAt.toISOString(),
        })
        .eq('organization_id', input.organizationId);
      if (monitorError) captureError(monitorError, { where: 'recordPayment.monitoringTier' });
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

  // Prefer the SECURITY DEFINER RPC — members cannot INSERT payments via RLS
  // (migration 031). Fall back to direct insert for staff sessions if the RPC
  // is not yet applied locally.
  const { data: rpcRow, error: rpcError } = await supabase.rpc('request_pending_bank_payment', {
    p_organization_id: input.organizationId,
    p_product_type: productType,
    p_notes: input.notes ?? '',
  });

  const rpcMissing =
    Boolean(rpcError) &&
    /could not find|schema cache|function .* does not exist/i.test(rpcError!.message);

  if (!rpcError) {
    const payment = (Array.isArray(rpcRow) ? rpcRow[0] : rpcRow) as OrganizationPayment | undefined;
    if (payment?.id) {
      try {
        const reference =
          payment.bank_transfer_reference?.trim() ||
          (await ensurePaymentReference(input.organizationId));
        return { payment, reference, error: null };
      } catch (err) {
        return {
          payment,
          reference: payment.bank_transfer_reference?.trim() ?? '',
          error: err instanceof Error ? err.message : 'Payment created but reference could not be saved.',
        };
      }
    }
    return {
      payment: null,
      reference: '',
      error: captureError(new Error('Payment request returned no record. Refresh before requesting again.'), {
        where: 'createPendingBankPayment.rpcEmpty',
      }),
    };
  }

  if (!rpcMissing) {
    return {
      payment: null,
      reference: '',
      error: captureError(rpcError, { where: 'createPendingBankPayment.rpc' }),
    };
  }

  // Legacy path (staff RLS / pre-migration).
  const amountCents = amountForProduct(productType);
  let reference: string;
  try {
    reference = await ensurePaymentReference(input.organizationId);
  } catch (err) {
    return {
      payment: null,
      reference: '',
      error: err instanceof Error ? err.message : 'Could not allocate a payment reference.',
    };
  }

  const membershipTypes =
    productType === 'membership_annual'
      ? (['membership_annual', 'verification_annual'] as const)
      : ([productType] as const);

  const { data: existing, error: existingError } = await supabase
    .from('organization_payments')
    .select('*')
    .eq('organization_id', input.organizationId)
    .eq('status', 'pending')
    .in('product_type', [...membershipTypes])
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (existingError) {
    return {
      payment: null,
      reference,
      error: captureError(existingError, { where: 'createPendingBankPayment.existing' }),
    };
  }

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

  if (error) {
    return {
      payment: null,
      reference,
      error: captureError(error, { where: 'createPendingBankPayment.insert' }),
    };
  }
  if (!data) {
    return {
      payment: null,
      reference,
      error: captureError(new Error('Payment was created but the record could not be loaded. Refresh before requesting again.'), {
        where: 'createPendingBankPayment.insertEmpty',
      }),
    };
  }
  return { payment: data as OrganizationPayment, reference, error: null };
}

/** Bank transfer instructions shown in CRM */
/**
 * NGO says the bank transfer has been sent. Stamps customer_reported_paid_at
 * and raises a staff task; the payment stays pending until staff match it.
 */
export async function reportBankTransferSent(
  paymentId: string,
): Promise<{ payment: OrganizationPayment | null; error: string | null }> {
  const { data, error } = await supabase.rpc('report_bank_transfer_sent', {
    p_payment_id: paymentId,
  });
  if (error) {
    return { payment: null, error: captureError(error, { where: 'reportBankTransferSent' }) };
  }
  const payment = (Array.isArray(data) ? data[0] : data) as OrganizationPayment | undefined;
  return { payment: payment ?? null, error: null };
}

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
