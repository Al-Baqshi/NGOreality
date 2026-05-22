import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, CheckCircle2, Circle, Download, FileSpreadsheet, Loader2 } from 'lucide-react';
import BusinessPlanFinancialSnapshot from '../../components/crm/BusinessPlanFinancialSnapshot';
import BusinessPlanInfographics from '../../components/crm/BusinessPlanInfographics';
import { SectionHeader } from '../../components/ui';
import {
  LANDING_STANDARDS_PACKAGE_CENTS,
  MEMBER_MONITORING_SUMMARY,
  ORGANISATION_WORKSPACE_NAME,
} from '../../config/customerProducts';
import { MSD_FLEXIWAGE_CHECKLIST } from '../../config/businessPlanRef';
import { MSD_CHECKLIST_ANSWERS } from '../../config/businessPlanNarrative';
import { downloadElementAsPdf } from '../../lib/businessPlanPdf';

const MSD_REVIEW_KEY = 'ngoreality_msd_reviewed_v1';

export default function BusinessPlan() {
  const exportRef = useRef<HTMLDivElement>(null);
  const [reviewed, setReviewed] = useState<Record<string, boolean>>(() => {
    try {
      const raw = localStorage.getItem(MSD_REVIEW_KEY);
      return raw ? (JSON.parse(raw) as Record<string, boolean>) : {};
    } catch {
      return {};
    }
  });
  const [pdfLoading, setPdfLoading] = useState(false);
  const [pdfError, setPdfError] = useState<string | null>(null);

  useEffect(() => {
    localStorage.setItem(MSD_REVIEW_KEY, JSON.stringify(reviewed));
  }, [reviewed]);

  const reviewedCount = Object.values(reviewed).filter(Boolean).length;
  const total = MSD_CHECKLIST_ANSWERS.length;

  const handleDownloadPdf = async () => {
    const el = exportRef.current;
    if (!el) return;
    setPdfLoading(true);
    setPdfError(null);
    try {
      const date = new Date().toISOString().slice(0, 10);
      await downloadElementAsPdf(el, `NGOreality-business-plan-${date}.pdf`);
    } catch (err) {
      setPdfError(err instanceof Error ? err.message : 'PDF export failed');
    } finally {
      setPdfLoading(false);
    }
  };

  return (
    <div className="max-w-5xl mx-auto pb-16 min-w-0 w-full">
      <div className="print:hidden flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-6">
        <Link
          to="/dashboard"
          className="inline-flex items-center gap-2 font-mono text-2xs uppercase tracking-wider text-ink-500 hover:text-ink-950"
        >
          <ArrowLeft size={14} /> Dashboard
        </Link>
        <div className="flex flex-col items-stretch sm:items-end gap-1">
          <button
            type="button"
            onClick={handleDownloadPdf}
            disabled={pdfLoading}
            className="btn-brutal-outline text-2xs py-2.5 px-4 inline-flex items-center justify-center gap-2 min-h-[44px] disabled:opacity-50"
          >
            {pdfLoading ? <Loader2 size={16} className="animate-spin" /> : <Download size={16} />}
            Download full plan PDF
          </button>
          <p className="font-mono text-2xs text-ink-500 text-center sm:text-end max-w-xs">
            Infographics, How the business works, and all {total} MSD checklist answers
          </p>
        </div>
      </div>

      {pdfError && (
        <div className="print:hidden border-2 border-accent bg-accent-light text-accent px-4 py-3 mb-6 font-mono text-2xs">
          {pdfError}
        </div>
      )}

      <div id="business-plan-export" ref={exportRef} className="pdf-export-content bg-white">
        <section data-pdf-section className="card-brutal border-3 border-ink-950 overflow-hidden mb-10">
          <div className="bg-ink-950 text-white px-6 py-8 sm:py-12" data-pdf-hero>
            <p className="font-mono text-2xs uppercase tracking-[0.25em] text-teal mb-3">Flexi-Wage · PSG narrative</p>
            <h1 className="text-3xl sm:text-4xl font-black uppercase tracking-tight leading-tight max-w-2xl">
              Trust platform + services for NZ nonprofits
            </h1>
            <p className="text-ink-300 mt-4 max-w-xl text-sm sm:text-base leading-relaxed">
              We are <strong className="text-white">not only</strong> verifiers or uptime ping services. NGOreality
              uses registry intelligence, standards education, the <strong className="text-white">Reality Badge</strong>
              , {MEMBER_MONITORING_SUMMARY.toLowerCase()}, phone consultation, the{' '}
              <strong className="text-white">{ORGANISATION_WORKSPACE_NAME}</strong> (their portal — not our internal
              staff CRM), and a <strong className="text-white">${LANDING_STANDARDS_PACKAGE_CENTS / 100}</strong> landing +
              standards package.
            </p>
            <div className="print:hidden flex flex-wrap gap-3 mt-6" data-pdf-exclude>
              <Link
                to="/cash-flow"
                className="inline-flex items-center gap-2 border-2 border-teal bg-teal text-white font-mono text-2xs uppercase tracking-wider px-4 py-3 min-h-[44px] hover:bg-teal/90"
              >
                <FileSpreadsheet size={16} /> Cash flow worksheet
              </Link>
              <Link
                to="/outreach"
                className="inline-flex items-center gap-2 border-2 border-white font-mono text-2xs uppercase tracking-wider px-4 py-3 min-h-[44px] hover:bg-white/10"
              >
                Registry outreach →
              </Link>
            </div>
          </div>
        </section>

        <BusinessPlanInfographics />

        <div className="mt-10">
          <BusinessPlanFinancialSnapshot />
        </div>

        <section data-pdf-section className="mt-12">
          <SectionHeader>How the business works</SectionHeader>
          <div className="space-y-4 text-sm text-ink-700 leading-relaxed">
            <p>
              <strong className="text-ink-950">1. Data advantage.</strong> NZ Charities Register (~29k orgs) plus
              monitoring shows who has no website, whose site looks down, and who is close to public trust standards.
            </p>
            <p>
              <strong className="text-ink-950">2. $650 landing + standards package.</strong> For many NGOs we build a
              trust landing page, teach how standards and the badge work, and wire the checklist — not just a verifier
              tick-box.
            </p>
            <p>
              <strong className="text-ink-950">3. {ORGANISATION_WORKSPACE_NAME}.</strong> Charities use their own
              organisation portal to track progress (criteria, documents, readiness). Our sidebar “CRM” is internal staff
              tooling only — we do not sell it as a CRM to avoid confusion.
            </p>
            <p>
              <strong className="text-ink-950">4. Membership ($100/year).</strong> When public standards pass: Reality
              Badge, {MEMBER_MONITORING_SUMMARY.toLowerCase()}, periodic reporting rhythm, and{' '}
              <strong>email if something looks wrong</strong>. They can always call for consultation.
            </p>
            <p>
              <strong className="text-ink-950">5. Already have a website?</strong> We help them meet standards in place,
              then membership. Larger needs → custom solutions with flexible pricing.
            </p>
            <p>
              <strong className="text-ink-950">6. Numbers.</strong> Flexi-Wage and cashflow on the{' '}
              <span className="font-medium text-ink-950">Cash flow worksheet</span> page (CSV export; open in CRM
              when editing).
            </p>
          </div>
        </section>

        <section className="mt-12">
          <div data-pdf-section className="mb-6">
            <SectionHeader>MSD submission checklist ({total} items)</SectionHeader>
            <p className="print:hidden font-mono text-2xs text-ink-500 mt-2">
              Reviewed {reviewedCount}/{total}
            </p>
            <p className="text-xs text-ink-500 mt-3 leading-relaxed">
              Full written answers for MSD / Flexi-Wage vetting. Financial tables and CSV export live on
              the Cash flow page.
            </p>
          </div>

          <div className="space-y-4">
            {MSD_CHECKLIST_ANSWERS.map((item, index) => {
              const meta = MSD_FLEXIWAGE_CHECKLIST.find((c) => c.id === item.id);
              const isReviewed = Boolean(reviewed[item.id]);
              return (
                <article
                  key={item.id}
                  data-pdf-section
                  className={`card-brutal overflow-hidden ${isReviewed ? 'ring-2 ring-teal ring-offset-2' : ''}`}
                >
                  <header className="flex items-start gap-3 border-b-3 border-ink-950 px-4 py-3 bg-ink-50">
                    <span className="font-mono text-2xs text-ink-400 w-6 shrink-0 pt-0.5">{index + 1}</span>
                    <div className="flex-1 min-w-0">
                      <p className="font-mono text-2xs uppercase text-teal">{item.section}</p>
                      <h3 className="font-semibold text-sm mt-0.5 leading-snug">{item.label}</h3>
                    </div>
                    <button
                      type="button"
                      onClick={() => setReviewed((prev) => ({ ...prev, [item.id]: !prev[item.id] }))}
                      className="print:hidden shrink-0 p-2 min-w-[44px] min-h-[44px] flex items-center justify-center"
                      aria-pressed={isReviewed}
                    >
                      {isReviewed ? (
                        <CheckCircle2 size={22} className="text-teal" />
                      ) : (
                        <Circle size={22} className="text-ink-300" />
                      )}
                    </button>
                  </header>
                  <div className="px-4 py-4 text-sm text-ink-700 leading-relaxed">{item.answer}</div>
                  {item.id === 'financials' && (
                    <div className="px-4 pb-4 print:hidden">
                      <Link to="/cash-flow" className="inline-flex items-center gap-2 btn-brutal-outline text-2xs py-2 px-3">
                        <FileSpreadsheet size={14} /> Open 12-month cashflow →
                      </Link>
                    </div>
                  )}
                  {meta?.docSection && item.id !== 'financials' && (
                    <p className="px-4 pb-3 font-mono text-2xs text-ink-400">PSG: {meta.docSection}</p>
                  )}
                </article>
              );
            })}
          </div>
        </section>

        <section data-pdf-section className="mt-10 card-brutal p-6 bg-teal/5 border-teal text-sm text-ink-700">
          <p className="font-mono text-2xs uppercase text-ink-500 mb-2">NGOreality · Business plan export</p>
          <p>Generated from CRM Business plan. Financial detail: Cash flow worksheet.</p>
        </section>
      </div>
    </div>
  );
}
