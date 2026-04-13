import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { DatabaseConnection, ConnectionState, ConnectionStatus } from '@/types';

interface ConnectionStore {
  connections: DatabaseConnection[];
  activeConnection: ConnectionState;
  activeConnectionId: string | null;
  selectedDatabase: string | null;
  addConnection: (
    connection: Omit<DatabaseConnection, 'id' | 'createdAt' | 'updatedAt'>
  ) => DatabaseConnection;
  updateConnection: (id: string, updates: Partial<DatabaseConnection>) => void;
  deleteConnection: (id: string) => void;
  setActiveConnection: (connection: DatabaseConnection | null) => void;
  setConnectionStatus: (status: ConnectionStatus, error?: string) => void;
  setSelectedDatabase: (database: string | null) => void;
}

const inferPasswordStorage = (connection: DatabaseConnection): 'local' | 'system' | 'none' => {
  if (connection.passwordStorage) {
    return connection.passwordStorage;
  }

  // 如果有本地密码，使用 'local'
  if (connection.password?.trim()) {
    return 'local';
  }

  // 默认使用 'local'
  return 'local';
};

const normalizeConnection = (connection: DatabaseConnection): DatabaseConnection => {
  const passwordStorage = inferPasswordStorage(connection);
  const localPassword = connection.password?.trim() ? connection.password : undefined;
  const hasPassword = passwordStorage === 'system' ? !!connection.hasPassword : !!localPassword;

  return {
    ...connection,
    // 始终保留本地密码（如果存在）
    password: localPassword,
    hasPassword,
    passwordStorage,
    readOnly: connection.readOnly ?? false,
  };
};

export const useConnectionStore = create<ConnectionStore>()(
  persist(
    set => ({
      connections: [],
      activeConnectionId: null,
      selectedDatabase: null,
      activeConnection: {
        connection: null,
        status: 'disconnected',
        error: null,
      },

      addConnection: connectionData => {
        const newConnection = normalizeConnection({
          ...connectionData,
          id: crypto.randomUUID(),
          createdAt: Date.now(),
          updatedAt: Date.now(),
        } as DatabaseConnection);
        set(state => ({
          connections: [...state.connections, newConnection],
        }));
        return newConnection;
      },

      updateConnection: (id, updates) => {
        set(state => ({
          connections: state.connections.map(conn => {
            if (conn.id !== id) {
              return conn;
            }

            return normalizeConnection({ ...conn, ...updates, updatedAt: Date.now() });
          }),
          activeConnection:
            state.activeConnection.connection?.id === id
              ? {
                  ...state.activeConnection,
                  connection: normalizeConnection({
                    ...state.activeConnection.connection,
                    ...updates,
                    updatedAt: Date.now(),
                  }),
                }
              : state.activeConnection,
        }));
      },

      deleteConnection: id => {
        set(state => ({
          connections: state.connections.filter(conn => conn.id !== id),
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

      setActiveConnection: connection => {
        const normalizedConnection = connection ? normalizeConnection(connection) : null;
        const nextDatabase =
          connection?.type === 'mysql' ? connection.database?.trim() || null : null;

        set({
          activeConnectionId: normalizedConnection?.id || null,
          selectedDatabase: nextDatabase,
          activeConnection: {
            connection: normalizedConnection,
            status: normalizedConnection ? 'disconnected' : 'disconnected',
            error: null,
          },
        });
      },

      setConnectionStatus: (status, error) => {
        set(state => ({
          activeConnection: {
            ...state.activeConnection,
            status,
            error: error || null,
          },
        }));
      },

      setSelectedDatabase: database => {
        set({ selectedDatabase: database });
      },
    }),
    {
      name: 'skylarkdb-connections',
      partialize: state => ({
        connections: state.connections.map(normalizeConnection),
        activeConnectionId: state.activeConnection.connection?.id || null,
        selectedDatabase: state.selectedDatabase,
      }),
      onRehydrateStorage: () => state => {
        if (state) {
          state.connections = state.connections.map(connection =>
            normalizeConnection(connection as DatabaseConnection)
          );
        }
        if (state && state.activeConnectionId) {
          const connection = state.connections.find(c => c.id === state.activeConnectionId);
          if (connection) {
            state.activeConnection = {
              connection,
              status: 'disconnected',
              error: null,
            };
            // 自动重连：延迟执行以确保 UI 已挂载
            setTimeout(() => {
              import('@/utils/api').then(({ connectMySQL, connectRedis }) => {
                state.setConnectionStatus('connecting');
                const doConnect = connection.type === 'mysql'
                  ? connectMySQL(connection)
                  : connectRedis(connection);
                doConnect.then(result => {
                  if (result.success) {
                    state.setConnectionStatus('connected');
                  } else {
                    state.setConnectionStatus('error', result.message);
                  }
                }).catch((error: unknown) => {
                  const errorMessage = error instanceof Error ? error.message : String(error);
                  state.setConnectionStatus('error', errorMessage);
                });
              });
            }, 300);
          }
        }
      },
    }
  )
);
