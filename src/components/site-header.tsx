import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { PanelLeftIcon } from 'lucide-react';

import { SearchForm } from '@/components/search-form';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { useSidebar } from '@/components/ui/sidebar';

export type SiteHeaderCrumb = {
  label: string;
  to?: string;
};

export function SiteHeader({
  breadcrumbs,
  searchPlaceholder,
  onSearch,
  children,
}: {
  breadcrumbs: SiteHeaderCrumb[];
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
        <Separator
          orientation="vertical"
          className="mr-2 data-vertical:h-4 data-vertical:self-auto"
        />
        <Breadcrumb className="hidden sm:block">
          <BreadcrumbList>
            {breadcrumbs.flatMap((crumb, index) => {
              const last = index === breadcrumbs.length - 1;
              const nodes = [];
              if (index > 0) {
                nodes.push(<BreadcrumbSeparator key={`sep-${crumb.label}-${index}`} />);
              }
              nodes.push(
                <BreadcrumbItem key={`item-${crumb.label}-${index}`}>
                  {last || !crumb.to ? (
                    <BreadcrumbPage>{crumb.label}</BreadcrumbPage>
                  ) : (
                    <BreadcrumbLink render={<Link to={crumb.to} />}>
                      {crumb.label}
                    </BreadcrumbLink>
                  )}
                </BreadcrumbItem>,
              );
              return nodes;
            })}
          </BreadcrumbList>
        </Breadcrumb>
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
