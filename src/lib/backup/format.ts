export const TRANSACTION_BACKUP_SCHEMA = "thu-chi-transactions";
export const TRANSACTION_BACKUP_VERSION = 1;
export const MAX_IMPORT_ROWS = 1000;
export const MAX_BACKUP_BYTES = 1_500_000;

export type BackupTransactionRow = {
  id: string;
  type: "income" | "expense";
  amount: number;
  transactionDate: string;
  categoryId: string | null;
  categoryName: string;
  memberId: string | null;
  memberEmail: string;
  memberName: string;
  note: string | null;
  createdAt: string | null;
};

export type ParsedBackupTransaction = BackupTransactionRow & { sourceRow: number };

export type TransactionBackup = {
  schema: typeof TRANSACTION_BACKUP_SCHEMA;
  version: typeof TRANSACTION_BACKUP_VERSION;
  exportedAt: string;
  householdName: string;
  rowCount: number;
  transactions: BackupTransactionRow[];
};

export type BackupParseResult =
  | {
      success: true;
      format: "csv" | "json";
      householdName: string | null;
      rows: ParsedBackupTransaction[];
    }
  | { success: false; errors: string[] };

const csvHeaders = [
  "id",
  "type",
  "amount",
  "transaction_date",
  "category_id",
  "category_name",
  "member_id",
  "member_email",
  "member_name",
  "note",
  "created_at",
] as const;

export function createTransactionBackup(
  householdName: string,
  transactions: BackupTransactionRow[],
): TransactionBackup {
  return {
    schema: TRANSACTION_BACKUP_SCHEMA,
    version: TRANSACTION_BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    householdName,
    rowCount: transactions.length,
    transactions,
  };
}

export function serializeTransactionsCsv(rows: BackupTransactionRow[]) {
  const lines = [csvHeaders.join(",")];
  for (const row of rows) {
    lines.push([
      csvCell(row.id),
      csvCell(row.type),
      csvCell(String(row.amount)),
      csvCell(row.transactionDate),
      csvCell(row.categoryId ?? ""),
      csvCell(row.categoryName, true),
      csvCell(row.memberId ?? ""),
      csvCell(row.memberEmail, true),
      csvCell(row.memberName, true),
      csvCell(row.note ?? "", true),
      csvCell(row.createdAt ?? ""),
    ].join(","));
  }
  return `\uFEFF${lines.join("\r\n")}`;
}

export function createImportPayload(rows: ParsedBackupTransaction[]) {
  return JSON.stringify({
    schema: TRANSACTION_BACKUP_SCHEMA,
    version: TRANSACTION_BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    householdName: "",
    rowCount: rows.length,
    transactions: rows.map(({ sourceRow, ...row }) => {
      void sourceRow;
      return row;
    }),
  });
}

export function parseTransactionBackup(text: string, fileName = "backup.json"): BackupParseResult {
  if (new TextEncoder().encode(text).byteLength > MAX_BACKUP_BYTES) {
    return { success: false, errors: ["File vượt quá giới hạn 1,5 MB."] };
  }

  const clean = text.replace(/^\uFEFF/, "").trim();
  if (!clean) return { success: false, errors: ["File backup đang trống."] };

  const looksJson = fileName.toLowerCase().endsWith(".json") || clean.startsWith("{") || clean.startsWith("[");
  return looksJson ? parseJsonBackup(clean) : parseCsvBackup(clean);
}

function parseJsonBackup(text: string): BackupParseResult {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    return { success: false, errors: ["JSON không hợp lệ."] };
  }

  const record = isRecord(value) ? value : null;
  const rawRows = Array.isArray(value) ? value : record?.transactions;
  if (!Array.isArray(rawRows)) {
    return { success: false, errors: ["JSON phải có mảng transactions."] };
  }
  if (record && record.schema !== undefined && record.schema !== TRANSACTION_BACKUP_SCHEMA) {
    return { success: false, errors: ["Đây không phải file backup giao dịch Thu Chi."] };
  }
  if (record && record.version !== undefined && record.version !== TRANSACTION_BACKUP_VERSION) {
    return { success: false, errors: ["Phiên bản file backup chưa được hỗ trợ."] };
  }

  return validateRows(
    rawRows,
    "json",
    typeof record?.householdName === "string" ? record.householdName : null,
    1,
  );
}

function parseCsvBackup(text: string): BackupParseResult {
  const parsed = parseCsv(text);
  if (!parsed.success) return parsed;
  if (parsed.rows.length < 2) return { success: false, errors: ["CSV chưa có giao dịch."] };

  const headers = parsed.rows[0].map((header) => header.trim().toLowerCase());
  const missing = ["id", "type", "amount", "transaction_date", "category_name"].filter(
    (header) => !headers.includes(header),
  );
  if (missing.length > 0) {
    return { success: false, errors: [`CSV thiếu cột bắt buộc: ${missing.join(", ")}.`] };
  }

  const rawRows = parsed.rows.slice(1).filter((row) => row.some((cell) => cell.trim())).map((row) => {
    const record: Record<string, string> = {};
    headers.forEach((header, index) => {
      record[header] = decodeSpreadsheetCell(row[index] ?? "");
    });
    return {
      id: record.id,
      type: record.type,
      amount: record.amount,
      transactionDate: record.transaction_date,
      categoryId: record.category_id || null,
      categoryName: record.category_name,
      memberId: record.member_id || null,
      memberEmail: record.member_email || "",
      memberName: record.member_name || "",
      note: record.note || null,
      createdAt: record.created_at || null,
    };
  });

  return validateRows(rawRows, "csv", null, 2);
}

function validateRows(
  rawRows: unknown[],
  format: "csv" | "json",
  householdName: string | null,
  firstSourceRow: number,
): BackupParseResult {
  if (rawRows.length === 0) return { success: false, errors: ["File backup chưa có giao dịch."] };
  if (rawRows.length > MAX_IMPORT_ROWS) {
    return { success: false, errors: [`Mỗi lần chỉ nhập tối đa ${MAX_IMPORT_ROWS} giao dịch.`] };
  }

  const rows: ParsedBackupTransaction[] = [];
  const errors: string[] = [];
  const ids = new Set<string>();

  rawRows.forEach((value, index) => {
    const sourceRow = firstSourceRow + index;
    const result = validateRow(value, sourceRow);
    if (!result.success) {
      if (errors.length < 12) errors.push(result.message);
      return;
    }
    if (ids.has(result.row.id)) {
      if (errors.length < 12) errors.push(`Dòng ${sourceRow}: ID giao dịch bị trùng trong file.`);
      return;
    }
    ids.add(result.row.id);
    rows.push(result.row);
  });

  if (errors.length > 0) return { success: false, errors };
  return { success: true, format, householdName, rows };
}

function validateRow(value: unknown, sourceRow: number) {
  if (!isRecord(value)) return invalid(`Dòng ${sourceRow}: dữ liệu không hợp lệ.`);

  const id = readString(value.id);
  const type = readString(value.type);
  const amount = typeof value.amount === "number" ? value.amount : Number(readString(value.amount));
  const transactionDate = readString(value.transactionDate ?? value.transaction_date).slice(0, 10);
  const categoryId = nullableString(value.categoryId ?? value.category_id);
  const categoryName = readString(value.categoryName ?? value.category_name).trim();
  const memberId = nullableString(value.memberId ?? value.member_id);
  const memberEmail = readString(value.memberEmail ?? value.member_email).trim().toLowerCase();
  const memberName = readString(value.memberName ?? value.member_name).trim();
  const note = nullableString(value.note)?.trim() || null;
  const createdAt = nullableString(value.createdAt ?? value.created_at);

  if (!isUuid(id)) return invalid(`Dòng ${sourceRow}: ID giao dịch không hợp lệ.`);
  if (type !== "income" && type !== "expense") return invalid(`Dòng ${sourceRow}: loại giao dịch phải là income hoặc expense.`);
  if (!Number.isFinite(amount) || amount <= 0 || amount > Number.MAX_SAFE_INTEGER) return invalid(`Dòng ${sourceRow}: số tiền không hợp lệ.`);
  if (!isDateInput(transactionDate)) return invalid(`Dòng ${sourceRow}: ngày giao dịch không hợp lệ.`);
  if (!categoryName || categoryName.length > 100) return invalid(`Dòng ${sourceRow}: tên danh mục không hợp lệ.`);
  if (!memberId && !isEmail(memberEmail)) return invalid(`Dòng ${sourceRow}: cần member_id hoặc member_email hợp lệ.`);
  if (categoryId && !isUuid(categoryId)) return invalid(`Dòng ${sourceRow}: category_id không hợp lệ.`);
  if (memberId && !isUuid(memberId)) return invalid(`Dòng ${sourceRow}: member_id không hợp lệ.`);
  if (note && note.length > 240) return invalid(`Dòng ${sourceRow}: ghi chú tối đa 240 ký tự.`);
  if (createdAt && Number.isNaN(Date.parse(createdAt))) return invalid(`Dòng ${sourceRow}: created_at không hợp lệ.`);

  return {
    success: true as const,
    row: {
      id,
      type,
      amount,
      transactionDate,
      categoryId,
      categoryName,
      memberId,
      memberEmail,
      memberName,
      note,
      createdAt,
      sourceRow,
    } satisfies ParsedBackupTransaction,
  };
}

function parseCsv(text: string): { success: true; rows: string[][] } | { success: false; errors: string[] } {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (quoted) {
      if (char === '"' && text[index + 1] === '"') {
        cell += '"';
        index += 1;
      } else if (char === '"') quoted = false;
      else cell += char;
      continue;
    }

    if (char === '"' && cell.length === 0) quoted = true;
    else if (char === ",") {
      row.push(cell);
      cell = "";
    } else if (char === "\n" || char === "\r") {
      if (char === "\r" && text[index + 1] === "\n") index += 1;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else cell += char;
  }

  if (quoted) return { success: false, errors: ["CSV có ô chưa đóng dấu ngoặc kép."] };
  if (cell.length > 0 || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }
  return { success: true, rows };
}

function csvCell(value: string, protectFormula = false) {
  const safe = protectFormula && /^[=+\-@]/.test(value) ? `'${value}` : value;
  return /[",\r\n]/.test(safe) ? `"${safe.replaceAll('"', '""')}"` : safe;
}

function decodeSpreadsheetCell(value: string) {
  return /^'[=+\-@]/.test(value) ? value.slice(1) : value;
}

function invalid(message: string) {
  return { success: false as const, message };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function readString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function nullableString(value: unknown) {
  const text = readString(value);
  return text || null;
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function isEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function isDateInput(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}
