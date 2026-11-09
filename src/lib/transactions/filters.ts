import type { TransactionView } from "@/lib/transactions/data";

export type TransactionFilter = {
  categoryIds: string[];
  memberIds: string[];
  search: string;
};

export const EMPTY_TRANSACTION_FILTER: TransactionFilter = { categoryIds: [], memberIds: [], search: "" };

// Giao dịch có categoryId rỗng (danh mục đã xoá) cần một id ổn định để chip/analytics/filter
// cùng nhắc tới; dùng chuỗi cố định thay vì null để không phải rẽ nhánh ở mọi nơi.
export const DELETED_CATEGORY_ID = "__deleted__";

// Bỏ dấu + hạ chữ thường để "AN UONG" khớp "Ăn uống". "đ" không tách được bằng NFD nên xử lý riêng.
function normalizeSearchText(value: string) {
  return value
    .toLocaleLowerCase("vi-VN")
    .normalize("NFD")
    // Dải dấu kết hợp phải viết dạng escape: ký tự thật ở đây không hiện gì trong editor/diff, nên
    // một lần format hay sửa vô ý là search mất khả năng bỏ dấu mà dòng code trông y nguyên.
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d");
}

// Chỉ đòi đúng những cột hàm này đọc, nên dòng tháng trước (bản chiếu hẹp) cũng lọc được bằng cùng
// một hàm; generic để kiểu trả về vẫn đúng bằng kiểu truyền vào.
export type FilterableTransaction = Pick<
  TransactionView,
  "categoryId" | "userId" | "title" | "note" | "categoryName" | "memberName"
>;

export function applyTransactionFilters<T extends FilterableTransaction>(rows: T[], filter: TransactionFilter): T[] {
  const categories = new Set(filter.categoryIds);
  const members = new Set(filter.memberIds);
  const search = normalizeSearchText(filter.search.trim());

  return rows.filter((row) => {
    // OR trong cùng một chiều (Set.has), AND giữa các chiều (return false sớm).
    if (categories.size > 0 && !categories.has(row.categoryId || DELETED_CATEGORY_ID)) return false;
    if (members.size > 0 && !members.has(row.userId)) return false;
    if (!search) return true;
    return [row.title, row.note, row.categoryName, row.memberName].some(
      (value) => value && normalizeSearchText(value).includes(search),
    );
  });
}

function parseIdList(value: string | null, known: Set<string>) {
  if (!value) return [];
  const ids = value.split(",").map((id) => id.trim()).filter((id) => id && known.has(id));
  return [...new Set(ids)];
}

// URL do người dùng sửa tay được, nên id lạ (danh mục/thành viên đã biến mất) bị bỏ thay vì
// làm filter khớp 0 dòng một cách khó hiểu. Param `member` giữ nguyên tên để link cũ vẫn chạy.
export function parseTransactionFilter(
  params: URLSearchParams,
  known: { categoryIds: Set<string>; memberIds: Set<string> },
): TransactionFilter {
  return {
    categoryIds: parseIdList(params.get("category"), known.categoryIds),
    memberIds: parseIdList(params.get("member"), known.memberIds),
    search: params.get("q")?.trim() ?? "",
  };
}

export function serializeTransactionFilter(filter: TransactionFilter): URLSearchParams {
  const params = new URLSearchParams();
  if (filter.search) params.set("q", filter.search);
  if (filter.categoryIds.length > 0) params.set("category", filter.categoryIds.join(","));
  if (filter.memberIds.length > 0) params.set("member", filter.memberIds.join(","));
  return params;
}

export function toggleFilterId(selected: string[], id: string) {
  return selected.includes(id) ? selected.filter((item) => item !== id) : [...selected, id];
}

export function isTransactionFilterEmpty(filter: TransactionFilter) {
  return filter.categoryIds.length === 0 && filter.memberIds.length === 0 && filter.search === "";
}
