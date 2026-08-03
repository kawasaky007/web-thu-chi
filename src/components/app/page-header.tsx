import type { ReactNode } from "react";

export function PageHeader({
  eyebrow,
  title,
  description,
  action,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <header className="mb-6 flex flex-col gap-4 sm:mb-8 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        {eyebrow ? (
          <p className="text-[11px] font-extrabold uppercase tracking-[0.18em] text-indigo">
            {eyebrow}
          </p>
        ) : null}
        <h1 className="mt-1 text-[clamp(2rem,8vw,3.2rem)] font-extrabold leading-none tracking-[-0.055em] text-ink">
          {title}
        </h1>
        {description ? (
          <p className="mt-3 max-w-2xl text-sm font-medium leading-6 text-ink/54 sm:text-base">
            {description}
          </p>
        ) : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </header>
  );
}
