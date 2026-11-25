import { useEffect, useState } from "react";
import { ApiError } from "./api/client";
import { asText } from "./normalize";

export interface ResourceState<T> {
  data: T | null;
  loading: boolean;
  error: string;
  /** True for 409 conflicts so callers can show a reload/diff action. */
  conflict: boolean;
}

/**
 * Small cancellable resource loader for feature panels. Endpoint modules own
 * caching concerns; this hook only keeps request lifecycle state local so that
 * panels remain independently testable.
 */
export function useApiResource<T>(
  load: (signal: AbortSignal) => Promise<T>,
  deps: readonly unknown[],
): ResourceState<T> & { reload: () => void } {
  const [state, setState] = useState<ResourceState<T>>({
    data: null,
    loading: true,
    error: "",
    conflict: false,
  });
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    setState((previous) => ({ ...previous, loading: true, error: "", conflict: false }));
    load(controller.signal)
      .then((data) => {
        if (active) setState({ data, loading: false, error: "", conflict: false });
      })
      .catch((error: unknown) => {
        if (!active || controller.signal.aborted) return;
        const conflict = error instanceof ApiError && error.status === 409;
        const message =
          error instanceof ApiError && typeof error.detail === "string" && error.detail
            ? error.detail
            : error instanceof Error
              ? error.message
              : asText(error, "Could not load this view.");
        setState({ data: null, loading: false, error: message, conflict });
      });
    return () => {
      active = false;
      controller.abort();
    };
    // The caller supplies the identity of the request through `deps`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, revision]);

  return { ...state, reload: () => setRevision((value) => value + 1) };
}
