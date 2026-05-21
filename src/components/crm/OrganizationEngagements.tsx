import { useState } from 'react';
import { supabase } from '../../lib/supabase';
import { useServiceEngagements, useStaffTasks } from '../../hooks/useCrm';
import { FormField } from '../ui';
import {
  ENGAGEMENT_STATUS_LABELS,
  ENGAGEMENT_TYPE_LABELS,
  STAFF_TASK_TYPE_LABELS,
  type EngagementStatus,
  type EngagementType,
  type StaffTaskType,
} from '../../types';
import { Plus, Calendar } from 'lucide-react';

export default function OrganizationEngagements({ organizationId }: { organizationId: string }) {
  const { engagements, loading, refetch } = useServiceEngagements(organizationId);
  const { tasks, loading: tasksLoading, refetch: refetchTasks } = useStaffTasks(organizationId);
  const [showEngagement, setShowEngagement] = useState(false);
  const [showTask, setShowTask] = useState(false);
  const [engForm, setEngForm] = useState({
    engagement_type: 'verification' as EngagementType,
    status: 'lead' as EngagementStatus,
    fee_cents: 0,
    notes: '',
    next_follow_up_at: '',
  });
  const [taskForm, setTaskForm] = useState({
    title: 'Follow-up call',
    task_type: 'call' as StaffTaskType,
    due_date: new Date().toISOString().slice(0, 10),
    notes: '',
  });

  const saveEngagement = async () => {
    await supabase.from('service_engagements').insert({
      organization_id: organizationId,
      engagement_type: engForm.engagement_type,
      status: engForm.status,
      fee_cents: engForm.fee_cents,
      notes: engForm.notes,
      next_follow_up_at: engForm.next_follow_up_at || null,
      started_at: engForm.status === 'active' ? new Date().toISOString() : null,
    });
    await supabase.from('activity_log').insert({
      organization_id: organizationId,
      action: 'engagement_created',
      description: `${ENGAGEMENT_TYPE_LABELS[engForm.engagement_type]} — ${ENGAGEMENT_STATUS_LABELS[engForm.status]}`,
      performed_by: 'staff',
    });
    setShowEngagement(false);
    refetch();
  };

  const saveTask = async () => {
    await supabase.from('staff_tasks').insert({
      organization_id: organizationId,
      ...taskForm,
    });
    setShowTask(false);
    refetchTasks();
  };

  const formatFee = (cents: number, currency: string) =>
    new Intl.NumberFormat('en-NZ', { style: 'currency', currency }).format(cents / 100);

  return (
    <div className="space-y-4">
      <div className="card-brutal">
        <div className="border-b-3 border-ink-950 px-4 py-3 flex items-center justify-between gap-2">
          <h3 className="font-mono text-xs uppercase tracking-wider font-semibold flex items-center gap-2">
            <Calendar size={14} /> Engagements & fees
          </h3>
          <button type="button" onClick={() => setShowEngagement(!showEngagement)} className="btn-brutal-outline text-2xs py-1 px-2">
            <Plus size={12} className="inline mr-1" /> Add
          </button>
        </div>
        {showEngagement && (
          <div className="p-4 border-b border-ink-100 space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <FormField label="Type">
                <select className="input-brutal w-full text-base" value={engForm.engagement_type} onChange={(e) => setEngForm({ ...engForm, engagement_type: e.target.value as EngagementType })}>
                  {Object.entries(ENGAGEMENT_TYPE_LABELS).map(([k, v]) => (
                    <option key={k} value={k}>{v}</option>
                  ))}
                </select>
              </FormField>
              <FormField label="Status">
                <select className="input-brutal w-full text-base" value={engForm.status} onChange={(e) => setEngForm({ ...engForm, status: e.target.value as EngagementStatus })}>
                  {Object.entries(ENGAGEMENT_STATUS_LABELS).map(([k, v]) => (
                    <option key={k} value={k}>{v}</option>
                  ))}
                </select>
              </FormField>
              <FormField label="Fee (cents)">
                <input type="number" className="input-brutal w-full text-base" value={engForm.fee_cents} onChange={(e) => setEngForm({ ...engForm, fee_cents: parseInt(e.target.value, 10) || 0 })} />
              </FormField>
              <FormField label="Next follow-up">
                <input type="datetime-local" className="input-brutal w-full text-base" value={engForm.next_follow_up_at} onChange={(e) => setEngForm({ ...engForm, next_follow_up_at: e.target.value })} />
              </FormField>
            </div>
            <FormField label="Notes">
              <textarea className="input-brutal w-full text-base h-20" value={engForm.notes} onChange={(e) => setEngForm({ ...engForm, notes: e.target.value })} />
            </FormField>
            <button type="button" onClick={saveEngagement} className="btn-brutal-accent text-sm w-full sm:w-auto">
              Save engagement
            </button>
          </div>
        )}
        <div className="divide-y divide-ink-100">
          {loading ? (
            <p className="px-4 py-4 font-mono text-2xs text-ink-400">Loading…</p>
          ) : engagements.length === 0 ? (
            <p className="px-4 py-6 text-sm text-ink-400 text-center">No engagements yet</p>
          ) : (
            engagements.map((e) => (
              <div key={e.id} className="px-4 py-3">
                <div className="flex justify-between gap-2">
                  <span className="text-sm font-semibold">{ENGAGEMENT_TYPE_LABELS[e.engagement_type]}</span>
                  <span className="font-mono text-2xs uppercase text-ink-500">{ENGAGEMENT_STATUS_LABELS[e.status]}</span>
                </div>
                <div className="font-mono text-2xs text-ink-400 mt-1">
                  {formatFee(e.fee_cents, e.currency)}
                  {e.next_follow_up_at && ` · Follow-up ${new Date(e.next_follow_up_at).toLocaleString()}`}
                </div>
                {e.notes && <p className="text-xs text-ink-600 mt-1">{e.notes}</p>}
              </div>
            ))
          )}
        </div>
      </div>

      <div className="card-brutal">
        <div className="border-b-3 border-ink-950 px-4 py-3 flex items-center justify-between gap-2">
          <h3 className="font-mono text-xs uppercase tracking-wider font-semibold">Tasks</h3>
          <button type="button" onClick={() => setShowTask(!showTask)} className="btn-brutal-outline text-2xs py-1 px-2">
            <Plus size={12} className="inline mr-1" /> Task
          </button>
        </div>
        {showTask && (
          <div className="p-4 border-b border-ink-100 space-y-3">
            <FormField label="Title">
              <input className="input-brutal w-full text-base" value={taskForm.title} onChange={(e) => setTaskForm({ ...taskForm, title: e.target.value })} />
            </FormField>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <FormField label="Type">
                <select className="input-brutal w-full text-base" value={taskForm.task_type} onChange={(e) => setTaskForm({ ...taskForm, task_type: e.target.value as StaffTaskType })}>
                  {Object.entries(STAFF_TASK_TYPE_LABELS).map(([k, v]) => (
                    <option key={k} value={k}>{v}</option>
                  ))}
                </select>
              </FormField>
              <FormField label="Due date">
                <input type="date" className="input-brutal w-full text-base" value={taskForm.due_date} onChange={(e) => setTaskForm({ ...taskForm, due_date: e.target.value })} />
              </FormField>
            </div>
            <button type="button" onClick={saveTask} className="btn-brutal-teal text-sm w-full sm:w-auto">
              Save task
            </button>
          </div>
        )}
        <div className="divide-y divide-ink-100">
          {tasksLoading ? (
            <p className="px-4 py-4 font-mono text-2xs text-ink-400">Loading…</p>
          ) : tasks.length === 0 ? (
            <p className="px-4 py-6 text-sm text-ink-400 text-center">No tasks</p>
          ) : (
            tasks.map((t) => (
              <div key={t.id} className="px-4 py-3 flex justify-between gap-2">
                <div>
                  <div className="text-sm font-semibold">{t.title}</div>
                  <div className="font-mono text-2xs text-ink-400">{STAFF_TASK_TYPE_LABELS[t.task_type]} · {t.due_date}</div>
                </div>
                <span className={`font-mono text-2xs uppercase ${t.status === 'open' ? 'text-amber-600' : 'text-teal'}`}>
                  {t.status}
                </span>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
