# NGOreality — Business plan (PSG / Flexi-Wage structure)

_Confidential draft aligned with `ref/PSG Business Plan Template.docx` and `ref/MSD Business Plan check List.docx`. Use with `ref/Cashflow Forecasting Template.xlsx` and the CRM **Business plan** page for monthly expected vs actual._

---

## Executive summary

NGOreality is a New Zealand–focused trust platform for nonprofits. We verify that listed charities meet **public digital trust standards** (live website, clear mission, contact, privacy, mobile-friendly presence) before issuing the **Reality Badge**, and we provide **website monitoring** with down alerts for paying members.

**Revenue model (launch):** one product — **$100 NZD/year membership** (badge + 12 months monitoring + email alerts). Consulting, custom sites, and full CRM are separate services later.

**Go-to-market:** outreach to ~29k NZ Charities Register listings using registry insights (orgs without sites, sites down, profile-ready counts). Convert interested NGOs through standards review → membership payment → badge + monitoring.

**Funding:** Flexi-Wage self-employment support and capitalisation grant (equipment, marketing, compliance) as applicable. Financial detail is tracked in CRM and the cashflow spreadsheet.

---

## The business idea

Nonprofits often look legitimate online while sites are broken, outdated, or misleading. NGOreality gives donors and partners a **single verified signal** (Reality Badge) backed by checks and ongoing monitoring—not a rating of mission quality, but of **digital operational credibility**.

The idea is proven feasible because:

- Public registry data provides a large addressable market (listed charities).
- Passive monitoring on listed orgs produces outreach statistics without claiming they are “down” customers.
- Early pilots can sell membership to NGOs that fail public standards until they pass.

---

## What we sell — products and services

| Offer | Price (NZD) | What’s included |
|--------|-------------|-----------------|
| **Annual membership** | **$100 / year** | Public standards review, Reality Badge (when criteria pass), 12 months **paid_live** monitoring (~1h checks), site-down email alerts |
| Consulting / custom build | Quote | Separate from membership (future) |
| CRM / support packages | Quote | B2B later |

**Cost to deliver:** hosting (Supabase, Vercel), email (Resend), founder time for verification and support. No physical COGS.

**Pricing rationale:** low enough for small NGOs; covers infra at modest scale; upsell consulting later.

---

## Place

- **Admin & product:** home office / remote (NZ).
- **Delivery:** `ngoreality` web app (public registry, verified list, NGO portal, staff CRM).
- **Sales channels:** direct outreach (email/phone), website, LinkedIn; later partnerships with sector bodies.

Domain and social profiles should be listed in appendices when live.

---

## Ownership

_State your structure: sole trader / NZ company / partnership._

Explain why that structure fits liability, tax, and grant requirements. Confirm professional advice (accountant/lawyer) if applicable.

---

## Skills and knowledge

_Document founder CV in appendix._

- Technical: web development (React, Supabase), basic security review, monitoring architecture.
- Business: nonprofit sector context, sales outreach, grant compliance.
- Gaps: fill via mentor, accountant, or contractor (see Staffing / Advisers).

---

## Research

**Demand**

- NZ Charities Register scale (~29k entities).
- CRM **Registry insights**: % without website, % URL invalid, % site down, % profile-ready for outreach.

**Competitors**

- Charity evaluators (mission/financial ratings) — different category.
- Generic uptime tools — no badge or NGO-specific standards.
- Document 5–6 comparable offerings with price and differentiation.

**Compliance**

- Privacy Act, Charities Act context, GST registration threshold, email marketing consent.
- Terms, privacy policy, and verification disclaimer on site.

---

## Point of difference

1. **Badge gated on public standards** — not pay-to-win; payment activates monitoring and staff workflow after standards pass.
2. **Member-only security checklist** (repo, credentials, etc.) — not marketed on public registry pages.
3. **Passive monitoring** on listed orgs for **aggregate outreach stats** without implying endorsement.
4. **NZ-first** registry integration and pricing in NZD.

---

## Operational processes

1. Import / sync registry orgs → passive monitor tier.
2. Outreach → NGO signs up → public criteria in portal.
3. Staff CRM: review criteria → record **membership paid** → badge issued + monitoring tier + notification emails queued.
4. Worker checks sites; incidents queue **site-down** emails for paying members.
5. Renewals annually; badge revoke in CRM if standards lapse.

Software: Supabase (data/auth), Vercel (hosting), Go worker (checks), Resend (email).

---

## Growth plans

| Horizon | Goals |
|---------|--------|
| **0–12 months** | 50–200 paying memberships; stable monitoring; grant/reporting compliance; **payroll from month 1** (see Staffing) |
| **12–24 months** | Consulting revenue; improved automation; optional Stripe checkout; premises + larger team |
| **24+ months** | AU expansion; API partners; up to five staff with premises |

Measure: memberships sold, MRR equivalent, churn, outreach conversion, incident SLA.

---

## Staffing

**Payroll (Year 1 plan):** Employees (not contractors) on wages of about **$1,500–$2,000 per week** each (~$7,600/mo at the midpoint used in the CRM cashflow).

| Month | Headcount | Notes |
|-------|-----------|--------|
| **1** | 1 | First hire — outreach / delivery support alongside founder |
| **2** | 2 | Second hire — same wage band |
| **3** | 2 | **Review month** — confirm revenue covers payroll before a third hire |
| **4–9** | 3 | Third employee when membership + $650 package volume supports it |
| **10–11** | 4 | **Premises** (shared office) — room for a larger team |
| **12** | 5 | Target team size with premises if the plan performs |

Founder remains operator; Flexi-Wage and capitalisation grant bridge early months while trading revenue ramps. The **12-month cashflow** in CRM includes **Staff wages and salaries** from month 1 — closing balance is intended to show the business can cover this payroll if volume targets are met.

Contractors still used for design, legal, or accounting as needed. Role descriptions in appendix.

---

## Professional advisers and mentors

_List accountant, business mentor (Flexi-Wage), legal, marketing support with contact frequency._

---

## Compliance

- NZ business registration and IRD/GST obligations.
- Privacy policy and data retention for CRM.
- Insurance: professional indemnity / cyber as advised by broker.
- Health & safety: low risk (desk-based); document home office setup.

---

## Risk assessment & backup plan

| Risk | Mitigation |
|------|------------|
| Low uptake | Registry outreach volume; pilot pricing; partnerships |
| False “down” alerts | url_invalid tier; paid_live cadence; manual incident review |
| Founder capacity | Automate verification; templates; defer consulting |
| Funding gap | Flexi-Wage + lean burn; phased features |

**SWOT:** complete in appendix for MSD submission.

---

## Assets owned / capitalisation grant

_List laptop, software licences, domains already owned._

**Grant requests:** itemise with quotes in appendix (hosting prepaid, marketing, insurance, equipment). Map each line to cashflow **Govt. grant** and expense rows in CRM.

---

## Marketing — market size and demand

- **Market:** NZ registered charities + international NGOs seeking NZ credibility.
- **Demand evidence:** registry stats, survey results (appendix), pilot LOIs.

---

## Marketing — identifying your customer

**Primary:** small–medium NZ charities with a website (or willing to launch one) and board pressure to show trust online.

**Secondary:** funders / platforms wanting verified partner lists.

---

## Marketing — promotional activities

- Email sequences to registry segments (no site / site down / ready).
- Content: “what the badge means”, standards transparency.
- 6–12 month calendar in appendix; costs in cashflow **Marketing and promotion**.

---

## Financial information

**Use together:**

1. `ref/Cashflow Forecasting Template.xlsx`
2. CRM → **Business plan** (12-month expected vs actual, MSD checklist)

**Assumptions (example — replace with your forecast):**

| Item | Year 1 assumption |
|------|-------------------|
| Memberships sold | 50 @ $100 = $5,000 |
| Flexi-Wage | Per MSD schedule (e.g. months 1–6) |
| Capitalisation grant | One-off (equipment/marketing) |
| Hosting & tools | ~$50–150/month |
| Marketing | Grant-funded + lean paid social |
| Drawings | Living costs per Flexi-Wage guidance |
| Staff wages | From month 1: 1 → 2 → (month 3 review) → 3 → up to 5 with premises; ~$1,750/wk midpoint in CRM forecast |

**Breakeven:** memberships + grant + Flexi-Wage cover hosting, tools, **payroll**, tax reserves, and drawings. Recalculate when targets are set in CRM (see closing balance).

**GST:** register when required; include **GST received / paid / net IRD** lines in cashflow.

**ACC & income tax:** budget monthly reserves in cashflow (**Savings for ACC** / **income tax**).

---

## Taxes and ACC

Explain GST registration plan, who files returns (founder vs accountant), and how ACC levies were estimated.

---

## Environmental considerations and community involvement

Digital-only product — low direct environmental impact. Community benefit: stronger trust in nonprofit sector, free public registry browsing, transparent standards.

---

## Appendices (checklist)

- [ ] CV and qualifications  
- [ ] Survey samples (if used)  
- [ ] Competitor analysis  
- [ ] Marketing calendar  
- [ ] Capitalisation quotes  
- [ ] Insurance quotes  
- [ ] SWOT  
- [ ] Leases / contracts (if any)  

---

## CRM cross-reference

| MSD checklist item | Where to maintain |
|--------------------|-------------------|
| 12-month cashflow | CRM Business plan → **Cashflow forecast** |
| Sales actuals | Auto from **Payments** / membership records |
| Expenses | CRM expense log (MSD categories) |
| Membership KPIs | CRM **Membership KPIs** grid |
| Narrative sections | This document |
