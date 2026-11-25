import type { ReactNode } from "react";
import { AlertTriangle, LoaderCircle } from "lucide-react";

export function FeaturePanel({
  kicker,
  title,
  children,
  action,
}: {
  kicker: string;
  title: string;
  children: ReactNode;
  action?: ReactNode;
}) {
  return (
    <section className="panel feature-panel">
      <div className="panel-heading">
        <div>
          <span className="section-kicker">{kicker}</span>
          <h2>{title}</h2>
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

export function LoadingNotice({ label = "Loading" }: { label?: string }) {
  return (
    <p className="feature-status" role="status">
      <LoaderCircle size={15} className="spin" aria-hidden="true" /> {label}…
    </p>
  );
}

export function ErrorNotice({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="feature-error" role="alert">
      <AlertTriangle size={16} aria-hidden="true" />
      <span>{message}</span>
      {onRetry && (
        <button type="button" className="text-button" onClick={onRetry}>
          Try again
        </button>
      )}
    </div>
  );
}

export function EmptyNotice({ children }: { children: ReactNode }) {
  return <p className="feature-status">{children}</p>;
}

export function StatusBadge({ value }: { value: string }) {
  const normalized = value.toLowerCase().replaceAll("_", " ");
  return (
    <span className={`status-badge status-${normalized.replaceAll(" ", "-")}`}>
      {normalized || "unknown"}
    </span>
  );
}
