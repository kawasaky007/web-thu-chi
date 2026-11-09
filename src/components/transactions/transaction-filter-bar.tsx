"use client";

import Link from "next/link";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { ChevronLeft, ChevronRight, Search, X } from "lucide-react";

import { LinkPendingOverlay } from "@/components/ui/link-pending-overlay";
import { MonthPicker } from "@/components/ui/month-picker";
import { Sheet } from "@/components/ui/sheet";
import { CATEGORY_ICONS, CATEGORY_ICON_FALLBACK } from "@/lib/categories/icons";
import { cn } from "@/lib/cn";
import type { CategoryChipEntry } from "@/lib/transactions/analytics";
import { shiftMonth, type MemberOption } from "@/lib/transactions/data";
import { toggleFilterId, isTransactionFilterEmpty, EMPTY_TRANSACTION_FILTER, type TransactionFilter } from "@/lib/transactions/filters";
import { formatCompactMoney, formatMoney } from "@/lib/transactions/format";

export const VISIBLE_CATEGORY_CHIPS = 6;

type TransactionFilterBarProps = {
  month: string;
  view: "month" | "all";
  chipOrder: CategoryChipEntry[];
  members: MemberOption[];
  filter: TransactionFilter;
  onFilterChange: (filter: TransactionFilter) => void;
  hrefForMonth: (month: string) => string;
  hrefForView: (view: "month" | "all") => string;
  /** Có prop này = **chế độ điều hướng** (view "Tất cả", nơi dữ liệu được lọc ở DB): mọi thay đổi
   * filter trở thành `<Link>` kèm `LinkPendingOverlay`, và search trở lại thành form GET submit —
   * input controlled bắn mỗi ký tự ở chế độ này sẽ đẩy một lần điều hướng cho từng ký tự, trên
   * giá trị filter đã cũ. Không có prop này = chế độ state (view tháng), lọc tức thì tại chỗ. */
  hrefForFilter?: (filter: TransactionFilter) => string;
};

// Chip cộng tiền theo phạm vi KHÁC mọi con số khác trên trang (cả tháng, cả thu lẫn chi, bỏ qua
// filter) — có chủ ý, nhưng vậy thì nó phải tự khai ra, nên cùng một câu dùng cho cả sheet lẫn thanh chip.
const CHIP_SCOPE_NOTE = "Số tiền tính theo tháng đang xem.";

const CHIP_BASE = "inline-flex min-h-9 shrink-0 items-center gap-1.5 rounded-full border px-3 text-xs font-extrabold transition";
const CHIP_IDLE = "border-forest/10 bg-paper-raised/65 text-forest hover:bg-mist";
const CHIP_ACTIVE = "border-forest/25 bg-mint-soft text-forest";

export function TransactionFilterBar({
  month,
  view,
  chipOrder,
  members,
  filter,
  onFilterChange,
  hrefForMonth,
  hrefForView,
  hrefForFilter,
}: TransactionFilterBarProps) {
  // Khởi tạo trực tiếp từ filter: đang có từ khoá (vd. mở từ URL) thì ô nhập phải hiện sẵn, khỏi cần effect.
  const [searchOpen, setSearchOpen] = useState(filter.search !== "");
  const [sheetOpen, setSheetOpen] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const scopeNoteId = useId();
  // Chỉ focus khi người dùng chủ động bấm icon; mở sẵn từ ?q= mà autoFocus thì bàn phím bật lên ngay khi vào trang.
  const focusSearchRef = useRef(false);

  useEffect(() => {
    if (searchOpen && focusSearchRef.current) {
      focusSearchRef.current = false;
      searchInputRef.current?.focus();
    }
  }, [searchOpen]);

  // chipOrder đã được sắp theo tổng tiền của tháng; sắp lại ở đây sẽ phá thứ tự "xếp hạng" mà chip thể hiện.
  const visibleChips = chipOrder.slice(0, VISIBLE_CATEGORY_CHIPS);
  const hiddenCount = chipOrder.length - visibleChips.length;
  const hasFilter = !isTransactionFilterEmpty(filter);
  const navigating = hrefForFilter !== undefined;
  // Ở chế độ điều hướng, chipOrder chỉ tính được trên trang đang tải — "20k" khi còn 40 trang nữa là
  // con số không bảo vệ được, đúng loại lỗi của dải tổng cũ. Không có số thì không hứa gì.
  const showAmounts = !navigating;
  const hrefFor = (next: TransactionFilter) => (hrefForFilter ? hrefForFilter(next) : null);

  const withCategory = (id: string) => ({ ...filter, categoryIds: toggleFilterId(filter.categoryIds, id) });
  const withMember = (id: string) => ({ ...filter, memberIds: toggleFilterId(filter.memberIds, id) });
  const toggleCategory = (id: string) => onFilterChange(withCategory(id));
  const toggleMember = (id: string) => onFilterChange(withMember(id));

  return (
    <div className="mt-4 space-y-2.5 rounded-2xl border border-forest/10 bg-paper-raised/65 p-2.5">
      {/* Điều hướng tháng/đổi view cần dữ liệu mới từ server nên là Link; filter chỉ là Link ở view "Tất cả". */}
      <div className="flex items-center gap-2">
        <div className="flex shrink-0 rounded-xl bg-mist/62 p-0.5 text-xs font-extrabold">
          <ViewLink active={view === "month"} href={hrefForView("month")} label="Tháng" />
          <ViewLink active={view === "all"} href={hrefForView("all")} label="Tất cả" />
        </div>
        {view === "month" ? (
          <div className="flex min-w-0 flex-1 items-center justify-center gap-1">
            <Link aria-label="Tháng trước" className="relative grid size-9 place-items-center rounded-xl text-forest hover:bg-mist" href={hrefForMonth(shiftMonth(month, -1))}>
              <ChevronLeft aria-hidden="true" className="size-4" />
              <LinkPendingOverlay />
            </Link>
            <MonthPicker hrefForMonth={hrefForMonth} month={month} />
            <Link aria-label="Tháng sau" className="relative grid size-9 place-items-center rounded-xl text-forest hover:bg-mist" href={hrefForMonth(shiftMonth(month, 1))}>
              <ChevronRight aria-hidden="true" className="size-4" />
              <LinkPendingOverlay />
            </Link>
          </div>
        ) : (
          <div className="flex-1" />
        )}
        {searchOpen ? null : (
          <button
            aria-label="Tìm kiếm"
            className="grid size-9 shrink-0 place-items-center rounded-xl text-forest hover:bg-mist"
            onClick={() => {
              focusSearchRef.current = true;
              setSearchOpen(true);
            }}
            type="button"
          >
            <Search aria-hidden="true" className="size-4" />
          </button>
        )}
      </div>

      {searchOpen ? (
        navigating ? (
          <SearchForm
            hrefWithoutSearch={hrefForFilter({ ...filter, search: "" })}
            inputRef={searchInputRef}
            onCloseEmpty={() => setSearchOpen(false)}
            search={filter.search}
          />
        ) : (
          <div className="flex items-center gap-2 rounded-xl border border-forest/10 bg-paper px-3">
            <Search aria-hidden="true" className="size-4 shrink-0 text-indigo" />
            <input
              aria-label="Tìm giao dịch"
              className="min-h-10 min-w-0 flex-1 bg-transparent text-sm font-semibold outline-none placeholder:text-ink/40"
              onChange={(event) => onFilterChange({ ...filter, search: event.target.value })}
              ref={searchInputRef}
              placeholder="Tìm theo tên, ghi chú, danh mục..."
              type="search"
              value={filter.search}
            />
            <button
              aria-label="Đóng tìm kiếm"
              className="grid size-8 shrink-0 place-items-center rounded-lg text-forest/60 hover:bg-mist"
              onClick={() => {
                // Đóng ô nhập mà vẫn giữ từ khoá thì danh sách bị lọc ngầm; xoá luôn để thấy được thứ đang áp dụng.
                if (filter.search) onFilterChange({ ...filter, search: "" });
                setSearchOpen(false);
              }}
              type="button"
            >
              <X aria-hidden="true" className="size-4" />
            </button>
          </div>
        )
      ) : null}

      {/* Hai chiều lọc (danh mục / thành viên) nghe giống nhau hoàn toàn nếu không có nhãn nhóm:
          chữ cái trên avatar là aria-hidden nên không còn cứ nào để phân biệt. */}
      <div
        aria-describedby={showAmounts ? scopeNoteId : undefined}
        aria-label="Lọc theo danh mục"
        className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-0.5 [scrollbar-width:none]"
        role="group"
      >
        {showAmounts ? <p className="sr-only" id={scopeNoteId}>{CHIP_SCOPE_NOTE}</p> : null}
        {visibleChips.map((entry) => (
          <CategoryChip
            entry={entry}
            href={hrefFor(withCategory(entry.categoryId))}
            key={entry.categoryId}
            onToggle={toggleCategory}
            pressed={filter.categoryIds.includes(entry.categoryId)}
            showAmount={showAmounts}
          />
        ))}
        {hiddenCount > 0 ? (
          <button
            aria-label={`Xem thêm ${hiddenCount} danh mục`}
            className={cn(CHIP_BASE, CHIP_IDLE, "text-indigo")}
            onClick={() => setSheetOpen(true)}
            type="button"
          >
            +{hiddenCount}
          </button>
        ) : null}
      </div>

      {members.length > 0 ? (
        <div aria-label="Lọc theo thành viên" className="flex gap-2 overflow-x-auto [scrollbar-width:none]" role="group">
          {members.map((member) => {
            const pressed = filter.memberIds.includes(member.id);
            return (
              <FilterControl
                className={cn(CHIP_BASE, pressed ? CHIP_ACTIVE : CHIP_IDLE)}
                href={hrefFor(withMember(member.id))}
                key={member.id}
                onActivate={() => toggleMember(member.id)}
                pressed={pressed}
              >
                <MemberAvatar name={member.name} />
                <span>{member.name}</span>
              </FilterControl>
            );
          })}
        </div>
      ) : null}

      {hasFilter ? (
        <div className="flex flex-wrap items-center gap-1.5">
          {filter.categoryIds.map((id) => {
            const name = chipOrder.find((entry) => entry.categoryId === id)?.name ?? "Danh mục";
            return (
              <ActiveChip
                href={hrefFor(withCategory(id))}
                key={`c-${id}`}
                label={name}
                onRemove={() => toggleCategory(id)}
                removeLabel={`Bỏ lọc danh mục ${name}`}
              />
            );
          })}
          {filter.memberIds.map((id) => {
            const name = members.find((member) => member.id === id)?.name ?? "Thành viên";
            return (
              <ActiveChip
                href={hrefFor(withMember(id))}
                key={`m-${id}`}
                label={name}
                onRemove={() => toggleMember(id)}
                removeLabel={`Bỏ lọc thành viên ${name}`}
              />
            );
          })}
          {filter.search ? (
            <ActiveChip
              href={hrefFor({ ...filter, search: "" })}
              // Nháy cong như mọi chỗ khác trong app (và như scopeLabel của panel ngay bên cạnh).
              label={`“${filter.search}”`}
              onRemove={() => onFilterChange({ ...filter, search: "" })}
              removeLabel={`Bỏ lọc từ khoá ${filter.search}`}
            />
          ) : null}
          <FilterControl
            className="ml-auto rounded-full px-2.5 py-1.5 text-xs font-extrabold text-indigo hover:bg-mist"
            href={hrefFor(EMPTY_TRANSACTION_FILTER)}
            onActivate={() => onFilterChange(EMPTY_TRANSACTION_FILTER)}
          >
            Xoá hết
          </FilterControl>
        </div>
      ) : null}

      <Sheet
        description={
          navigating
            ? "Chọn danh mục để lọc toàn bộ dữ liệu."
            : CHIP_SCOPE_NOTE
        }
        onClose={() => setSheetOpen(false)}
        eyebrow="Danh mục"
        open={sheetOpen}
        title="Tổng theo danh mục"
      >
        <div className="grid gap-2">
          {chipOrder.map((entry) => (
            <CategoryChip
              block
              entry={entry}
              href={hrefFor(withCategory(entry.categoryId))}
              key={entry.categoryId}
              onToggle={toggleCategory}
              pressed={filter.categoryIds.includes(entry.categoryId)}
              showAmount={showAmounts}
            />
          ))}
        </div>
      </Sheet>
    </div>
  );
}

/** Một chỗ duy nhất quyết định "nút đổi state" hay "<Link> điều hướng". Mọi điều khiển gây round-trip
 * server trong app đều bọc LinkPendingOverlay; thiếu nó thì trên mạng chậm nút trông như chết. */
function FilterControl({
  className,
  pressed,
  href,
  onActivate,
  children,
}: {
  className: string;
  pressed?: boolean;
  href: string | null;
  onActivate: () => void;
  children: ReactNode;
}) {
  if (href !== null) {
    // aria-pressed chỉ được định nghĩa cho role="button"; trên <a> screen reader có thể bỏ qua, và
    // lúc đó màu nền là dấu hiệu duy nhất cho biết filter nào đang bật. aria-current thì hợp lệ trên link.
    return (
      <Link aria-current={pressed ? "true" : undefined} className={cn("relative", className)} href={href}>
        {children}
        <LinkPendingOverlay />
      </Link>
    );
  }
  return (
    <button aria-pressed={pressed} className={className} onClick={onActivate} type="button">
      {children}
    </button>
  );
}

/** Search ở chế độ điều hướng: form GET thật (như bản trước đợt này), nên gõ bao nhiêu ký tự cũng
 * chỉ có đúng một lần điều hướng lúc submit. Các param khác được lấy lại từ href của filter hiện
 * tại để URL vẫn chỉ được dựng ở một nơi (`hrefFor` của orchestrator). */
function SearchForm({
  search,
  hrefWithoutSearch,
  inputRef,
  onCloseEmpty,
}: {
  search: string;
  hrefWithoutSearch: string;
  inputRef: React.RefObject<HTMLInputElement | null>;
  onCloseEmpty: () => void;
}) {
  // Lấy lại các param khác (view, category, member) từ chính href của filter hiện tại, để submit
  // không làm mất filter đang bật mà cũng không cần biết tên param nào.
  const params = new URLSearchParams(hrefWithoutSearch.split("?")[1] ?? "");

  return (
    <form action="/transactions" className="flex items-center gap-2 rounded-xl border border-forest/10 bg-paper px-3" method="get">
      {[...params].map(([key, value]) => (
        <input key={key} name={key} readOnly type="hidden" value={value} />
      ))}
      <Search aria-hidden="true" className="size-4 shrink-0 text-indigo" />
      <input
        aria-label="Tìm giao dịch"
        className="min-h-10 min-w-0 flex-1 bg-transparent text-sm font-semibold outline-none placeholder:text-ink/40"
        defaultValue={search}
        name="q"
        placeholder="Tìm theo tên, ghi chú, danh mục..."
        ref={inputRef}
        type="search"
      />
      <button aria-label="Tìm kiếm" className="grid size-8 shrink-0 place-items-center rounded-lg text-forest hover:bg-mist" type="submit">
        <Search aria-hidden="true" className="size-4" />
      </button>
      {search ? (
        <Link aria-label="Đóng tìm kiếm" className="relative grid size-8 shrink-0 place-items-center rounded-lg text-forest/60 hover:bg-mist" href={hrefWithoutSearch}>
          <X aria-hidden="true" className="size-4" />
          <LinkPendingOverlay />
        </Link>
      ) : (
        <button
          aria-label="Đóng tìm kiếm"
          className="grid size-8 shrink-0 place-items-center rounded-lg text-forest/60 hover:bg-mist"
          onClick={onCloseEmpty}
          type="button"
        >
          <X aria-hidden="true" className="size-4" />
        </button>
      )}
    </form>
  );
}

function ViewLink({ active, href, label }: { active: boolean; href: string; label: string }) {
  return (
    <Link
      aria-current={active ? "page" : undefined}
      className={cn("relative rounded-[0.65rem] px-3 py-1.5 transition", active ? "bg-forest text-paper" : "text-forest/70 hover:text-forest")}
      href={href}
    >
      {label}
      <LinkPendingOverlay />
    </Link>
  );
}

function CategoryChip({
  entry,
  pressed,
  block = false,
  showAmount,
  href,
  onToggle,
}: {
  entry: CategoryChipEntry;
  pressed: boolean;
  block?: boolean;
  showAmount: boolean;
  href: string | null;
  onToggle: (id: string) => void;
}) {
  const Icon = CATEGORY_ICONS[entry.icon] ?? CATEGORY_ICON_FALLBACK;
  return (
    <FilterControl
      className={cn(CHIP_BASE, pressed ? CHIP_ACTIVE : CHIP_IDLE, block && "w-full justify-between rounded-2xl py-2")}
      href={href}
      onActivate={() => onToggle(entry.categoryId)}
      pressed={pressed}
    >
      <span className="flex min-w-0 items-center gap-1.5">
        <span aria-hidden="true" className="grid size-5 shrink-0 place-items-center rounded-full" style={{ backgroundColor: `${entry.color}20`, color: entry.color }}>
          <Icon className="size-3" />
        </span>
        <span className="truncate">{entry.name}</span>
      </span>
      {showAmount ? (
        <span className="shrink-0 font-bold text-ink/52">{block ? formatMoney(entry.amount) : formatCompactMoney(entry.amount)}</span>
      ) : null}
    </FilterControl>
  );
}

function MemberAvatar({ name }: { name: string }) {
  return (
    <span aria-hidden="true" className="grid size-5 shrink-0 place-items-center rounded-full bg-forest text-[10px] font-extrabold text-paper">
      {name.trim().charAt(0).toLocaleUpperCase("vi-VN")}
    </span>
  );
}

function ActiveChip({
  label,
  removeLabel,
  href,
  onRemove,
}: {
  label: string;
  removeLabel: string;
  href: string | null;
  onRemove: () => void;
}) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-mint-soft py-1 pl-2.5 pr-1 text-xs font-extrabold text-forest">
      {label}
      {href !== null ? (
        <Link aria-label={removeLabel} className="relative grid size-5 place-items-center rounded-full hover:bg-forest/10" href={href}>
          <X aria-hidden="true" className="size-3" />
          <LinkPendingOverlay />
        </Link>
      ) : (
        <button aria-label={removeLabel} className="grid size-5 place-items-center rounded-full hover:bg-forest/10" onClick={onRemove} type="button">
          <X aria-hidden="true" className="size-3" />
        </button>
      )}
    </span>
  );
}
