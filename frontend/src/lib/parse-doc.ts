export type TreeNode = { type: "section" | "paragraph" | "table"; label: string; children?: TreeNode[] };

/** Builds a simple heading → section → paragraph/table tree from plain text or Markdown. */
export function buildTree(text: string): TreeNode[] {
  const root: TreeNode[] = [];
  const stack: { level: number; node: TreeNode }[] = [];
  const add = (n: TreeNode) => {
    const parent = stack[stack.length - 1];
    if (parent) (parent.node.children ??= []).push(n);
    else root.push(n);
  };
  const blocks = text.replace(/\r/g, "").split(/\n\s*\n/);
  for (const raw of blocks) {
    const lines = raw.split("\n").filter((l) => l.trim());
    if (!lines.length) continue;
    for (let i = 0; i < lines.length; i++) {
      const h = /^(#{1,6})\s+(.*)$/.exec(lines[i]) ?? /^(\d+(?:\.\d+)*)\.?\s+([A-Z].{0,80})$/.exec(lines[i]);
      if (h && (h[1].startsWith("#") || lines.length === 1)) {
        const level = h[1].startsWith("#") ? h[1].length : h[1].split(".").length;
        while (stack.length && stack[stack.length - 1].level >= level) stack.pop();
        const node: TreeNode = { type: "section", label: h[2].trim(), children: [] };
        add(node);
        stack.push({ level, node });
        continue;
      }
      const rest = lines.slice(i).join(" ");
      const isTable = lines.slice(i).some((l) => l.includes("|") || l.includes("\t"));
      add({ type: isTable ? "table" : "paragraph", label: rest.slice(0, 120) + (rest.length > 120 ? "…" : "") });
      break;
    }
  }
  return root;
}
