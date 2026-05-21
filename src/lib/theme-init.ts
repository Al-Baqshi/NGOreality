const STORAGE_KEY = 'ngoreality-theme';

function shouldUseDark(): boolean {
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored === 'dark') return true;
  if (stored === 'light') return false;
  return window.matchMedia('(prefers-color-scheme: dark)').matches;
}

if (shouldUseDark()) {
  document.documentElement.classList.add('dark');
}
