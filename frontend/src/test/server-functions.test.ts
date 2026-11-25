import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  handlers: {} as Record<string, (args: any) => Promise<any>>,
}));

vi.mock("@tanstack/react-start", () => ({
  createServerFn: ({ method }: { method: string }) => {
    const fn = { method, middleware: () => fn, inputValidator: () => fn, handler: (handler: (args: any) => Promise<any>) => {
      const name = `${method}:${Object.keys(mocks.handlers).length}`;
      mocks.handlers[name] = handler;
      return handler;
    } };
    return fn;
  },
}));
vi.mock("@/integrations/supabase/auth-middleware", () => ({ requireSupabaseAuth: vi.fn() }));
vi.mock("@/lib/ai-estimate.server", () => ({
  AiError: class AiError extends Error {},
  estimateWithAi: vi.fn(async () => ({ points: 5 })),
}));

import "@/lib/backlog.functions";
import "@/lib/documents.functions";
import { buildTree } from "@/lib/parse-doc";

const handler = (index: number) => Object.values(mocks.handlers)[index]!;

describe("backlog server functions", () => {
  it("saves a normalized story, lists converted values, and deletes by id", async () => {
    const insert = vi.fn().mockResolvedValue({ error: null });
    const order = vi.fn().mockResolvedValue({ data: [
      { id: "1", title: "Story", points: 8, confidence: "0.75", criteria: null },
    ], error: null });
    const eq = vi.fn().mockResolvedValue({ error: null });
    const from = vi.fn(() => ({
      insert, select: () => ({ order }), delete: () => ({ eq }),
    }));
    const context = { userId: "u1", supabase: { from } };
    expect(await handler(1)({ data: { title: "Story", points: 4 }, context })).toEqual({ ok: true });
    expect(insert).toHaveBeenCalledWith(expect.objectContaining({ points: 3, owner_id: "u1" }));
    expect(await handler(2)({ context })).toEqual([
      { id: "1", title: "Story", points: 8, confidence: 0.75, criteria: [] },
    ]);
    expect(await handler(3)({ data: { id: "uuid" }, context })).toEqual({ ok: true });
    expect(eq).toHaveBeenCalledWith("id", "uuid");
  });

  it("propagates database failures and maps estimation errors", async () => {
    const context = { userId: "u1", supabase: { from: () => ({
      insert: async () => ({ error: { message: "insert failed" } }),
      select: () => ({ order: async () => ({ data: [], error: { message: "read failed" } }) }),
    }) } };
    await expect(handler(1)({ data: { title: "Story" }, context })).rejects.toThrow("insert failed");
    await expect(handler(2)({ context })).rejects.toThrow("read failed");
    expect(await handler(0)({ data: { title: "Good story", description: "Details" } })).toEqual({ ok: true, estimate: { points: 5 } });
  });
});

describe("document server functions", () => {
  it("lists documents with their tree normalized", async () => {
    const order = vi.fn().mockResolvedValue({ data: [{ id: "d1", tree: null }], error: null });
    const context = { supabase: { from: () => ({ select: () => ({ order }) }) } };
    expect(await handler(4)({ context })).toEqual([{ id: "d1", tree: null }]);
  });

  it("parses text documents and marks stored binary documents ready", async () => {
    const updates: unknown[] = [];
    const doc = { id: "d1", mime: "text/plain", name: "story.txt", storage_path: "d1" };
    const sb = {
      from: () => ({
        select: () => ({ eq: () => ({ single: async () => ({ data: doc, error: null }) }) }),
        update: (row: unknown) => { updates.push(row); return { eq: async () => ({ error: null }) }; },
      }),
      storage: { from: () => ({ download: async () => ({ data: { text: async () => "# Heading\nA paragraph." }, error: null }) }) },
    };
    expect(await handler(5)({ data: { id: "d1" }, context: { supabase: sb } })).toEqual({ ok: true });
    expect(updates).toHaveLength(2);
    expect(updates[1]).toMatchObject({ status: "ready", tree: buildTree("# Heading\nA paragraph."), error: null });
  });

  it("handles missing documents and reports download failures", async () => {
    const missing = { from: () => ({ select: () => ({ eq: () => ({ single: async () => ({ data: null, error: new Error("missing") }) }) }) }) };
    await expect(handler(5)({ data: { id: "missing" }, context: { supabase: missing } })).rejects.toThrow("Document not found");

    const updates: unknown[] = [];
    const sb = {
      from: () => ({
        select: () => ({ eq: () => ({ single: async () => ({ data: { id: "d2", name: "x.pdf", storage_path: "x", mime: "application/pdf" }, error: null }) }) }),
        update: (row: unknown) => { updates.push(row); return { eq: async () => ({}) }; },
      }),
      storage: { from: () => ({ download: async () => ({ data: null, error: new Error("no file") }) }) },
    };
    await handler(5)({ data: { id: "d2" }, context: { supabase: sb } });
    expect(updates.at(-1)).toMatchObject({ status: "failed", error: "Could not read the uploaded file" });
  });

  it("removes stored files before deleting a document", async () => {
    const remove = vi.fn().mockResolvedValue({});
    const del = vi.fn(() => ({ eq: vi.fn().mockResolvedValue({}) }));
    const sb = {
      from: () => ({ select: () => ({ eq: () => ({ single: async () => ({ data: { storage_path: "folder/file.txt" } }) }) }), delete: del }),
      storage: { from: () => ({ remove }) },
    };
    expect(await handler(6)({ data: { id: "d1" }, context: { supabase: sb } })).toEqual({ ok: true });
    expect(remove).toHaveBeenCalledWith(["folder/file.txt"]);
    expect(del).toHaveBeenCalled();
  });
});
