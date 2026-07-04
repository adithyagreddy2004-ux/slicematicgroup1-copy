// Business rules — Rajan's current policy. Change these constants to change policy.
export const DISCOUNT_THRESHOLD = 5; // pizzas
export const DISCOUNT_RATE = 0.1; // 10%
export const GST_RATE = 0.18; // 18%

export function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export function formatINR(n: number): string {
  return `₹${n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export interface BillInput {
  basePrice: number;
  pizzaPrice: number;
  toppingPrices: number[];
  quantity: number;
}

export interface Bill {
  unitPrice: number;
  subtotal: number;
  discount: number;
  gst: number;
  total: number;
}

export function computeBill({ basePrice, pizzaPrice, toppingPrices, quantity }: BillInput): Bill {
  const unitPrice = round2(basePrice + pizzaPrice + toppingPrices.reduce((sum, p) => sum + p, 0));
  const subtotal = round2(unitPrice * quantity);
  const discount = quantity >= DISCOUNT_THRESHOLD ? round2(subtotal * DISCOUNT_RATE) : 0;
  const gst = round2((subtotal - discount) * GST_RATE);
  const total = round2(subtotal - discount + gst);
  return { unitPrice, subtotal, discount, gst, total };
}
