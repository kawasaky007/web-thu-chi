import type { ReactNode } from "react";
import { AlertTriangle, Inbox, LoaderCircle } from "lucide-react";

import { cn } from "@/lib/cn";

type StateProps = {
  title: string;
  description: string;
  action?: ReactNode;
  className?: string;
};

export function EmptyState({ title, description, action, className }: StateProps) {
  return (
    <StateFrame
      className={className}
      icon={<Inbox className="size-6" />}
      title={title}
      description={description}
      action={action}
    />
  );
}

export function ErrorState({ title, description, action, className }: StateProps) {
  return (
    <StateFrame
      className={className}
      icon={<AlertTriangle className="size-6 text-expense" />}
      title={title}
      description={description}
      action={action}
    />
  );
}

export function LoadingState({ label = "Đang tải dữ liệu" }: { label?: string }) {
  return (
    <div className="flex min-h-56 items-center justify-center" role="status">
      <div className="flex items-center gap-3 rounded-full border border-forest/10 bg-paper-raised/80 px-5 py-3 text-sm font-bold text-forest shadow-lg">
        <LoaderCircle aria-hidden="true" className="size-5 animate-spin text-indigo" />
        {label}
      </div>
    </div>
  );
}

function StateFrame({
  title,
  description,
  action,
  icon,
  className,
}: StateProps & { icon: ReactNode }) {
  return (
    <div
      className={cn(
        "flex flex-col items-center rounded-[1.75rem] border border-dashed border-forest/18 bg-paper-raised/58 px-6 py-10 text-center",
        className,
      )}
    >
      <div className="grid size-12 place-items-center rounded-2xl bg-mist text-forest">
        {icon}
      </div>
      <h2 className="mt-4 text-lg font-extrabold text-ink">{title}</h2>
      <p className="mt-2 max-w-sm text-sm font-medium leading-6 text-ink/52">
        {description}
      </p>
      {action ? <div className="mt-5">{action}</div> : null}
    </div>
  );
}
