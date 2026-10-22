import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { buildTree, type TreeNode } from "./parse-doc";

export const listDocuments = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("documents")
      .select("id,name,mime,size_bytes,status,error,tree,created_at")
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return data.map((d) => ({ ...d, tree: (d.tree ?? null) as TreeNode[] | null }));
  });

export const processDocument = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const sb = context.supabase;
    const { data: doc, error } = await sb.from("documents").select("*").eq("id", data.id).single();
    if (error || !doc) throw new Error("Document not found");
    await sb.from("documents").update({ status: "parsing", updated_at: new Date().toISOString() }).eq("id", doc.id);
    try {
      const { data: file, error: dlErr } = await sb.storage.from("documents").download(doc.storage_path);
      if (dlErr || !file) throw new Error("Could not read the uploaded file");
      const isText = /^text\//.test(doc.mime ?? "") || /\.(md|txt|markdown|csv)$/i.test(doc.name);
      let tree: TreeNode[];
      if (isText) {
        tree = buildTree(await file.text());
      } else {
        tree = [{ type: "section", label: `${doc.name} (stored — section parsing supports text and Markdown files)` }];
      }
      if (!tree.length) tree = [{ type: "paragraph", label: "Empty document" }];
      await sb.from("documents").update({ status: "ready", tree, error: null, updated_at: new Date().toISOString() }).eq("id", doc.id);
    } catch (e) {
      await sb
        .from("documents")
        .update({ status: "failed", error: e instanceof Error ? e.message : "Parsing failed" })
        .eq("id", doc.id);
    }
    return { ok: true };
  });

export const deleteDocument = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: doc } = await context.supabase.from("documents").select("storage_path").eq("id", data.id).single();
    if (doc) await context.supabase.storage.from("documents").remove([doc.storage_path]);
    await context.supabase.from("documents").delete().eq("id", data.id);
    return { ok: true };
  });
