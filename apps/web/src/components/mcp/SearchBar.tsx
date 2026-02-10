import { useState, useRef, useEffect } from "react";
import { Search, X } from "lucide-react";
import { Button, cn } from "@ai-chatbox/ui";

interface SearchBarProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
}

export function SearchBar({
  value,
  onChange,
  placeholder = "搜索...",
  className,
}: SearchBarProps) {
  const [expanded, setExpanded] = useState(!!value);
  const inputRef = useRef<HTMLInputElement>(null);

  // 当展开时自动聚焦
  useEffect(() => {
    if (expanded && inputRef.current) {
      inputRef.current.focus();
    }
  }, [expanded]);

  // 如果有值，保持展开
  useEffect(() => {
    if (value && !expanded) {
      setExpanded(true);
    }
  }, [value, expanded]);

  const handleClear = () => {
    onChange("");
    setExpanded(false);
  };

  if (!expanded) {
    return (
      <Button
        variant="ghost"
        size="icon"
        onClick={() => setExpanded(true)}
        className={cn("h-9 w-9", className)}
        title="搜索"
      >
        <Search className="h-4 w-4" />
      </Button>
    );
  }

  return (
    <div className={cn("relative flex items-center", className)}>
      <Search className="absolute left-3 h-4 w-4 text-muted-foreground pointer-events-none" />
      <input
        ref={inputRef}
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onBlur={() => {
          if (!value) {
            setExpanded(false);
          }
        }}
        placeholder={placeholder}
        className="h-9 w-64 pl-9 pr-9 rounded-md border border-input bg-background text-sm outline-none focus:ring-2 focus:ring-primary/20 transition-all"
      />
      {value && (
        <Button
          variant="ghost"
          size="icon"
          onClick={handleClear}
          className="absolute right-1 h-7 w-7"
          title="清空"
        >
          <X className="h-3.5 w-3.5" />
        </Button>
      )}
    </div>
  );
}
