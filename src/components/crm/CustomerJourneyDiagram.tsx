import { CUSTOMER_JOURNEY } from '../../config/businessPlanNarrative';
import { MEMBER_MONITORING_SUMMARY } from '../../config/customerProducts';

export default function CustomerJourneyDiagram() {
  return (
    <div className="card-brutal p-4 sm:p-6 min-w-0 overflow-hidden">
      <h3 className="font-mono text-2xs uppercase tracking-wider text-ink-500 mb-1">Customer journey</h3>
      <p className="text-xs text-ink-600 mb-4 leading-relaxed">
        What charities experience — separate from our <span className="font-medium">internal staff console</span>{' '}
        (sidebar CRM). Monitoring: {MEMBER_MONITORING_SUMMARY.toLowerCase()}.
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {CUSTOMER_JOURNEY.map((s) => (
          <div
            key={s.step}
            className="border-2 border-ink-950 p-3 sm:p-4 bg-white relative min-w-0"
          >
            <span className="font-mono text-2xs text-teal font-bold">{s.step}</span>
            <h4 className="font-semibold text-sm mt-1 leading-snug break-words">{s.title}</h4>
            <p className="text-2xs sm:text-xs text-ink-600 mt-2 leading-relaxed">{s.body}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
