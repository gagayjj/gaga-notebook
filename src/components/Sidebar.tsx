import { useMemo, useState } from "react";
import { BookOpen, FileText, FolderPlus, Pencil, Plus, Search, Trash2, X } from "lucide-react";
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
  onQueryChange: (value: string) => void;
  onSelectNote: (id: string) => void;
  onNewNote: () => void;
  onNewCourse: (name: string) => void;
  onRemoveCourse: (courseId: string) => void;
  onRenameCourse: (courseId: string, name: string) => void;
  onRenameNote: (id: string, title: string) => void;
  onMoveNote: (noteId: string, courseId: string) => void;
  onRemoveNote: (id: string) => void;
  onClose?: () => void;
}

export function Sidebar({
  library,
  activeNoteId,
  query,
  onQueryChange,
  onSelectNote,
  onNewNote,
  onNewCourse,
  onRemoveCourse,
  onRenameCourse,
  onRenameNote,
  onMoveNote,
  onRemoveNote,
  onClose,
}: SidebarProps) {
  const [prompt, setPrompt] = useState<{ title: string; initial: string; value: string; onConfirm: (value: string) => void } | null>(null);
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

  const openPrompt = (title: string, initial: string, onConfirm: (value: string) => void) => {
    setPrompt({ title, initial, value: initial, onConfirm });
  };

  const confirmPrompt = () => {
    if (!prompt) return;
    const value = prompt.value.trim();
    if (value) prompt.onConfirm(value);
    setPrompt(null);
  };

  return (
    <aside className="sidebar">
      <div className="sidebar-search">
        <Search size={15} />
        <input
          value={query}
          onChange={(event) => onQueryChange(event.target.value)}
          placeholder="搜索标题、标签"
        />
        {onClose && (
          <button type="button" className="sidebar-close" title="收起笔记库" onClick={onClose}>
            <X size={15} />
          </button>
        )}
      </div>

      <section className="sidebar-section">
        <div className="sidebar-section-head">
          <span>课程与笔记</span>
          <div className="sidebar-head-actions">
            <button
              type="button"
              className="mini-btn"
              title="新建分类文件夹"
              onClick={() => openPrompt("新建分类", "新建分类", (name) => onNewCourse(name))}
            >
              <FolderPlus size={14} />
            </button>
            <button type="button" className="mini-btn" title="新建笔记" onClick={onNewNote}>
              <Plus size={14} />
            </button>
          </div>
        </div>
        <div className="course-tree">
          {library?.courses.map((course) => (
            <div
              className="course-group"
              key={course.id}
              onDragOver={(event) => event.preventDefault()}
              onDrop={(event) => {
                event.preventDefault();
                const noteId = event.dataTransfer.getData("text/note-id");
                if (noteId) onMoveNote(noteId, course.id);
              }}
            >
              <div className="course-name">
                <BookOpen size={14} />
                <span>{course.name}</span>
                <span className="course-actions">
                  <button
                    type="button"
                    className="course-rename-btn"
                    title="重命名分类"
                    onClick={(event) => {
                      event.stopPropagation();
                      openPrompt("重命名分类", course.name, (name) => onRenameCourse(course.id, name));
                    }}
                  >
                    <Pencil size={13} />
                  </button>
                  <button
                    type="button"
                    className="course-delete-btn"
                    title={`删除分类「${course.name}」及其中笔记`}
                    onClick={() => onRemoveCourse(course.id)}
                  >
                    <Trash2 size={13} />
                  </button>
                </span>
              </div>
              {course.noteIds
                .map((id) => noteById.get(id))
                .filter((note): note is NoteMeta => note !== undefined && visibleNotes.includes(note))
                .map((note) => (
                  <div
                    key={note.id}
                    className={`note-row ${note.id === activeNoteId ? "active" : ""}`}
                    onClick={() => onSelectNote(note.id)}
                    draggable
                    onDragStart={(event) => {
                      event.dataTransfer.setData("text/note-id", note.id);
                      event.dataTransfer.effectAllowed = "move";
                    }}
                  >
                    <FileText size={14} />
                    <span>{note.title}</span>
                    <button
                      type="button"
                      className="note-rename-btn"
                      title="重命名笔记"
                      onClick={(event) => {
                        event.stopPropagation();
                        openPrompt("重命名笔记", note.title, (title) => onRenameNote(note.id, title));
                      }}
                    >
                      <Pencil size={13} />
                    </button>
                    <button
                      type="button"
                      className="note-delete-btn"
                      title="删除这篇笔记"
                      onClick={(event) => {
                        event.stopPropagation();
                        onRemoveNote(note.id);
                      }}
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                ))}
            </div>
          ))}
        </div>
      </section>

      {prompt && (
        <div className="sidebar-prompt-backdrop" onMouseDown={() => setPrompt(null)}>
          <div className="sidebar-prompt" onMouseDown={(event) => event.stopPropagation()}>
            <strong>{prompt.title}</strong>
            <input
              autoFocus
              value={prompt.value}
              onChange={(event) => setPrompt({ ...prompt, value: event.target.value })}
              onKeyDown={(event) => {
                if (event.key === "Enter") confirmPrompt();
                if (event.key === "Escape") setPrompt(null);
              }}
            />
            <div className="sidebar-prompt-actions">
              <button type="button" className="btn ghost" onClick={() => setPrompt(null)}>
                取消
              </button>
              <button type="button" className="btn primary" onClick={confirmPrompt}>
                确定
              </button>
            </div>
          </div>
        </div>
      )}
    </aside>
  );
}
