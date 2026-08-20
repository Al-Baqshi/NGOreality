import type { ReactNode } from 'react';
import { PanelLeftIcon } from 'lucide-react';

import { SearchForm } from '@/components/search-form';
import { Button } from '@/components/ui/button';
import { useSidebar } from '@/components/ui/sidebar';

export function SiteHeader({
  searchPlaceholder,
  onSearch,
  children,
}: {
  searchPlaceholder?: string;
  onSearch?: (query: string) => void;
  children?: ReactNode;
}) {
  const { toggleSidebar } = useSidebar();

  return (
    <header className="bg-background sticky top-0 z-50 flex w-full shrink-0 items-center border-b">
      <div className="flex h-(--header-height) w-full items-center gap-2 px-4">
        <Button
          className="h-8 w-8"
          variant="ghost"
          size="icon"
          onClick={toggleSidebar}
        >
          <PanelLeftIcon />
          <span className="sr-only">Toggle sidebar</span>
        </Button>
        <div className="ml-auto flex min-w-0 items-center gap-2">
          {onSearch ? (
            <SearchForm
              className="hidden w-auto sm:block"
              placeholder={searchPlaceholder}
              onSubmit={(event) => {
                event.preventDefault();
                const value = String(new FormData(event.currentTarget).get('q') ?? '').trim();
                onSearch(value);
              }}
            />
          ) : null}
          {children}
        </div>
      </div>
    </header>
  );
}
