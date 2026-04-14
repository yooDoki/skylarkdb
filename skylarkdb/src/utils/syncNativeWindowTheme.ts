import { setTheme } from '@tauri-apps/api/app';

function isTauriRuntime(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
}

/** 与页面 dark 类同步，使系统标题栏在暗黑模式下不为浅色（macOS / Windows）。 */
export function syncNativeWindowTheme(): void {
  if (!isTauriRuntime()) return;
  const isDark = document.documentElement.classList.contains('dark');
  void setTheme(isDark ? 'dark' : 'light');
}

export function initNativeWindowThemeSync(): void {
  if (!isTauriRuntime()) return;
  syncNativeWindowTheme();
  const observer = new MutationObserver(() => {
    syncNativeWindowTheme();
  });
  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ['class'],
  });
}
