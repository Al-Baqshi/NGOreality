import { useInquiries } from '../../hooks/useSupabase';
import { supabase } from '../../lib/supabase';
import { useState } from 'react';
import { SectionHeader, EmptyState, FormField, Modal } from '../../components/ui';
import { Mail, Clock, CheckCircle, XCircle } from 'lucide-react';
import type { InquirySubmission } from '../../types';

const statusIcons: Record<string, React.ReactNode> = {
  new: <Mail size={14} className="text-accent" />,
  contacted: <Clock size={14} className="text-amber-600" />,
  qualified: <CheckCircle size={14} className="text-teal" />,
  closed: <XCircle size={14} className="text-ink-300" />,
};

const statusLabels: Record<string, string> = {
  new: 'New',
  contacted: 'Contacted',
  qualified: 'Qualified',
  closed: 'Closed',
};

export default function Inquiries() {
  const { inquiries, loading, refetch } = useInquiries();
  const [selected, setSelected] = useState<InquirySubmission | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);

  const handleStatusChange = async (id: string, newStatus: InquirySubmission['status']) => {
    await supabase.from('inquiry_submissions').update({ status: newStatus }).eq('id', id);
    refetch();
  };

  const openDetail = (inq: InquirySubmission) => {
    setSelected(inq);
    setDetailOpen(true);
  };

  return (
    <div className="max-w-6xl mx-auto">
      <SectionHeader>Inquiries</SectionHeader>

      {loading ? (
        <div className="text-center py-16 font-mono text-sm text-ink-400">Loading...</div>
      ) : inquiries.length === 0 ? (
        <EmptyState
          icon={<Mail size={48} />}
          title="No inquiries yet"
          description="Inquiries from the public contact form will appear here."
        />
      ) : (
        <div className="space-y-3">
          {inquiries.map((inq) => (
            <div key={inq.id} className="card-brutal p-5">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div className="flex items-start gap-4 cursor-pointer" onClick={() => openDetail(inq)}>
                  <div className="flex h-10 w-10 items-center justify-center border-2 border-ink-200 bg-ink-50 shrink-0">
                    {statusIcons[inq.status]}
                  </div>
                  <div>
                    <div className="text-sm font-bold">{inq.organization_name}</div>
                    <div className="font-mono text-2xs text-ink-400">
                      {inq.contact_name} &middot; {inq.email}
                    </div>
                    {inq.message && (
                      <p className="text-xs text-ink-500 mt-1 line-clamp-2">{inq.message}</p>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`badge-${inq.status === 'new' ? 'failed' : inq.status === 'qualified' ? 'verified' : 'pending'}`}>
                    {statusLabels[inq.status]}
                  </span>
                  <div className="flex border-2 border-ink-200">
                    {(['new', 'contacted', 'qualified', 'closed'] as const).map((s) => (
                      <button
                        key={s}
                        onClick={() => handleStatusChange(inq.id, s)}
                        className={`px-2 py-1 font-mono text-2xs uppercase tracking-wider transition-colors
                          ${inq.status === s
                            ? 'bg-ink-950 text-white'
                            : 'bg-white text-ink-400 hover:bg-ink-50'
                          }`}
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Detail Modal */}
      <Modal open={detailOpen} onClose={() => setDetailOpen(false)} title="Inquiry Details">
        {selected && (
          <div className="space-y-4">
            <FormField label="Organization">
              <div className="text-sm font-medium">{selected.organization_name}</div>
            </FormField>
            <FormField label="Contact">
              <div className="text-sm">{selected.contact_name}</div>
            </FormField>
            <FormField label="Email">
              <div className="text-sm">{selected.email}</div>
            </FormField>
            <FormField label="Phone">
              <div className="text-sm">{selected.phone || 'Not provided'}</div>
            </FormField>
            <FormField label="Category">
              <div className="text-sm">{selected.category || 'Not specified'}</div>
            </FormField>
            <FormField label="Message">
              <div className="text-sm leading-relaxed">{selected.message || 'No message'}</div>
            </FormField>
            <FormField label="Submitted">
              <div className="text-sm font-mono">{new Date(selected.created_at).toLocaleString()}</div>
            </FormField>
          </div>
        )}
      </Modal>
    </div>
  );
}
