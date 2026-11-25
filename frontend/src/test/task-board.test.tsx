import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { TaskBoard } from "@/components/TaskBoard";
import * as backendApi from "@/lib/backend-api";

const member = {
  user_id: "u1",
  full_name: "Alex Member",
  email: "alex@example.test",
  role: "editor",
};
const task = {
  id: "t1",
  project_id: "p1",
  title: "Validate loan eligibility",
  description: "Apply the income rule.",
  status: "todo" as const,
  priority: "high" as const,
  assignee_id: "u1",
  due_date: "2026-12-15",
  story_points: 5,
  created_by: "u1",
  created_at: "2026-11-25T00:00:00Z",
  updated_at: "2026-11-25T00:00:00Z",
};

function mockApi(tasks: unknown[] = [], members: unknown[] = [member]) {
  return vi.spyOn(backendApi, "api").mockImplementation(((path: string) => {
    if (path.endsWith("/tasks")) return Promise.resolve(tasks);
    if (path.endsWith("/members")) return Promise.resolve({ members });
    return Promise.resolve({});
  }) as typeof backendApi.api);
}

describe("TaskBoard", () => {
  beforeEach(() => vi.restoreAllMocks());

  it("loads project tasks, assignees, and per-column counts", async () => {
    mockApi([task]);
    render(<TaskBoard projectId="p1" token="token" canEdit />);
    expect(await screen.findByText("Validate loan eligibility")).toBeInTheDocument();
    expect(screen.getByText("Alex Member")).toBeInTheDocument();
    expect(
      within(screen.getByRole("region", { name: "To Do tasks" })).getByText("1"),
    ).toBeInTheDocument();
    expect(
      within(screen.getByRole("region", { name: "In Progress tasks" })).getByText("0"),
    ).toBeInTheDocument();
  });

  it("shows loading, empty columns, and the create hint", async () => {
    let resolveTasks!: (value: unknown) => void;
    vi.spyOn(backendApi, "api").mockImplementation(((path: string) =>
      path.endsWith("/tasks")
        ? new Promise<unknown>((resolve) => {
            resolveTasks = resolve;
          })
        : Promise.resolve({ members: [] })) as typeof backendApi.api);
    render(<TaskBoard projectId="p1" token="token" canEdit />);
    expect(screen.getByRole("status")).toHaveTextContent("Loading tasks");
    resolveTasks([]);
    expect(await screen.findAllByText("No tasks yet")).toHaveLength(3);
    expect(screen.getByText(/Create a task to start tracking/)).toBeInTheDocument();
  });

  it("opens the To Do shortcut and closes the editor with cancel, close, or backdrop", async () => {
    mockApi([], []);
    const { container } = render(<TaskBoard projectId="p1" token="token" canEdit />);
    await screen.findAllByText("No tasks yet");
    fireEvent.click(screen.getByRole("button", { name: "Add task to To Do" }));
    const dialog = screen.getByRole("dialog");
    expect(screen.getByRole("heading", { name: "Create task" })).toBeInTheDocument();
    fireEvent.mouseDown(dialog);
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /^add task$/i }));
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /^add task$/i }));
    fireEvent.mouseDown(container.querySelector(".modal-backdrop")!);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("shows a load error and supports retry", async () => {
    let fail = true;
    const apiSpy = vi.spyOn(backendApi, "api").mockImplementation(((path: string) => {
      if (fail && path.endsWith("/tasks"))
        return Promise.reject(new Error("Task service unavailable"));
      return Promise.resolve(path.endsWith("/tasks") ? [] : { members: [] });
    }) as typeof backendApi.api);
    render(<TaskBoard projectId="p1" token="token" canEdit />);
    expect(await screen.findByRole("alert")).toHaveTextContent("Task service unavailable");
    fail = false;
    fireEvent.click(screen.getByRole("button", { name: /refresh/i }));
    expect(await screen.findAllByText("No tasks yet")).toHaveLength(3);
    expect(apiSpy).toHaveBeenCalled();
  });

  it("normalizes unexpected API payloads and ignores drops for tasks outside the project", async () => {
    const api = vi.spyOn(backendApi, "api").mockImplementation(((path: string) =>
      path.endsWith("/tasks") ? Promise.resolve({ unexpected: true }) : Promise.resolve({ members: null })) as typeof backendApi.api);
    render(<TaskBoard projectId="p1" token="token" canEdit />);
    expect(await screen.findAllByText("No tasks yet")).toHaveLength(3);
    const dataTransfer = { setData: vi.fn(), getData: vi.fn(() => "missing-task"), effectAllowed: "" };
    fireEvent.drop(screen.getByRole("region", { name: "Done tasks" }), { dataTransfer });
    expect(api).toHaveBeenCalledTimes(2);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("uses safe feedback when create, move, and delete APIs reject non-Error values", async () => {
    const api = vi.spyOn(backendApi, "api").mockImplementation(((path: string, _token: string, init?: RequestInit) => {
      if (path.endsWith("/members")) return Promise.resolve({ members: [member] });
      if (init?.method === "POST" || init?.method === "PATCH" || init?.method === "DELETE") return Promise.reject("request rejected");
      return Promise.resolve([task]);
    }) as typeof backendApi.api);
    vi.spyOn(window, "confirm").mockReturnValue(true);
    render(<TaskBoard projectId="p1" token="token" canEdit />);
    await screen.findByText(task.title);
    fireEvent.click(screen.getByRole("button", { name: /^add task$/i }));
    fireEvent.change(screen.getByLabelText("Title"), { target: { value: "New task" } });
    fireEvent.click(screen.getByRole("button", { name: "Create task" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Could not save task.");
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    const dataTransfer = { setData: vi.fn(), getData: vi.fn(() => task.id), effectAllowed: "" };
    fireEvent.drop(screen.getByRole("region", { name: "In Progress tasks" }), { dataTransfer });
    expect(await screen.findByRole("alert")).toHaveTextContent("Could not move task.");
    fireEvent.click(screen.getByRole("button", { name: `Delete ${task.title}` }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Could not delete task.");
    expect(api).toHaveBeenCalled();
  });

  it("creates a task with all supported fields", async () => {
    const created = { ...task, id: "t2", title: "New loan task", status: "in_progress" as const };
    const apiSpy = mockApi([]);
    apiSpy.mockImplementation(((path: string, _token: string, init?: RequestInit) => {
      if (path.endsWith("/members")) return Promise.resolve({ members: [member] });
      if (path.endsWith("/tasks") && init?.method === "POST") return Promise.resolve(created);
      return Promise.resolve([]);
    }) as typeof backendApi.api);
    render(<TaskBoard projectId="p1" token="token" canEdit />);
    fireEvent.click(await screen.findByRole("button", { name: /add task/i }));
    fireEvent.change(screen.getByLabelText("Title"), { target: { value: "New loan task" } });
    fireEvent.change(screen.getByLabelText("Description"), {
      target: { value: "Calculate eligibility" },
    });
    fireEvent.change(screen.getByLabelText("Status"), { target: { value: "in_progress" } });
    fireEvent.change(screen.getByLabelText("Priority"), { target: { value: "urgent" } });
    fireEvent.change(screen.getByLabelText("Assignee"), { target: { value: member.user_id } });
    fireEvent.change(screen.getByLabelText("Due date"), { target: { value: "2026-12-15" } });
    fireEvent.change(screen.getByLabelText("Story points"), { target: { value: "5" } });
    fireEvent.click(screen.getByRole("button", { name: "Create task" }));
    await waitFor(() =>
      expect(apiSpy).toHaveBeenCalledWith(
        "/api/v1/projects/p1/tasks",
        "token",
        expect.objectContaining({
          method: "POST",
          body: expect.stringContaining('"priority":"urgent"'),
        }),
      ),
    );
    expect(await screen.findByText("New loan task")).toBeInTheDocument();
  });

  it("edits a task and displays save failures", async () => {
    const apiSpy = mockApi([task]);
    apiSpy.mockImplementation(((path: string, _token: string, init?: RequestInit) => {
      if (path.endsWith("/members")) return Promise.resolve({ members: [member] });
      if (init?.method === "PATCH") return Promise.reject(new Error("Update failed"));
      return Promise.resolve([task]);
    }) as typeof backendApi.api);
    render(<TaskBoard projectId="p1" token="token" canEdit />);
    await screen.findByText(task.title);
    fireEvent.click(screen.getByRole("button", { name: `Edit ${task.title}` }));
    fireEvent.change(screen.getByLabelText("Title"), { target: { value: "Edited title" } });
    fireEvent.click(screen.getByRole("button", { name: /save changes/i }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Update failed");
    expect(apiSpy).toHaveBeenCalledWith(
      `/api/v1/projects/p1/tasks/${task.id}`,
      "token",
      expect.objectContaining({ method: "PATCH" }),
    );
  });

  it("saves task edits and deletes the task after confirmation", async () => {
    const updated = { ...task, title: "Edited successfully" };
    const apiSpy = mockApi([task]);
    apiSpy.mockImplementation(((path: string, _token: string, init?: RequestInit) => {
      if (path.endsWith("/members")) return Promise.resolve({ members: [member] });
      if (init?.method === "PATCH") return Promise.resolve(updated);
      if (init?.method === "DELETE") return Promise.resolve(undefined);
      return Promise.resolve([task]);
    }) as typeof backendApi.api);
    vi.spyOn(window, "confirm").mockReturnValue(true);
    render(<TaskBoard projectId="p1" token="token" canEdit />);
    await screen.findByText(task.title);
    fireEvent.click(screen.getByRole("button", { name: `Edit ${task.title}` }));
    fireEvent.change(screen.getByLabelText("Title"), { target: { value: updated.title } });
    fireEvent.click(screen.getByRole("button", { name: /save changes/i }));
    expect(await screen.findByText(updated.title)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: `Delete ${updated.title}` }));
    await waitFor(() =>
      expect(apiSpy).toHaveBeenCalledWith(
        `/api/v1/projects/p1/tasks/${task.id}`,
        "token",
        expect.objectContaining({ method: "DELETE" }),
      ),
    );
    expect(screen.queryByText(updated.title)).not.toBeInTheDocument();
  });

  it("moves tasks by drag and drop and handles move errors", async () => {
    const apiSpy = mockApi([task]);
    let failMove = false;
    apiSpy.mockImplementation(((path: string, _token: string, init?: RequestInit) => {
      if (path.endsWith("/members")) return Promise.resolve({ members: [member] });
      if (init?.method === "PATCH") {
        if (failMove) return Promise.reject(new Error("Move failed"));
        return Promise.resolve({ ...task, status: "in_progress" });
      }
      return Promise.resolve([task]);
    }) as typeof backendApi.api);
    render(<TaskBoard projectId="p1" token="token" canEdit />);
    const card = await screen.findByText(task.title);
    const dataTransfer = { setData: vi.fn(), getData: vi.fn(() => task.id), effectAllowed: "" };
    fireEvent.dragStart(card.closest("article")!, { dataTransfer });
    fireEvent.dragOver(screen.getByRole("region", { name: "In Progress tasks" }));
    fireEvent.drop(screen.getByRole("region", { name: "In Progress tasks" }), { dataTransfer });
    await waitFor(() =>
      expect(apiSpy).toHaveBeenCalledWith(
        `/api/v1/projects/p1/tasks/${task.id}`,
        "token",
        expect.objectContaining({ body: '{"status":"in_progress"}' }),
      ),
    );
    expect(await screen.findByText(task.title)).toBeInTheDocument();
    expect(
      within(screen.getByRole("region", { name: "In Progress tasks" })).getByText("1"),
    ).toBeInTheDocument();

    failMove = true;
    fireEvent.drop(screen.getByRole("region", { name: "Done tasks" }), { dataTransfer });
    expect(await screen.findByRole("alert")).toHaveTextContent("Move failed");
  });

  it("deletes after confirmation and handles deletion errors", async () => {
    const apiSpy = mockApi([task]);
    let failDelete = false;
    apiSpy.mockImplementation(((path: string, _token: string, init?: RequestInit) => {
      if (path.endsWith("/members")) return Promise.resolve({ members: [member] });
      if (init?.method === "DELETE")
        return failDelete ? Promise.reject(new Error("Delete failed")) : Promise.resolve(undefined);
      return Promise.resolve([task]);
    }) as typeof backendApi.api);
    vi.spyOn(window, "confirm").mockReturnValue(false);
    render(<TaskBoard projectId="p1" token="token" canEdit />);
    await screen.findByText(task.title);
    fireEvent.click(screen.getByRole("button", { name: `Delete ${task.title}` }));
    expect(apiSpy).not.toHaveBeenCalledWith(
      `/api/v1/projects/p1/tasks/${task.id}`,
      "token",
      expect.objectContaining({ method: "DELETE" }),
    );
    vi.mocked(window.confirm).mockReturnValue(true);
    failDelete = true;
    fireEvent.click(screen.getByRole("button", { name: `Delete ${task.title}` }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Delete failed");
  });

  it("keeps board read-only for viewers", async () => {
    mockApi([task]);
    render(<TaskBoard projectId="p1" token="token" canEdit={false} />);
    await screen.findByText(task.title);
    expect(screen.queryByRole("button", { name: /add task/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: `Edit ${task.title}` })).not.toBeInTheDocument();
    expect(screen.getByRole("article")).not.toHaveAttribute("draggable", "true");
  });
});
