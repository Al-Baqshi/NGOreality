import { BookMarked, PenLine } from 'lucide-react';
import { REGISTRY_SOURCE_LABELS } from '../../types';

/**
 * Answers the one question staff keep asking about a signup: did this NGO come
 * from the official registry import, or did someone type it in themselves?
 */
export default function OrgOriginChip({
  sourceRegistry,
  registrationNumber,
}: {
  sourceRegistry: string;
  registrationNumber?: string;
}) {
  if (sourceRegistry) {
    return (
      <span className="inline-flex items-center gap-1.5 border border-teal bg-teal-light text-teal font-mono text-2xs font-semibold uppercase tracking-wider px-2.5 py-1 max-w-full">
        <BookMarked size={12} className="shrink-0" />
        <span className="truncate">
          {REGISTRY_SOURCE_LABELS[sourceRegistry] || sourceRegistry}
        </span>
        {registrationNumber && (
          <span className="normal-case tracking-normal font-medium opacity-80 hidden sm:inline">
            · {registrationNumber}
          </span>
        )}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 border border-amber-400 bg-amber-50 text-amber-900 font-mono text-2xs font-semibold uppercase tracking-wider px-2.5 py-1 max-w-full dark:border-amber-600 dark:bg-amber-950/40 dark:text-amber-100">
      <PenLine size={12} className="shrink-0" />
      <span className="truncate">New submission</span>
    </span>
  );
}
