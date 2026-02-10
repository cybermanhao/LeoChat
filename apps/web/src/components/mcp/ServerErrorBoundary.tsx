import React, { Component, ReactNode } from "react";
import { AlertCircle } from "lucide-react";
import { Button } from "@ai-chatbox/ui";

interface Props {
  children: ReactNode;
  onDelete?: () => void;
  fallback?: (error: Error) => ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ServerErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error("ServerCard render error:", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback && this.state.error) {
        return this.props.fallback(this.state.error);
      }

      return (
        <div className="h-[125px] rounded-lg border border-red-500/50 bg-red-50/10 p-4 flex flex-col items-center justify-center gap-2">
          <AlertCircle className="h-6 w-6 text-red-500" />
          <p className="text-sm text-red-600 font-medium">服务器卡片渲染失败</p>
          {this.state.error && (
            <pre className="text-xs text-red-500/80 max-w-full overflow-hidden text-ellipsis whitespace-nowrap">
              {this.state.error.message}
            </pre>
          )}
          {this.props.onDelete && (
            <Button
              size="sm"
              variant="destructive"
              onClick={this.props.onDelete}
              className="mt-2"
            >
              删除此服务器
            </Button>
          )}
        </div>
      );
    }

    return this.props.children;
  }
}
