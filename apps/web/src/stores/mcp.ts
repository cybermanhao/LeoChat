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
  {
    id: "fetch",
    name: "Fetch",
    transport: "stdio",
    command: "npx",
    args: ["-y", "@tokenizin/mcp-npx-fetch"],
  },
  {
    id: "excel",
    name: "Excel",
    transport: "stdio",
    command: "uvx",
    args: ["excel-mcp-server", "stdio"],
    env: { EXCEL_MCP_PAGING_CELLS_LIMIT: "4000" },
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

  // 新增：连接状态管理（使用 Set 避免重复）
  connectingServerIds: Set<string>;
  setConnecting: (serverId: string, connecting: boolean) => void;

  // 新增：服务器版本信息
  serverVersions: Record<string, string | null>;
  fetchServerVersion: (serverId: string) => Promise<void>;

  // 新增：搜索和过滤
  searchText: string;
  setSearchText: (text: string) => void;
  getFilteredServers: () => MCPServerConfig[];

  // 新增：工具启用/禁用控制
  disabledToolIds: Set<string>; // Format: "${serverId}:${toolName}"
  toggleTool: (serverId: string, toolName: string) => void;
  isToolEnabled: (serverId: string, toolName: string) => boolean;

  // Computed getter
  getAllTools: () => MCPTool[];
  getEnabledTools: () => MCPTool[];  // Get all enabled tools (filtering out disabled ones)
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

      // 新增状态
      connectingServerIds: new Set<string>(),
      serverVersions: {},
      searchText: "",
      disabledToolIds: new Set<string>(),

      // 新增方法：连接状态管理
      setConnecting: (serverId, connecting) => {
        set((state) => {
          const newSet = new Set(state.connectingServerIds);
          if (connecting) {
            newSet.add(serverId);
          } else {
            newSet.delete(serverId);
          }
          return { connectingServerIds: newSet };
        });
      },

      // 新增方法：获取服务器版本
      fetchServerVersion: async (serverId) => {
        try {
          // 调用后端 API 获取版本（需要后端支持）
          // 目前先使用占位逻辑
          const serverInfo = await mcpApi.getServerDetails(serverId);
          const version = (serverInfo as any).version || null;

          set((state) => ({
            serverVersions: {
              ...state.serverVersions,
              [serverId]: version,
            },
          }));
        } catch (error) {
          console.error("Failed to fetch server version:", error);
          set((state) => ({
            serverVersions: {
              ...state.serverVersions,
              [serverId]: null,
            },
          }));
        }
      },

      // 新增方法：设置搜索文本
      setSearchText: (text) => {
        set({ searchText: text });
      },

      // 新增方法：获取过滤后的服务器列表
      getFilteredServers: () => {
        const { sources, searchText } = get();
        const allServers = sources.flatMap((source) => source.servers);

        if (!searchText) {
          return allServers;
        }

        const lowerSearch = searchText.toLowerCase();
        return allServers.filter((server) => {
          const nameMatch = server.name.toLowerCase().includes(lowerSearch);
          const commandMatch = server.command?.toLowerCase().includes(lowerSearch);
          const urlMatch = server.url?.toLowerCase().includes(lowerSearch);

          return nameMatch || commandMatch || urlMatch;
        });
      },

      // 新增方法：切换工具启用状态
      toggleTool: (serverId, toolName) => {
        set((state) => {
          const toolId = `${serverId}:${toolName}`;
          const newSet = new Set(state.disabledToolIds);
          if (newSet.has(toolId)) {
            newSet.delete(toolId);
          } else {
            newSet.add(toolId);
          }
          return { disabledToolIds: newSet };
        });
      },

      // 新增方法：检查工具是否启用
      isToolEnabled: (serverId, toolName) => {
        const { disabledToolIds } = get();
        const toolId = `${serverId}:${toolName}`;
        return !disabledToolIds.has(toolId);
      },

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

      getEnabledTools: () => {
        const { serverStates, enabledServerIds, disabledToolIds } = get();
        const tools: MCPTool[] = [];
        for (const serverId of enabledServerIds) {
          const state = serverStates[serverId];
          if (state?.session?.tools) {
            for (const tool of state.session.tools) {
              const toolId = `${serverId}:${tool.name}`;
              if (!disabledToolIds.has(toolId)) {
                tools.push(tool);
              }
            }
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
        const { sources, setConnecting, fetchServerVersion } = get();

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

        // 使用新的 setConnecting 方法
        setConnecting(serverId, true);

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
          }));

          // 获取详细信息和版本
          await get().fetchServerDetails(serverId);
          await fetchServerVersion(serverId);
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
          }));
        } finally {
          setConnecting(serverId, false);
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
        const { autoConnectServerIds, connectServer } = get();
        if (autoConnectServerIds.length === 0) return;

        console.log("[MCP] Auto-connect starting:", autoConnectServerIds.length, "servers");

        for (const serverId of autoConnectServerIds) {
          try {
            await connectServer(serverId);
            console.log("[MCP] Auto-connected:", serverId);
          } catch (error) {
            console.warn("[MCP] Auto-connect failed:", serverId, error);
          }
          // 每个连接之间延迟 500ms，避免同时 spawn 多个进程
          await new Promise(resolve => setTimeout(resolve, 500));
        }

        console.log("[MCP] Auto-connect complete");
      },

      // 初始化
      initBuiltinServers: () => {
        // 同步内置服务列表：新增/删除跟随 BUILTIN_SERVERS，保留用户对已有服务器的修改
        set((state) => {
          const validServerIds = new Set(BUILTIN_SERVERS.map((s) => s.id));

          // 保留用户对 builtin 服务器的修改（如 env、args、timeout 等）
          const currentBuiltinSource = state.sources.find((s) => s.id === "builtin");
          const currentBuiltinMap = new Map(
            (currentBuiltinSource?.servers || []).map((s) => [s.id, s])
          );
          const mergedBuiltin = BUILTIN_SERVERS.map((s) =>
            currentBuiltinMap.get(s.id) || s
          );

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
                servers: mergedBuiltin,
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
                enabled: session.status === "connected" || session.status === "reconnecting",
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
        // 持久化所有服务器配置（builtin + custom），不持久化运行时连接状态
        builtinServers: state.sources.find((s) => s.id === "builtin")?.servers || [],
        customServers: state.sources.find((s) => s.id === "custom")?.servers || [],
        autoConnectServerIds: state.autoConnectServerIds,
        disabledToolIds: Array.from(state.disabledToolIds),
      }),
      // 从持久化数据恢复时，重建完整的 sources
      merge: (persisted, current) => {
        const persistedData = persisted as {
          builtinServers?: MCPServerConfig[];
          customServers?: MCPServerConfig[];
          autoConnectServerIds?: string[];
          disabledToolIds?: string[];
        };

        // 合并 builtin 服务器：以 BUILTIN_SERVERS 为基准，保留用户对已有服务器的修改
        const persistedBuiltinMap = new Map(
          (persistedData.builtinServers || []).map((s) => [s.id, s])
        );
        const mergedBuiltin = BUILTIN_SERVERS.map((s) =>
          persistedBuiltinMap.get(s.id) || s
        );

        return {
          ...current,
          sources: [
            {
              id: "builtin",
              name: "内置服务",
              type: "builtin" as const,
              servers: mergedBuiltin,
            },
            {
              id: "custom",
              name: "自定义服务",
              type: "custom" as const,
              servers: persistedData.customServers || [],
            },
          ],
          // 运行时连接状态不恢复，由 autoConnectAll 重新连接
          enabledServerIds: [],
          serverStates: {},
          // 只恢复配置数据
          autoConnectServerIds: persistedData.autoConnectServerIds || [],
          disabledToolIds: new Set(persistedData.disabledToolIds || []),
        };
      },
    }
  )
);
