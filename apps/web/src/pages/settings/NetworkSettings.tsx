import { useNetworkStore, CHINA_MIRRORS } from "../../stores/network";
import { cn } from "@ai-chatbox/ui";

function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={cn(
        "relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent",
        "transition-colors duration-200 focus:outline-none",
        checked ? "bg-primary" : "bg-muted"
      )}
    >
      <span
        className={cn(
          "pointer-events-none inline-block h-4 w-4 rounded-full bg-white shadow",
          "transform transition-transform duration-200",
          checked ? "translate-x-4" : "translate-x-0"
        )}
      />
    </button>
  );
}

function MirrorField({
  label,
  value,
  onChange,
  placeholder,
  disabled,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  disabled: boolean;
}) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-xs text-muted-foreground">{label}</label>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        disabled={disabled}
        className={cn(
          "w-full rounded-md border border-border bg-card text-foreground text-sm px-3 py-1.5",
          "focus:outline-none focus:ring-1 focus:ring-primary/50",
          "placeholder:text-muted-foreground transition-colors duration-200",
          disabled && "opacity-40 cursor-not-allowed"
        )}
      />
    </div>
  );
}

export function NetworkSettings() {
  const { useChinaMirrors, pypiMirror, hfMirror, setUseChinaMirrors, setPypiMirror, setHfMirror } =
    useNetworkStore();

  const handleReset = () => {
    setPypiMirror(CHINA_MIRRORS.pypi);
    setHfMirror(CHINA_MIRRORS.hf);
  };

  return (
    <div className="p-6 space-y-6 max-w-2xl">
      <div>
        <h3 className="text-base font-medium text-foreground">网络设置</h3>
        <p className="text-sm text-muted-foreground mt-1">
          配置下载镜像，改善中国大陆网络环境下的连接速度。
        </p>
      </div>

      {/* 总开关 */}
      <div className="flex items-center justify-between rounded-lg border border-border bg-card px-4 py-3">
        <div>
          <p className="text-sm font-medium text-foreground">使用中国大陆镜像加速</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            开启后，MCP 工具下载 Python 包和 AI 模型时使用国内镜像
          </p>
        </div>
        <Toggle checked={useChinaMirrors} onChange={setUseChinaMirrors} />
      </div>

      {/* 镜像地址配置 */}
      <div className={cn("space-y-4 rounded-lg border border-border p-4", !useChinaMirrors && "opacity-50")}>
        <div className="flex items-center justify-between">
          <p className="text-sm font-medium text-foreground">镜像地址</p>
          <button
            onClick={handleReset}
            disabled={!useChinaMirrors}
            className="text-xs text-muted-foreground hover:text-foreground disabled:cursor-not-allowed transition-colors"
          >
            恢复默认
          </button>
        </div>

        <MirrorField
          label="PyPI 镜像（Word / Excel MCP 下载 Python 包）"
          value={pypiMirror}
          onChange={setPypiMirror}
          placeholder={CHINA_MIRRORS.pypi}
          disabled={!useChinaMirrors}
        />

        <MirrorField
          label="HuggingFace 镜像（法律知识库 AI 模型）"
          value={hfMirror}
          onChange={setHfMirror}
          placeholder={CHINA_MIRRORS.hf}
          disabled={!useChinaMirrors}
        />
      </div>

      <div className="text-xs text-muted-foreground space-y-1">
        <p>常用 PyPI 镜像：清华 tuna · 阿里云 aliyun · 腾讯云 tcloud · 华为云 huawei</p>
        <p>常用 HuggingFace 镜像：hf-mirror.com · mirror.sjtu.edu.cn/hugging-face-models</p>
      </div>
    </div>
  );
}
