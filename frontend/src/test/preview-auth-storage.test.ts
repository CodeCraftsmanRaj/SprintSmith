import { afterEach, describe, expect, it, vi } from "vitest";
import { brokeredPreviewStorage } from "@/integrations/supabase/previewAuthStorage";

const PROJECT_ID = "123e4567-e89b-42d3-a456-426614174000";
const EDITOR_ORIGIN = "https://lovable.dev";

function createPreviewStorage() {
  const postMessage = vi.fn();
  const parent = { postMessage };
  Object.defineProperty(window, "parent", { configurable: true, value: parent });
  vi.stubGlobal("location", {
    hostname: `id-preview--${PROJECT_ID}.lovable.app`,
    ancestorOrigins: [EDITOR_ORIGIN],
  });
  vi.stubGlobal("crypto", { randomUUID: vi.fn(() => `request-${postMessage.mock.calls.length + 1}`) });
  const storage = brokeredPreviewStorage()!;

  async function answerNext(value: string | null, options: { ok?: boolean; origin?: string } = {}) {
    const callIndex = postMessage.mock.calls.length;
    const call = postMessage.mock.calls[callIndex - 1];
    const request = call[0] as { requestId: string };
    const origin = options.origin ?? EDITOR_ORIGIN;
    window.dispatchEvent(new MessageEvent("message", {
      origin,
      data: { type: "lovable-preview-auth:result", requestId: request.requestId, ok: options.ok ?? true, value },
    }));
  }

  return { storage, postMessage, answerNext };
}

afterEach(() => {
  vi.unstubAllGlobals();
  Object.defineProperty(window, "parent", { configurable: true, value: window });
  localStorage.clear();
});

describe("brokered preview auth storage", () => {
  it("gets and seeds the editor session, then applies broker updates and logout tombstones", async () => {
    const { storage, postMessage, answerNext } = createPreviewStorage();

    const reading = storage.getItem("supabase-session");
    expect(postMessage.mock.calls[0]![0]).toMatchObject({
      type: "lovable-preview-auth:get", projectId: PROJECT_ID, key: "supabase-session",
    });
    await answerNext("editor-session");
    await expect(reading).resolves.toBe("editor-session");
    expect(localStorage.getItem("supabase-session")).toBe("editor-session");

    const setting = storage.setItem("supabase-session", "new-session");
    await answerNext("canonical-session");
    await setting;
    expect(postMessage.mock.calls[1]![0]).toMatchObject({
      type: "lovable-preview-auth:set", key: "supabase-session", value: "new-session",
    });
    expect(localStorage.getItem("supabase-session")).toBe("canonical-session");

    const logout = storage.getItem("supabase-session");
    await answerNext("");
    await expect(logout).resolves.toBeNull();
    expect(localStorage.getItem("supabase-session")).toBeNull();
  });

  it("keeps local state when the editor has no value and removes it on sign out", async () => {
    const { storage, postMessage, answerNext } = createPreviewStorage();
    localStorage.setItem("token", "local-token");

    const reading = storage.getItem("token");
    await answerNext(null);
    await expect(reading).resolves.toBe("local-token");
    expect(postMessage.mock.calls[0]![0]).toMatchObject({ value: "local-token" });

    const removing = storage.removeItem("token");
    expect(localStorage.getItem("token")).toBeNull();
    expect(postMessage.mock.calls[1]![0]).toMatchObject({
      type: "lovable-preview-auth:remove", key: "token", value: "local-token",
    });
    await answerNext(null);
    await removing;
  });

  it("ignores messages from untrusted origins and validates preview project hosts", async () => {
    const { storage, answerNext } = createPreviewStorage();
    const reading = storage.getItem("key");
    await answerNext("spoofed", { origin: "https://untrusted.example" });
    await answerNext("trusted");
    await expect(reading).resolves.toBe("trusted");

    vi.stubGlobal("location", {
      hostname: `preview--attacker--${PROJECT_ID}.lovable.app`,
      ancestorOrigins: [EDITOR_ORIGIN],
    });
    Object.defineProperty(window, "parent", { configurable: true, value: { postMessage: vi.fn() } });
    expect(brokeredPreviewStorage()).toBe(localStorage);
  });
});
