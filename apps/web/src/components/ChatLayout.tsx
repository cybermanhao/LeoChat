import { Sidebar } from "./Sidebar";
import { ChatArea } from "./ChatArea";
import { Header } from "./Header";

export function ChatLayout() {
  return (
    <div className="flex h-full">
      {/* Sidebar */}
      <Sidebar />

      {/* Main Content */}
      <div className="flex flex-1 flex-col">
        <Header />
        <ChatArea />
      </div>
    </div>
  );
}
