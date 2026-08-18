import { useState } from 'react';
import { Search, Funnel } from 'lucide-react';
import { OUTREACH_KANBAN_STATUSES, OUTREACH_STATUS_LABELS } from '../../types';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

interface Props {
  searchValue: string;
  onSearchChange: (value: string) => void;
  onSearchSubmit: (value: string) => void;
  statusFilter: string;
  onStatusFilterChange: (value: string) => void;
  locationFilter: string;
  onLocationFilterChange: (value: string) => void;
  categoryFilter: string;
  onCategoryFilterChange: (value: string) => void;
  sortBy: string;
  onSortChange: (value: string) => void;
  totalCount: number;
  className?: string;
}

const SORT_OPTIONS = [
  { value: 'name', label: 'Name (A-Z)' },
  { value: '-name', label: 'Name (Z-A)' },
  { value: 'last_outreach', label: 'Last outreach' },
  { value: 'created', label: 'Date added' },
];

export default function OutreachToolbar({
  searchValue,
  onSearchChange,
  onSearchSubmit,
  statusFilter,
  onStatusFilterChange,
  locationFilter,
  onLocationFilterChange,
  categoryFilter,
  onCategoryFilterChange,
  sortBy,
  onSortChange,
  totalCount,
  className = '',
}: Props) {
  const [showFilters, setShowFilters] = useState(false);

  return (
    <div className={`card-brutal p-4 mb-4 ${className}`}>
      <div className="flex flex-wrap items-center gap-3 mb-3">
        <span className="font-mono text-2xs uppercase tracking-wider text-ink-500">
          {totalCount.toLocaleString()} organizations
        </span>

        <form
          className="flex-1 min-w-[280px] max-w-md"
          onSubmit={(e) => {
            e.preventDefault();
            onSearchSubmit(searchValue);
          }}
        >
          <div className="relative">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-400" />
            <input
              type="search"
              className="input-brutal w-full pl-9 min-h-[44px]"
              placeholder="Search organizations..."
              value={searchValue}
              onChange={(e) => onSearchChange(e.target.value)}
              aria-label="Search organizations"
            />
          </div>
        </form>

        <button
          type="button"
          onClick={() => setShowFilters(!showFilters)}
          className={`btn-brutal-outline min-h-[44px] flex items-center gap-2 ${showFilters ? 'bg-ink-100 dark:bg-ink-800' : ''}`}
        >
          <Funnel size={16} /> Filters
        </button>
      </div>

      {showFilters && (
        <div className="flex flex-wrap items-center gap-3 pt-3 border-t border-ink-200 dark:border-ink-800">
          <Select value={statusFilter} onValueChange={onStatusFilterChange}>
            <SelectTrigger className="w-[180px] min-h-[44px]">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="">All statuses</SelectItem>
              {OUTREACH_KANBAN_STATUSES.map((s) => (
                <SelectItem key={s} value={s}>
                  {OUTREACH_STATUS_LABELS[s]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={locationFilter} onValueChange={onLocationFilterChange}>
            <SelectTrigger className="w-[180px] min-h-[44px]">
              <SelectValue placeholder="Location" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="">All locations</SelectItem>
              <SelectItem value="NZ">New Zealand</SelectItem>
              <SelectItem value="AU">Australia</SelectItem>
              <SelectItem value="US">United States</SelectItem>
              <SelectItem value="GB">United Kingdom</SelectItem>
              <SelectItem value="CA">Canada</SelectItem>
              <SelectItem value="IE">Ireland</SelectItem>
              <SelectItem value="SG">Singapore</SelectItem>
              <SelectItem value="HK">Hong Kong</SelectItem>
              <SelectItem value="DE">Germany</SelectItem>
              <SelectItem value="FR">France</SelectItem>
              <SelectItem value="OTHER">Other</SelectItem>
            </SelectContent>
          </Select>

          <Select value={categoryFilter} onValueChange={onCategoryFilterChange}>
            <SelectTrigger className="w-[180px] min-h-[44px]">
              <SelectValue placeholder="Category" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="">All categories</SelectItem>
              <SelectItem value="Education">Education</SelectItem>
              <SelectItem value="Health">Health</SelectItem>
              <SelectItem value="Environment">Environment</SelectItem>
              <SelectItem value="Social Services">Social Services</SelectItem>
              <SelectItem value="Arts & Culture">Arts & Culture</SelectItem>
              <SelectItem value="Human Rights">Human Rights</SelectItem>
              <SelectItem value="Community Development">Community Development</SelectItem>
              <SelectItem value="Animal Welfare">Animal Welfare</SelectItem>
              <SelectItem value="Disaster Relief">Disaster Relief</SelectItem>
              <SelectItem value="Youth Development">Youth Development</SelectItem>
              <SelectItem value="Other">Other</SelectItem>
            </SelectContent>
          </Select>

          <Select value={sortBy} onValueChange={onSortChange}>
            <SelectTrigger className="w-[180px] min-h-[44px]">
              <SelectValue placeholder="Sort" />
            </SelectTrigger>
            <SelectContent>
              {SORT_OPTIONS.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}
    </div>
  );
}