import { useCallback, useEffect, useState } from "react";
import {
  Bell,
  CalendarClock,
  CheckCircle2,
  FileText,
  FolderOpen,
  Link as LinkIcon,
  Plus,
  Trash2,
  X,
} from "lucide-react";
import type { PlanItem, ResourceItem } from "../types";

interface ResourceLibraryProps {
  onClose: () => void;
}

function todayString() {
  return new Date().toISOString().slice(0, 10);
}

export function ResourceLibrary({ onClose }: ResourceLibraryProps) {
  const [tab, setTab] = useState<"resources" | "plans">("resources");
  const [resources, setResources] = useState<ResourceItem[]>([]);
  const [plans, setPlans] = useState<PlanItem[]>([]);
  const [linkUrl, setLinkUrl] = useState("");
  const [linkTitle, setLinkTitle] = useState("");
  const [planTitle, setPlanTitle] = useState("");
  const [planDate, setPlanDate] = useState(todayString());
  const [planTime, setPlanTime] = useState("19:00");
  const [planRemind, setPlanRemind] = useState(true);
  const [message, setMessage] = useState("");

  const refresh = useCallback(async () => {
    const [nextResources, nextPlans] = await Promise.all([
      window.studyNotes?.listResources() || Promise.resolve([]),
      window.studyNotes?.listPlans() || Promise.resolve([]),
    ]);
    setResources(nextResources);
    setPlans(nextPlans);
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const handlePickFiles = async () => {
    const next = await window.studyNotes?.pickResources();
    if (next) setResources(next);
  };

  const handleAddLink = async () => {
    const url = linkUrl.trim();
    if (!/^https?:\/\//i.test(url)) return;
    const next = await window.studyNotes?.addResourceLink({ url, title: linkTitle.trim() || undefined });
    if (next) {
      setResources(next);
      setLinkUrl("");
      setLinkTitle("");
    }
  };

  const handleRemoveResource = async (id: string) => {
    const next = await window.studyNotes?.removeResource(id);
    if (next) setResources(next);
  };

  const handleOpenResource = (resource: ResourceItem) => {
    if (resource.kind === "file" && resource.path) {
      window.studyNotes?.openResourceFile(resource.path);
    } else if (resource.kind === "link" && resource.url) {
      window.studyNotes?.openExternal(resource.url);
    }
  };

  const handleSavePlan = async () => {
    if (!planTitle.trim() || !planDate || !planTime) return;
    const result = await window.studyNotes?.savePlan({
      title: planTitle.trim(),
      date: planDate,
      time: planTime,
      done: false,
      remind: planRemind,
    });
    if (result) {
      setPlans(result.plans);
      setPlanTitle("");
      setMessage(planRemind ? "计划已添加，到点会弹出提醒" : "计划已添加");
    }
  };

  const handleTogglePlan = async (plan: PlanItem) => {
    const result = await window.studyNotes?.savePlan({ ...plan, done: !plan.done });
    if (result) setPlans(result.plans);
  };

  const handleRemovePlan = async (id: string) => {
    const next = await window.studyNotes?.removePlan(id);
    if (next) setPlans(next);
  };

  const sortedPlans = [...plans].sort((a, b) => `${a.date} ${a.time}`.localeCompare(`${b.date} ${b.time}`));

  return (
    <div className="modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <div className="resource-modal">
        <header className="resource-header">
          <div className="resource-tabs">
            <button
              type="button"
              className={tab === "resources" ? "active" : ""}
              onClick={() => setTab("resources")}
            >
              <FolderOpen size={15} />
              资料库
            </button>
            <button
              type="button"
              className={tab === "plans" ? "active" : ""}
              onClick={() => setTab("plans")}
            >
              <CalendarClock size={15} />
              学习计划
            </button>
          </div>
          {message && <span className="resource-message">{message}</span>}
          <button type="button" className="icon-btn" title="关闭" onClick={onClose}>
            <X size={17} />
          </button>
        </header>

        {tab === "resources" && (
          <div className="resource-content">
            <div className="resource-add">
              <button type="button" className="btn primary" onClick={handlePickFiles}>
                <FolderOpen size={15} />
                添加本地文件
              </button>
              <div className="link-add">
                <input value={linkTitle} onChange={(event) => setLinkTitle(event.target.value)} placeholder="资料名称（可选）" />
                <input
                  value={linkUrl}
                  onChange={(event) => setLinkUrl(event.target.value)}
                  onKeyDown={(event) => event.key === "Enter" && handleAddLink()}
                  placeholder="粘贴课程/资料链接"
                />
                <button type="button" className="btn" onClick={handleAddLink}>
                  <LinkIcon size={15} />
                  添加链接
                </button>
              </div>
            </div>

            <div className="resource-list">
              {resources.length === 0 && <p className="muted">还没有资料，先添加本地文件或课程链接</p>}
              {resources.map((resource) => (
                <div className="resource-row" key={resource.id}>
                  <button type="button" className="resource-main" onClick={() => handleOpenResource(resource)}>
                    {resource.kind === "file" ? <FileText size={16} /> : <LinkIcon size={16} />}
                    <div>
                      <strong>{resource.title}</strong>
                      <span>{resource.kind === "file" ? "本地文件" : resource.url}</span>
                    </div>
                  </button>
                  <button
                    type="button"
                    className="icon-btn"
                    title="删除资料"
                    onClick={() => handleRemoveResource(resource.id)}
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {tab === "plans" && (
          <div className="resource-content">
            <div className="plan-add">
              <input value={planTitle} onChange={(event) => setPlanTitle(event.target.value)} placeholder="今天要学什么" />
              <input type="date" value={planDate} onChange={(event) => setPlanDate(event.target.value)} />
              <input type="time" value={planTime} onChange={(event) => setPlanTime(event.target.value)} />
              <label className="remind-toggle">
                <input type="checkbox" checked={planRemind} onChange={(event) => setPlanRemind(event.target.checked)} />
                <Bell size={14} />
                到点提醒
              </label>
              <button type="button" className="btn primary" onClick={handleSavePlan}>
                <Plus size={15} />
                添加计划
              </button>
            </div>

            <div className="resource-list plan-list">
              {sortedPlans.length === 0 && <p className="muted">还没有学习计划</p>}
              {sortedPlans.map((plan) => (
                <div className={`plan-row ${plan.done ? "done" : ""}`} key={plan.id}>
                  <button type="button" className="plan-check" title={plan.done ? "标记未完成" : "标记完成"} onClick={() => handleTogglePlan(plan)}>
                    {plan.done ? <CheckCircle2 size={18} /> : <span className="plan-ring" />}
                  </button>
                  <div className="plan-info">
                    <strong>{plan.title}</strong>
                    <span>
                      {plan.date} {plan.time}
                      {plan.remind && <Bell size={12} />}
                    </span>
                  </div>
                  <button type="button" className="icon-btn" title="删除计划" onClick={() => handleRemovePlan(plan.id)}>
                    <Trash2 size={15} />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
