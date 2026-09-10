/**
 * Something failed, said plainly, with a way out.
 *
 * `role="alert"` rather than a styled div: a read failing is the difference
 * between "there are no races" and "we could not ask", and a screen reader has
 * to be told which one it is looking at.
 *
 * Contract reverts arrive here already classified by @sterunxyz/sdk, so the
 * message can name what happened instead of printing `Error(Contract, #4)`.
 */
import { Button } from "@/components/ui/button";

interface ErrorNoticeProps {
  title: string;
  detail?: string;
  onRetry?: () => void;
}

export function ErrorNotice({ title, detail, onRetry }: ErrorNoticeProps) {
  return (
    <div
      role="alert"
      className="rounded-lg border border-danger-border bg-danger-surface px-6 py-5 text-left"
    >
      <p className="heading-strong text-lg text-danger">{title}</p>
      {detail ? <p className="mt-1 text-base text-n-700">{detail}</p> : null}
      {onRetry ? (
        <Button variant="secondary" size="sm" className="mt-4" onClick={onRetry}>
          Try again
        </Button>
      ) : null}
    </div>
  );
}
