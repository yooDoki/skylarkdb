/**
 * 读取 Tauri OS 插件注入的运行时平台（编译期确定），用于 Windows / macOS / Linux 等 UI 差异。
 * 非 Tauri 环境（如纯浏览器打开 Vite）无注入对象时返回 other。
 */
export type HostPlatform = 'macos' | 'windows' | 'linux' | 'other';

type OsPluginInternals = { platform?: string };

export function getTauriHostPlatform(): HostPlatform {
  if (typeof window === 'undefined') return 'other';
  const internals = (window as Window & { __TAURI_OS_PLUGIN_INTERNALS__?: OsPluginInternals })
    .__TAURI_OS_PLUGIN_INTERNALS__;
  const p = internals?.platform;
  if (p === 'macos' || p === 'windows' || p === 'linux') return p;
  return 'other';
}
