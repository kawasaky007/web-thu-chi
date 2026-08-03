import type { ReactNode } from "react";

import { Brand } from "@/components/brand";

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <main className="relative grid min-h-dvh overflow-hidden px-4 py-5 sm:px-6 lg:grid-cols-[0.92fr_1.08fr] lg:gap-6 lg:p-6" id="main-content" tabIndex={-1}>
      <div className="ambient ambient-one" aria-hidden="true" />
      <div className="ambient ambient-two" aria-hidden="true" />

      <section className="relative z-10 flex flex-col">
        <Brand />
        <div className="mx-auto flex w-full max-w-md flex-1 items-center py-10 lg:py-16">
          {children}
        </div>
        <p className="text-xs font-semibold text-forest/42">Thu Chi Gia Đình · Đăng nhập an toàn với Supabase</p>
      </section>

      <aside className="relative hidden overflow-hidden rounded-[2.5rem] bg-forest p-10 text-paper lg:flex lg:flex-col lg:justify-between">
        <div className="absolute -right-20 -top-20 size-80 rounded-full bg-yellow" aria-hidden="true" />
        <div className="absolute -bottom-28 -left-24 size-96 rounded-full border-[70px] border-indigo/24" aria-hidden="true" />
        <p className="relative z-10 text-xs font-extrabold uppercase tracking-[0.2em] text-mint">Forest Finance</p>
        <div className="relative z-10 max-w-xl">
          <p className="text-[clamp(3.6rem,6.5vw,7.5rem)] font-extrabold leading-[0.82] tracking-[-0.075em]">
            Cùng nhau,
            <span className="block text-yellow">rõ từng khoản.</span>
          </p>
          <p className="mt-8 max-w-lg text-lg font-medium leading-8 text-paper/62">
            Mọi quyết định tài chính gia đình bắt đầu từ dữ liệu dễ hiểu và một trải nghiệm đủ nhẹ để dùng mỗi ngày.
          </p>
        </div>
      </aside>
    </main>
  );
}
