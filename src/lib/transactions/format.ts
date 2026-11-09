export function formatMoney(value: number) {
  const formatted = new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 2 }).format(Math.abs(value));
  return `${formatted} đ`;
}

export function formatSignedMoney(value: number) {
  return `${value >= 0 ? "+" : "-"}${formatMoney(value)}`;
}

// Dấu phẩy thập phân kiểu Việt, bỏ ",0" thừa ("8tr" chứ không phải "8,0tr").
function oneDecimal(value: number) {
  return (Math.round(value * 10) / 10).toString().replace(".", ",");
}

// Dạng gọn cho chip: hàng chục chip phải vừa một màn hình hẹp nên không dùng số đầy đủ.
// Làm tròn rồi mới chọn đơn vị để 999.999.999 ra "1 tỷ" chứ không phải "1000tr".
export function formatCompactMoney(value: number) {
  const abs = Math.abs(value);
  const sign = value < 0 ? "-" : "";
  if (Math.round(abs / 1e5) >= 10000) return `${sign}${oneDecimal(abs / 1e9)} tỷ`;
  if (Math.round(abs / 1e3) >= 1000) return `${sign}${oneDecimal(abs / 1e6)}tr`;
  if (abs >= 1000) return `${sign}${Math.round(abs / 1e3)}k`;
  return `${sign}${Math.round(abs)}`;
}
