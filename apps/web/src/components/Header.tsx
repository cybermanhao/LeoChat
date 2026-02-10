import { Settings, Sun, Moon, Palette, Server } from "lucide-react";
import { useNavigate } from "react-router-dom";
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  cn,
} from "@ai-chatbox/ui";
import { themePresets } from "@ai-chatbox/shared";
import { useThemeStore } from "../stores/theme";

export function Header() {
  const navigate = useNavigate();
  const { currentTheme, setTheme, themeJustChanged } = useThemeStore();

  return (
    <header className="flex h-14 flex-shrink-0 items-center justify-between border-b px-4 bg-background">
      <div className="flex items-center gap-2">
        <h1 className="text-lg font-semibold">AI Chatbox</h1>
        <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs text-primary">
          MCP
        </span>
      </div>

      <div className="flex items-center gap-2">
        {/* Theme Switcher */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className={cn(
                "relative transition-all duration-300",
                themeJustChanged && "ring-2 ring-primary ring-offset-2 ring-offset-background animate-pulse"
              )}
            >
              <Palette className={cn(
                "h-5 w-5 transition-transform duration-300",
                themeJustChanged && "scale-110"
              )} />
              <span className="sr-only">Toggle theme</span>
              {/* 切换指示动画 */}
              {themeJustChanged && (
                <span className="absolute -top-1 -right-1 flex h-3 w-3">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-3 w-3 bg-primary"></span>
                </span>
              )}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48">
            <DropdownMenuLabel>Theme</DropdownMenuLabel>
            <DropdownMenuSeparator />
            {themePresets.map((preset) => (
              <DropdownMenuItem
                key={preset.id}
                onClick={() => setTheme(preset.id)}
                className={cn(
                  "flex items-center gap-2 cursor-pointer",
                  currentTheme === preset.id && "bg-accent"
                )}
              >
                {preset.isDark ? (
                  <Moon className="h-4 w-4" />
                ) : (
                  <Sun className="h-4 w-4" />
                )}
                <span className="flex-1">{preset.name}</span>
                {currentTheme === preset.id && (
                  <span className="text-primary font-bold">✓</span>
                )}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        {/* Settings Menu */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon">
              <Settings className="h-5 w-5" />
              <span className="sr-only">Settings</span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48">
            <DropdownMenuLabel>设置</DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={() => navigate("/mcp/servers")}
              className="flex items-center gap-2 cursor-pointer"
            >
              <Server className="h-4 w-4" />
              <span>MCP 服务器</span>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
