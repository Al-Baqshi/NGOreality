import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import CRMLayout from './components/Layout';
import PublicLayout from './components/PublicLayout';
import Dashboard from './pages/crm/Dashboard';
import OrganizationsList from './pages/crm/OrganizationsList';
import OrganizationDetail from './pages/crm/OrganizationDetail';
import OrganizationNew from './pages/crm/OrganizationNew';
import Verification from './pages/crm/Verification';
import Contacts from './pages/crm/Contacts';
import Inquiries from './pages/crm/Inquiries';
import BlogManager from './pages/crm/BlogManager';
import OutreachBoard from './pages/crm/OutreachBoard';
import InboundQueue from './pages/crm/InboundQueue';
import CustomersList from './pages/crm/CustomersList';
import PaymentsList from './pages/crm/PaymentsList';
// TODO: re-enable once external business plan is finalized
// import BusinessPlan from './pages/crm/BusinessPlan';
import CashFlow from './pages/crm/CashFlow';
import WorkQueue from './pages/crm/WorkQueue';
import CrmBadges from './pages/crm/CrmBadges';
import Monitoring from './pages/crm/Monitoring';
import CrmNotificationInbox from './pages/crm/CrmNotificationInbox';
import EmailNotifications from './pages/crm/EmailNotifications';
import Homepage from './pages/public/Homepage';
import HowItWorks from './pages/public/HowItWorks';
import Directory from './pages/public/Directory';
import VerificationPublic from './pages/public/Verification';
import RealityBadge from './pages/public/RealityBadge';
import Verified from './pages/public/Verified';
import Blog from './pages/public/Blog';
import BlogDetail from './pages/public/BlogDetail';
import About from './pages/public/About';
import Contact from './pages/public/Contact';
import BusinessPlanGate from './pages/public/BusinessPlanGate';
import PrivacyPolicy from './pages/public/PrivacyPolicy';
import TermsOfService from './pages/public/TermsOfService';
import OrganizationProfile from './pages/public/OrganizationProfile';
import NotFound from './pages/public/NotFound';
import NgoLogin from './pages/ngo/NgoLogin';
import NgoSignup from './pages/ngo/NgoSignup';
import NgoLayout from './components/NgoLayout';
import NgoPortalGate from './components/ngo/NgoPortalGate';
import NgoOverviewPage from './pages/ngo/portal/NgoOverviewPage';
import NgoProfilePage from './pages/ngo/portal/NgoProfilePage';
import NgoSetupRequestPage from './pages/ngo/portal/NgoSetupRequestPage';
import NgoMembershipPage from './pages/ngo/portal/NgoMembershipPage';
import NgoStandardsPage from './pages/ngo/portal/NgoStandardsPage';
import NgoBadgePage from './pages/ngo/portal/NgoBadgePage';
import NgoMonitoringPage from './pages/ngo/portal/NgoMonitoringPage';
import NgoRequestsPage from './pages/ngo/portal/NgoRequestsPage';
import NgoNotificationsPage from './pages/ngo/portal/NgoNotificationsPage';
import NgoProtectedRoute from './components/NgoProtectedRoute';
import StaffProtectedRoute from './components/StaffProtectedRoute';
import StaffLogin from './pages/staff/StaffLogin';
import { isSupabaseConfigured } from './lib/supabase';

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
            <Route path="/outreach" element={<OutreachBoard />} />
            <Route path="/inbound" element={<InboundQueue />} />
            <Route path="/customers" element={<CustomersList />} />
            <Route path="/payments" element={<PaymentsList />} />
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
          <Route path="verification" element={<VerificationPublic />} />
          <Route path="blog" element={<Blog />} />
          <Route path="blog/:slug" element={<BlogDetail />} />
          <Route path="about" element={<About />} />
          <Route path="contact" element={<Contact />} />
          <Route path="business-plan" element={<BusinessPlanGate />} />
          <Route path="privacy" element={<PrivacyPolicy />} />
          <Route path="terms" element={<TermsOfService />} />
        </Route>

        {/* Default redirect */}
        <Route path="/" element={<Navigate to="/public" replace />} />
        <Route path="*" element={<NotFound />} />
      </Routes>
    </BrowserRouter>
  );
}
