import { Settings, Sun, Moon, Palette } from "lucide-react";
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@ai-chatbox/ui";
import { themePresets } from "@ai-chatbox/shared";
import { useThemeStore } from "../stores/theme";

export function Header() {
  const { currentTheme, setTheme } = useThemeStore();

  return (
    <header className="flex h-14 items-center justify-between border-b px-4">
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
            <Button variant="ghost" size="icon">
              <Palette className="h-5 w-5" />
              <span className="sr-only">Toggle theme</span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuLabel>Theme</DropdownMenuLabel>
            <DropdownMenuSeparator />
            {themePresets.map((preset) => (
              <DropdownMenuItem
                key={preset.id}
                onClick={() => setTheme(preset.id)}
                className="flex items-center gap-2"
              >
                {preset.isDark ? (
                  <Moon className="h-4 w-4" />
                ) : (
                  <Sun className="h-4 w-4" />
                )}
                <span>{preset.name}</span>
                {currentTheme === preset.id && (
                  <span className="ml-auto text-primary">*</span>
                )}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        {/* Settings */}
        <Button variant="ghost" size="icon">
          <Settings className="h-5 w-5" />
          <span className="sr-only">Settings</span>
        </Button>
      </div>
    </header>
  );
}
