import { useState } from "react";
import { NPM_REGISTRIES, PIP_REGISTRIES } from "@ai-chatbox/shared";

function Label({ children, className, ...props }: React.LabelHTMLAttributes<HTMLLabelElement>) {
  return <label className={className} {...props}>{children}</label>;
}

interface RegistrySelectorProps {
  type: "npm" | "pip";
  value?: string;
  onChange: (value: string) => void;
}

export function RegistrySelector({ type, value = "", onChange }: RegistrySelectorProps) {
  const registries = type === "npm" ? NPM_REGISTRIES : PIP_REGISTRIES;
  const [customUrl, setCustomUrl] = useState("");

  // 判断当前值是否为自定义
  const isCustom = value && !registries.some((r) => r.url === value);
  const selectedValue = isCustom ? "custom" : value || "default";

  const handleSelectionChange = (newValue: string) => {
    if (newValue === "default") {
      onChange("");
    } else if (newValue === "custom") {
      onChange(customUrl);
    } else {
      onChange(newValue);
    }
  };

  const handleCustomUrlChange = (url: string) => {
    setCustomUrl(url);
    if (selectedValue === "custom") {
      onChange(url);
    }
  };

  return (
    <div className="space-y-3">
      <div>
        <Label className="text-sm font-medium mb-2 block">
          Registry 镜像 ({type === "npm" ? "NPM" : "Pip"})
        </Label>
        <p className="text-xs text-muted-foreground mb-3">
          选择镜像源以加速包下载
        </p>
      </div>

      <div className="space-y-2">
        {/* 默认选项 */}
        <label className="flex items-start gap-3 p-3 rounded-lg border cursor-pointer hover:bg-muted/50 transition-colors">
          <input
            type="radio"
            name="registry"
            value="default"
            checked={selectedValue === "default"}
            onChange={(e) => handleSelectionChange(e.target.value)}
            className="mt-0.5"
          />
          <div className="flex-1">
            <div className="font-medium text-sm">默认</div>
            <div className="text-xs text-muted-foreground mt-0.5">
              使用系统默认配置
            </div>
          </div>
        </label>

        {/* 预设镜像选项 */}
        {registries.map((registry) => (
          <label
            key={registry.url}
            className="flex items-start gap-3 p-3 rounded-lg border cursor-pointer hover:bg-muted/50 transition-colors"
          >
            <input
              type="radio"
              name="registry"
              value={registry.url}
              checked={selectedValue === registry.url}
              onChange={(e) => handleSelectionChange(e.target.value)}
              className="mt-0.5"
            />
            <div className="flex-1">
              <div className="font-medium text-sm">{registry.name}</div>
              <div className="text-xs text-muted-foreground mt-0.5 break-all">
                {registry.url}
              </div>
            </div>
          </label>
        ))}

        {/* 自定义选项 */}
        <label className="flex items-start gap-3 p-3 rounded-lg border cursor-pointer hover:bg-muted/50 transition-colors">
          <input
            type="radio"
            name="registry"
            value="custom"
            checked={selectedValue === "custom"}
            onChange={(e) => handleSelectionChange(e.target.value)}
            className="mt-0.5"
          />
          <div className="flex-1">
            <div className="font-medium text-sm">自定义</div>
            <div className="text-xs text-muted-foreground mt-0.5 mb-2">
              输入自定义镜像源地址
            </div>
            {(selectedValue === "custom" || isCustom) && (
              <input
                type="url"
                value={isCustom ? value : customUrl}
                onChange={(e) => handleCustomUrlChange(e.target.value)}
                placeholder={
                  type === "npm"
                    ? "https://registry.example.com"
                    : "https://pypi.example.com/simple"
                }
                className="w-full rounded-md border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/20"
                onClick={(e) => e.stopPropagation()}
              />
            )}
          </div>
        </label>
      </div>
    </div>
  );
}
