import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { CalendarDays, GripVertical, Pencil, Plus, RefreshCw, Trash2, X } from "lucide-react";
import { api } from "@/lib/backend-api";

type TaskStatus = "todo" | "in_progress" | "done";
type TaskPriority = "low" | "medium" | "high" | "urgent";
type Task = {
  id: string;
  project_id: string;
  title: string;
  description: string;
  status: TaskStatus;
  priority: TaskPriority;
  assignee_id: string | null;
  due_date: string | null;
  story_points: number;
  created_by: string;
  created_at: string;
  updated_at: string;
};
type Member = { user_id: string; full_name: string; email: string; role: string };
type TaskDraft = Omit<Task, "id" | "project_id" | "created_by" | "created_at" | "updated_at">;
const columns: { id: TaskStatus; title: string }[] = [
  { id: "todo", title: "To Do" },
  { id: "in_progress", title: "In Progress" },
  { id: "done", title: "Done" },
];
const blankTask = (): TaskDraft => ({
  title: "",
  description: "",
  status: "todo",
  priority: "medium",
  assignee_id: null,
  due_date: null,
  story_points: 0,
});

export function TaskBoard({
  projectId,
  token,
  canEdit,
}: {
  projectId: string;
  token: string;
  canEdit: boolean;
}) {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [editor, setEditor] = useState<Task | null | false>(false);
  const [draft, setDraft] = useState<TaskDraft>(blankTask);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [taskData, team] = await Promise.all([
        api<Task[]>(`/api/v1/projects/${projectId}/tasks`, token),
        api<{ members: Member[] }>(`/api/v1/projects/${projectId}/members`, token),
      ]);
      setTasks(Array.isArray(taskData) ? taskData : []);
      setMembers(Array.isArray(team.members) ? team.members : []);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not load project tasks.");
    } finally {
      setLoading(false);
    }
  }, [projectId, token]);

  useEffect(() => {
    void load();
  }, [load]);

  const tasksByStatus = useMemo(
    () =>
      Object.fromEntries(
        columns.map(({ id }) => [id, tasks.filter((task) => task.status === id)]),
      ) as Record<TaskStatus, Task[]>,
    [tasks],
  );
  const openEditor = (task?: Task) => {
    setDraft(
      task
        ? {
            title: task.title,
            description: task.description,
            status: task.status,
            priority: task.priority,
            assignee_id: task.assignee_id,
            due_date: task.due_date,
            story_points: task.story_points,
          }
        : blankTask(),
    );
    setEditor(task ?? null);
    setError("");
  };

  async function saveTask(event: FormEvent) {
    event.preventDefault();
    if (!draft.title.trim()) return;
    setSaving(true);
    setError("");
    try {
      if (editor) {
        const updated = await api<Task>(`/api/v1/projects/${projectId}/tasks/${editor.id}`, token, {
          method: "PATCH",
          body: JSON.stringify(draft),
        });
        setTasks((all) => all.map((task) => (task.id === updated.id ? updated : task)));
      } else {
        const created = await api<Task>(`/api/v1/projects/${projectId}/tasks`, token, {
          method: "POST",
          body: JSON.stringify(draft),
        });
        setTasks((all) => [created, ...all]);
      }
      setEditor(false);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not save task.");
    } finally {
      setSaving(false);
    }
  }

  async function moveTask(taskId: string, status: TaskStatus) {
    if (!canEdit) return;
    const task = tasks.find((item) => item.id === taskId);
    if (!task || task.status === status) return;
    setError("");
    try {
      const updated = await api<Task>(`/api/v1/projects/${projectId}/tasks/${taskId}`, token, {
        method: "PATCH",
        body: JSON.stringify({ status }),
      });
      setTasks((all) => all.map((item) => (item.id === updated.id ? updated : item)));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not move task.");
    }
  }

  async function deleteTask(task: Task) {
    if (!canEdit || !window.confirm(`Delete “${task.title}”?`)) return;
    setError("");
    try {
      await api<void>(`/api/v1/projects/${projectId}/tasks/${task.id}`, token, {
        method: "DELETE",
      });
      setTasks((all) => all.filter((item) => item.id !== task.id));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not delete task.");
    }
  }

  return (
    <section className="task-board" aria-label="Kanban Board">
      <div className="task-board-toolbar">
        <div>
          <span className="section-kicker">PROJECT WORKFLOW</span>
          <p>Track project work across its current status.</p>
        </div>
        <div className="task-board-actions">
          <button
            className="button button-quiet button-small"
            onClick={() => void load()}
            disabled={loading}
          >
            <RefreshCw size={14} className={loading ? "spin" : ""} /> Refresh
          </button>
          {canEdit && (
            <button className="button button-primary button-small" onClick={() => openEditor()}>
              <Plus size={15} /> Add task
            </button>
          )}
        </div>
      </div>
      {error && (
        <div className="task-board-error" role="alert">
          {error}
        </div>
      )}
      {loading ? (
        <div className="task-board-state" role="status">
          Loading tasks…
        </div>
      ) : (
        <div className="task-board-columns">
          {columns.map((column) => (
            <section
              className="task-column"
              key={column.id}
              aria-label={`${column.title} tasks`}
              onDragOver={(event) => {
                if (canEdit) event.preventDefault();
              }}
              onDrop={(event) => {
                event.preventDefault();
                const taskId = event.dataTransfer.getData("text/plain");
                if (taskId) void moveTask(taskId, column.id);
              }}
            >
              <header className="task-column-header">
                <div>
                  <h2>{column.title}</h2>
                  <span className="count-badge">{tasksByStatus[column.id].length}</span>
                </div>
                {canEdit && column.id === "todo" && (
                  <button
                    className="icon-button"
                    aria-label="Add task to To Do"
                    onClick={() => openEditor()}
                  >
                    <Plus size={16} />
                  </button>
                )}
              </header>
              <div className="task-column-list">
                {tasksByStatus[column.id].map((task) => {
                  const assignee = members.find((member) => member.user_id === task.assignee_id);
                  return (
                    <article
                      className="task-card"
                      key={task.id}
                      draggable={canEdit}
                      onDragStart={(event) => {
                        event.dataTransfer.setData("text/plain", task.id);
                        event.dataTransfer.effectAllowed = "move";
                      }}
                    >
                      <div className="task-card-top">
                        <span className={`task-priority priority-${task.priority}`}>
                          {task.priority}
                        </span>
                        {canEdit && (
                          <div className="task-card-actions">
                            <GripVertical size={14} aria-hidden="true" />
                            <button
                              className="icon-button"
                              aria-label={`Edit ${task.title}`}
                              onClick={() => openEditor(task)}
                            >
                              <Pencil size={13} />
                            </button>
                            <button
                              className="icon-button danger-icon"
                              aria-label={`Delete ${task.title}`}
                              onClick={() => void deleteTask(task)}
                            >
                              <Trash2 size={13} />
                            </button>
                          </div>
                        )}
                      </div>
                      <h3>{task.title}</h3>
                      {task.description && <p>{task.description}</p>}
                      <footer>
                        <span>{assignee?.full_name ?? "Unassigned"}</span>
                        <span>{task.story_points} pts</span>
                        {task.due_date && (
                          <span>
                            <CalendarDays size={12} /> {task.due_date}
                          </span>
                        )}
                      </footer>
                    </article>
                  );
                })}
                {!tasksByStatus[column.id].length && (
                  <div className="task-column-empty">
                    {tasks.length ? "Drop a task here" : "No tasks yet"}
                  </div>
                )}
              </div>
            </section>
          ))}
        </div>
      )}
      {!loading && !tasks.length && (
        <p className="task-board-empty-hint">
          Create a task to start tracking work in this project.
        </p>
      )}

      {editor !== false && (
        <div
          className="modal-backdrop"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget && !saving) setEditor(false);
          }}
        >
          <section
            className="modal task-editor"
            role="dialog"
            aria-modal="true"
            aria-labelledby="task-editor-title"
          >
            <header className="modal-heading">
              <div>
                <span className="section-kicker">PROJECT TASK</span>
                <h2 id="task-editor-title">{editor ? "Edit task" : "Create task"}</h2>
              </div>
              <button
                className="icon-button"
                onClick={() => setEditor(false)}
                disabled={saving}
                aria-label="Close"
              >
                <X size={17} />
              </button>
            </header>
            <form className="task-editor-form" onSubmit={(event) => void saveTask(event)}>
              <label>
                Title
                <input
                  required
                  maxLength={200}
                  value={draft.title}
                  onChange={(event) => setDraft((item) => ({ ...item, title: event.target.value }))}
                />
              </label>
              <label className="task-editor-wide">
                Description
                <textarea
                  maxLength={5000}
                  value={draft.description}
                  onChange={(event) =>
                    setDraft((item) => ({ ...item, description: event.target.value }))
                  }
                />
              </label>
              <label>
                Status
                <select
                  value={draft.status}
                  onChange={(event) =>
                    setDraft((item) => ({ ...item, status: event.target.value as TaskStatus }))
                  }
                >
                  {columns.map((column) => (
                    <option value={column.id} key={column.id}>
                      {column.title}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Priority
                <select
                  value={draft.priority}
                  onChange={(event) =>
                    setDraft((item) => ({ ...item, priority: event.target.value as TaskPriority }))
                  }
                >
                  {["low", "medium", "high", "urgent"].map((priority) => (
                    <option key={priority} value={priority}>
                      {priority.slice(0, 1).toUpperCase() + priority.slice(1)}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Assignee
                <select
                  value={draft.assignee_id ?? ""}
                  onChange={(event) =>
                    setDraft((item) => ({ ...item, assignee_id: event.target.value || null }))
                  }
                >
                  <option value="">Unassigned</option>
                  {members.map((member) => (
                    <option value={member.user_id} key={member.user_id}>
                      {member.full_name} ({member.email})
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Due date
                <input
                  type="date"
                  value={draft.due_date ?? ""}
                  onChange={(event) =>
                    setDraft((item) => ({ ...item, due_date: event.target.value || null }))
                  }
                />
              </label>
              <label>
                Story points
                <input
                  type="number"
                  min={0}
                  max={100}
                  value={draft.story_points}
                  onChange={(event) =>
                    setDraft((item) => ({ ...item, story_points: Number(event.target.value) }))
                  }
                />
              </label>
              <div className="task-editor-actions">
                <button
                  type="button"
                  className="button button-quiet"
                  onClick={() => setEditor(false)}
                  disabled={saving}
                >
                  Cancel
                </button>
                <button
                  className="button button-primary"
                  type="submit"
                  disabled={saving || !draft.title.trim()}
                >
                  {saving ? "Saving…" : editor ? "Save changes" : "Create task"}
                </button>
              </div>
            </form>
          </section>
        </div>
      )}
    </section>
  );
}
