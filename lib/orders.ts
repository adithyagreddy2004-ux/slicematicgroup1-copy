import { computeBill, Bill } from "@/lib/pricing";
import {
  validateName,
  validatePhone,
  validateQuantity,
  validatePaymentMode,
  validateTableId,
  PaymentMode,
} from "@/lib/validation";
import type { Menu, MenuItem } from "@/lib/types";

export interface OrderPayload {
  customerName: string;
  phone: string;
  tableId: string;
  baseId: string;
  pizzaId: string;
  toppingIds: string[];
  beverageIds?: string[];
  quantity: number;
  paymentMode: string;
  acceptedUpsellEventId?: string | null;
}

export interface NewOrder {
  customer_name: string;
  phone: string;
  table_id: string;
  subtotal: number;
  discount: number;
  gst: number;
  total: number;
  payment_mode: PaymentMode;
}

export interface NewOrderItem {
  item_type: "base" | "pizza" | "topping" | "beverage";
  item_id: string;
  item_name: string;
  unit_price: number;
  quantity: number;
}

export type BuildResult =
  | { ok: true; order: NewOrder; items: NewOrderItem[]; bill: Bill }
  | { ok: false; error: string };

function findItem(list: MenuItem[], id: unknown): MenuItem | undefined {
  if (typeof id !== "string") return undefined;
  return list.find((item) => item.id === id);
}

/**
 * Validates the payload and rebuilds the entire bill from DB menu prices.
 * Client-sent prices are never trusted — only ids, quantity, and mode.
 */
export function buildOrder(payload: OrderPayload, menu: Menu): BuildResult {
  const nameCheck = validateName(payload?.customerName);
  if (!nameCheck.ok) return nameCheck;
  const phoneCheck = validatePhone(payload?.phone);
  if (!phoneCheck.ok) return phoneCheck;
  const tableCheck = validateTableId(payload?.tableId);
  if (!tableCheck.ok) return tableCheck;
  const qtyCheck = validateQuantity(payload?.quantity);
  if (!qtyCheck.ok) return qtyCheck;
  const paymentCheck = validatePaymentMode(payload?.paymentMode);
  if (!paymentCheck.ok) return paymentCheck;

  const base = findItem(menu.bases, payload.baseId);
  if (!base) return { ok: false, error: "Selected base was not found on the menu." };
  const pizza = findItem(menu.pizzas, payload.pizzaId);
  if (!pizza) return { ok: false, error: "Selected pizza was not found on the menu." };

  if (!Array.isArray(payload.toppingIds)) {
    return { ok: false, error: "Toppings must be a list." };
  }
  if (new Set(payload.toppingIds).size !== payload.toppingIds.length) {
    return { ok: false, error: "Each topping can only be added once." };
  }
  const toppings: MenuItem[] = [];
  for (const id of payload.toppingIds) {
    const topping = findItem(menu.toppings, id);
    if (!topping) return { ok: false, error: "A selected topping was not found on the menu." };
    toppings.push(topping);
  }

  const beverageIds = payload.beverageIds ?? [];
  if (!Array.isArray(beverageIds)) {
    return { ok: false, error: "Beverages must be a list." };
  }
  if (new Set(beverageIds).size !== beverageIds.length) {
    return { ok: false, error: "Each beverage can only be added once." };
  }
  const beverages: MenuItem[] = [];
  for (const id of beverageIds) {
    const beverage = findItem(menu.beverages, id);
    if (!beverage) return { ok: false, error: "A selected beverage was not found on the menu." };
    beverages.push(beverage);
  }

  const quantity = Number(payload.quantity);
  const bill = computeBill({
    basePrice: Number(base.price),
    pizzaPrice: Number(pizza.price),
    toppingPrices: toppings.map((t) => Number(t.price)),
    quantity,
    beveragePrices: beverages.map((b) => Number(b.price)),
  });

  const order: NewOrder = {
    customer_name: payload.customerName.trim(),
    phone: payload.phone.trim(),
    table_id: payload.tableId.trim(),
    subtotal: bill.subtotal,
    discount: bill.discount,
    gst: bill.gst,
    total: bill.total,
    payment_mode: payload.paymentMode as PaymentMode,
  };

  const items: NewOrderItem[] = [
    { item_type: "base", item_id: base.id, item_name: base.name, unit_price: Number(base.price), quantity },
    { item_type: "pizza", item_id: pizza.id, item_name: pizza.name, unit_price: Number(pizza.price), quantity },
    ...toppings.map((t): NewOrderItem => ({
      item_type: "topping",
      item_id: t.id,
      item_name: t.name,
      unit_price: Number(t.price),
      quantity,
    })),
    // Beverages are one each, independent of pizza quantity.
    ...beverages.map((b): NewOrderItem => ({
      item_type: "beverage",
      item_id: b.id,
      item_name: b.name,
      unit_price: Number(b.price),
      quantity: 1,
    })),
  ];

  return { ok: true, order, items, bill };
}
