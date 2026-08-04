import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const outputPath = resolve(scriptDirectory, "../src/lib/assistant/data/vi-agent-training.jsonl");

const categoryProfiles = [
  { type: "expense", icon: "coffee", terms: ["cà phê", "cafe", "trà sữa"] },
  { type: "expense", icon: "grocery", terms: ["đi chợ", "siêu thị", "thực phẩm"] },
  { type: "expense", icon: "food", terms: ["ăn trưa", "cơm", "phở"] },
  { type: "expense", icon: "transport", terms: ["xăng", "Grab", "gửi xe"] },
  { type: "expense", icon: "home", terms: ["tiền nhà", "thuê nhà", "nội thất"] },
  { type: "expense", icon: "shopping", terms: ["mua sắm", "quần áo", "Shopee"] },
  { type: "expense", icon: "health", terms: ["thuốc", "khám bệnh", "sức khỏe"] },
  { type: "expense", icon: "education", terms: ["học phí", "khóa học", "sách"] },
  { type: "expense", icon: "entertainment", terms: ["xem phim", "game", "karaoke"] },
  { type: "expense", icon: "saving", terms: ["tiết kiệm", "bỏ heo"] },
  { type: "expense", icon: "bill", terms: ["hóa đơn", "tiền điện", "tiền nước"] },
  { type: "expense", icon: "internet", terms: ["internet", "wifi", "cước mạng"] },
  { type: "expense", icon: "travel", terms: ["du lịch", "khách sạn", "máy bay"] },
  { type: "expense", icon: "pet", terms: ["thú cưng", "con chó", "mèo"] },
  { type: "expense", icon: "gift", terms: ["quà tặng", "mua quà"] },
  { type: "expense", icon: "sport", terms: ["gym", "thể thao", "bóng đá"] },
  { type: "expense", icon: "insurance", terms: ["bảo hiểm"] },
  { type: "expense", icon: "investment", terms: ["đầu tư", "chứng khoán", "cổ phiếu"] },
  { type: "income", icon: "salary", terms: ["lương", "tiền lương"] },
  { type: "income", icon: "bonus", terms: ["tiền thưởng", "bonus"] },
  { type: "income", icon: "investment", terms: ["lợi nhuận đầu tư", "lãi chứng khoán"] },
];

const expenseTemplates = [
  "Tôi mới mua {term} hết {amount} {date}",
  "Ghi giúp mình khoản {term} {amount} {date}",
  "Mình vừa trả tiền {term} {amount} {date}",
  "Chi cho {term} {amount} {date}",
  "Khoản {term} tốn {amount} {date}",
];

const incomeTemplates = [
  "Tôi vừa nhận được {term} {amount} {date}",
  "Ghi khoản thu nhập {term} {amount} {date}",
  "Được chuyển {amount} tiền {term} {date}",
  "Khoản {term} thu về {amount} {date}",
  "Hôm nay nhận {term} {amount} {date}",
];

const amountVariants = [
  { text: "18k", value: 18_000 },
  { text: "25 nghìn", value: 25_000 },
  { text: "42 ngàn", value: 42_000 },
  { text: "1,2 triệu", value: 1_200_000 },
  { text: "2tr", value: 2_000_000 },
  { text: "1tr2", value: 1_200_000 },
  { text: "125.000", value: 125_000 },
  { text: "45000", value: 45_000 },
  { text: "750k", value: 750_000 },
  { text: "3 triệu", value: 3_000_000 },
];

const dateVariants = [
  { text: "", value: "2026-08-04" },
  { text: "hôm nay", value: "2026-08-04" },
  { text: "hôm qua", value: "2026-08-03" },
  { text: "ngày 02/08", value: "2026-08-02" },
  { text: "ngày 01-08-2026", value: "2026-08-01" },
];

const cases = [];
const profileCounts = new Map();

for (let index = 0; index < 700; index += 1) {
  const profileIndex = index % categoryProfiles.length;
  const profile = categoryProfiles[profileIndex];
  const profileCaseIndex = profileCounts.get(profile.icon + profile.type) ?? 0;
  profileCounts.set(profile.icon + profile.type, profileCaseIndex + 1);
  const amount = amountVariants[profileCaseIndex % amountVariants.length];
  const date = dateVariants[Math.floor(profileCaseIndex / amountVariants.length) % dateVariants.length];
  const term = profile.terms[(profileCaseIndex + profileIndex) % profile.terms.length];
  const templates = profile.type === "income" ? incomeTemplates : expenseTemplates;
  const template = templates[(profileIndex + Math.floor(profileCaseIndex / 5)) % templates.length];
  const input = cleanSentence(
    template
      .replace("{term}", term)
      .replace("{amount}", amount.text)
      .replace("{date}", date.text),
  );

  cases.push({
    id: `transaction-${String(index + 1).padStart(4, "0")}`,
    input,
    expected: {
      kind: "create_transaction",
      type: profile.type,
      amount: amount.value,
      categoryIcon: profile.icon,
      transactionDate: date.value,
    },
    tags: ["transaction", profile.type, profile.icon],
  });
}

const summaryQuestions = [
  "Tháng này tôi chi bao nhiêu?",
  "Tổng chi tháng này là bao nhiêu?",
  "Tháng này thu bao nhiêu?",
  "Tổng thu tháng hiện tại là bao nhiêu?",
  "Số dư tháng này còn bao nhiêu?",
  "Tháng này còn lại bao nhiêu tiền?",
  "Cho tôi xem tổng quan tháng này",
  "Tổng quan thu chi tháng này thế nào?",
  "Tháng này household đã chi bao nhiêu?",
  "Tháng hiện tại thu nhập bao nhiêu?",
  "Tổng chi của tháng hiện tại?",
  "Tổng thu của tháng này?",
  "Số dư của tháng hiện tại là bao nhiêu?",
  "Cho biết tháng này chi hết bao nhiêu",
  "Tôi muốn xem tổng quan tháng hiện tại",
  "Tháng này còn lại bao nhiêu sau thu chi?",
  "Bao nhiêu tiền đã chi trong tháng này?",
  "Bao nhiêu tiền đã thu trong tháng này?",
  "Tình hình tổng quan tháng này ra sao?",
  "Số dư thu chi tháng này giúp tôi",
];
const politeSuffixes = ["", " nhé", " giúp mình", " được không", " cho gia đình"];

for (let index = 0; index < 100; index += 1) {
  cases.push({
    id: `summary-${String(index + 1).padStart(3, "0")}`,
    input: cleanSentence(`${summaryQuestions[index % summaryQuestions.length]}${politeSuffixes[Math.floor(index / summaryQuestions.length)]}`),
    expected: { kind: "monthly_summary" },
    tags: ["query", "monthly_summary"],
  });
}

const navigationProfiles = [
  { href: "/", label: "Tổng quan", terms: ["tổng quan", "dashboard", "trang chủ"] },
  { href: "/transactions", label: "Giao dịch", terms: ["giao dịch", "lịch sử thu chi"] },
  { href: "/categories", label: "Danh mục", terms: ["danh mục"] },
  { href: "/budgets", label: "Ngân sách", terms: ["ngân sách"] },
  { href: "/goals", label: "Mục tiêu", terms: ["mục tiêu", "quỹ tiết kiệm"] },
  { href: "/recurring", label: "Giao dịch định kỳ", terms: ["định kỳ"] },
  { href: "/backup", label: "Sao lưu", terms: ["sao lưu", "backup", "xuất dữ liệu"] },
  { href: "/profile", label: "Cá nhân", terms: ["cá nhân", "hồ sơ", "tài khoản"] },
];
const navigationVerbs = ["Mở", "Xem", "Đi đến", "Chuyển đến", "Vào"];
const navigationSuffixes = ["", " giúp mình", " nhé", " ngay", " cho tôi", " được không", " bây giờ", " nhanh nhé", " của app", " trên ứng dụng", " để kiểm tra", " cho household", " giúp tôi với"];

for (let index = 0; index < 100; index += 1) {
  const profile = navigationProfiles[index % navigationProfiles.length];
  const variant = Math.floor(index / navigationProfiles.length);
  const term = profile.terms[variant % profile.terms.length];
  const verb = navigationVerbs[variant % navigationVerbs.length];
  cases.push({
    id: `navigation-${String(index + 1).padStart(3, "0")}`,
    input: cleanSentence(`${verb} ${term}${navigationSuffixes[variant]}`),
    expected: { kind: "navigate", href: profile.href, label: profile.label },
    tags: ["navigation", profile.href],
  });
}

const missingAmountPhrases = [
  "Mới mua cà phê",
  "Vừa đi chợ",
  "Ghi khoản ăn trưa",
  "Tôi vừa đổ xăng",
  "Đã trả tiền nhà",
  "Mua sắm quần áo",
  "Mua thuốc",
  "Đóng học phí",
  "Vừa xem phim",
  "Bỏ heo tiết kiệm",
  "Trả hóa đơn tiền điện",
  "Đóng cước internet",
  "Đặt khách sạn du lịch",
  "Mua đồ cho thú cưng",
  "Mua quà tặng",
  "Đóng tiền gym",
  "Mua bảo hiểm",
  "Đầu tư chứng khoán",
  "Nhận lương",
  "Được thưởng",
];

for (let index = 0; index < 40; index += 1) {
  const base = missingAmountPhrases[index % missingAmountPhrases.length];
  const suffix = index < missingAmountPhrases.length ? "" : " hôm nay";
  cases.push({
    id: `clarification-missing-amount-${String(index + 1).padStart(3, "0")}`,
    input: cleanSentence(`${base}${suffix}`),
    expected: { kind: "clarification" },
    tags: ["clarification", "missing_amount"],
  });
}

for (let index = 0; index < 35; index += 1) {
  const amount = amountVariants[index % amountVariants.length];
  cases.push({
    id: `clarification-unknown-category-${String(index + 1).padStart(3, "0")}`,
    input: `Tôi chi ${amount.text} cho khoản chưa phân loại mã ${index + 1}`,
    expected: { kind: "clarification" },
    tags: ["clarification", "unknown_category"],
  });
}

const helpPhrases = [
  "Xin chào trợ lý",
  "Bạn làm được gì?",
  "Hướng dẫn tôi sử dụng app",
  "Cho tôi vài ví dụ câu lệnh",
  "Agent có thể giúp gì?",
  "Tôi cần trợ giúp",
  "Nói chuyện với tôi",
  "Chào buổi sáng",
  "Chào buổi tối",
  "Cảm ơn bạn",
  "Tôi chưa biết nói gì",
  "Giúp tôi bắt đầu",
  "Có những lệnh nào?",
  "Hướng dẫn nhập bằng giọng nói",
  "App này hoạt động thế nào?",
  "Cho xem gợi ý",
  "Tôi muốn quản lý tiền tốt hơn",
  "Hãy giới thiệu tính năng",
  "Trợ lý ơi",
  "Bạn có hiểu tiếng Việt không?",
  "Tôi cần một gợi ý",
  "Bắt đầu nhé",
  "Có thể nói tự nhiên không?",
  "Chỉ tôi cách dùng",
  "Tôi muốn thử agent",
];

for (let index = 0; index < helpPhrases.length; index += 1) {
  cases.push({
    id: `help-${String(index + 1).padStart(3, "0")}`,
    input: helpPhrases[index],
    expected: { kind: "help" },
    tags: ["help"],
  });
}

const todayExpenseTimePhrases = [
  "Hôm nay",
  "Ngày hôm nay",
  "Trong ngày hôm nay",
  "Sáng nay",
  "Từ sáng đến giờ",
  "Từ đầu ngày đến giờ",
  "Trong ngày",
  "Bữa giờ",
  "Đến lúc này hôm nay",
  "Từ lúc sáng đến giờ",
];
const todayExpenseQuestions = [
  "tôi đã chi những gì?",
  "mình chi những gì?",
  "tôi đã tiêu gì?",
  "mình tiêu những gì?",
  "có những khoản chi nào?",
  "hãy liệt kê chi tiêu giúp tôi",
  "tôi đã mua gì?",
  "mình mua những gì?",
  "tiền của tôi đi đâu?",
  "có khoản chi nào được ghi nhận?",
];

for (let timeIndex = 0; timeIndex < todayExpenseTimePhrases.length; timeIndex += 1) {
  for (let questionIndex = 0; questionIndex < todayExpenseQuestions.length; questionIndex += 1) {
    const caseIndex = timeIndex * todayExpenseQuestions.length + questionIndex + 1;
    cases.push({
      id: `today-expenses-${String(caseIndex).padStart(3, "0")}`,
      input: cleanSentence(`${todayExpenseTimePhrases[timeIndex]} ${todayExpenseQuestions[questionIndex]}`),
      expected: { kind: "today_expenses" },
      tags: ["query", "today_expenses", "augmented_from_seed"],
    });
  }
}

if (cases.length !== 1100) throw new Error(`Expected 1100 cases, received ${cases.length}.`);
if (new Set(cases.map((item) => item.id)).size !== cases.length) throw new Error("Training case IDs must be unique.");
if (new Set(cases.map((item) => item.input.toLocaleLowerCase("vi-VN"))).size !== cases.length) {
  throw new Error("Training inputs must be unique.");
}

await mkdir(dirname(outputPath), { recursive: true });
await writeFile(outputPath, `${cases.map((item) => JSON.stringify(item)).join("\n")}\n`, "utf8");
console.log(`Generated ${cases.length} assistant training cases at ${outputPath}`);

function cleanSentence(value) {
  return value.replace(/\s+/g, " ").replace(/\s+([?.!,])/g, "$1").trim();
}
