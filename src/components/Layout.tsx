import { Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import ThemeToggle from './ThemeToggle';
import PortalNotificationBell from './notifications/PortalNotificationBell';
import { CrmAppSidebar } from './crm/CrmAppSidebar';
import { NavUser } from './nav-user';
import { SiteHeader } from './site-header';
import { SidebarInset, SidebarProvider } from '@/components/ui/sidebar';
import { TooltipProvider } from '@/components/ui/tooltip';

export default function CRMLayout() {
  const { signOut } = useAuth();
  const navigate = useNavigate();

  const handleSignOut = async () => {
    await signOut();
    navigate('/staff/login', { replace: true });
  };

  return (
    <TooltipProvider delay={0}>
      <SidebarProvider>
        <CrmAppSidebar />
        <SidebarInset className="flex min-h-svh min-w-0 flex-1 flex-col overflow-hidden bg-background">
          <SiteHeader>
            <ThemeToggle variant="ghost" />
            <PortalNotificationBell audience="staff" to="/notifications" />
            <NavUser onSignOut={handleSignOut} />
          </SiteHeader>
          <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden p-3 sm:p-5 lg:p-8">
            <div className="flex w-full min-w-0 flex-col gap-4 sm:gap-6">
              <Outlet />
            </div>
          </div>
        </SidebarInset>
      </SidebarProvider>
    </TooltipProvider>
  );
}
