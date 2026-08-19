import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import { useOrganization, useContacts, useVerificationCriteria, useBadges, useActivityLog } from '../../hooks/useSupabase';
import { OrgTrustStatusBadge, CriterionStatus, FormField, Modal } from '../../components/ui';
import {
  DEFAULT_CRITERIA,
  FINANCIAL_CRITERIA,
  CATEGORIES,
  OUTREACH_STATUS_LABELS,
  REGISTRY_SOURCE_LABELS,
} from '../../types';
import {
  getTrustStageDescription,
  getTrustStageLabel,
  getTrustStageOptions,
  getTrustStageQuickActions,
  orgToTrustStage,
  trustStageToFields,
  type OrgTrustStage,
} from '../../lib/orgTrustStatus';
import { isPublicCriterion, isMemberCriterion } from '../../lib/criteria';
import type { OutreachStatus } from '../../types';
import { hasRegistryProvenance, OUTREACH_KANBAN_STATUSES } from '../../types';
import OrgOriginChip from '../../components/crm/OrgOriginChip';
import RegistryMatchCheck from '../../components/crm/RegistryMatchCheck';
import { markRegisteredInbound, registerAsCustomer, setOutreachStatus } from '../../lib/crmOutreach';
import { FINANCIAL_VERIFICATION_ENABLED } from '../../config/features';
import FinancialComingSoon from '../../components/FinancialComingSoon';
import OrganizationEngagements from '../../components/crm/OrganizationEngagements';
import OrganizationPortalMembers from '../../components/crm/OrganizationPortalMembers';
import OrganizationPayments from '../../components/crm/OrganizationPayments';
import { updateCriterionStatuses, tryAutoVerifyOrganization, allPublicCriteriaPass } from '../../lib/verification';
import { publicCriteriaScore } from '../../lib/criteria';
import { ArrowLeft, Globe, Mail, Phone, MapPin, CreditCard as Edit3, Save, X, Shield, Clock, User, Plus, Trash2, Award, CheckCheck } from 'lucide-react';

export default function OrganizationDetail() {
  const { id } = useParams<{ id: string }>();
  const { organization, loading, refetch: refetchOrganization } = useOrganization(id);
  const { contacts, loading: contactsLoading } = useContacts(id);
  const { criteria, loading: criteriaLoading, refetch: refetchCriteria, setCriteria } = useVerificationCriteria(id);
  const { badges, loading: badgesLoading } = useBadges(id);
  const { entries, loading: logLoading } = useActivityLog(id);

  const [editing, setEditing] = useState(false);
  const [editForm, setEditForm] = useState(organization || null);
  const [contactModal, setContactModal] = useState(false);
  const [contactForm, setContactForm] = useState({ name: '', role: '', email: '', phone: '', is_primary: false, notes: '' });
  const [criteriaBusy, setCriteriaBusy] = useState(false);
  const [verifyNotice, setVerifyNotice] = useState<string | null>(null);

  useEffect(() => {
    if (organization) setEditForm(organization);
  }, [organization]);

  const handleSave = async () => {
    if (!editForm || !id) return;
    await supabase.from('organizations').update({
      ...editForm,
      updated_at: new Date().toISOString(),
    }).eq('id', id);
    setEditing(false);
    window.location.reload();
  };

  const handleTrustStageChange = async (stage: OrgTrustStage) => {
    if (!id) return;
    const { status, verification_level } = trustStageToFields(stage);
    const label = getTrustStageLabel(stage);
    await supabase
      .from('organizations')
      .update({ status, verification_level, updated_at: new Date().toISOString() })
      .eq('id', id);
    await supabase.from('activity_log').insert({
      organization_id: id,
      action: 'trust_stage_change',
      description: `Trust stage set to ${label}`,
      performed_by: 'admin',
    });
    // Create staff notification for trust stage change
    await supabase.rpc('notify_staff_system', {
      p_organization_id: id,
      p_action: 'trust_stage_change',
      p_description: `Trust stage changed to ${label}`,
      p_link_path: `/organizations/${id}`,
    });
    window.location.reload();
  };

  const handleOutreachChange = async (outreach: OutreachStatus) => {
    if (!id) return;
    if (outreach === 'registered' || outreach === 'responded') {
      await markRegisteredInbound(id);
    } else {
      await setOutreachStatus(id, outreach);
    }
    window.location.reload();
  };

  const handleRegisterAsCustomer = async () => {
    if (!id || !organization) return;
    if (!confirm(`Register "${organization.name}" as a customer?`)) return;
    await registerAsCustomer(id);
    window.location.reload();
  };

  const handleDeleteOrganization = async () => {
    if (!id || !organization) return;
    if (!confirm(`DELETE "${organization.name}"?\n\nThis will permanently remove the organization and all its data (contacts, criteria, badges, activity log, payments, engagements).\n\nThis cannot be undone.`)) return;
    await supabase.from('organizations').delete().eq('id', id);
    window.location.href = '/organizations';
  };

  const handleAddContact = async () => {
    if (!id) return;
    await supabase.from('contacts').insert({
      organization_id: id,
      ...contactForm,
    });
    setContactModal(false);
    setContactForm({ name: '', role: '', email: '', phone: '', is_primary: false, notes: '' });
    window.location.reload();
  };

  const handleDeleteContact = async (contactId: string) => {
    await supabase.from('contacts').delete().eq('id', contactId);
    window.location.reload();
  };

  const applyCriteriaUpdates = async (
    updates: { id: string; status: 'pass' | 'fail' | 'pending' }[],
  ) => {
    if (!id || !organization || updates.length === 0) return;
    setCriteriaBusy(true);
    setVerifyNotice(null);

    const evaluatedAt = new Date().toISOString();
    setCriteria((prev) =>
      prev.map((c) => {
        const u = updates.find((x) => x.id === c.id);
        return u ? { ...c, status: u.status, evaluated_at: evaluatedAt } : c;
      }),
    );

    const { error } = await updateCriterionStatuses(updates);
    if (error) {
      setVerifyNotice(error);
      await refetchCriteria();
      setCriteriaBusy(false);
      return;
    }

    const merged = criteria.map((c) => {
      const u = updates.find((x) => x.id === c.id);
      return u ? { ...c, status: u.status, evaluated_at: evaluatedAt } : c;
    });

    if (allPublicCriteriaPass(merged)) {
      const result = await tryAutoVerifyOrganization(id, merged, organization);
      setVerifyNotice(result.message);
      if (result.verified) {
        await refetchOrganization();
        await refetchCriteria();
      }
    }

    setCriteriaBusy(false);
  };

  const handleCriterionStatus = (criterionId: string, newStatus: 'pass' | 'fail' | 'pending') => {
    applyCriteriaUpdates([{ id: criterionId, status: newStatus }]);
  };

  const handlePassAllPublic = () => {
    const pub = criteria.filter(isPublicCriterion);
    applyCriteriaUpdates(pub.map((c) => ({ id: c.id, status: 'pass' as const })));
  };

  const handleResetPublicPending = () => {
    const pub = criteria.filter(isPublicCriterion);
    applyCriteriaUpdates(pub.map((c) => ({ id: c.id, status: 'pending' as const })));
  };

  const handleInitializeCriteria = async () => {
    if (!id) return;
    const rows = DEFAULT_CRITERIA.map((c) => ({
      organization_id: id,
      ...c,
    }));
    await supabase.from('verification_criteria').insert(rows);
    window.location.reload();
  };

  const handleInitializeFinancialCriteria = async () => {
    if (!id) return;
    const rows = FINANCIAL_CRITERIA.map((c) => ({
      organization_id: id,
      ...c,
    }));
    await supabase.from('verification_criteria').insert(rows);
    window.location.reload();
  };

  const handleIssueBadge = async () => {
    if (!id || !organization) return;
    const count = (await supabase.from('verification_badges').select('id', { count: 'exact' }).eq('organization_id', id)).count || 0;
    const verificationId = `REAL-${new Date().getFullYear()}-${String(count + 1).padStart(3, '0')}`;
    await supabase.from('verification_badges').insert({
      organization_id: id,
      verification_id: verificationId,
      level: organization.verification_level === 'none' ? 'basic' : organization.verification_level,
      issued_at: new Date().toISOString(),
      expires_at: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(),
      is_active: true,
    });
    await supabase.from('activity_log').insert({
      organization_id: id,
      action: 'badge_issued',
      description: `Badge issued: ${verificationId}`,
      performed_by: 'admin',
    });
    window.location.reload();
  };

  const handleRevokeBadge = async (badgeId: string, verificationId: string) => {
    if (!id || !organization) return;
    if (!window.confirm(`Revoke badge ${verificationId}? This removes public verified status if no other active badge remains.`)) return;
    await supabase.from('verification_badges').update({ is_active: false }).eq('id', badgeId);
    const { count: activeCount } = await supabase
      .from('verification_badges')
      .select('id', { count: 'exact', head: true })
      .eq('organization_id', id)
      .eq('is_active', true);
    if ((activeCount ?? 0) === 0) {
      const nextStatus = organization.source_registry ? 'listed' : 'onboarding';
      await supabase
        .from('organizations')
        .update({ verification_level: 'none', status: nextStatus })
        .eq('id', id);
    }
    await supabase.from('activity_log').insert({
      organization_id: id,
      action: 'badge_revoked',
      description: `Badge revoked: ${verificationId}`,
      performed_by: 'admin',
    });
    window.location.reload();
  };

  if (loading) return <div className="text-center py-16 font-mono text-sm text-ink-400">Loading...</div>;
  if (!organization) return <div className="text-center py-16 font-mono text-sm text-ink-400">Organization not found</div>;

  const publicCriteria = criteria.filter(isPublicCriterion);
  const memberCriteria = criteria.filter(isMemberCriterion);
  const financialCriteriaList = criteria.filter((c) => FINANCIAL_CRITERIA.some((f) => f.criterion_key === c.criterion_key));
  const hasFinancialCriteria = financialCriteriaList.length > 0;
  const publicScore = publicCriteriaScore(criteria);
  const publicReady = allPublicCriteriaPass(criteria);
  const financialScore = financialCriteriaList.length > 0 ? Math.round((financialCriteriaList.filter((c) => c.status === 'pass').length / financialCriteriaList.length) * 100) : 0;

  return (
    <div className="max-w-6xl mx-auto min-w-0 w-full">
      {/* Back */}
      <Link to="/organizations" className="inline-flex items-center gap-2 font-mono text-2xs uppercase tracking-wider text-ink-500 hover:text-ink-950 transition-colors mb-6">
        <ArrowLeft size={14} /> Back to Organizations
      </Link>

      {/* Header */}
      <div className="card-brutal p-4 sm:p-6 mb-6 overflow-hidden">
        <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
          <div className="flex items-start gap-3 sm:gap-4 min-w-0 flex-1">
            <div className="flex h-12 w-12 sm:h-14 sm:w-14 items-center justify-center border-3 border-ink-950 bg-ink-50 font-mono text-lg sm:text-xl font-black text-ink-600 shrink-0">
              {organization.name.charAt(0)}
            </div>
            <div className="min-w-0 flex-1">
              <h1 className="text-lg sm:text-2xl font-black uppercase tracking-tight break-words">{organization.name}</h1>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <OrgTrustStatusBadge org={organization} />
                <OrgOriginChip
                  sourceRegistry={organization.source_registry}
                  registrationNumber={organization.charity_registration_number}
                />
              </div>
            </div>
          </div>
          <div className="flex flex-wrap gap-2 w-full md:w-auto shrink-0">
            {!editing ? (
              <>
                <button
                  type="button"
                  onClick={handleDeleteOrganization}
                  className="btn-brutal-outline text-sm flex items-center justify-center gap-2 min-h-[44px] flex-1 sm:flex-none border-accent text-accent hover:bg-accent/5"
                >
                  <Trash2 size={14} /> Delete
                </button>
                <button onClick={() => setEditing(true)} className="btn-brutal-outline text-sm flex items-center justify-center gap-2 min-h-[44px] flex-1 sm:flex-none">
                  <Edit3 size={14} /> Edit
                </button>
              </>
            ) : (
              <>
                <button onClick={handleSave} className="btn-brutal-teal text-sm flex items-center gap-2">
                  <Save size={14} /> Save
                </button>
                <button onClick={() => { setEditing(false); setEditForm(organization); }} className="btn-brutal-outline text-sm flex items-center gap-2">
                  <X size={14} /> Cancel
                </button>
              </>
            )}
          </div>
        </div>

        {hasRegistryProvenance(organization) ? (
          <div className="mt-6 border-t-3 border-ink-950 pt-6">
            <div className="label-brutal">Origin — registry import</div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-3 text-sm">
              <div>
                <span className="font-mono text-2xs uppercase tracking-wider text-ink-400">Source</span>
                <p>{REGISTRY_SOURCE_LABELS[organization.source_registry] || organization.source_registry}</p>
              </div>
              {organization.charity_registration_number && (
                <div>
                  <span className="font-mono text-2xs uppercase tracking-wider text-ink-400">Registration</span>
                  <p className="font-mono">{organization.charity_registration_number}</p>
                </div>
              )}
              {organization.registry_url && (
                <div className="md:col-span-2">
                  <a href={organization.registry_url} target="_blank" rel="noopener noreferrer" className="text-teal hover:underline text-sm">
                    View on official register
                  </a>
                </div>
              )}
            </div>
            {organization.claimed_at && (
              <p className="text-xs text-ink-600 mt-3">
                Claimed through the NGO portal on {new Date(organization.claimed_at).toLocaleDateString()} — the
                accounts managing it are listed under Portal members below.
              </p>
            )}
            {organization.status === 'listed' && (
              <div className="flex flex-col sm:flex-row gap-3 mt-4">
                <div className="flex-1 min-w-0">
                  <label className="label-brutal">Outreach status</label>
                  <select
                    className="input-brutal w-full mt-1 text-base"
                    value={organization.outreach_status}
                    onChange={(e) => handleOutreachChange(e.target.value as OutreachStatus)}
                    disabled={organization.is_customer}
                  >
                    {[...OUTREACH_KANBAN_STATUSES, 'registered' as const, 'declined' as const].map((k) => (
                      <option key={k} value={k}>
                        {OUTREACH_STATUS_LABELS[k]}
                      </option>
                    ))}
                    {organization.is_customer && (
                      <option value="not_applicable">{OUTREACH_STATUS_LABELS.not_applicable}</option>
                    )}
                  </select>
                </div>
                {!organization.is_customer && (
                  <div className="flex items-end">
                    <button
                      type="button"
                      onClick={handleRegisterAsCustomer}
                      className="btn-brutal-accent w-full sm:w-auto text-sm min-h-[44px]"
                    >
                      Register as customer
                    </button>
                  </div>
                )}
              </div>
            )}
            <p className="text-2xs text-ink-400 mt-3 font-mono">
              Public profile: /public/org/{organization.slug}
            </p>
          </div>
        ) : (
          <div className="mt-6 border-t-3 border-ink-950 pt-6">
            <div className="label-brutal">Origin — new submission</div>
            <p className="text-xs text-ink-600 mt-2">
              {organization.claimed_at
                ? `Self-submitted through the NGO portal on ${new Date(organization.claimed_at).toLocaleDateString()} — not linked to a registry import.`
                : 'Added manually in the CRM — not linked to a registry import.'}
            </p>
            <div className="mt-3">
              <RegistryMatchCheck organizationId={organization.id} organizationName={organization.name} />
            </div>
            <p className="text-2xs text-ink-400 mt-3 font-mono">
              Public profile: /public/org/{organization.slug}
            </p>
          </div>
        )}

        {/* Details */}
        {editing ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-6 border-t-3 border-ink-950 pt-6">
            <FormField label="Name">
              <input className="input-brutal w-full" value={editForm?.name || ''} onChange={(e) => setEditForm({ ...editForm!, name: e.target.value })} />
            </FormField>
            <FormField label="Category">
              <select className="input-brutal w-full" value={editForm?.category || ''} onChange={(e) => setEditForm({ ...editForm!, category: e.target.value })}>
                <option value="">Select category</option>
                {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </FormField>
            <FormField label="Location">
              <input className="input-brutal w-full" value={editForm?.location || ''} onChange={(e) => setEditForm({ ...editForm!, location: e.target.value })} />
            </FormField>
            <FormField label="Website">
              <input className="input-brutal w-full" value={editForm?.website_url || ''} onChange={(e) => setEditForm({ ...editForm!, website_url: e.target.value })} />
            </FormField>
            <FormField label="Email">
              <input className="input-brutal w-full" value={editForm?.email || ''} onChange={(e) => setEditForm({ ...editForm!, email: e.target.value })} />
            </FormField>
            <FormField label="Phone">
              <input className="input-brutal w-full" value={editForm?.phone || ''} onChange={(e) => setEditForm({ ...editForm!, phone: e.target.value })} />
            </FormField>
            <FormField label="Trust stage">
              <select
                className="input-brutal w-full"
                value={editForm ? orgToTrustStage(editForm) : 'onboarding'}
                onChange={(e) => {
                  const fields = trustStageToFields(e.target.value as OrgTrustStage);
                  setEditForm({ ...editForm!, ...fields });
                }}
              >
                {getTrustStageOptions().map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
              <p className="mt-2 font-mono text-2xs text-ink-500 leading-snug">
                {editForm ? getTrustStageDescription(orgToTrustStage(editForm)) : ''}
              </p>
            </FormField>
            <div className="md:col-span-2">
              <FormField label="Description">
                <textarea className="input-brutal w-full h-24" value={editForm?.description || ''} onChange={(e) => setEditForm({ ...editForm!, description: e.target.value })} />
              </FormField>
            </div>
            <div className="md:col-span-2">
              <FormField label="Mission Statement">
                <textarea className="input-brutal w-full h-24" value={editForm?.mission_statement || ''} onChange={(e) => setEditForm({ ...editForm!, mission_statement: e.target.value })} />
              </FormField>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-6 border-t-3 border-ink-950 pt-6">
            <div>
              <div className="label-brutal">Description</div>
              <p className="text-sm text-ink-700 leading-relaxed">{organization.description || 'No description provided'}</p>
            </div>
            <div>
              <div className="label-brutal">Mission Statement</div>
              <p className="text-sm text-ink-700 leading-relaxed">{organization.mission_statement || 'No mission statement provided'}</p>
            </div>
            <div className="flex flex-col gap-3">
              {organization.website_url && (
                <div className="flex items-center gap-2 text-sm">
                  <Globe size={14} className="text-ink-400" />
                  <a href={organization.website_url} target="_blank" rel="noopener noreferrer" className="text-teal hover:underline">{organization.website_url}</a>
                </div>
              )}
              {organization.email && (
                <div className="flex items-center gap-2 text-sm">
                  <Mail size={14} className="text-ink-400" />
                  <span>{organization.email}</span>
                </div>
              )}
              {organization.phone && (
                <div className="flex items-center gap-2 text-sm">
                  <Phone size={14} className="text-ink-400" />
                  <span>{organization.phone}</span>
                </div>
              )}
              {organization.location && (
                <div className="flex items-center gap-2 text-sm">
                  <MapPin size={14} className="text-ink-400" />
                  <span>{organization.location}</span>
                </div>
              )}
            </div>
            <div>
              <div className="label-brutal">Change trust stage</div>
              <p className="text-2xs text-ink-500 mt-1 mb-2 leading-snug">
                One setting for pipeline and public trust. Issuing the NGOreality badge also happens when
                public criteria pass below.
              </p>
              <div className="flex flex-wrap gap-2 mt-2">
                {getTrustStageQuickActions(organization).map((stage) => (
                  <button
                    key={stage.value}
                    type="button"
                    onClick={() => handleTrustStageChange(stage.value)}
                    className="btn-brutal-outline text-2xs py-1.5 px-3"
                  >
                    {stage.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Verification Criteria */}
        <div className="lg:col-span-2 space-y-4">
          {/* Public trust standards (badge gate) */}
          <div className="card-brutal">
            <div className="flex items-center justify-between border-b-3 border-ink-950 px-6 py-4">
              <h3 className="font-mono text-xs uppercase tracking-wider font-semibold flex items-center gap-2">
                <Shield size={14} /> Public trust standards
              </h3>
              <div className="flex items-center gap-3 flex-wrap justify-end">
                <span className="font-mono text-sm font-black">{publicScore}%</span>
                {publicCriteria.length > 0 && (
                  <>
                    <button
                      type="button"
                      disabled={criteriaBusy}
                      onClick={handlePassAllPublic}
                      className="btn-brutal-teal text-2xs py-1.5 px-3 flex items-center gap-1 min-h-[36px] disabled:opacity-50"
                    >
                      <CheckCheck size={12} /> Pass all
                    </button>
                    <button
                      type="button"
                      disabled={criteriaBusy}
                      onClick={handleResetPublicPending}
                      className="btn-brutal-outline text-2xs py-1.5 px-3 min-h-[36px] disabled:opacity-50"
                    >
                      Reset pending
                    </button>
                  </>
                )}
                {criteria.length === 0 && (
                  <button onClick={handleInitializeCriteria} className="btn-brutal-outline text-2xs py-1.5 px-3 flex items-center gap-1">
                    <Plus size={12} /> Initialize
                  </button>
                )}
              </div>
            </div>
            <div className="border-b border-ink-100 px-6 py-2 bg-amber-50 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
              <span className="font-mono text-2xs text-amber-700 uppercase tracking-wider">
                {publicReady
                  ? 'Standards met → record $100 membership to issue badge + monitoring alerts'
                  : 'All public standards must pass before badge (outreach-safe checklist)'}
              </span>
              {criteriaBusy && <span className="font-mono text-2xs text-ink-500">Saving…</span>}
              {verifyNotice && !criteriaBusy && (
                <span className="font-mono text-2xs text-teal">{verifyNotice}</span>
              )}
            </div>
            <div className="divide-y divide-ink-100">
              {criteriaLoading ? (
                <div className="px-6 py-4 font-mono text-xs text-ink-400">Loading...</div>
              ) : publicCriteria.length === 0 ? (
                <div className="px-6 py-6 text-center text-sm text-ink-400">No criteria. Click Initialize.</div>
              ) : (
                publicCriteria.map((c) => (
                  <div key={c.id} className="flex items-center justify-between px-6 py-3">
                    <div className="flex-1">
                      <div className="text-sm font-medium">{c.criterion_label}</div>
                      {c.notes && <div className="font-mono text-2xs text-ink-400 mt-0.5">{c.notes}</div>}
                    </div>
                    <div className="flex items-center gap-2">
                      <CriterionStatus status={c.status} />
                      <div className="flex border-2 border-ink-200">
                        {(['pass', 'fail', 'pending'] as const).map((s) => (
                          <button
                            key={s}
                            type="button"
                            disabled={criteriaBusy}
                            onClick={() => handleCriterionStatus(c.id, s)}
                            className={`px-2 py-1 font-mono text-2xs uppercase tracking-wider transition-colors min-h-[36px] disabled:opacity-50
                              ${c.status === s
                                ? s === 'pass' ? 'bg-teal text-white' : s === 'fail' ? 'bg-accent text-white' : 'bg-ink-200 text-ink-700'
                                : 'bg-white text-ink-400 hover:bg-ink-50'
                              }`}
                          >
                            {s}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Member-only standards (portal after login — not for public marketing) */}
          <div className="card-brutal">
            <div className="flex items-center justify-between border-b-3 border-ink-950 px-6 py-4">
              <h3 className="font-mono text-xs uppercase tracking-wider font-semibold flex items-center gap-2">
                <Shield size={14} /> Member security checklist
              </h3>
              <span className="font-mono text-2xs text-ink-400 uppercase">Portal only</span>
            </div>
            <div className="border-b border-ink-100 px-6 py-2 bg-ink-50">
              <span className="font-mono text-2xs text-ink-500 uppercase tracking-wider">
                Repository, security baseline, credentials — not shown on public directory
              </span>
            </div>
            <div className="divide-y divide-ink-100">
              {memberCriteria.length === 0 ? (
                <div className="px-6 py-4 text-sm text-ink-400">Initialize criteria to add member checklist.</div>
              ) : (
                memberCriteria.map((c) => (
                  <div key={c.id} className="flex items-center justify-between px-6 py-3">
                    <div className="flex-1 text-sm font-medium">{c.criterion_label}</div>
                    <div className="flex items-center gap-2">
                      <CriterionStatus status={c.status} />
                      <div className="flex border-2 border-ink-200">
                        {(['pass', 'fail', 'pending'] as const).map((s) => (
                          <button
                            key={s}
                            type="button"
                            disabled={criteriaBusy}
                            onClick={() => handleCriterionStatus(c.id, s)}
                            className={`px-2 py-1 font-mono text-2xs uppercase min-h-[36px] disabled:opacity-50
                              ${c.status === s ? (s === 'pass' ? 'bg-teal text-white' : s === 'fail' ? 'bg-accent text-white' : 'bg-ink-200') : 'bg-white text-ink-400'}`}
                          >
                            {s}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {FINANCIAL_VERIFICATION_ENABLED ? (
          /* Financial Criteria — preserved for launch; hidden via FINANCIAL_VERIFICATION_ENABLED */
          <div className="card-brutal">
            <div className="flex items-center justify-between border-b-3 border-ink-950 px-6 py-4">
              <h3 className="font-mono text-xs uppercase tracking-wider font-semibold flex items-center gap-2">
                <Award size={14} /> Transparent Financial Criteria
              </h3>
              <div className="flex items-center gap-3">
                {hasFinancialCriteria && <span className="font-mono text-sm font-black">{financialScore}%</span>}
                {!hasFinancialCriteria && (
                  <button onClick={handleInitializeFinancialCriteria} className="btn-brutal-outline text-2xs py-1.5 px-3 flex items-center gap-1">
                    <Plus size={12} /> Add Financial Criteria
                  </button>
                )}
              </div>
            </div>
            <div className="border-b border-ink-100 px-6 py-2 bg-teal-light">
              <span className="font-mono text-2xs text-teal uppercase tracking-wider">Financial transparency — requires verified tier first</span>
            </div>
            <div className="divide-y divide-ink-100">
              {!hasFinancialCriteria ? (
                <div className="px-6 py-6 text-center text-sm text-ink-400">No financial criteria. Click Add Financial Criteria to begin evaluation.</div>
              ) : (
                financialCriteriaList.map((c) => (
                  <div key={c.id} className="flex items-center justify-between px-6 py-3">
                    <div className="flex-1">
                      <div className="text-sm font-medium">{c.criterion_label}</div>
                      {c.notes && <div className="font-mono text-2xs text-ink-400 mt-0.5">{c.notes}</div>}
                    </div>
                    <div className="flex items-center gap-2">
                      <CriterionStatus status={c.status} />
                      <div className="flex border-2 border-ink-200">
                        {(['pass', 'fail', 'pending'] as const).map((s) => (
                          <button
                            key={s}
                            type="button"
                            disabled={criteriaBusy}
                            onClick={() => handleCriterionStatus(c.id, s)}
                            className={`px-2 py-1 font-mono text-2xs uppercase tracking-wider transition-colors min-h-[36px] disabled:opacity-50
                              ${c.status === s
                                ? s === 'pass' ? 'bg-teal text-white' : s === 'fail' ? 'bg-accent text-white' : 'bg-ink-200 text-ink-700'
                                : 'bg-white text-ink-400 hover:bg-ink-50'
                              }`}
                          >
                            {s}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
          ) : (
            <FinancialComingSoon variant="crm" />
          )}
        </div>

        {/* Right column */}
        <div className="space-y-6">
          {id && <OrganizationPortalMembers organizationId={id} />}
          {id && <OrganizationEngagements organizationId={id} />}
          {id && organization && (
            <OrganizationPayments
              organizationId={id}
              organizationName={organization.name}
              paymentReference={organization.payment_reference}
            />
          )}

          {/* Contacts */}
          <div className="card-brutal">
            <div className="flex items-center justify-between border-b-3 border-ink-950 px-6 py-4">
              <h3 className="font-mono text-xs uppercase tracking-wider font-semibold flex items-center gap-2">
                <User size={14} /> Contacts
              </h3>
              <button onClick={() => setContactModal(true)} className="btn-brutal-outline text-2xs py-1.5 px-3 flex items-center gap-1">
                <Plus size={12} /> Add
              </button>
            </div>
            <div className="divide-y divide-ink-100">
              {contactsLoading ? (
                <div className="px-6 py-4 font-mono text-xs text-ink-400">Loading...</div>
              ) : contacts.length === 0 ? (
                <div className="px-6 py-6 text-center text-sm text-ink-400">No contacts</div>
              ) : (
                contacts.map((c) => (
                  <div key={c.id} className="flex items-start justify-between px-6 py-3">
                    <div>
                      <div className="text-sm font-medium flex items-center gap-2">
                        {c.name}
                        {c.is_primary && <span className="badge-verified text-2xs py-0">Primary</span>}
                      </div>
                      <div className="font-mono text-2xs text-ink-400">{c.role}</div>
                      <div className="font-mono text-2xs text-ink-400">{c.email}</div>
                    </div>
                    <button onClick={() => handleDeleteContact(c.id)} className="text-ink-300 hover:text-accent transition-colors">
                      <Trash2 size={14} />
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Badges */}
          <div className="card-brutal">
            <div className="flex items-center justify-between border-b-3 border-ink-950 px-6 py-4">
              <h3 className="font-mono text-xs uppercase tracking-wider font-semibold flex items-center gap-2">
                <Award size={14} /> Badges
              </h3>
              <button onClick={handleIssueBadge} className="btn-brutal-outline text-2xs py-1.5 px-3 flex items-center gap-1">
                <Plus size={12} /> Issue
              </button>
            </div>
            <div className="divide-y divide-ink-100">
              {badgesLoading ? (
                <div className="px-6 py-4 font-mono text-xs text-ink-400">Loading...</div>
              ) : badges.length === 0 ? (
                <div className="px-6 py-6 text-center text-sm text-ink-400">No badges issued</div>
              ) : (
                badges.map((b) => (
                  <div key={b.id} className="px-6 py-3">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-mono text-xs font-bold">{b.verification_id}</span>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className={`font-mono text-2xs uppercase tracking-wider ${b.is_active ? 'text-teal' : 'text-ink-400'}`}>
                          {b.is_active ? 'Active' : 'Inactive'}
                        </span>
                        {b.is_active && (
                          <button
                            type="button"
                            onClick={() => handleRevokeBadge(b.id, b.verification_id)}
                            className="btn-brutal-outline text-2xs py-1 px-2"
                          >
                            Revoke
                          </button>
                        )}
                      </div>
                    </div>
                    <div className="font-mono text-2xs text-ink-400 mt-0.5">
                      {b.level} &middot; Issued {new Date(b.issued_at).toLocaleDateString()}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Activity Log */}
          <div className="card-brutal">
            <div className="border-b-3 border-ink-950 px-6 py-4">
              <h3 className="font-mono text-xs uppercase tracking-wider font-semibold flex items-center gap-2">
                <Clock size={14} /> Activity
              </h3>
            </div>
            <div className="divide-y divide-ink-100 max-h-64 overflow-y-auto">
              {logLoading ? (
                <div className="px-6 py-4 font-mono text-xs text-ink-400">Loading...</div>
              ) : entries.length === 0 ? (
                <div className="px-6 py-6 text-center text-sm text-ink-400">No activity</div>
              ) : (
                entries.map((e) => (
                  <div key={e.id} className="px-6 py-3">
                    <div className="text-xs font-medium">{e.description}</div>
                    <div className="font-mono text-2xs text-ink-400 mt-0.5">
                      {e.action} &middot; {new Date(e.created_at).toLocaleDateString()}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Add Contact Modal */}
      <Modal open={contactModal} onClose={() => setContactModal(false)} title="Add Contact">
        <FormField label="Name">
          <input className="input-brutal w-full" value={contactForm.name} onChange={(e) => setContactForm({ ...contactForm, name: e.target.value })} />
        </FormField>
        <FormField label="Role">
          <input className="input-brutal w-full" value={contactForm.role} onChange={(e) => setContactForm({ ...contactForm, role: e.target.value })} />
        </FormField>
        <FormField label="Email">
          <input className="input-brutal w-full" type="email" value={contactForm.email} onChange={(e) => setContactForm({ ...contactForm, email: e.target.value })} />
        </FormField>
        <FormField label="Phone">
          <input className="input-brutal w-full" value={contactForm.phone} onChange={(e) => setContactForm({ ...contactForm, phone: e.target.value })} />
        </FormField>
        <div className="flex items-center gap-2 mb-4">
          <input
            type="checkbox"
            id="is_primary"
            checked={contactForm.is_primary}
            onChange={(e) => setContactForm({ ...contactForm, is_primary: e.target.checked })}
            className="h-4 w-4 border-2 border-ink-950"
          />
          <label htmlFor="is_primary" className="text-sm">Primary contact</label>
        </div>
        <FormField label="Notes">
          <textarea className="input-brutal w-full h-20" value={contactForm.notes} onChange={(e) => setContactForm({ ...contactForm, notes: e.target.value })} />
        </FormField>
        <button onClick={handleAddContact} className="btn-brutal w-full">Add Contact</button>
      </Modal>
    </div>
  );
}
