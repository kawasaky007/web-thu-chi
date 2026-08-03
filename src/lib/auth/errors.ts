interface ErrorLike {
  code?: string | null;
  message?: string | null;
  status?: number;
  statusCode?: string | null;
}

export function friendlyAuthError(error: unknown) {
  const { code, message } = readError(error);
  const normalized = message.toLowerCase();

  if (normalized.includes("invalid login credentials")) {
    return "Email hoặc mật khẩu không đúng.";
  }
  if (normalized.includes("email not confirmed")) {
    return "Email chưa được xác nhận.";
  }
  if (
    normalized.includes("user already registered") ||
    normalized.includes("already been registered")
  ) {
    return "Email này đã được đăng ký.";
  }
  if (normalized.includes("password") && normalized.includes("least")) {
    return "Mật khẩu chưa đáp ứng yêu cầu bảo mật.";
  }
  if (normalized.includes("rate limit") || code === "over_request_rate_limit") {
    return "Bạn thao tác quá nhanh. Vui lòng thử lại sau ít phút.";
  }
  if (normalized.includes("fetch failed") || normalized.includes("network")) {
    return "Không thể kết nối máy chủ. Vui lòng kiểm tra mạng và thử lại.";
  }

  return "Không thể xác thực tài khoản. Vui lòng thử lại.";
}

export function friendlyMembershipError(error: unknown) {
  const { code, message } = readError(error);

  switch (message) {
    case "AUTH_REQUIRED":
      return "Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.";
    case "PROFILE_NOT_FOUND":
      return "Không thể tạo hồ sơ người dùng. Vui lòng đăng nhập lại.";
    case "HOUSEHOLD_ALREADY_SET":
      return "Tài khoản đã thuộc một household khác.";
    case "INVALID_HOUSEHOLD_NAME":
      return "Tên household cần từ 2 đến 60 ký tự.";
    case "INVALID_INVITE_CODE":
      return "Mã mời không tồn tại hoặc đã hết hạn.";
    case "INVITE_CODE_GENERATION_FAILED":
      return "Chưa thể tạo mã mời duy nhất. Vui lòng thử lại.";
  }

  if (code === "42501") {
    return "Bạn không có quyền thực hiện thao tác này.";
  }
  if (code === "23505") {
    return "Dữ liệu bị trùng. Vui lòng thử lại.";
  }

  return "Không thể cập nhật household. Vui lòng thử lại.";
}

function readError(error: unknown) {
  if (!error || typeof error !== "object") {
    return { code: "", message: "" };
  }

  const value = error as ErrorLike;
  return {
    code: value.code ?? value.statusCode ?? "",
    message: value.message ?? "",
  };
}
