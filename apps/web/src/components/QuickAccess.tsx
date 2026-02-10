import { useState, useRef, useEffect } from "react";
import { Mail, Github } from "lucide-react";
import { Button } from "@ai-chatbox/ui";
import { useI18nStore, LOCALES, type LocaleOption } from "../stores/i18n";
import { cn } from "@ai-chatbox/ui";

export function QuickAccess() {
  const currentLocale = useI18nStore((s) => s.currentLocale);
  const setLocale = useI18nStore((s) => s.setLocale);
  const getCurrentLocaleOption = useI18nStore((s) => s.getCurrentLocaleOption);

  const [languageMenuOpen, setLanguageMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const currentLocaleOption = getCurrentLocaleOption();

  // 点击外部关闭菜单
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setLanguageMenuOpen(false);
      }
    };

    if (languageMenuOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [languageMenuOpen]);

  const handleLanguageSelect = (locale: LocaleOption) => {
    setLocale(locale.code);
    setLanguageMenuOpen(false);
  };

  const handleEmailClick = () => {
    window.open("mailto:cybermanhao@gmail.com", "_blank");
  };

  const handleGithubClick = () => {
    window.open("https://github.com/cybermanhao/LeoChat", "_blank");
  };

  return (
    <div className="flex items-center gap-0.5">
      {/* 语言切换 */}
      <div className="relative" ref={menuRef}>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 hover:bg-muted text-muted-foreground hover:text-foreground rounded-none"
          onClick={() => setLanguageMenuOpen(!languageMenuOpen)}
          title={`${currentLocaleOption.nativeName} / Language`}
        >
          <span className="text-base leading-none">{currentLocaleOption.flag}</span>
        </Button>

        {/* 语言下拉菜单 */}
        {languageMenuOpen && (
          <div className="absolute top-full right-0 mt-1 w-40 bg-card border border-border rounded-md shadow-lg z-50 overflow-hidden">
            {LOCALES.map((locale) => (
              <button
                key={locale.code}
                onClick={() => handleLanguageSelect(locale)}
                className={cn(
                  "w-full px-3 py-2 text-left text-sm flex items-center gap-2 hover:bg-accent transition-colors",
                  currentLocale === locale.code && "bg-accent/50 font-medium"
                )}
              >
                <span className="text-base">{locale.flag}</span>
                <span className="flex-1">{locale.nativeName}</span>
                {currentLocale === locale.code && (
                  <span className="text-primary text-xs">✓</span>
                )}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* 邮件 */}
      <Button
        variant="ghost"
        size="icon"
        className="h-8 w-8 hover:bg-muted text-muted-foreground hover:text-foreground rounded-none"
        onClick={handleEmailClick}
        title="发送邮件 / Email"
      >
        <Mail className="h-3.5 w-3.5" />
      </Button>

      {/* GitHub */}
      <Button
        variant="ghost"
        size="icon"
        className="h-8 w-8 hover:bg-muted text-muted-foreground hover:text-foreground rounded-none"
        onClick={handleGithubClick}
        title="GitHub 仓库"
      >
        <Github className="h-3.5 w-3.5" />
      </Button>
    </div>
  );
}
