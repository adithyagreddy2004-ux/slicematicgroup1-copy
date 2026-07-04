import { describe, it, expect } from "vitest";
import { computeBill, round2, formatINR, DISCOUNT_THRESHOLD } from "@/lib/pricing";

describe("computeBill", () => {
  // Thin Crust 149 + Margherita 299 + Extra Cheese 69 = 517/unit
  const cart = { basePrice: 149, pizzaPrice: 299, toppingPrices: [69] };

  it("computes a bill with no discount below the threshold", () => {
    const bill = computeBill({ ...cart, quantity: 4 });
    expect(bill.unitPrice).toBe(517);
    expect(bill.subtotal).toBe(2068);
    expect(bill.discount).toBe(0);
    expect(bill.gst).toBe(round2(2068 * 0.18)); // 372.24
    expect(bill.total).toBe(round2(2068 + 372.24)); // 2440.24
  });

  it("applies 10% discount exactly at the threshold (boundary: 4 vs 5)", () => {
    const at4 = computeBill({ ...cart, quantity: 4 });
    const at5 = computeBill({ ...cart, quantity: 5 });
    expect(at4.discount).toBe(0);
    expect(at5.discount).toBe(round2(517 * 5 * 0.1)); // 258.5
  });

  it("computes GST on the post-discount amount", () => {
    const bill = computeBill({ ...cart, quantity: 5 });
    const postDiscount = 2585 - 258.5; // 2326.5
    expect(bill.gst).toBe(round2(postDiscount * 0.18)); // 418.77
    expect(bill.total).toBe(round2(postDiscount + 418.77)); // 2745.27
  });

  it("handles zero toppings", () => {
    const bill = computeBill({ basePrice: 149, pizzaPrice: 299, toppingPrices: [], quantity: 1 });
    expect(bill.unitPrice).toBe(448);
  });

  it("exposes the discount threshold as a constant", () => {
    expect(DISCOUNT_THRESHOLD).toBe(5);
  });
});

describe("round2", () => {
  it("rounds to two decimal places", () => {
    expect(round2(418.7699999)).toBe(418.77);
    expect(round2(100)).toBe(100);
  });
});

describe("formatINR", () => {
  it("formats with rupee symbol and two decimals", () => {
    expect(formatINR(2440.24)).toBe("₹2,440.24");
    expect(formatINR(0)).toBe("₹0.00");
  });
});
