import type { VerificationCriterion } from '../types';
import { MEMBER_CRITERIA, PUBLIC_BADGE_CRITERIA } from '../types';

export type CriterionTier = 'public' | 'member';

export function isPublicCriterion(c: Pick<VerificationCriterion, 'criterion_key' | 'criterion_tier'>): boolean {
  if (c.criterion_tier === 'public') return true;
  if (c.criterion_tier === 'member') return false;
  return PUBLIC_BADGE_CRITERIA.some((d) => d.criterion_key === c.criterion_key);
}

export function isMemberCriterion(c: Pick<VerificationCriterion, 'criterion_key' | 'criterion_tier'>): boolean {
  if (c.criterion_tier === 'member') return true;
  if (c.criterion_tier === 'public') return false;
  return MEMBER_CRITERIA.some((d) => d.criterion_key === c.criterion_key);
}

export function allPublicCriteriaPass(criteria: VerificationCriterion[]): boolean {
  const publicRows = criteria.filter(isPublicCriterion);
  if (publicRows.length < PUBLIC_BADGE_CRITERIA.length) return false;
  const keys = new Set(PUBLIC_BADGE_CRITERIA.map((d) => d.criterion_key));
  const relevant = publicRows.filter((c) => keys.has(c.criterion_key));
  if (relevant.length < PUBLIC_BADGE_CRITERIA.length) return false;
  return relevant.every((c) => c.status === 'pass');
}

export function publicCriteriaScore(criteria: VerificationCriterion[]): number {
  const publicRows = criteria.filter(isPublicCriterion);
  if (publicRows.length === 0) return 0;
  return Math.round((publicRows.filter((c) => c.status === 'pass').length / publicRows.length) * 100);
}
