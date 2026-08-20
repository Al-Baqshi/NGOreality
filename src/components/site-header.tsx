import type { ReactNode } from 'react';
import { PanelLeftIcon } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { useSidebar } from '@/components/ui/sidebar';

export function SiteHeader({ children }: { children?: ReactNode }) {
  const { toggleSidebar } = useSidebar();

  return (
    <header className="bg-background sticky top-0 z-40 flex h-14 shrink-0 items-center gap-2 border-b px-3 sm:px-4">
      <Button
        className="h-8 w-8"
        variant="ghost"
        size="icon"
        onClick={toggleSidebar}
      >
        <PanelLeftIcon />
        <span className="sr-only">Toggle sidebar</span>
      </Button>
      <div className="ml-auto flex min-w-0 items-center gap-2">{children}</div>
    </header>
  );
}
