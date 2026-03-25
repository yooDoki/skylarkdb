import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { DatabaseConnection, ConnectionState, ConnectionStatus } from '@/types';

interface ConnectionStore {
  connections: DatabaseConnection[];
  activeConnection: ConnectionState;
  addConnection: (connection: Omit<DatabaseConnection, 'id' | 'createdAt' | 'updatedAt'>) => void;
  updateConnection: (id: string, updates: Partial<DatabaseConnection>) => void;
  deleteConnection: (id: string) => void;
  setActiveConnection: (connection: DatabaseConnection | null) => void;
  setConnectionStatus: (status: ConnectionStatus, error?: string) => void;
}

export const useConnectionStore = create<ConnectionStore>()(
  persist(
    (set) => ({
      connections: [],
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
          activeConnection:
            state.activeConnection.connection?.id === id
              ? { connection: null, status: 'disconnected', error: null }
              : state.activeConnection,
        }));
      },

      setActiveConnection: (connection) => {
        set({
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
    }),
    {
      name: 'skylarkdb-connections',
      partialize: (state) => ({ connections: state.connections }),
    }
  )
);
