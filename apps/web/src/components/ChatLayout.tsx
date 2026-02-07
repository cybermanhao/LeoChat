import { Sidebar } from "./Sidebar";
import { ChatArea } from "./ChatArea";
import { Header } from "./Header";

export function ChatLayout() {
  return (
    <div className="flex h-full min-h-0 overflow-hidden">
      {/* Sidebar */}
      <Sidebar />

      {/* Main Content */}
      <div className="flex flex-1 flex-col min-h-0 min-w-0 overflow-hidden">
        <Header />
        <ChatArea />
      </div>
    </div>
  );
}
