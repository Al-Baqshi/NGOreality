import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import { useOrganization, useContacts, useVerificationCriteria, useBadges, useActivityLog } from '../../hooks/useSupabase';
import { StatusPill, VerificationBadge, CriterionStatus, FormField, Modal } from '../../components/ui';
import {
  DEFAULT_CRITERIA,
  FINANCIAL_CRITERIA,
  CATEGORIES,
  ORG_STATUS_LABELS,
  VERIFICATION_LEVEL_LABELS,
  OUTREACH_STATUS_LABELS,
  REGISTRY_SOURCE_LABELS,
} from '../../types';
import type { OrgStatus, VerificationLevel, OutreachStatus } from '../../types';
import { isRegistryListed } from '../../types';
import { FINANCIAL_VERIFICATION_ENABLED, getVerificationLevelOptions } from '../../config/features';
import FinancialComingSoon from '../../components/FinancialComingSoon';
import { ArrowLeft, Globe, Mail, Phone, MapPin, CreditCard as Edit3, Save, X, Shield, Clock, User, Plus, Trash2, Award } from 'lucide-react';

export default function OrganizationDetail() {
  const { id } = useParams<{ id: string }>();
  const { organization, loading } = useOrganization(id);
  const { contacts, loading: contactsLoading } = useContacts(id);
  const { criteria, loading: criteriaLoading } = useVerificationCriteria(id);
  const { badges, loading: badgesLoading } = useBadges(id);
  const { entries, loading: logLoading } = useActivityLog(id);

  const [editing, setEditing] = useState(false);
  const [editForm, setEditForm] = useState(organization || null);
  const [contactModal, setContactModal] = useState(false);
  const [contactForm, setContactForm] = useState({ name: '', role: '', email: '', phone: '', is_primary: false, notes: '' });

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

  const handleStatusChange = async (newStatus: OrgStatus) => {
    if (!id) return;
    await supabase.from('organizations').update({ status: newStatus, updated_at: new Date().toISOString() }).eq('id', id);
    await supabase.from('activity_log').insert({
      organization_id: id,
      action: 'status_change',
      description: `Status changed to ${ORG_STATUS_LABELS[newStatus]}`,
      performed_by: 'admin',
    });
    window.location.reload();
  };

  const handleOutreachChange = async (outreach: OutreachStatus) => {
    if (!id) return;
    await supabase
      .from('organizations')
      .update({ outreach_status: outreach, updated_at: new Date().toISOString() })
      .eq('id', id);
    await supabase.from('activity_log').insert({
      organization_id: id,
      action: 'outreach_updated',
      description: `Outreach: ${OUTREACH_STATUS_LABELS[outreach]}`,
      performed_by: 'staff',
    });
    window.location.reload();
  };

  const handleBeginVerification = async () => {
    if (!id) return;
    await supabase
      .from('organizations')
      .update({
        status: 'onboarding',
        onboarding_stage: 'intake',
        outreach_status: 'responded',
        updated_at: new Date().toISOString(),
      })
      .eq('id', id);
    const { count } = await supabase
      .from('verification_criteria')
      .select('id', { count: 'exact', head: true })
      .eq('organization_id', id);
    if (!count) {
      await supabase.from('verification_criteria').insert(
        DEFAULT_CRITERIA.map((c) => ({ organization_id: id, ...c })),
      );
    }
    await supabase.from('activity_log').insert({
      organization_id: id,
      action: 'verification_started',
      description: 'Moved from registry listing to NGOreality verification onboarding',
      performed_by: 'staff',
    });
    window.location.reload();
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

  const handleCriterionStatus = async (criterionId: string, newStatus: 'pass' | 'fail' | 'pending') => {
    await supabase.from('verification_criteria').update({
      status: newStatus,
      evaluated_at: new Date().toISOString(),
    }).eq('id', criterionId);
    window.location.reload();
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

  if (loading) return <div className="text-center py-16 font-mono text-sm text-ink-400">Loading...</div>;
  if (!organization) return <div className="text-center py-16 font-mono text-sm text-ink-400">Organization not found</div>;

  const baseCriteria = criteria.filter((c) => DEFAULT_CRITERIA.some((d) => d.criterion_key === c.criterion_key));
  const financialCriteriaList = criteria.filter((c) => FINANCIAL_CRITERIA.some((f) => f.criterion_key === c.criterion_key));
  const hasFinancialCriteria = financialCriteriaList.length > 0;
  const baseScore = baseCriteria.length > 0 ? Math.round((baseCriteria.filter((c) => c.status === 'pass').length / baseCriteria.length) * 100) : 0;
  const financialScore = financialCriteriaList.length > 0 ? Math.round((financialCriteriaList.filter((c) => c.status === 'pass').length / financialCriteriaList.length) * 100) : 0;

  return (
    <div className="max-w-6xl mx-auto">
      {/* Back */}
      <Link to="/organizations" className="inline-flex items-center gap-2 font-mono text-2xs uppercase tracking-wider text-ink-500 hover:text-ink-950 transition-colors mb-6">
        <ArrowLeft size={14} /> Back to Organizations
      </Link>

      {/* Header */}
      <div className="card-brutal p-6 mb-6">
        <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
          <div className="flex items-start gap-4">
            <div className="flex h-14 w-14 items-center justify-center border-3 border-ink-950 bg-ink-50 font-mono text-xl font-black text-ink-600 shrink-0">
              {organization.name.charAt(0)}
            </div>
            <div>
              <h1 className="text-2xl font-black uppercase tracking-tight">{organization.name}</h1>
              <div className="flex items-center gap-3 mt-2">
                <StatusPill status={organization.status} />
                <VerificationBadge level={organization.verification_level} showDisclaimer />
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {!editing ? (
              <button onClick={() => setEditing(true)} className="btn-brutal-outline text-sm flex items-center gap-2">
                <Edit3 size={14} /> Edit
              </button>
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

        {isRegistryListed(organization) && (
          <div className="mt-6 border-t-3 border-ink-950 pt-6">
            <div className="label-brutal">Registry import</div>
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
            <div className="flex flex-col sm:flex-row gap-3 mt-4">
              <div className="flex-1 min-w-0">
                <label className="label-brutal">Outreach status</label>
                <select
                  className="input-brutal w-full mt-1"
                  value={organization.outreach_status}
                  onChange={(e) => handleOutreachChange(e.target.value as OutreachStatus)}
                >
                  {Object.entries(OUTREACH_STATUS_LABELS).map(([k, v]) => (
                    <option key={k} value={k}>
                      {v}
                    </option>
                  ))}
                </select>
              </div>
              {organization.status === 'listed' && (
                <div className="flex items-end">
                  <button type="button" onClick={handleBeginVerification} className="btn-brutal-teal w-full sm:w-auto text-sm">
                    Begin NGOreality verification
                  </button>
                </div>
              )}
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
            <FormField label="Verification Level">
              <select className="input-brutal w-full" value={editForm?.verification_level || 'none'} onChange={(e) => setEditForm({ ...editForm!, verification_level: e.target.value as VerificationLevel })}>
                {getVerificationLevelOptions().map(({ value, label }) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </select>
            </FormField>
            <FormField label="Status">
              <select className="input-brutal w-full" value={editForm?.status || 'onboarding'} onChange={(e) => setEditForm({ ...editForm!, status: e.target.value as OrgStatus })}>
                {Object.entries(ORG_STATUS_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
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
              <div className="label-brutal">Status Actions</div>
              <div className="flex flex-wrap gap-2 mt-2">
                {(['listed', 'onboarding', 'under_review', 'verified', 'active', 'lapsed'] as const)
                  .filter((s) => s !== organization.status)
                  .map((status) => (
                    <button
                      key={status}
                      onClick={() => handleStatusChange(status)}
                      className="btn-brutal-outline text-2xs py-1.5 px-3"
                    >
                      Move to {ORG_STATUS_LABELS[status]}
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
          {/* Base Criteria */}
          <div className="card-brutal">
            <div className="flex items-center justify-between border-b-3 border-ink-950 px-6 py-4">
              <h3 className="font-mono text-xs uppercase tracking-wider font-semibold flex items-center gap-2">
                <Shield size={14} /> Verified Criteria
              </h3>
              <div className="flex items-center gap-3">
                <span className="font-mono text-sm font-black">{baseScore}%</span>
                {baseCriteria.length === 0 && (
                  <button onClick={handleInitializeCriteria} className="btn-brutal-outline text-2xs py-1.5 px-3 flex items-center gap-1">
                    <Plus size={12} /> Initialize
                  </button>
                )}
              </div>
            </div>
            <div className="border-b border-ink-100 px-6 py-2 bg-amber-50">
              <span className="font-mono text-2xs text-amber-700 uppercase tracking-wider">Non-financial verification — digital & operational standards only</span>
            </div>
            <div className="divide-y divide-ink-100">
              {criteriaLoading ? (
                <div className="px-6 py-4 font-mono text-xs text-ink-400">Loading...</div>
              ) : baseCriteria.length === 0 ? (
                <div className="px-6 py-6 text-center text-sm text-ink-400">No base criteria. Click Initialize to add.</div>
              ) : (
                baseCriteria.map((c) => (
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
                            onClick={() => handleCriterionStatus(c.id, s)}
                            className={`px-2 py-1 font-mono text-2xs uppercase tracking-wider transition-colors
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
                            onClick={() => handleCriterionStatus(c.id, s)}
                            className={`px-2 py-1 font-mono text-2xs uppercase tracking-wider transition-colors
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
                    <div className="flex items-center justify-between">
                      <span className="font-mono text-xs font-bold">{b.verification_id}</span>
                      <span className={`font-mono text-2xs uppercase tracking-wider ${b.is_active ? 'text-teal' : 'text-ink-400'}`}>
                        {b.is_active ? 'Active' : 'Inactive'}
                      </span>
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
