"use client";

import type { ChangeEvent } from "react";

import { Input } from "@/components/ui/input";

type CurrencyInputProps = {
  value: number;
  onValueChange: (value: number) => void;
  label?: string;
  hint?: string;
  error?: string;
  name?: string;
};

const formatter = new Intl.NumberFormat("vi-VN");

export function CurrencyInput({
  value,
  onValueChange,
  label = "Số tiền",
  hint,
  error,
  name,
}: CurrencyInputProps) {
  const handleChange = (event: ChangeEvent<HTMLInputElement>) => {
    const digits = event.target.value.replace(/\D/g, "");
    onValueChange(digits ? Number(digits) : 0);
  };

  return (
    <Input
      autoComplete="off"
      error={error}
      hint={hint}
      inputMode="numeric"
      label={label}
      name={name}
      onChange={handleChange}
      placeholder="0"
      value={value ? `${formatter.format(value)} đ` : ""}
    />
  );
}
