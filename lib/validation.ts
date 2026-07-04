export type ValidationResult = { ok: true } | { ok: false; error: string };

export const PAYMENT_MODES = ["cash", "card", "upi"] as const;
export type PaymentMode = (typeof PAYMENT_MODES)[number];

export function validateName(raw: unknown): ValidationResult {
  if (typeof raw !== "string" || raw.trim().length === 0) {
    return { ok: false, error: "Please enter your name." };
  }
  const name = raw.trim();
  if (name.length < 2) return { ok: false, error: "Name must be at least 2 characters." };
  if (name.length > 40) return { ok: false, error: "Name must be 40 characters or fewer." };
  if (!/^[A-Za-z ]+$/.test(name)) {
    return { ok: false, error: "Name can only contain letters and spaces." };
  }
  return { ok: true };
}

export function validatePhone(raw: unknown): ValidationResult {
  if (typeof raw !== "string" || raw.trim().length === 0) {
    return { ok: false, error: "Please enter your phone number." };
  }
  const phone = raw.trim();
  if (!/^\d{10}$/.test(phone)) {
    return { ok: false, error: "Phone number must be exactly 10 digits." };
  }
  if (!/^[6-9]/.test(phone)) {
    return { ok: false, error: "Phone number must start with 6, 7, 8 or 9." };
  }
  return { ok: true };
}

export function validateQuantity(raw: unknown): ValidationResult {
  const asString = typeof raw === "number" ? String(raw) : raw;
  if (typeof asString !== "string" || asString.trim() === "") {
    return { ok: false, error: "Please enter a quantity." };
  }
  const n = Number(asString.trim());
  if (!Number.isInteger(n)) {
    return { ok: false, error: "Quantity must be a whole number — no decimals or words." };
  }
  if (n < 1) return { ok: false, error: "Quantity must be at least 1." };
  if (n > 10) return { ok: false, error: "Maximum 10 pizzas per order." };
  return { ok: true };
}

export function validatePaymentMode(raw: unknown): ValidationResult {
  if (typeof raw !== "string" || !PAYMENT_MODES.includes(raw as PaymentMode)) {
    return { ok: false, error: "Payment mode must be Cash, Card or UPI." };
  }
  return { ok: true };
}

export function validateTableId(raw: unknown): ValidationResult {
  if (typeof raw !== "string") return { ok: false, error: "Missing table number." };
  const table = raw.trim();
  if (table.length === 0 || table.length > 10 || !/^[A-Za-z0-9-]+$/.test(table)) {
    return { ok: false, error: "Invalid table number." };
  }
  return { ok: true };
}
