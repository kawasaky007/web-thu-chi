export type AmountCalculationResult = {
  expression: string;
  value: number | null;
  errorMessage: string | null;
  isValid: boolean;
};

/** Formats editable amount tokens while preserving calculator operators. */
export function formatAmountExpressionInput(input: string) {
  const safeInput = input.replace(/[^0-9.,+\-*/()%\s×÷]/g, "");
  return safeInput.replace(/\d[\d.,]*/g, formatAmountToken);
}

export function formatAmountValue(value: number) {
  return new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 2 }).format(value);
}

export function sanitizeAmountExpression(input: string) {
  const normalizedOperators = input.replaceAll("×", "*").replaceAll("÷", "/");

  return normalizeNumberSeparators(normalizedOperators)
    .replace(/[^0-9+\-*/().%\s]/g, "")
    .replace(/\s+/g, "");
}

export function evaluateAmountExpression(input: string): AmountCalculationResult {
  const expression = sanitizeAmountExpression(input);
  if (!expression) return invalidAmount(expression, "Vui lòng nhập số tiền.");

  try {
    const value = new AmountExpressionParser(expression).parse();
    if (!Number.isFinite(value)) return invalidAmount(expression, "Kết quả không hợp lệ.");

    return {
      expression,
      value: normalizePrecision(value),
      errorMessage: null,
      isValid: true,
    };
  } catch (error) {
    return invalidAmount(
      expression,
      error instanceof AmountExpressionError ? error.message : "Biểu thức không hợp lệ.",
    );
  }
}

function invalidAmount(expression: string, errorMessage: string): AmountCalculationResult {
  return { expression, value: null, errorMessage, isValid: false };
}

function formatAmountToken(token: string) {
  const trailingSeparator = /[.,]$/.test(token);
  const lastDot = token.lastIndexOf(".");
  const lastComma = token.lastIndexOf(",");
  const separatorIndex = Math.max(lastDot, lastComma);
  const separator = separatorIndex >= 0 ? token[separatorIndex] : null;
  const fraction = separator ? token.slice(separatorIndex + 1) : "";

  if (separator && !trailingSeparator && fraction.length > 0 && fraction.length < 3) {
    const integer = token.slice(0, separatorIndex).replace(/[.,]/g, "");
    return `${groupInteger(integer)}${separator}${fraction}`;
  }

  const digits = token.replace(/[.,]/g, "");
  return `${groupInteger(digits)}${trailingSeparator ? separator ?? "" : ""}`;
}

function groupInteger(value: string) {
  if (!value) return value;
  return value.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
}

function normalizeNumberSeparators(input: string) {
  return input.replace(/\d[\d,.]*/g, (token) => {
    if (!token.includes(",")) {
      if (!token.includes(".")) return token;
      const parts = token.split(".");
      const looksLikeThousands =
        parts.length > 1 &&
        parts[0].length > 0 &&
        parts[0].length <= 3 &&
        parts.slice(1).every((part) => part.length === 3);
      return looksLikeThousands ? parts.join("") : token;
    }

    if (token.includes(".")) return token.replaceAll(",", "");
    const parts = token.split(",");
    const looksLikeThousands =
      parts.length > 1 &&
      parts[0].length > 0 &&
      parts[0].length <= 3 &&
      parts.slice(1).every((part) => part.length === 3);
    return looksLikeThousands ? parts.join("") : token.replace(",", ".").replaceAll(",", "");
  });
}

class AmountExpressionParser {
  private index = 0;

  constructor(private readonly source: string) {}

  parse() {
    const value = this.parseExpression();
    if (!this.isAtEnd) throw new AmountExpressionError("Biểu thức không hợp lệ.");
    return value.value;
  }

  private parseExpression(): ParsedAmount {
    const firstTerm = this.parseTerm();
    let value = firstTerm.value;
    let isPercentage = firstTerm.isPercentage;

    while (!this.isAtEnd) {
      if (this.match("+")) {
        const term = this.parseTerm();
        value += term.isPercentage ? value * term.value : term.value;
        isPercentage = false;
      } else if (this.match("-")) {
        const term = this.parseTerm();
        value -= term.isPercentage ? value * term.value : term.value;
        isPercentage = false;
      } else {
        break;
      }
    }

    return { value, isPercentage };
  }

  private parseTerm(): ParsedAmount {
    const firstFactor = this.parseFactor();
    let value = firstFactor.value;
    let isPercentage = firstFactor.isPercentage;

    while (!this.isAtEnd) {
      if (this.match("*")) {
        value *= this.parseFactor().value;
        isPercentage = false;
      } else if (this.match("/")) {
        const divisor = this.parseFactor().value;
        if (Math.abs(divisor) < 0.000000000001) {
          throw new AmountExpressionError("Không thể chia cho 0.");
        }
        value /= divisor;
        isPercentage = false;
      } else {
        break;
      }
    }

    return { value, isPercentage };
  }

  private parseFactor(): ParsedAmount {
    if (this.match("+")) return this.parseFactor();
    if (this.match("-")) {
      const factor = this.parseFactor();
      return { value: -factor.value, isPercentage: factor.isPercentage };
    }

    return this.parsePercentSuffix(this.parsePrimary());
  }

  private parsePrimary(): ParsedAmount {
    if (this.match("(")) {
      const value = this.parseExpression();
      if (!this.match(")")) throw new AmountExpressionError("Thiếu dấu ngoặc đóng.");
      return value;
    }
    return this.parseNumber();
  }

  private parsePercentSuffix(value: ParsedAmount): ParsedAmount {
    let resolvedValue = value.value;
    let isPercentage = value.isPercentage;
    while (this.match("%")) {
      resolvedValue /= 100;
      isPercentage = true;
    }
    return { value: resolvedValue, isPercentage };
  }

  private parseNumber(): ParsedAmount {
    const start = this.index;
    let dotCount = 0;
    let digitCount = 0;

    while (!this.isAtEnd) {
      const char = this.source[this.index];
      if (/[0-9]/.test(char)) {
        digitCount++;
        this.index++;
      } else if (char === ".") {
        dotCount++;
        if (dotCount > 1) throw new AmountExpressionError("Số tiền không hợp lệ.");
        this.index++;
      } else {
        break;
      }
    }

    if (digitCount === 0) throw new AmountExpressionError("Biểu thức không hợp lệ.");
    const value = Number(this.source.slice(start, this.index));
    if (!Number.isFinite(value)) throw new AmountExpressionError("Số tiền không hợp lệ.");
    return { value, isPercentage: false };
  }

  private match(token: string) {
    if (this.isAtEnd || this.source[this.index] !== token) return false;
    this.index++;
    return true;
  }

  private get isAtEnd() {
    return this.index >= this.source.length;
  }
}

type ParsedAmount = { value: number; isPercentage: boolean };

class AmountExpressionError extends Error {}

function normalizePrecision(value: number) {
  const rounded = Math.round(value);
  if (Math.abs(value - rounded) < 0.000001) return rounded;
  return Number(value.toFixed(2));
}
