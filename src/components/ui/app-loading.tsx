import { LoaderCircle, Sparkles } from "lucide-react";

type AppLoadingProps = {
  label?: string;
  fullScreen?: boolean;
};

export function AppLoading({
  label = "Đang chuẩn bị sổ thu chi của gia đình",
  fullScreen = true,
}: AppLoadingProps) {
  return (
    <main
      aria-label="Đang tải ứng dụng"
      className={`relative isolate grid place-items-center overflow-hidden bg-paper px-5 ${fullScreen ? "min-h-dvh" : "min-h-[62dvh] rounded-[2rem]"}`}
    >
      <div aria-hidden="true" className="pointer-events-none absolute -left-24 top-[-7rem] size-72 rounded-full bg-yellow/18 blur-3xl" />
      <div aria-hidden="true" className="pointer-events-none absolute -right-28 bottom-[-9rem] size-80 rounded-full bg-indigo/10 blur-3xl" />
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 opacity-45 [background-image:radial-gradient(rgb(31_61_43/12%)_0.8px,transparent_0.8px)] [background-size:18px_18px]" />

      <div className="relative w-full max-w-sm text-center">
        <div className="relative mx-auto grid size-20 place-items-center rounded-[1.8rem] bg-forest text-paper shadow-[0_22px_60px_rgba(31,61,43,0.28)] loading-logo">
          <span className="brand-mark scale-[1.28]" aria-hidden="true" />
          <span className="absolute grid size-7 place-items-center rounded-full bg-yellow text-ink shadow-lg">
            <Sparkles aria-hidden="true" className="size-3.5" strokeWidth={2.5} />
          </span>
        </div>

        <p className="mt-7 text-[11px] font-extrabold uppercase tracking-[0.24em] text-indigo">Forest Finance</p>
        <h1 className="mt-2 text-3xl font-extrabold tracking-[-0.06em] text-ink">Thu Chi Gia Đình</h1>
        <p aria-live="polite" className="mt-3 flex items-center justify-center gap-2 text-sm font-semibold text-ink/48" role="status">
          <LoaderCircle aria-hidden="true" className="size-4 animate-spin text-income" />
          {label}
        </p>

        <div aria-hidden="true" className="mx-auto mt-7 h-1.5 w-52 overflow-hidden rounded-full bg-forest/10">
          <div className="loading-progress h-full w-1/2 rounded-full bg-gradient-to-r from-income via-mint to-yellow" />
        </div>

        <div aria-hidden="true" className="mt-10 grid gap-3 text-left">
          <div className="loading-skeleton h-24 rounded-[1.65rem] border border-white/60 bg-paper-raised/68" />
          <div className="grid grid-cols-2 gap-3">
            <div className="loading-skeleton h-16 rounded-2xl border border-white/60 bg-paper-raised/68" />
            <div className="loading-skeleton h-16 rounded-2xl border border-white/60 bg-paper-raised/68" />
          </div>
        </div>
      </div>
    </main>
  );
}
