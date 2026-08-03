"use client";

import { useActionState, useEffect, useState, type FormEvent } from "react";
import {
  Check,
  Pencil,
  Save,
  Trash2,
  TrendingDown,
  TrendingUp,
  type LucideIcon,
} from "lucide-react";
import { useRouter } from "next/navigation";

import {
  createCategoryAction,
  deleteCategoryAction,
  moveCategoryAction,
  updateCategoryAction,
} from "@/app/(app)/categories/actions";
import { AuthFeedback } from "@/components/auth/auth-feedback";
import { PageHeader } from "@/components/app/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { ConfirmAction } from "@/components/ui/confirm-dialog";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { EmptyState } from "@/components/ui/status-state";
import { Sheet } from "@/components/ui/sheet";
import { useToast } from "@/components/ui/toast";
import {
  CATEGORY_COLOR_OPTIONS,
  CATEGORY_ICON_OPTIONS,
  DEFAULT_CATEGORY_VALUES,
  categoryTypeLabel,
  categoryTypeLabelLowercase,
  type CategoryType,
} from "@/lib/categories/constants";
import { initialCategoryActionState } from "@/lib/categories/action-state";
import { CATEGORY_ICONS, CATEGORY_ICON_FALLBACK } from "@/lib/categories/icons";
import { normalizeCategoryName } from "@/lib/categories/validation";

export type CategoryView = {
  id: string;
  name: string;
  type: CategoryType;
  color: string;
  icon: string;
  sortOrder: number;
};

export function CategoriesManager({ categories }: { categories: CategoryView[] }) {
  const [selectedType, setSelectedType] = useState<CategoryType>("expense");
  const [editor, setEditor] = useState<{
    category?: CategoryView;
    initialType: CategoryType;
  } | null>(null);

  const visibleCategories = categories.filter((category) => category.type === selectedType);
  const typeCount = visibleCategories.length;

  return (
    <>
      <PageHeader
        action={
          <Button className="w-full sm:w-auto" onClick={() => setEditor({ initialType: selectedType })}>
            <span aria-hidden="true" className="text-lg leading-none">+</span> Thêm danh mục
          </Button>
        }
        eyebrow="Tổ chức dữ liệu"
        title="Danh mục"
        description="Giữ tên gọi, màu sắc và thứ tự rõ ràng để giao dịch, báo cáo và ngân sách luôn khớp nhau."
      />

      <div className="mb-5 grid grid-cols-2 gap-2 rounded-2xl border border-forest/10 bg-paper-raised/65 p-1.5 shadow-sm">
        <TypeTab
          count={categories.filter((category) => category.type === "expense").length}
          icon={TrendingDown}
          label="Chi tiêu"
          selected={selectedType === "expense"}
          type="expense"
          onSelect={setSelectedType}
        />
        <TypeTab
          count={categories.filter((category) => category.type === "income").length}
          icon={TrendingUp}
          label="Thu nhập"
          selected={selectedType === "income"}
          type="income"
          onSelect={setSelectedType}
        />
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-3">
          <div>
            <p className="text-[11px] font-extrabold uppercase tracking-[0.16em] text-indigo">
              Household hiện tại
            </p>
            <h2 className="mt-1 text-xl font-extrabold">Danh mục {categoryTypeLabelLowercase(selectedType)}</h2>
          </div>
          <span className="rounded-full bg-mist px-3 py-1.5 text-xs font-bold text-forest">
            {typeCount} danh mục
          </span>
        </CardHeader>
        <CardContent>
          {visibleCategories.length === 0 ? (
            <EmptyState
              action={
                <Button onClick={() => setEditor({ initialType: selectedType })} variant="secondary">
                  Thêm danh mục đầu tiên
                </Button>
              }
              description={`Tạo nhóm ${categoryTypeLabelLowercase(selectedType)} đầu tiên để chọn nhanh khi ghi giao dịch.`}
              title={`Chưa có danh mục ${categoryTypeLabelLowercase(selectedType)}`}
            />
          ) : (
            <div className="grid gap-2">
              {visibleCategories.map((category, index) => (
                <CategoryRow
                  category={category}
                  isFirst={index === 0}
                  isLast={index === visibleCategories.length - 1}
                  key={category.id}
                  onEdit={() => setEditor({ category, initialType: category.type })}
                />
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {editor ? (
        <CategoryForm
          category={editor.category}
          existingCategories={categories}
          initialType={editor.initialType}
          onClose={() => setEditor(null)}
        />
      ) : null}
    </>
  );
}

function TypeTab({
  count,
  icon: Icon,
  label,
  selected,
  type,
  onSelect,
}: {
  count: number;
  icon: LucideIcon;
  label: string;
  selected: boolean;
  type: CategoryType;
  onSelect: (type: CategoryType) => void;
}) {
  return (
    <button
      aria-pressed={selected}
      className={`flex min-h-12 items-center justify-center gap-2 rounded-xl px-3 text-sm font-extrabold transition ${
        selected
          ? type === "income"
            ? "bg-mint-soft text-income shadow-sm"
            : "bg-rose/35 text-expense shadow-sm"
          : "text-ink/48 hover:bg-paper-raised hover:text-ink"
      }`}
      onClick={() => onSelect(type)}
      type="button"
    >
      <Icon aria-hidden="true" className="size-4" />
      {label}
      <span className="rounded-full bg-white/55 px-2 py-0.5 text-xs">{count}</span>
    </button>
  );
}

function CategoryRow({
  category,
  isFirst,
  isLast,
  onEdit,
}: {
  category: CategoryView;
  isFirst: boolean;
  isLast: boolean;
  onEdit: () => void;
}) {
  const Icon = CATEGORY_ICONS[category.icon] ?? CATEGORY_ICON_FALLBACK;

  return (
    <div className="flex items-center gap-3 rounded-2xl border border-forest/8 bg-white/58 p-3 transition hover:border-forest/18 hover:bg-white">
      <span
        className="grid size-12 shrink-0 place-items-center rounded-2xl"
        style={{ backgroundColor: `${category.color}20`, color: category.color }}
      >
        <Icon aria-hidden="true" className="size-5" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-extrabold text-ink">{category.name}</span>
        <span className="mt-0.5 block text-xs font-semibold text-ink/44">
          {categoryTypeLabel(category.type)} · {CATEGORY_ICON_OPTIONS.find((option) => option.value === category.icon)?.label ?? "Khác"}
        </span>
      </span>
      <div className="flex shrink-0 items-center gap-1">
        <MoveCategoryButton
          categoryId={category.id}
          direction="up"
          disabled={isFirst}
          label={`Đưa ${category.name} lên trên`}
        />
        <MoveCategoryButton
          categoryId={category.id}
          direction="down"
          disabled={isLast}
          label={`Đưa ${category.name} xuống dưới`}
        />
        <Button aria-label={`Sửa ${category.name}`} onClick={onEdit} size="icon" variant="ghost">
          <Pencil aria-hidden="true" className="size-4" />
        </Button>
        <DeleteCategoryButton category={category} />
      </div>
    </div>
  );
}

function CategoryForm({
  category,
  existingCategories,
  initialType,
  onClose,
}: {
  category?: CategoryView;
  existingCategories: CategoryView[];
  initialType: CategoryType;
  onClose: () => void;
}) {
  const router = useRouter();
  const [type, setType] = useState<CategoryType>(category?.type ?? initialType);
  const [color, setColor] = useState(category?.color ?? DEFAULT_CATEGORY_VALUES[initialType].color);
  const [icon, setIcon] = useState(category?.icon ?? DEFAULT_CATEGORY_VALUES[initialType].icon);
  const [clientError, setClientError] = useState("");
  const action = category ? updateCategoryAction : createCategoryAction;
  const [state, formAction, pending] = useActionState(action, initialCategoryActionState);

  useEffect(() => {
    if (state.status !== "success") return;
    router.refresh();
    onClose();
  }, [onClose, router, state.status]);

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    const data = new FormData(event.currentTarget);
    const name = normalizeCategoryName(String(data.get("name") ?? ""));
    const duplicate = existingCategories.some(
      (item) =>
        item.id !== category?.id &&
        item.type === type &&
        normalizeCategoryName(item.name).toLocaleLowerCase("vi-VN") === name.toLocaleLowerCase("vi-VN"),
    );
    if (duplicate) {
      event.preventDefault();
      setClientError("Tên danh mục này đã tồn tại trong cùng loại thu/chi.");
      return;
    }
    setClientError("");
  };

  const displayedError = clientError || state.fieldErrors?.name || state.message;

  return (
    <Sheet
      description="Danh mục được chia sẻ trong household hiện tại."
      onClose={pending ? () => undefined : onClose}
      open
      title={category ? "Sửa danh mục" : "Thêm danh mục"}
    >
      <form action={formAction} className="grid gap-5" onSubmit={handleSubmit}>
        {category ? <input name="categoryId" type="hidden" value={category.id} readOnly /> : null}
        {displayedError ? <AuthFeedback message={displayedError} /> : null}
        <Input
          autoFocus
          defaultValue={category?.name}
          disabled={pending}
          label="Tên danh mục"
          maxLength={40}
          minLength={2}
          name="name"
          placeholder="Ví dụ: Ăn uống"
          required
        />
        <Select
          disabled={pending}
          label="Loại danh mục"
          name="type"
          onChange={(event) => {
            const nextType = event.target.value as CategoryType;
            setType(nextType);
            setColor(DEFAULT_CATEGORY_VALUES[nextType].color);
            setIcon(DEFAULT_CATEGORY_VALUES[nextType].icon);
            setClientError("");
          }}
          value={type}
        >
          <option value="expense">Chi tiêu</option>
          <option value="income">Thu nhập</option>
        </Select>
        <input name="color" type="hidden" value={color} readOnly />
        <fieldset>
          <legend className="mb-2 text-sm font-extrabold text-ink/76">Màu sắc</legend>
          <div className="flex flex-wrap gap-2">
            {CATEGORY_COLOR_OPTIONS.map((option) => (
              <button
                aria-label={`Chọn màu ${option}`}
                aria-pressed={color === option}
                className="grid size-11 place-items-center rounded-full border-2 border-transparent shadow-sm transition-transform hover:scale-105 aria-pressed:border-ink aria-pressed:ring-2 aria-pressed:ring-ink/15"
                disabled={pending}
                key={option}
                onClick={() => setColor(option)}
                style={{ backgroundColor: option }}
                type="button"
              >
                {color === option ? <Check aria-hidden="true" className="size-5 text-white" /> : null}
              </button>
            ))}
          </div>
        </fieldset>
        <input name="icon" type="hidden" value={icon} readOnly />
        <fieldset>
          <legend className="mb-2 text-sm font-extrabold text-ink/76">Biểu tượng</legend>
          <div className="grid grid-cols-4 gap-2 sm:grid-cols-6">
            {CATEGORY_ICON_OPTIONS.map((option) => {
              const Icon = CATEGORY_ICONS[option.value] ?? CATEGORY_ICON_FALLBACK;
              return (
                <button
                  aria-label={option.label}
                  aria-pressed={icon === option.value}
                  className="grid min-h-14 place-items-center gap-1 rounded-2xl border border-forest/10 bg-mist/45 px-1 py-2 text-forest transition hover:bg-mist aria-pressed:border-forest/40 aria-pressed:bg-mint-soft aria-pressed:text-income"
                  disabled={pending}
                  key={option.value}
                  onClick={() => setIcon(option.value)}
                  title={option.label}
                  type="button"
                >
                  <Icon aria-hidden="true" className="size-5" />
                  <span className="max-w-full truncate text-[10px] font-bold">{option.label}</span>
                </button>
              );
            })}
          </div>
        </fieldset>
        <Button disabled={pending} type="submit">
          {pending ? <Save aria-hidden="true" className="size-4 animate-pulse" /> : <Check aria-hidden="true" className="size-4" />}
          {category ? "Lưu thay đổi" : "Thêm danh mục"}
        </Button>
      </form>
    </Sheet>
  );
}

function DeleteCategoryButton({ category }: { category: CategoryView }) {
  const router = useRouter();
  const { notify } = useToast();
  const [state, formAction, pending] = useActionState(deleteCategoryAction, initialCategoryActionState);

  useEffect(() => {
    if (state.status === "success") {
      notify(state.message ?? "Đã xóa danh mục.");
      router.refresh();
    } else if (state.status === "error") {
      notify(state.message ?? "Không thể xóa danh mục.", "error");
    }
  }, [notify, router, state.message, state.status]);

  return (
    <ConfirmAction
      action={formAction}
      confirmLabel="Xóa danh mục"
      description={`Danh mục “${category.name}” sẽ bị xóa khỏi household hiện tại. Danh mục đang được sử dụng có thể không xóa được.`}
      pending={pending}
      title="Xóa danh mục này?"
      trigger={(openDialog) => (
        <Button aria-label={`Xóa ${category.name}`} disabled={pending} onClick={openDialog} size="icon" type="button" variant="ghost">
          <Trash2 aria-hidden="true" className="size-4 text-expense" />
        </Button>
      )}
    >
      <input name="categoryId" type="hidden" value={category.id} readOnly />
      {state.status === "error" ? <span className="sr-only">{state.message}</span> : null}
    </ConfirmAction>
  );
}

function MoveCategoryButton({
  categoryId,
  direction,
  disabled,
  label,
}: {
  categoryId: string;
  direction: "up" | "down";
  disabled: boolean;
  label: string;
}) {
  const router = useRouter();
  const { notify } = useToast();
  const [state, formAction, pending] = useActionState(moveCategoryAction, initialCategoryActionState);

  useEffect(() => {
    if (state.status === "success") {
      router.refresh();
    } else if (state.status === "error") {
      notify(state.message ?? "Không thể đổi thứ tự danh mục.", "error");
    }
  }, [notify, router, state.message, state.status]);

  return (
    <form action={formAction}>
      <input name="categoryId" type="hidden" value={categoryId} readOnly />
      <input name="direction" type="hidden" value={direction} readOnly />
      <Button aria-label={label} disabled={disabled || pending} size="icon" type="submit" variant="ghost">
        {direction === "up" ? <TrendingUp aria-hidden="true" className="size-4 rotate-[-45deg]" /> : <TrendingDown aria-hidden="true" className="size-4 rotate-[-45deg]" />}
      </Button>
    </form>
  );
}
