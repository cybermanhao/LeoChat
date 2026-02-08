import { create } from "zustand";
import { persist } from "zustand/middleware";
import type {
  MCPServerConfig,
  MCPSession,
  MCPSource,
  MCPServerState,
  MCPResource,
  MCPPrompt,
  MCPTool,
} from "@ai-chatbox/shared";
import { mcpApi } from "../lib/api";

// 内置服务预设 (使用官方 MCP 服务器包)
const BUILTIN_SERVERS: MCPServerConfig[] = [
  {
    id: "leochat",
    name: "LeoChat",
    transport: "stdio",
    command: "node",
    args: ["../../packages/leochat-mcp/dist/index.js"],
  },
  {
    id: "everything",
    name: "Everything",
    transport: "stdio",
    command: "npx",
    args: ["-y", "@modelcontextprotocol/server-everything"],
  },
  {
    id: "filesystem",
    name: "Filesystem",
    transport: "stdio",
    command: "npx",
    args: ["-y", "@modelcontextprotocol/server-filesystem"],
    // 注意: 需要在配置中添加允许的目录才能使用
  },
  {
    id: "memory",
    name: "Memory",
    transport: "stdio",
    command: "npx",
    args: ["-y", "@modelcontextprotocol/server-memory"],
  },
];

interface MCPState {
  // 持久化状态
  sources: MCPSource[];
  serverStates: Record<string, MCPServerState>;
  enabledServerIds: string[];
  autoConnectServerIds: string[];

  // 运行时状态
  quickPanelOpen: boolean;
  detailDialogOpen: boolean;
  selectedServerId: string | null;
  isConnecting: Record<string, boolean>;

  // Computed getter
  getAllTools: () => MCPTool[];
  getEnabledServers: () => MCPServerConfig[];

  // 快捷面板
  openQuickPanel: () => void;
  closeQuickPanel: () => void;
  toggleQuickPanel: () => void;

  // 详细对话框
  openDetailDialog: (serverId?: string) => void;
  closeDetailDialog: () => void;

  // 服务管理
  addServer: (sourceId: string, config: MCPServerConfig) => void;
  removeServer: (serverId: string) => void;
  updateServer: (serverId: string, config: Partial<MCPServerConfig>) => void;

  // 连接控制
  toggleServer: (serverId: string) => Promise<void>;
  connectServer: (serverId: string) => Promise<void>;
  disconnectServer: (serverId: string) => Promise<void>;
  refreshServer: (serverId: string) => Promise<void>;

  // 数据获取
  fetchServerDetails: (serverId: string) => Promise<void>;

  // 自动连接
  setAutoConnect: (serverId: string, enabled: boolean) => void;
  autoConnectAll: () => Promise<void>;

  // 初始化
  initBuiltinServers: () => void;
  syncWithBackend: () => Promise<void>;
}

export const useMCPStore = create<MCPState>()(
  persist(
    (set, get) => ({
      // 初始状态
      sources: [
        {
          id: "builtin",
          name: "内置服务",
          type: "builtin",
          servers: BUILTIN_SERVERS,
        },
        {
          id: "custom",
          name: "自定义服务",
          type: "custom",
          servers: [],
        },
      ],
      serverStates: {},
      enabledServerIds: [],
      autoConnectServerIds: [],

      // 运行时状态
      quickPanelOpen: false,
      detailDialogOpen: false,
      selectedServerId: null,
      isConnecting: {},

      // Computed
      getAllTools: () => {
        const { serverStates, enabledServerIds } = get();
        const tools: MCPTool[] = [];
        for (const serverId of enabledServerIds) {
          const state = serverStates[serverId];
          if (state?.session?.tools) {
            tools.push(...state.session.tools);
          }
        }
        return tools;
      },

      getEnabledServers: () => {
        const { sources, enabledServerIds } = get();
        const servers: MCPServerConfig[] = [];
        for (const source of sources) {
          for (const server of source.servers) {
            if (enabledServerIds.includes(server.id)) {
              servers.push(server);
            }
          }
        }
        return servers;
      },

      // 快捷面板
      openQuickPanel: () => set({ quickPanelOpen: true }),
      closeQuickPanel: () => set({ quickPanelOpen: false }),
      toggleQuickPanel: () => set((s) => ({ quickPanelOpen: !s.quickPanelOpen })),

      // 详细对话框
      openDetailDialog: (serverId) =>
        set({ detailDialogOpen: true, selectedServerId: serverId ?? null }),
      closeDetailDialog: () =>
        set({ detailDialogOpen: false, selectedServerId: null }),

      // 服务管理
      addServer: (sourceId, config) => {
        set((state) => ({
          sources: state.sources.map((source) =>
            source.id === sourceId
              ? { ...source, servers: [...source.servers, config] }
              : source
          ),
        }));
      },

      removeServer: (serverId) => {
        // 先断开连接
        get().disconnectServer(serverId);

        set((state) => ({
          sources: state.sources.map((source) => ({
            ...source,
            servers: source.servers.filter((s) => s.id !== serverId),
          })),
          enabledServerIds: state.enabledServerIds.filter((id) => id !== serverId),
          autoConnectServerIds: state.autoConnectServerIds.filter((id) => id !== serverId),
          serverStates: Object.fromEntries(
            Object.entries(state.serverStates).filter(([id]) => id !== serverId)
          ),
        }));
      },

      updateServer: (serverId, config) => {
        set((state) => ({
          sources: state.sources.map((source) => ({
            ...source,
            servers: source.servers.map((s) =>
              s.id === serverId ? { ...s, ...config } : s
            ),
          })),
        }));
      },

      // 连接控制
      toggleServer: async (serverId) => {
        const { enabledServerIds, connectServer, disconnectServer } = get();
        if (enabledServerIds.includes(serverId)) {
          await disconnectServer(serverId);
        } else {
          await connectServer(serverId);
        }
      },

      connectServer: async (serverId) => {
        const { sources } = get();

        // 找到服务配置
        let serverConfig: MCPServerConfig | undefined;
        for (const source of sources) {
          serverConfig = source.servers.find((s) => s.id === serverId);
          if (serverConfig) break;
        }

        if (!serverConfig) {
          console.error("Server config not found:", serverId);
          return;
        }

        set((state) => ({
          isConnecting: { ...state.isConnecting, [serverId]: true },
        }));

        try {
          // 先添加服务器配置到后端
          await mcpApi.addServer(serverConfig);

          // 连接服务器
          const session = await mcpApi.connect(serverId);

          set((state) => ({
            enabledServerIds: [...state.enabledServerIds, serverId],
            serverStates: {
              ...state.serverStates,
              [serverId]: {
                serverId,
                enabled: true,
                session,
                lastConnected: Date.now(),
              },
            },
            isConnecting: { ...state.isConnecting, [serverId]: false },
          }));

          // 获取详细信息
          await get().fetchServerDetails(serverId);
        } catch (error) {
          console.error("Failed to connect server:", error);
          set((state) => ({
            serverStates: {
              ...state.serverStates,
              [serverId]: {
                serverId,
                enabled: false,
                error: error instanceof Error ? error.message : String(error),
              },
            },
            isConnecting: { ...state.isConnecting, [serverId]: false },
          }));
        }
      },

      disconnectServer: async (serverId) => {
        try {
          await mcpApi.disconnect(serverId);
        } catch (error) {
          console.error("Failed to disconnect server:", error);
        }

        set((state) => ({
          enabledServerIds: state.enabledServerIds.filter((id) => id !== serverId),
          serverStates: {
            ...state.serverStates,
            [serverId]: {
              ...state.serverStates[serverId],
              serverId,
              enabled: false,
              session: undefined,
            },
          },
        }));
      },

      refreshServer: async (serverId) => {
        const { disconnectServer, connectServer } = get();
        await disconnectServer(serverId);
        await connectServer(serverId);
      },

      // 数据获取
      fetchServerDetails: async (serverId) => {
        try {
          const details = await mcpApi.getServerDetails(serverId);

          set((state) => ({
            serverStates: {
              ...state.serverStates,
              [serverId]: {
                ...state.serverStates[serverId],
                serverId,
                enabled: true,
                session: details.session,
                resources: details.resources as MCPResource[],
                prompts: details.prompts as MCPPrompt[],
              },
            },
          }));
        } catch (error) {
          console.error("Failed to fetch server details:", error);
        }
      },

      // 自动连接
      setAutoConnect: (serverId, enabled) => {
        set((state) => ({
          autoConnectServerIds: enabled
            ? [...state.autoConnectServerIds.filter(id => id !== serverId), serverId]
            : state.autoConnectServerIds.filter(id => id !== serverId),
        }));
      },

      autoConnectAll: async () => {
        const { autoConnectServerIds, enabledServerIds, connectServer } = get();
        // 只连接尚未连接的服务器
        const toConnect = autoConnectServerIds.filter(id => !enabledServerIds.includes(id));
        if (toConnect.length === 0) return;

        console.log("[MCP] Auto-connect starting:", toConnect.length, "servers");

        for (const serverId of toConnect) {
          try {
            await connectServer(serverId);
            console.log("[MCP] Auto-connected:", serverId);
          } catch (error) {
            console.warn("[MCP] Auto-connect failed:", serverId, error);
            // 继续连接下一个，不阻塞
          }
          // 每个连接之间延迟 500ms，避免同时 spawn 多个进程
          await new Promise(resolve => setTimeout(resolve, 500));
        }

        console.log("[MCP] Auto-connect complete");
      },

      // 初始化
      initBuiltinServers: () => {
        // 重置内置服务列表为最新的 BUILTIN_SERVERS，清理废弃的服务
        set((state) => {
          // 获取当前有效的服务器 ID 集合
          const validServerIds = new Set(BUILTIN_SERVERS.map((s) => s.id));

          // 获取自定义服务
          const customSource = state.sources.find((s) => s.id === "custom");
          const customServers = customSource?.servers || [];
          customServers.forEach((s) => validServerIds.add(s.id));

          // 过滤掉不存在的服务器的 enabledServerIds
          const validEnabledIds = state.enabledServerIds.filter((id) =>
            validServerIds.has(id)
          );

          // 过滤掉不存在的服务器的 serverStates
          const validServerStates = Object.fromEntries(
            Object.entries(state.serverStates).filter(([id]) =>
              validServerIds.has(id)
            )
          );

          return {
            sources: [
              {
                id: "builtin",
                name: "内置服务",
                type: "builtin" as const,
                servers: BUILTIN_SERVERS,
              },
              {
                id: "custom",
                name: "自定义服务",
                type: "custom" as const,
                servers: customServers,
              },
            ],
            enabledServerIds: validEnabledIds,
            serverStates: validServerStates,
          };
        });
      },

      syncWithBackend: async () => {
        try {
          const sessions = await mcpApi.getSessions();

          set((state) => {
            const newServerStates = { ...state.serverStates };

            for (const session of sessions) {
              newServerStates[session.serverId] = {
                ...newServerStates[session.serverId],
                serverId: session.serverId,
                enabled: session.status === "connected",
                session,
              };
            }

            return { serverStates: newServerStates };
          });
        } catch (error) {
          console.error("Failed to sync with backend:", error);
        }
      },
    }),
    {
      name: "leochat-mcp-storage",
      partialize: (state) => ({
        // 只持久化自定义服务器和启用的服务器 ID
        // 内置服务器列表始终从 BUILTIN_SERVERS 常量获取
        customServers: state.sources.find((s) => s.id === "custom")?.servers || [],
        enabledServerIds: state.enabledServerIds,
        autoConnectServerIds: state.autoConnectServerIds,
      }),
      // 从持久化数据恢复时，重建完整的 sources
      merge: (persisted, current) => {
        const persistedData = persisted as { customServers?: MCPServerConfig[]; enabledServerIds?: string[]; autoConnectServerIds?: string[] };
        return {
          ...current,
          sources: [
            {
              id: "builtin",
              name: "内置服务",
              type: "builtin" as const,
              servers: BUILTIN_SERVERS,
            },
            {
              id: "custom",
              name: "自定义服务",
              type: "custom" as const,
              servers: persistedData.customServers || [],
            },
          ],
          enabledServerIds: persistedData.enabledServerIds || [],
          autoConnectServerIds: persistedData.autoConnectServerIds || [],
        };
      },
    }
  )
);
