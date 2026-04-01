import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { TableData } from '@/types';

export interface QueryHistoryItem {
  query: string;
  timestamp: number;
  executionTime: number;
  rowCount?: number;
}

export interface QueryTab {
  id: string;
  name: string;
  query: string;
  result: TableData | null;
  error: string | null;
  isExecuting: boolean;
  history: QueryHistoryItem[];
}

interface QueryStore {
  tabs: QueryTab[];
  activeTabId: string;
  globalHistory: QueryHistoryItem[];

  addTab: () => void;
  closeTab: (id: string) => void;
  setActiveTabId: (id: string) => void;
  updateTab: (id: string, updates: Partial<QueryTab>) => void;
  addToHistory: (item: QueryHistoryItem) => void;
  clearHistory: () => void;
  resetTabs: () => void;
}

const MAX_HISTORY = 50;

const createDefaultTab = (): QueryTab => ({
  id: '1',
  name: '查询 1',
  query: '',
  result: null,
  error: null,
  isExecuting: false,
  history: [],
});

export const useQueryStore = create<QueryStore>()(
  persist(
    (set, get) => ({
      tabs: [createDefaultTab()],
      activeTabId: '1',
      globalHistory: [],

      addTab: () => {
        const { tabs } = get();
        const newId = Date.now().toString();
        const newTab: QueryTab = {
          id: newId,
          name: `查询 ${tabs.length + 1}`,
          query: '',
          result: null,
          error: null,
          isExecuting: false,
          history: [],
        };
        set({
          tabs: [...tabs, newTab],
          activeTabId: newId,
        });
      },

      closeTab: id => {
        const { tabs, activeTabId } = get();
        if (tabs.length === 1) return;

        const newTabs = tabs.filter(t => t.id !== id);
        const newActiveTabId = activeTabId === id ? newTabs[0].id : activeTabId;

        set({
          tabs: newTabs,
          activeTabId: newActiveTabId,
        });
      },

      setActiveTabId: id => {
        set({ activeTabId: id });
      },

      updateTab: (id, updates) => {
        set(state => ({
          tabs: state.tabs.map(t => (t.id === id ? { ...t, ...updates } : t)),
        }));
      },

      addToHistory: item => {
        set(state => ({
          globalHistory: [item, ...state.globalHistory.slice(0, MAX_HISTORY - 1)],
        }));
      },

      clearHistory: () => {
        set({ globalHistory: [] });
      },

      resetTabs: () => {
        set({
          tabs: [createDefaultTab()],
          activeTabId: '1',
        });
      },
    }),
    {
      name: 'skylarkdb-query-state',
      partialize: state => ({
        tabs: state.tabs.map(tab => ({
          id: tab.id,
          name: tab.name,
          query: tab.query,
        })),
        activeTabId: state.activeTabId,
        globalHistory: state.globalHistory,
      }),
    }
  )
);
