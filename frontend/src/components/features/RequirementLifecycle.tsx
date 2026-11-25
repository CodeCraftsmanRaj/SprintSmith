import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { CheckCircle2, Clock3, History, Save, XCircle } from "lucide-react";
import { endpoints } from "@/lib/api/endpoints";
import type { RequirementOut, RequirementVersion } from "@/lib/api/types";
import {
  asArray,
  asNullableText,
  asNumber,
  asText,
  formatDate,
  formatDateTime,
  uniqueStrings,
} from "@/lib/normalize";
import { useApiResource } from "@/lib/use-api-resource";
import { EmptyNotice, ErrorNotice, FeaturePanel, LoadingNotice, StatusBadge } from "./common";

const editSchema = z.object({
  content: z.string().min(1, "Content is required"),
  category: z.string().max(120),
  tags: z.string().max(400),
  priority: z.enum(["low", "medium", "high", "critical"]),
  change_summary: z.string().max(300),
});
type EditValues = z.infer<typeof editSchema>;

const priorityOptions = ["low", "medium", "high", "critical"] as const;
const reviewFilters = ["", "pending", "approved", "rejected"] as const;

function toEditValues(requirement: RequirementOut): EditValues {
  return {
    content: asText(requirement.content),
    category: asText(requirement.category),
    tags: asArray(requirement.tags)
      .map((tag) => asText(tag))
      .join(", "),
    priority: priorityOptions.includes(requirement.priority as (typeof priorityOptions)[number])
      ? (requirement.priority as (typeof priorityOptions)[number])
      : "medium",
    change_summary: "",
  };
}

export function RequirementLifecycle({ projectId }: { projectId: string }) {
  const [reviewFilter, setReviewFilter] = useState<string>("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [conflict, setConflict] = useState("");
  const [actionError, setActionError] = useState("");
  const [notice, setNotice] = useState("");

  const list = useApiResource(
    (signal) =>
      endpoints.requirements.list(projectId, reviewFilter ? { review_status: reviewFilter } : {}),
    [projectId, reviewFilter],
  );

  const requirements = list.data ?? [];
  const selected = requirements.find((item) => item.id === selectedId) ?? requirements[0] ?? null;

  useEffect(() => {
    setConflict("");
    setActionError("");
    setNotice("");
  }, [projectId, selected?.id]);

  const detail = useApiResource(
    (signal) => (selected ? endpoints.requirements.get(selected.id) : Promise.resolve(null)),
    [selected?.id],
  );
  const versions = useApiResource(
    (signal) => (selected ? endpoints.requirements.versions(selected.id) : Promise.resolve([])),
    [selected?.id, detail.data?.version],
  );

  const form = useForm<EditValues>({
    resolver: zodResolver(editSchema),
    ...(selected ? { defaultValues: toEditValues(selected) } : {}),
  });

  useEffect(() => {
    if (detail.data) form.reset(toEditValues(detail.data as RequirementOut));
  }, [detail.data, form]);

  async function save(values: EditValues) {
    if (!selected) return;
    setActionError("");
    setConflict("");
    try {
      await endpoints.requirements.update(selected.id, {
        content: values.content,
        category: values.category || null,
        tags: uniqueStrings(values.tags.split(",")),
        priority: values.priority,
        expected_version: asNumber(detail.data?.version, 0) || null,
        change_summary: values.change_summary || undefined,
      });
      setNotice("Requirement saved and re-indexed.");
      detail.reload();
      versions.reload();
      list.reload();
    } catch (error) {
      const status = (error as { status?: number }).status;
      const message = error instanceof Error ? error.message : "Could not save requirement.";
      if (status === 409) {
        setConflict(
          "This requirement changed while you were editing. Review the latest version and reapply your changes.",
        );
        detail.reload();
      } else {
        setActionError(message);
      }
    }
  }

  async function review(decision: "approved" | "rejected") {
    if (!selected) return;
    setActionError("");
    try {
      await endpoints.requirements.review(selected.id, {
        decision,
        review_note: `Reviewed in workspace: ${decision}`,
        expected_version: asNumber(detail.data?.version, 0) || null,
      });
      setNotice(`Requirement ${decision}.`);
      detail.reload();
      versions.reload();
      list.reload();
    } catch (error) {
      const status = (error as { status?: number }).status;
      const message = error instanceof Error ? error.message : "Could not review requirement.";
      if (status === 409) {
        setConflict("The requirement changed before review. Reload and review the latest version.");
        detail.reload();
      } else {
        setActionError(message);
      }
    }
  }

  return (
    <div className="feature-grid">
      <FeaturePanel
        kicker="REQUIREMENT LIFECYCLE"
        title="Source requirements"
        action={
          <label className="feature-filter">
            <span className="sr-only">Filter by review status</span>
            <select value={reviewFilter} onChange={(event) => setReviewFilter(event.target.value)}>
              {reviewFilters.map((filter) => (
                <option key={filter} value={filter}>
                  {filter ? `${filter.charAt(0).toUpperCase()}${filter.slice(1)}` : "All reviews"}
                </option>
              ))}
            </select>
          </label>
        }
      >
        {list.loading && <LoadingNotice label="Loading requirements" />}
        {list.error && <ErrorNotice message={list.error} onRetry={list.reload} />}
        {!list.loading && !list.error && requirements.length === 0 && (
          <EmptyNotice>No requirements have been ingested for this project yet.</EmptyNotice>
        )}
        {requirements.length > 0 && (
          <ul className="feature-list">
            {requirements.map((item) => (
              <li key={item.id}>
                <button
                  type="button"
                  className={`feature-list-item ${selected?.id === item.id ? "active" : ""}`}
                  onClick={() => setSelectedId(item.id)}
                  aria-pressed={selected?.id === item.id}
                >
                  <span>
                    <b>{asText(item.filename, asText(item.title, "Untitled requirement"))}</b>
                    <small>
                      {asText(item.doc_type, "requirement")} · v{asNumber(item.version, 1)}
                    </small>
                  </span>
                  <StatusBadge value={asText(item.review_status, "pending")} />
                </button>
              </li>
            ))}
          </ul>
        )}
      </FeaturePanel>

      <FeaturePanel
        kicker="DETAIL & REVIEW"
        title={selected ? asText(selected.filename, "Requirement") : "No selection"}
      >
        {!selected && <EmptyNotice>Select a requirement to edit or review it.</EmptyNotice>}
        {selected && detail.loading && <LoadingNotice label="Loading requirement" />}
        {selected && detail.error && <ErrorNotice message={detail.error} onRetry={detail.reload} />}
        {conflict && (
          <div className="feature-error" role="alert">
            <Clock3 size={16} aria-hidden="true" />
            <span>{conflict}</span>
            <button
              type="button"
              className="text-button"
              onClick={() => {
                setConflict("");
                detail.reload();
              }}
            >
              Load latest
            </button>
          </div>
        )}
        {actionError && <ErrorNotice message={actionError} />}
        {notice && (
          <p className="feature-success" role="status">
            <CheckCircle2 size={15} /> {notice}
          </p>
        )}
        {detail.data && (
          <form className="feature-form" onSubmit={form.handleSubmit(save)} noValidate>
            <label className="field-label" htmlFor="requirement-content">
              Requirement content
            </label>
            <textarea
              id="requirement-content"
              className="text-input feature-textarea"
              rows={8}
              {...form.register("content")}
            />
            {form.formState.errors.content && (
              <span className="field-error">{form.formState.errors.content.message}</span>
            )}
            <div className="feature-form-row">
              <label className="field-label" htmlFor="requirement-category">
                Category
              </label>
              <input
                id="requirement-category"
                className="text-input"
                {...form.register("category")}
              />
              <label className="field-label" htmlFor="requirement-priority">
                Priority
              </label>
              <select
                id="requirement-priority"
                className="text-input"
                {...form.register("priority")}
              >
                {priorityOptions.map((priority) => (
                  <option key={priority} value={priority}>
                    {priority}
                  </option>
                ))}
              </select>
            </div>
            <label className="field-label" htmlFor="requirement-tags">
              Tags (comma separated)
            </label>
            <input id="requirement-tags" className="text-input" {...form.register("tags")} />
            <label className="field-label" htmlFor="requirement-summary">
              Change summary
            </label>
            <input
              id="requirement-summary"
              className="text-input"
              {...form.register("change_summary")}
            />
            {asNullableText(detail.data.index_stale === true ? "Index stale after edit" : null) && (
              <p className="feature-warning">The search index is stale for this requirement.</p>
            )}
            <div className="feature-actions">
              <button
                type="submit"
                className="button button-primary button-small"
                disabled={form.formState.isSubmitting}
              >
                <Save size={15} /> Save version
              </button>
              <button
                type="button"
                className="button button-quiet button-small"
                onClick={() => review("approved")}
              >
                <CheckCircle2 size={15} /> Approve
              </button>
              <button
                type="button"
                className="button button-quiet button-small"
                onClick={() => review("rejected")}
              >
                <XCircle size={15} /> Reject
              </button>
            </div>
          </form>
        )}
      </FeaturePanel>

      <FeaturePanel kicker="AUDIT HISTORY" title="Version snapshots">
        {versions.loading && <LoadingNotice label="Loading versions" />}
        {versions.error && <ErrorNotice message={versions.error} onRetry={versions.reload} />}
        {!versions.loading && !versions.error && (versions.data?.length ?? 0) === 0 && (
          <EmptyNotice>No prior versions have been recorded.</EmptyNotice>
        )}
        {(versions.data?.length ?? 0) > 0 && (
          <ul className="feature-timeline">
            {(versions.data as RequirementVersion[]).map((version, index) => (
              <li key={version.id ?? `${version.version}-${index}`}>
                <History size={14} aria-hidden="true" />
                <div>
                  <b>Version {version.version ?? "—"}</b>
                  <small>{asText(version.change_summary, "No change summary")}</small>
                  <small>{formatDateTime(version.created_at)}</small>
                </div>
              </li>
            ))}
          </ul>
        )}
        {selected && <p className="feature-footnote">Created {formatDate(selected.created_at)}</p>}
      </FeaturePanel>
    </div>
  );
}
