import { CalendarClock, FolderOpen, Languages, NotebookPen, Plus, UserRound } from "lucide-react";
import logoUrl from "../assets/logo.png";

interface MobileTopBarProps {
  onToggleSidebar: () => void;
  onNewNote: () => void;
}

export function MobileTopBar({ onToggleSidebar, onNewNote }: MobileTopBarProps) {
  return (
    <header className="mobile-topbar">
      <button type="button" className="mobile-icon-btn" title="笔记库" onClick={onToggleSidebar}>
        <NotebookPen size={18} />
      </button>
      <div className="mobile-brand">
        <img src={logoUrl} alt="GaGa" />
        <strong>GAGA的笔记本</strong>
      </div>
      <button type="button" className="mobile-icon-btn primary" title="新建笔记" onClick={onNewNote}>
        <Plus size={20} />
      </button>
    </header>
  );
}

export type MobileTab = "notes" | "english" | "plans" | "resources" | "mine";

interface MobileNavProps {
  activeTab: MobileTab;
  onChange: (tab: MobileTab) => void;
}

const tabs: Array<{ id: MobileTab; label: string; icon: typeof NotebookPen }> = [
  { id: "notes", label: "笔记", icon: NotebookPen },
  { id: "english", label: "英语", icon: Languages },
  { id: "plans", label: "计划", icon: CalendarClock },
  { id: "resources", label: "资料", icon: FolderOpen },
  { id: "mine", label: "我的", icon: UserRound },
];

export function MobileNav({ activeTab, onChange }: MobileNavProps) {
  return (
    <nav className="mobile-nav">
      {tabs.map((tab) => {
        const Icon = tab.icon;
        return (
          <button
            key={tab.id}
            type="button"
            className={activeTab === tab.id ? "active" : ""}
            onClick={() => onChange(tab.id)}
          >
            <Icon size={19} />
            <span>{tab.label}</span>
          </button>
        );
      })}
    </nav>
  );
}
