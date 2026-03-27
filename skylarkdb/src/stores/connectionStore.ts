import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { DatabaseConnection, ConnectionState, ConnectionStatus } from '@/types';

interface ConnectionStore {
  connections: DatabaseConnection[];
  activeConnection: ConnectionState;
  activeConnectionId: string | null;
  selectedDatabase: string | null;
  addConnection: (connection: Omit<DatabaseConnection, 'id' | 'createdAt' | 'updatedAt'>) => void;
  updateConnection: (id: string, updates: Partial<DatabaseConnection>) => void;
  deleteConnection: (id: string) => void;
  setActiveConnection: (connection: DatabaseConnection | null) => void;
  setConnectionStatus: (status: ConnectionStatus, error?: string) => void;
  setSelectedDatabase: (database: string | null) => void;
}

export const useConnectionStore = create<ConnectionStore>()(
  persist(
    (set) => ({
      connections: [],
      activeConnectionId: null,
      selectedDatabase: null,
      activeConnection: {
        connection: null,
        status: 'disconnected',
        error: null,
      },

      addConnection: (connectionData) => {
        const newConnection: DatabaseConnection = {
          ...connectionData,
          id: crypto.randomUUID(),
          createdAt: Date.now(),
          updatedAt: Date.now(),
        };
        set((state) => ({
          connections: [...state.connections, newConnection],
        }));
      },

      updateConnection: (id, updates) => {
        set((state) => ({
          connections: state.connections.map((conn) =>
            conn.id === id
              ? { ...conn, ...updates, updatedAt: Date.now() }
              : conn
          ),
        }));
      },

      deleteConnection: (id) => {
        set((state) => ({
          connections: state.connections.filter((conn) => conn.id !== id),
          activeConnectionId:
            state.activeConnection.connection?.id === id ? null : state.activeConnectionId,
          selectedDatabase:
            state.activeConnection.connection?.id === id ? null : state.selectedDatabase,
          activeConnection:
            state.activeConnection.connection?.id === id
              ? { connection: null, status: 'disconnected', error: null }
              : state.activeConnection,
        }));
      },

      setActiveConnection: (connection) => {
        const nextDatabase = connection?.type === 'mysql'
          ? connection.database?.trim() || null
          : null;

        set({
          activeConnectionId: connection?.id || null,
          selectedDatabase: nextDatabase,
          activeConnection: {
            connection,
            status: connection ? 'disconnected' : 'disconnected',
            error: null,
          },
        });
      },

      setConnectionStatus: (status, error) => {
        set((state) => ({
          activeConnection: {
            ...state.activeConnection,
            status,
            error: error || null,
          },
        }));
      },

      setSelectedDatabase: (database) => {
        set({ selectedDatabase: database });
      },
    }),
    {
      name: 'skylarkdb-connections',
      partialize: (state) => ({ 
        connections: state.connections,
        activeConnectionId: state.activeConnection.connection?.id || null,
        selectedDatabase: state.selectedDatabase
      }),
      onRehydrateStorage: () => (state) => {
        if (state && state.activeConnectionId) {
          const connection = state.connections.find(c => c.id === state.activeConnectionId);
          if (connection) {
            state.activeConnection = {
              connection,
              status: 'disconnected',
              error: null
            };
          }
        }
      }
    }
  )
);
