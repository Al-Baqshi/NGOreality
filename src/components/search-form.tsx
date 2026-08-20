import * as React from 'react';
import { Search } from 'lucide-react';

import { Label } from '@/components/ui/label';
import { SidebarInput } from '@/components/ui/sidebar';

export function SearchForm({
  placeholder = 'Type to search...',
  ...props
}: React.ComponentProps<'form'> & { placeholder?: string }) {
  const id = React.useId();

  return (
    <form {...props}>
      <div className="relative">
        <Label htmlFor={id} className="sr-only">
          Search
        </Label>
        <SidebarInput
          id={id}
          name="q"
          placeholder={placeholder}
          className="h-8 pl-7"
        />
        <Search className="pointer-events-none absolute top-1/2 left-2 size-4 -translate-y-1/2 opacity-50 select-none" />
      </div>
    </form>
  );
}
