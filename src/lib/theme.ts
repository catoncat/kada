export type ThemePreference = 'system' | 'light' | 'dark';

const THEME_STORAGE_KEY = 'spv2_theme_preference';

function isThemePreference(value: unknown): value is ThemePreference {
  return value === 'system' || value === 'light' || value === 'dark';
}

export function getThemePreference(): ThemePreference {
  try {
    const value = localStorage.getItem(THEME_STORAGE_KEY);
    return isThemePreference(value) ? value : 'system';
  } catch {
    return 'system';
  }
}

export function setThemePreference(preference: ThemePreference) {
  try {
    localStorage.setItem(THEME_STORAGE_KEY, preference);
  } catch {
    // ignore
  }
  applyThemePreference(preference);
}

export function resolveTheme(preference: ThemePreference): 'light' | 'dark' {
  if (preference === 'light' || preference === 'dark') return preference;
  const prefersDark =
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-color-scheme: dark)').matches;
  return prefersDark ? 'dark' : 'light';
}

export function applyThemePreference(preference: ThemePreference) {
  if (typeof document === 'undefined') return;
  const resolved = resolveTheme(preference);
  document.documentElement.classList.toggle('dark', resolved === 'dark');
  document.documentElement.dataset.theme = preference;
  document.documentElement.style.colorScheme = resolved;
}

export function startThemeSync() {
  if (typeof window === 'undefined') return () => {};

  const media =
    typeof window.matchMedia === 'function'
      ? window.matchMedia('(prefers-color-scheme: dark)')
      : null;

  const applyFromStorage = () => applyThemePreference(getThemePreference());

  applyFromStorage();

  const onChange = () => {
    const preference = getThemePreference();
    if (preference !== 'system') return;
    applyThemePreference(preference);
  };

  try {
    media?.addEventListener('change', onChange);
  } catch {
    media?.addListener?.(onChange);
  }

  window.addEventListener('storage', applyFromStorage);

  return () => {
    try {
      media?.removeEventListener('change', onChange);
    } catch {
      media?.removeListener?.(onChange);
    }
    window.removeEventListener('storage', applyFromStorage);
  };
}
