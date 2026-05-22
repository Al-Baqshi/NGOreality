import { Moon, Sun } from 'lucide-react';
import { useTheme } from '../contexts/ThemeContext';

type ThemeToggleProps = {
  className?: string;
};

export default function ThemeToggle({ className = '' }: ThemeToggleProps) {
  const { resolvedTheme, toggleTheme } = useTheme();
  const isDark = resolvedTheme === 'dark';

  return (
    <button
      type="button"
      onClick={toggleTheme}
      className={`flex min-h-9 min-w-9 items-center justify-center rounded-md border border-sidebar-border text-sidebar-foreground/80 transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground sm:min-h-10 sm:min-w-10 ${className}`}
      aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
      title={isDark ? 'Light mode' : 'Dark mode'}
    >
      {isDark ? <Sun size={18} aria-hidden /> : <Moon size={18} aria-hidden />}
    </button>
  );
}
