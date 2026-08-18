import { Moon, Sun } from 'lucide-react';
import { useTheme } from '../contexts/ThemeContext';

type ThemeToggleProps = {
  className?: string;
  /**
   * `outline` — bordered square that matches the public site's heavy chrome.
   * `ghost` — quiet icon button for app headers (CRM / portal), where a
   * bordered brutalist square reads as noise.
   */
  variant?: 'outline' | 'ghost';
};

export default function ThemeToggle({ className = '', variant = 'outline' }: ThemeToggleProps) {
  const { resolvedTheme, toggleTheme } = useTheme();
  const isDark = resolvedTheme === 'dark';

  const styles =
    variant === 'ghost'
      ? 'flex size-9 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'
      : 'flex min-h-9 min-w-9 items-center justify-center rounded-md border-2 border-ink-950 text-ink-950 transition-colors hover:bg-ink-50 dark:border-ink-200 dark:text-ink-50 dark:hover:bg-ink-800 sm:min-h-10 sm:min-w-10';

  return (
    <button
      type="button"
      onClick={toggleTheme}
      className={`${styles} ${className}`}
      aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
      title={isDark ? 'Light mode' : 'Dark mode'}
    >
      {isDark ? <Sun size={variant === 'ghost' ? 16 : 18} aria-hidden /> : <Moon size={variant === 'ghost' ? 16 : 18} aria-hidden />}
    </button>
  );
}
