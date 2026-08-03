import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/auth/session", () => ({ getCurrentMembership: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createServerSupabaseClient: vi.fn() }));

import {
  createCategoryAction,
  deleteCategoryAction,
  updateCategoryAction,
} from "./actions";
import { getCurrentMembership } from "@/lib/auth/session";
import { initialCategoryActionState } from "@/lib/categories/action-state";
import { createServerSupabaseClient } from "@/lib/supabase/server";

const getMembership = vi.mocked(getCurrentMembership);
const createClient = vi.mocked(createServerSupabaseClient);

describe("category actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getMembership.mockResolvedValue({
      userId: "user-1",
      email: "an@example.com",
      metadataFullName: "An",
      profile: { household_id: "household-1" },
      household: { id: "household-1" },
    } as never);
  });

  it("không đụng Supabase khi dữ liệu form không hợp lệ", async () => {
    const result = await createCategoryAction(
      initialCategoryActionState,
      makeFormData({ name: "A", type: "expense", color: "#C2410C", icon: "food" }),
    );

    expect(result).toEqual({
      status: "error",
      fieldErrors: { name: "Tên danh mục cần tối thiểu 2 ký tự." },
    });
    expect(getMembership).not.toHaveBeenCalled();
  });

  it("tạo danh mục trong household hiện tại với thứ tự kế tiếp", async () => {
    const orderQuery = createChain({
      maybeSingle: { data: { sort_order: 4 }, error: null },
    });
    const insertQuery = { insert: vi.fn().mockResolvedValue({ error: null }) };
    const client = { from: vi.fn().mockReturnValueOnce(orderQuery).mockReturnValueOnce(insertQuery) };
    createClient.mockResolvedValue(client as never);

    const result = await createCategoryAction(
      initialCategoryActionState,
      makeFormData({ name: "  Ăn   uống ", type: "expense", color: "#c2410c", icon: "food" }),
    );

    expect(result.status).toBe("success");
    expect(insertQuery.insert).toHaveBeenCalledWith({
      household_id: "household-1",
      created_by: "user-1",
      name: "Ăn uống",
      type: "expense",
      color: "#C2410C",
      icon: "food",
      sort_order: 5,
    });
  });

  it("đổi lỗi unique thành thông báo trùng tên", async () => {
    const orderQuery = createChain({ maybeSingle: { data: null, error: null } });
    const insertQuery = {
      insert: vi.fn().mockResolvedValue({ error: { code: "23505", message: "duplicate" } }),
    };
    const client = { from: vi.fn().mockReturnValueOnce(orderQuery).mockReturnValueOnce(insertQuery) };
    createClient.mockResolvedValue(client as never);

    const result = await createCategoryAction(
      initialCategoryActionState,
      makeFormData({ name: "Ăn uống", type: "expense", color: "#C2410C", icon: "food" }),
    );

    expect(result).toEqual({
      status: "error",
      fieldErrors: { name: "Tên danh mục này đã tồn tại trong cùng loại thu/chi." },
    });
  });

  it("update và delete luôn khóa theo household hiện tại", async () => {
    const updateQuery = createChain({ maybeSingle: { data: { id: "cat-1" }, error: null } });
    const deleteQuery = createChain({ maybeSingle: { data: { id: "cat-1" }, error: null } });
    const client = { from: vi.fn().mockReturnValueOnce(updateQuery).mockReturnValueOnce(deleteQuery) };
    createClient.mockResolvedValue(client as never);

    const updateResult = await updateCategoryAction(
      initialCategoryActionState,
      makeFormData({
        categoryId: "cat-1",
        name: "Nhà cửa",
        type: "expense",
        color: "#2563EB",
        icon: "home",
      }),
    );
    const deleteResult = await deleteCategoryAction(
      initialCategoryActionState,
      makeFormData({ categoryId: "cat-1" }),
    );

    expect(updateResult.status).toBe("success");
    expect(deleteResult.status).toBe("success");
    expect(updateQuery.eq).toHaveBeenCalledWith("household_id", "household-1");
    expect(deleteQuery.eq).toHaveBeenCalledWith("household_id", "household-1");
  });
});

function createChain({ maybeSingle }: { maybeSingle: { data: unknown; error: unknown } }) {
  const chain = {
    eq: vi.fn(),
    order: vi.fn(),
    select: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    limit: vi.fn(),
    maybeSingle: vi.fn().mockResolvedValue(maybeSingle),
  };

  chain.eq.mockReturnValue(chain);
  chain.order.mockReturnValue(chain);
  chain.select.mockReturnValue(chain);
  chain.update.mockReturnValue(chain);
  chain.delete.mockReturnValue(chain);
  chain.limit.mockReturnValue(chain);
  return chain;
}

function makeFormData(values: Record<string, string>) {
  const formData = new FormData();
  Object.entries(values).forEach(([key, value]) => formData.set(key, value));
  return formData;
}
