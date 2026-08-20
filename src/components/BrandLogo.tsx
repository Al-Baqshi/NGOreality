import { Link } from 'react-router-dom';
import { useTheme } from '../contexts/ThemeContext';

type BrandLogoProps = {
  /** Icon only, or icon + wordmark */
  variant?: 'full' | 'icon';
  linkToPublic?: boolean;
  /** Show tagline under the name (full variant only) */
  showTagline?: boolean;
  /** Horizontal (header) or stacked icon above wordmark (footer) */
  layout?: 'horizontal' | 'stacked';
  /** Allow wordmark / tagline to wrap instead of overflowing */
  allowWrap?: boolean;
  className?: string;
  linkClassName?: string;
  /** Icon mark size */
  iconClassName?: string;
  /** Footer / CRM dark chrome — light text, light icon strokes */
  onDark?: boolean;
};

const ICON_LIGHT = '/logo-icon.svg';
const ICON_DARK = '/logo-icon-dark.svg';

export default function BrandLogo({
  variant = 'full',
  linkToPublic = false,
  showTagline = true,
  layout = 'horizontal',
  allowWrap = false,
  className = '',
  linkClassName = '',
  iconClassName = 'h-12 w-12 sm:h-14 sm:w-14 md:h-[3.75rem] md:w-[3.75rem] shrink-0',
  onDark = false,
}: BrandLogoProps) {
  const { resolvedTheme } = useTheme();
  const isDark = onDark || resolvedTheme === 'dark';
  const src = isDark ? ICON_DARK : ICON_LIGHT;

  const nameClass = isDark
    ? 'text-white'
    : 'text-ink-950 dark:text-ink-50';

  const taglineClass = isDark
    ? 'text-[#EBBB57]'
    : 'text-ink-500 dark:text-ink-400';

  if (variant === 'icon') {
    const icon = (
      <img
        src={src}
        alt="NGOreality"
        className={`object-contain ${iconClassName}`}
        decoding="async"
      />
    );
    if (linkToPublic) {
      return (
        <Link
          to="/public"
          className={`inline-flex shrink-0 cursor-pointer select-none caret-transparent focus:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 ${linkClassName}`}
        >
          {icon}
        </Link>
      );
    }
    return icon;
  }

  const nowrap = allowWrap ? '' : 'whitespace-nowrap';
  const stacked = layout === 'stacked';

  const lockup = (
    <div
      className={`inline-flex min-w-0 max-w-full ${
        stacked ? 'flex-col items-start gap-3' : 'items-center gap-2.5 sm:gap-3'
      } ${className}`}
      aria-label="NGOreality — Digital trust infrastructure"
    >
      <img
        src={src}
        alt=""
        aria-hidden
        className={`object-contain shrink-0 ${iconClassName}`}
        decoding="async"
      />
      <div className="flex flex-col justify-center min-w-0 max-w-full gap-0.5 sm:gap-1 leading-snug pointer-events-none select-none">
        <span
          className={`font-black uppercase tracking-[0.04em] text-base sm:text-lg md:text-xl ${nowrap} ${nameClass}`}
        >
          NGOREALITY
        </span>
        {showTagline && (
          <span
            className={`font-mono font-medium uppercase tracking-[0.12em] sm:tracking-[0.2em] text-[0.65rem] sm:text-xs ${nowrap} ${taglineClass}`}
          >
            Digital trust infrastructure
          </span>
        )}
      </div>
    </div>
  );

  if (linkToPublic) {
    return (
      <Link
        to="/public"
        className={`inline-flex min-w-0 cursor-pointer select-none caret-transparent focus:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 dark:focus-visible:ring-offset-ink-900 ${linkClassName}`}
      >
        {lockup}
      </Link>
    );
  }

  return lockup;
}
