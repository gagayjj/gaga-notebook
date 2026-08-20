import { useMemo } from "react";
import { BookOpen, FileText, ListTree, Plus, Search } from "lucide-react";
import type { Library, NoteMeta } from "../types";

export interface OutlineItem {
  text: string;
  level: number;
  pos: number;
}

interface SidebarProps {
  library: Library | null;
  activeNoteId: string | null;
  query: string;
  outline: OutlineItem[];
  onQueryChange: (value: string) => void;
  onSelectNote: (id: string) => void;
  onNewNote: () => void;
  onJumpToOutline: (pos: number) => void;
}

export function Sidebar({
  library,
  activeNoteId,
  query,
  outline,
  onQueryChange,
  onSelectNote,
  onNewNote,
  onJumpToOutline,
}: SidebarProps) {
  const visibleNotes = useMemo(() => {
    if (!library) return [];
    const q = query.trim().toLowerCase();
    return Object.values(library.notes).filter((note) => {
      if (!q) return true;
      return (
        note.title.toLowerCase().includes(q) ||
        note.tags.some((tag) => tag.toLowerCase().includes(q))
      );
    });
  }, [library, query]);

  const noteById = useMemo(() => {
    const map = new Map<string, NoteMeta>();
    if (!library) return map;
    Object.values(library.notes).forEach((note) => map.set(note.id, note));
    return map;
  }, [library]);

  return (
    <aside className="sidebar">
      <div className="sidebar-search">
        <Search size={15} />
        <input
          value={query}
          onChange={(event) => onQueryChange(event.target.value)}
          placeholder="搜索标题、标签"
        />
      </div>

      <section className="sidebar-section">
        <div className="sidebar-section-head">
          <span>课程与笔记</span>
          <button type="button" className="mini-btn" title="新建笔记" onClick={onNewNote}>
            <Plus size={14} />
          </button>
        </div>
        <div className="course-tree">
          {library?.courses.map((course) => (
            <div className="course-group" key={course.id}>
              <div className="course-name">
                <BookOpen size={14} />
                <span>{course.name}</span>
              </div>
              {course.noteIds
                .map((id) => noteById.get(id))
                .filter((note): note is NoteMeta => note !== undefined && visibleNotes.includes(note))
                .map((note) => (
                  <button
                    type="button"
                    key={note.id}
                    className={`note-row ${note.id === activeNoteId ? "active" : ""}`}
                    onClick={() => onSelectNote(note.id)}
                  >
                    <FileText size={14} />
                    <span>{note.title}</span>
                  </button>
                ))}
            </div>
          ))}
        </div>
      </section>

      <section className="sidebar-section">
        <div className="sidebar-section-head">
          <span>大纲</span>
          <ListTree size={14} />
        </div>
        <div className="outline-list">
          {outline.length === 0 && <p className="muted">当前笔记还没有标题</p>}
          {outline.map((item, index) => (
            <button
              type="button"
              key={`${item.text}-${index}`}
              className="outline-row"
              style={{ paddingLeft: 10 + Math.max(0, item.level - 1) * 14 }}
              onClick={() => onJumpToOutline(item.pos)}
            >
              {item.text}
            </button>
          ))}
        </div>
      </section>
    </aside>
  );
}
