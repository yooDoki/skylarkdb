import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { logError } from '@/utils/errorHandler';

type ThemeMode = 'light' | 'dark' | 'system';

interface SettingsState {
  theme: ThemeMode;
  connectionTimeout: number;
  autoReconnect: boolean;
  showStatusBar: boolean;
  showLineNumbers: boolean;
  wordWrap: boolean;
  autoSave: boolean;
  confirmBeforeDelete: boolean;
  rowsPerPage: number;
}

const defaultSettings: SettingsState = {
  theme: 'system',
  connectionTimeout: 30,
  autoReconnect: true,
  showStatusBar: false,
  showLineNumbers: true,
  wordWrap: true,
  autoSave: true,
  confirmBeforeDelete: true,
  rowsPerPage: 15,
};

const SETTINGS_KEY = 'skylarkdb-settings';

interface SettingsContextValue {
  settings: SettingsState;
  isLoaded: boolean;
  updateSetting: <K extends keyof SettingsState>(key: K, value: SettingsState[K]) => void;
  resetSettings: () => void;
}

const SettingsContext = createContext<SettingsContextValue | null>(null);

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<SettingsState>(defaultSettings);
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(SETTINGS_KEY);
      if (saved) {
        const parsed = JSON.parse(saved) as Partial<SettingsState>;
        setSettings({ ...defaultSettings, ...parsed });
      }
    } catch (error) {
      logError('Settings - Load', error);
    }
    setIsLoaded(true);
  }, []);

  useEffect(() => {
    if (!isLoaded) return;
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
    } catch (error) {
      logError('Settings - Save', error);
    }
  }, [settings, isLoaded]);

  useEffect(() => {
    let transitionTimer: ReturnType<typeof setTimeout> | undefined;

    const applyTheme = () => {
      const theme = settings.theme;
      document.documentElement.classList.add('theme-transition');

      if (theme === 'dark') {
        document.documentElement.classList.add('dark');
      } else if (theme === 'light') {
        document.documentElement.classList.remove('dark');
      } else {
        const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
        document.documentElement.classList.toggle('dark', prefersDark);
      }

      if (transitionTimer) clearTimeout(transitionTimer);
      transitionTimer = window.setTimeout(() => {
        document.documentElement.classList.remove('theme-transition');
      }, 300);
    };

    applyTheme();

    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const handleChange = () => {
      if (settings.theme === 'system') {
        applyTheme();
      }
    };

    mediaQuery.addEventListener('change', handleChange);
    return () => {
      mediaQuery.removeEventListener('change', handleChange);
      if (transitionTimer) clearTimeout(transitionTimer);
    };
  }, [settings.theme]);

  const updateSetting = useCallback(
    <K extends keyof SettingsState>(key: K, value: SettingsState[K]) => {
      setSettings(prev => ({ ...prev, [key]: value }));
    },
    []
  );

  const resetSettings = useCallback(() => {
    setSettings(defaultSettings);
  }, []);

  const value = useMemo(
    () => ({
      settings,
      isLoaded,
      updateSetting,
      resetSettings,
    }),
    [settings, isLoaded, updateSetting, resetSettings]
  );

  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>;
}

export function useSettings(): SettingsContextValue {
  const ctx = useContext(SettingsContext);
  if (!ctx) {
    throw new Error('useSettings 必须在 SettingsProvider 内使用');
  }
  return ctx;
}

export type { SettingsState, ThemeMode };
export { defaultSettings };
