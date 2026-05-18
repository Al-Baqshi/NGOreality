import { Link } from 'react-router-dom';

type BrandLogoProps = {
  /** Full wordmark image, or icon-only mark */
  variant?: 'full' | 'icon';
  /** Wrap in link to public home */
  linkToPublic?: boolean;
  /** Show “NGOreality” text beside the icon (full variant only) */
  showWordmarkText?: boolean;
  className?: string;
  iconClassName?: string;
  wordmarkClassName?: string;
  /** Light logo treatment for dark backgrounds (footer, CRM sidebar) */
  onDark?: boolean;
};

const iconSrc = '/logo-icon-36.png';
const wordmarkSrc = '/logo-wordmark.png';

export default function BrandLogo({
  variant = 'full',
  linkToPublic = false,
  showWordmarkText = false,
  className = '',
  iconClassName = 'h-9 w-9',
  wordmarkClassName = 'h-8 sm:h-9 w-auto max-w-[200px]',
  onDark = false,
}: BrandLogoProps) {
  const tone = onDark ? 'brightness-0 invert' : '';
  const content =
    variant === 'icon' ? (
      <img
        src={iconSrc}
        alt="NGOreality"
        className={`object-contain shrink-0 ${tone} ${iconClassName}`}
        width={36}
        height={36}
        decoding="async"
      />
    ) : (
      <div className={`flex items-center gap-2 sm:gap-3 min-w-0 ${className}`}>
        <img
          src={iconSrc}
          alt=""
          className={`object-contain shrink-0 ${tone} ${iconClassName}`}
          width={36}
          height={36}
          decoding="async"
          aria-hidden
        />
        {showWordmarkText ? (
          <span
            className={`text-lg font-black uppercase tracking-[0.15em] truncate ${onDark ? 'text-white' : 'text-ink-950'}`}
          >
            NGOreality
          </span>
        ) : (
          <img
            src={wordmarkSrc}
            alt="NGOreality"
            className={`object-contain object-left min-w-0 ${tone} ${wordmarkClassName}`}
            decoding="async"
          />
        )}
      </div>
    );

  if (linkToPublic) {
    return (
      <Link to="/public" className="inline-flex items-center min-w-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2">
        {content}
      </Link>
    );
  }

  return content;
}
