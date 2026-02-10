import { Sidebar } from "./Sidebar";
import { ChatArea } from "./ChatArea";
import { ThreeColumnLayout } from "./layout/ThreeColumnLayout";

export function ChatLayout() {
  return (
    <ThreeColumnLayout leftDrawer={<Sidebar />}>
      <ChatArea />
    </ThreeColumnLayout>
  );
}
