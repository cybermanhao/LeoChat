import { useState, useCallback } from "react";
import { FileJson, Terminal, Globe, AlertCircle, Check } from "lucide-react";
import { Button, cn } from "@ai-chatbox/ui";
import { useT } from "../../i18n";
import { showToast } from "../../stores/toast";
import type { MCPServerConfigValidated } from "@ai-chatbox/shared";

interface ParsedServer {
  key: string;
  config: MCPServerConfigValidated;
  selected: boolean;
}

interface McpJsonImporterProps {
  onImport: (servers: MCPServerConfigValidated[]) => void;
  onCancel?: () => void;
}

export function McpJsonImporter({ onImport, onCancel }: McpJsonImporterProps) {
  const { t } = useT();
  const [jsonText, setJsonText] = useState("");
  const [parsedServers, setParsedServers] = useState<ParsedServer[] | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);
  const [isImporting, setIsImporting] = useState(false);

  const parseJson = useCallback(() => {
    setParseError(null);
    setParsedServers(null);

    if (!jsonText.trim()) {
      setParseError(t("mcp.jsonImport.errorEmpty"));
      return;
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(jsonText);
    } catch {
      setParseError(t("mcp.jsonImport.errorInvalidJson"));
      return;
    }

    // Support both { mcpServers: {...} } and direct { serverName: {...} }
    const rawServers =
      parsed && typeof parsed === "object" && "mcpServers" in parsed
        ? (parsed as Record<string, unknown>).mcpServers
        : parsed;

    if (!rawServers || typeof rawServers !== "object" || Array.isArray(rawServers)) {
      setParseError(t("mcp.jsonImport.errorNoServers"));
      return;
    }

    const servers: ParsedServer[] = [];
    let index = 0;
    for (const [key, value] of Object.entries(rawServers)) {
      if (!value || typeof value !== "object") continue;
      const cfg = value as Record<string, unknown>;

      const transport =
        cfg.transport === "streamable-http" || cfg.url
          ? "streamable-http"
          : "stdio";

      const serverConfig: MCPServerConfigValidated = {
        name: key,
        transport: transport as "stdio" | "streamable-http",
        command: typeof cfg.command === "string" ? cfg.command : undefined,
        args: Array.isArray(cfg.args)
          ? cfg.args.filter((a): a is string => typeof a === "string")
          : undefined,
        cwd: typeof cfg.cwd === "string" ? cfg.cwd : undefined,
        env:
          cfg.env && typeof cfg.env === "object" && !Array.isArray(cfg.env)
            ? Object.fromEntries(
                Object.entries(cfg.env).filter(([, v]) => typeof v === "string")
              )
            : undefined,
        url: typeof cfg.url === "string" ? cfg.url : undefined,
        autoConnect: true,
      };

      // Validate: stdio needs command, http needs url
      if (serverConfig.transport === "stdio" && !serverConfig.command) {
        continue; // skip invalid
      }
      if (serverConfig.transport === "streamable-http" && !serverConfig.url) {
        continue;
      }

      servers.push({
        key,
        config: serverConfig,
        selected: true,
      });
      index++;
    }

    if (servers.length === 0) {
      setParseError(t("mcp.jsonImport.errorNoValidServers"));
      return;
    }

    setParsedServers(servers);
  }, [jsonText, t]);

  const toggleServer = (key: string) => {
    setParsedServers((prev) =>
      prev
        ? prev.map((s) => (s.key === key ? { ...s, selected: !s.selected } : s))
        : null
    );
  };

  const handleImport = () => {
    if (!parsedServers) return;
    const selected = parsedServers.filter((s) => s.selected).map((s) => s.config);
    if (selected.length === 0) {
      showToast(t("mcp.jsonImport.errorNoSelection"), "destructive");
      return;
    }
    setIsImporting(true);
    try {
      onImport(selected);
      showToast(
        t("mcp.jsonImport.importSuccess", { count: String(selected.length) }),
        "default"
      );
    } catch (e) {
      showToast(t("mcp.jsonImport.importFailed"), "destructive");
    } finally {
      setIsImporting(false);
    }
  };

  const selectAll = () => {
    setParsedServers((prev) =>
      prev ? prev.map((s) => ({ ...s, selected: true })) : null
    );
  };

  const deselectAll = () => {
    setParsedServers((prev) =>
      prev ? prev.map((s) => ({ ...s, selected: false })) : null
    );
  };

  return (
    <div className="space-y-5">
      {/* Paste area */}
      <div className="space-y-2">
        <label className="text-sm font-medium flex items-center gap-2">
          <FileJson className="h-4 w-4 text-muted-foreground" />
          {t("mcp.jsonImport.pasteLabel")}
        </label>
        <textarea
          value={jsonText}
          onChange={(e) => setJsonText(e.target.value)}
          placeholder={t("mcp.jsonImport.placeholder")}
          rows={10}
          className={cn(
            "w-full rounded-lg border bg-background px-4 py-3 text-sm font-mono",
            "outline-none focus:ring-2 focus:ring-primary/20 resize-none",
            "text-foreground placeholder:text-muted-foreground"
          )}
        />
        <p className="text-xs text-muted-foreground">
          {t("mcp.jsonImport.hint")}
        </p>
      </div>

      {/* Error */}
      {parseError && (
        <div className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
          <span>{parseError}</span>
        </div>
      )}

      {/* Parse button */}
      {!parsedServers && (
        <div className="flex justify-end gap-3">
          {onCancel && (
            <Button type="button" variant="outline" onClick={onCancel}>
              {t("common.cancel")}
            </Button>
          )}
          <Button onClick={parseJson}>{t("mcp.jsonImport.parse")}</Button>
        </div>
      )}

      {/* Preview */}
      {parsedServers && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-semibold">
              {t("mcp.jsonImport.previewTitle", {
                count: String(parsedServers.length),
              })}
            </h4>
            <div className="flex items-center gap-2">
              <button
                type="button"
                data-testid="mcp-import-select-all"
                onClick={selectAll}
                className="text-xs text-primary hover:underline"
              >
                {t("mcp.jsonImport.selectAll")}
              </button>
              <span className="text-xs text-muted-foreground">/</span>
              <button
                type="button"
                data-testid="mcp-import-deselect-all"
                onClick={deselectAll}
                className="text-xs text-primary hover:underline"
              >
                {t("mcp.jsonImport.deselectAll")}
              </button>
            </div>
          </div>

          <div className="rounded-lg border divide-y">
            {parsedServers.map((server) => (
              <div
                key={server.key}
                data-testid={`mcp-import-server-${server.key}`}
                onClick={() => toggleServer(server.key)}
                className={cn(
                  "flex items-center gap-3 px-4 py-3 cursor-pointer transition-colors",
                  "hover:bg-muted/50"
                )}
              >
                <div
                  className={cn(
                    "h-4 w-4 rounded border flex items-center justify-center shrink-0 transition-colors",
                    server.selected
                      ? "bg-primary border-primary"
                      : "border-border bg-background"
                  )}
                >
                  {server.selected && (
                    <Check className="h-3 w-3 text-primary-foreground" />
                  )}
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium truncate">
                      {server.config.name}
                    </span>
                    <span
                      className={cn(
                        "inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full border",
                        server.config.transport === "stdio"
                          ? "bg-primary/10 text-primary border-primary/20"
                          : "bg-secondary/10 text-secondary-foreground border-secondary/20"
                      )}
                    >
                      {server.config.transport === "stdio" ? (
                        <>
                          <Terminal className="h-3 w-3" />
                          STDIO
                        </>
                      ) : (
                        <>
                          <Globe className="h-3 w-3" />
                          HTTP
                        </>
                      )}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground truncate mt-0.5">
                    {server.config.transport === "stdio"
                      ? `${server.config.command ?? ""} ${(server.config.args ?? []).join(" ")}`
                      : server.config.url}
                  </p>
                </div>
              </div>
            ))}
          </div>

          <div className="flex items-center justify-between pt-2">
            <span className="text-xs text-muted-foreground">
              {t("mcp.jsonImport.selectedCount", {
                count: String(parsedServers.filter((s) => s.selected).length),
                total: String(parsedServers.length),
              })}
            </span>
            <div className="flex gap-3">
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setParsedServers(null);
                  setParseError(null);
                }}
              >
                {t("common.reset")}
              </Button>
              <Button
                onClick={handleImport}
                disabled={
                  isImporting || !parsedServers.some((s) => s.selected)
                }
              >
                {isImporting
                  ? t("mcp.adding")
                  : t("mcp.jsonImport.import")}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
