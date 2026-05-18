import { Link } from 'react-router-dom';

type BrandLogoProps = {
  /** Full horizontal logo, or compact mark (sidebar collapsed only) */
  variant?: 'full' | 'icon';
  linkToPublic?: boolean;
  className?: string;
  /** Full logo height (width scales with aspect ratio) */
  fullClassName?: string;
  /** Compact mark — sidebar collapsed only; not for favicon use in headers */
  iconClassName?: string;
  onDark?: boolean;
};

const fullLogoSrc = '/logo.svg';
const iconLogoSrc = '/logo-icon.svg';

export default function BrandLogo({
  variant = 'full',
  linkToPublic = false,
  className = '',
  fullClassName = 'h-12 sm:h-14 md:h-16 w-auto max-w-[min(320px,72vw)]',
  iconClassName = 'h-10 w-10 sm:h-11 sm:w-11',
  onDark = false,
}: BrandLogoProps) {
  const tone = onDark ? 'brightness-0 invert' : '';

  const content =
    variant === 'icon' ? (
      <img
        src={iconLogoSrc}
        alt="NGOreality"
        className={`object-contain shrink-0 ${tone} ${iconClassName}`}
        decoding="async"
      />
    ) : (
      <img
        src={fullLogoSrc}
        alt="NGOreality"
        className={`object-contain object-left shrink-0 ${tone} ${fullClassName} ${className}`}
        decoding="async"
      />
    );

  if (linkToPublic) {
    return (
      <Link
        to="/public"
        className="inline-flex items-center min-w-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2"
      >
        {content}
      </Link>
    );
  }

  return content;
}
