type FieldErrors<T extends string> = Partial<Record<T, string>>;

type ValidationResult<T, F extends string> =
  | { success: true; data: T }
  | { success: false; fieldErrors: FieldErrors<F> };

interface LoginInput {
  email: string;
  password: string;
}

interface RegisterInput extends LoginInput {
  fullName: string;
}

export function validateLoginInput(input: LoginInput): ValidationResult<LoginInput, keyof LoginInput> {
  const email = normalizeEmail(input.email);
  const password = input.password;
  const fieldErrors: FieldErrors<keyof LoginInput> = {};

  if (!isValidEmail(email)) {
    fieldErrors.email = email ? "Email không hợp lệ." : "Vui lòng nhập email.";
  }
  if (!password) {
    fieldErrors.password = "Vui lòng nhập mật khẩu.";
  }

  return Object.keys(fieldErrors).length > 0
    ? { success: false, fieldErrors }
    : { success: true, data: { email, password } };
}

export function validateRegisterInput(
  input: RegisterInput,
): ValidationResult<RegisterInput, keyof RegisterInput> {
  const fullName = normalizeWhitespace(input.fullName);
  const loginResult = validateLoginInput(input);
  const fieldErrors: FieldErrors<keyof RegisterInput> = loginResult.success
    ? {}
    : { ...loginResult.fieldErrors };

  if (fullName.length < 2) {
    fieldErrors.fullName = "Tên hiển thị cần tối thiểu 2 ký tự.";
  } else if (fullName.length > 80) {
    fieldErrors.fullName = "Tên hiển thị tối đa 80 ký tự.";
  }

  if (input.password.length > 0 && input.password.length < 8) {
    fieldErrors.password = "Mật khẩu cần tối thiểu 8 ký tự.";
  }

  return Object.keys(fieldErrors).length > 0
    ? { success: false, fieldErrors }
    : {
        success: true,
        data: {
          fullName,
          email: normalizeEmail(input.email),
          password: input.password,
        },
      };
}

export function validateHouseholdName(
  value: string,
): ValidationResult<{ householdName: string }, "householdName"> {
  const householdName = normalizeWhitespace(value);

  if (householdName.length < 2) {
    return {
      success: false,
      fieldErrors: { householdName: "Tên household cần tối thiểu 2 ký tự." },
    };
  }
  if (householdName.length > 60) {
    return {
      success: false,
      fieldErrors: { householdName: "Tên household tối đa 60 ký tự." },
    };
  }

  return { success: true, data: { householdName } };
}

export function validateInviteCode(
  value: string,
): ValidationResult<{ inviteCode: string }, "inviteCode"> {
  const inviteCode = normalizeInviteCode(value);

  if (!/^[A-Z0-9]{6,8}$/.test(inviteCode)) {
    return {
      success: false,
      fieldErrors: { inviteCode: "Mã mời cần từ 6 đến 8 chữ hoặc số." },
    };
  }

  return { success: true, data: { inviteCode } };
}

export function readFormString(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value : "";
}

export function normalizeInviteCode(value: string) {
  return value.trim().replace(/[\s-]+/g, "").toUpperCase();
}

function normalizeEmail(value: string) {
  return value.trim().toLowerCase();
}

function normalizeWhitespace(value: string) {
  return value.trim().replace(/\s+/g, " ");
}

function isValidEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}
