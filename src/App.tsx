import { lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import PublicLayout from './components/PublicLayout';
import StaffProtectedRoute from './components/StaffProtectedRoute';
import NgoProtectedRoute from './components/NgoProtectedRoute';
import { isSupabaseConfigured } from './lib/supabase';

/* Route-level code splitting: the public site (homepage, directory, org
   profiles) no longer ships the CRM, NGO portal, or their heavy libraries
   (recharts, jspdf, exceljs, html2canvas). Each page loads on demand. */

import { WORKSPACE_ENABLED } from './config/features';
// Public
const Homepage = lazy(() => import('./pages/public/Homepage'));
const HowItWorks = lazy(() => import('./pages/public/HowItWorks'));
const Directory = lazy(() => import('./pages/public/Directory'));
const VerificationPublic = lazy(() => import('./pages/public/Verification'));
const RealityBadge = lazy(() => import('./pages/public/RealityBadge'));
const Workspace = lazy(() => import('./pages/public/Workspace'));
const Verified = lazy(() => import('./pages/public/Verified'));
const Blog = lazy(() => import('./pages/public/Blog'));
const BlogDetail = lazy(() => import('./pages/public/BlogDetail'));
const About = lazy(() => import('./pages/public/About'));
const Contact = lazy(() => import('./pages/public/Contact'));
const BusinessPlanGate = lazy(() => import('./pages/public/BusinessPlanGate'));
const PrivacyPolicy = lazy(() => import('./pages/public/PrivacyPolicy'));
const TermsOfService = lazy(() => import('./pages/public/TermsOfService'));
const DataProcessingAddendum = lazy(() => import('./pages/public/DataProcessingAddendum'));
const OrganizationProfile = lazy(() => import('./pages/public/OrganizationProfile'));
const NotFound = lazy(() => import('./pages/public/NotFound'));

// Staff CRM
const CRMLayout = lazy(() => import('./components/Layout'));
const StaffLogin = lazy(() => import('./pages/staff/StaffLogin'));
const Dashboard = lazy(() => import('./pages/crm/Dashboard'));
const OrganizationsList = lazy(() => import('./pages/crm/OrganizationsList'));
const OrganizationDetail = lazy(() => import('./pages/crm/OrganizationDetail'));
const OrganizationNew = lazy(() => import('./pages/crm/OrganizationNew'));
const Verification = lazy(() => import('./pages/crm/Verification'));
const Registrations = lazy(() => import('./pages/crm/Registrations'));
const Contacts = lazy(() => import('./pages/crm/Contacts'));
const Inquiries = lazy(() => import('./pages/crm/Inquiries'));
const BlogManager = lazy(() => import('./pages/crm/BlogManager'));
const OutreachBoard = lazy(() => import('./pages/crm/OutreachBoard'));
const InboundQueue = lazy(() => import('./pages/crm/InboundQueue'));
const CustomersList = lazy(() => import('./pages/crm/CustomersList'));
const PaymentsList = lazy(() => import('./pages/crm/PaymentsList'));
const Reconciliation = lazy(() => import('./pages/crm/Reconciliation'));
const CashFlow = lazy(() => import('./pages/crm/CashFlow'));
const WorkQueue = lazy(() => import('./pages/crm/WorkQueue'));
const CrmBadges = lazy(() => import('./pages/crm/CrmBadges'));
const Monitoring = lazy(() => import('./pages/crm/Monitoring'));
const CrmNotificationInbox = lazy(() => import('./pages/crm/CrmNotificationInbox'));
const EmailNotifications = lazy(() => import('./pages/crm/EmailNotifications'));

// NGO Portal
const NgoLogin = lazy(() => import('./pages/ngo/NgoLogin'));
const NgoSignup = lazy(() => import('./pages/ngo/NgoSignup'));
const NgoLayout = lazy(() => import('./components/NgoLayout'));
const NgoPortalGate = lazy(() => import('./components/ngo/NgoPortalGate'));
const NgoOverviewPage = lazy(() => import('./pages/ngo/portal/NgoOverviewPage'));
const NgoProfilePage = lazy(() => import('./pages/ngo/portal/NgoProfilePage'));
const NgoSetupRequestPage = lazy(() => import('./pages/ngo/portal/NgoSetupRequestPage'));
const NgoMembershipPage = lazy(() => import('./pages/ngo/portal/NgoMembershipPage'));
const NgoStandardsPage = lazy(() => import('./pages/ngo/portal/NgoStandardsPage'));
const NgoBadgePage = lazy(() => import('./pages/ngo/portal/NgoBadgePage'));
const NgoMonitoringPage = lazy(() => import('./pages/ngo/portal/NgoMonitoringPage'));
const NgoRequestsPage = lazy(() => import('./pages/ngo/portal/NgoRequestsPage'));
const NgoNotificationsPage = lazy(() => import('./pages/ngo/portal/NgoNotificationsPage'));

// Organisation Workspace — the case management CRM. Backed by the Go service
// on its own database, not Supabase (see docs/CRM_SAAS.md).
const NgoWorkspacePage = lazy(() => import('./pages/ngo/workspace/NgoWorkspacePage'));
const NgoWorkspaceClientsPage = lazy(() => import('./pages/ngo/workspace/NgoWorkspaceClientsPage'));
const NgoWorkspaceClientDetailPage = lazy(
  () => import('./pages/ngo/workspace/NgoWorkspaceClientDetailPage'),
);
const NgoWorkspaceCaseDetailPage = lazy(
  () => import('./pages/ngo/workspace/NgoWorkspaceCaseDetailPage'),
);

function RouteFallback() {
  return (
    <div className="flex min-h-[60vh] items-center justify-center" role="status" aria-live="polite">
      <div className="flex items-center gap-3 font-mono text-2xs uppercase tracking-[0.3em] text-ink-400">
        <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-teal" />
        Loading…
      </div>
    </div>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      {import.meta.env.DEV && !isSupabaseConfigured && (
        <div
          role="status"
          className="border-b-3 border-ink-950 bg-amber-100 px-4 py-2 text-center font-mono text-2xs uppercase tracking-wider text-ink-950"
        >
          Supabase not configured — copy <code className="normal-case">.env.example</code> to{' '}
          <code className="normal-case">.env.local</code> and add your project URL and anon key.
        </div>
      )}
      <Suspense fallback={<RouteFallback />}>
        <Routes>
          {/* Staff CRM */}
          <Route path="/staff/login" element={<StaffLogin />} />
          <Route element={<StaffProtectedRoute />}>
            <Route element={<CRMLayout />}>
              <Route path="/dashboard" element={<Dashboard />} />
              <Route path="/organizations" element={<OrganizationsList />} />
              <Route path="/organizations/new" element={<OrganizationNew />} />
              <Route path="/organizations/:id" element={<OrganizationDetail />} />
              <Route path="/verification" element={<Verification />} />
              <Route path="/registrations" element={<Registrations />} />
              <Route path="/outreach" element={<OutreachBoard />} />
              <Route path="/inbound" element={<InboundQueue />} />
              <Route path="/customers" element={<CustomersList />} />
              <Route path="/payments" element={<PaymentsList />} />
              <Route path="/reconciliation" element={<Reconciliation />} />
              {/* TODO: re-enable once external business plan is finalized */}
              {/* <Route path="/plan" element={<BusinessPlan />} /> */}
              <Route path="/cash-flow" element={<CashFlow />} />
              <Route path="/work-queue" element={<WorkQueue />} />
              <Route path="/badges" element={<CrmBadges />} />
              <Route path="/monitoring" element={<Monitoring />} />
              <Route path="/notifications" element={<CrmNotificationInbox />} />
              <Route path="/email-notifications" element={<EmailNotifications />} />
              <Route path="/contacts" element={<Contacts />} />
              <Route path="/inquiries" element={<Inquiries />} />
              <Route path="/blog-manager" element={<BlogManager />} />
            </Route>
          </Route>

          {/* NGO Portal */}
          <Route path="/ngo/login" element={<NgoLogin />} />
          <Route path="/ngo/signup" element={<NgoSignup />} />
          <Route element={<NgoProtectedRoute />}>
            <Route path="/ngo" element={<NgoLayout />}>
              <Route element={<NgoPortalGate />}>
                <Route index element={<NgoOverviewPage />} />
                <Route path="profile" element={<NgoProfilePage />} />
                <Route path="setup-request" element={<NgoSetupRequestPage />} />
                <Route path="membership" element={<NgoMembershipPage />} />
                <Route path="standards" element={<NgoStandardsPage />} />
                <Route path="badge" element={<NgoBadgePage />} />
                <Route path="monitoring" element={<NgoMonitoringPage />} />
                <Route path="requests" element={<NgoRequestsPage />} />
                <Route path="notifications" element={<NgoNotificationsPage />} />
                {WORKSPACE_ENABLED && (
                  <>
                    <Route path="workspace" element={<NgoWorkspacePage />} />
                    <Route path="workspace/clients" element={<NgoWorkspaceClientsPage />} />
                    <Route path="workspace/clients/:id" element={<NgoWorkspaceClientDetailPage />} />
                    <Route path="workspace/cases/:id" element={<NgoWorkspaceCaseDetailPage />} />
                  </>
                )}
              </Route>
            </Route>
          </Route>

          {/* Public Routes */}
          <Route path="/public" element={<PublicLayout />}>
            <Route index element={<Homepage />} />
            <Route path="how-it-works" element={<HowItWorks />} />
            <Route path="directory" element={<Directory />} />
            <Route path="org/:slug" element={<OrganizationProfile />} />
            <Route path="verified" element={<Verified />} />
            <Route path="reality-badge" element={<RealityBadge />} />
            <Route path="workspace" element={<Workspace />} />
            <Route path="verification" element={<VerificationPublic />} />
            <Route path="blog" element={<Blog />} />
            <Route path="blog/:slug" element={<BlogDetail />} />
            <Route path="about" element={<About />} />
            <Route path="contact" element={<Contact />} />
            <Route path="business-plan" element={<BusinessPlanGate />} />
            <Route path="privacy" element={<PrivacyPolicy />} />
            <Route path="terms" element={<TermsOfService />} />
            <Route path="data-processing" element={<DataProcessingAddendum />} />
          </Route>

          {/* Default redirect */}
          <Route path="/" element={<Navigate to="/public" replace />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </Suspense>
    </BrowserRouter>
  );
}
