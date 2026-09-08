export function formatTransactionNotificationText(
  actorName: string,
  type: "income" | "expense",
  amount: number,
  categoryName: string,
): { title: string; body: string } {
  const amountLabel = new Intl.NumberFormat("vi-VN").format(Math.round(amount));
  const typeLabel = type === "income" ? "thu" : "chi";
  return {
    title: "Có giao dịch mới",
    body: `${actorName} đã thêm khoản ${typeLabel} ${amountLabel} đ · ${categoryName}`,
  };
}
