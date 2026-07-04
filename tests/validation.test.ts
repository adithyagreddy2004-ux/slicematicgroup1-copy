import { describe, it, expect } from "vitest";
import {
  validateName,
  validatePhone,
  validateQuantity,
  validatePaymentMode,
  validateTableId,
} from "@/lib/validation";

describe("validateName", () => {
  it("accepts a normal name", () => {
    expect(validateName("Rajan Sharma")).toEqual({ ok: true });
  });
  it("rejects spaces-only input", () => {
    expect(validateName("    ").ok).toBe(false);
  });
  it("rejects empty and non-string input", () => {
    expect(validateName("").ok).toBe(false);
    expect(validateName(undefined).ok).toBe(false);
    expect(validateName(42).ok).toBe(false);
  });
  it("rejects names shorter than 2 or longer than 40 chars", () => {
    expect(validateName("A").ok).toBe(false);
    expect(validateName("A".repeat(41)).ok).toBe(false);
    expect(validateName("Al").ok).toBe(true);
    expect(validateName("A".repeat(40)).ok).toBe(true);
  });
  it("rejects digits and symbols", () => {
    expect(validateName("Rajan123").ok).toBe(false);
    expect(validateName("Rajan!").ok).toBe(false);
  });
});

describe("validatePhone", () => {
  it("accepts a valid Indian mobile number", () => {
    expect(validatePhone("9876543210")).toEqual({ ok: true });
  });
  it("rejects a 10-digit number starting with 1", () => {
    expect(validatePhone("1234567890").ok).toBe(false);
  });
  it("rejects wrong lengths, letters, and empty", () => {
    expect(validatePhone("98765").ok).toBe(false);
    expect(validatePhone("98765432101").ok).toBe(false);
    expect(validatePhone("98765abcde").ok).toBe(false);
    expect(validatePhone("").ok).toBe(false);
    expect(validatePhone(undefined).ok).toBe(false);
  });
});

describe("validateQuantity", () => {
  it("accepts integers 1 through 10", () => {
    expect(validateQuantity("1")).toEqual({ ok: true });
    expect(validateQuantity("10")).toEqual({ ok: true });
    expect(validateQuantity(7)).toEqual({ ok: true });
  });
  it("rejects 0, 11, and negatives", () => {
    expect(validateQuantity("0").ok).toBe(false);
    expect(validateQuantity("11").ok).toBe(false);
    expect(validateQuantity("-3").ok).toBe(false);
  });
  it("rejects floats and words", () => {
    expect(validateQuantity("2.5").ok).toBe(false);
    expect(validateQuantity("three").ok).toBe(false);
  });
  it("rejects empty input", () => {
    expect(validateQuantity("").ok).toBe(false);
    expect(validateQuantity("   ").ok).toBe(false);
    expect(validateQuantity(undefined).ok).toBe(false);
  });
});

describe("validatePaymentMode", () => {
  it("accepts exactly cash, card, upi", () => {
    expect(validatePaymentMode("cash")).toEqual({ ok: true });
    expect(validatePaymentMode("card")).toEqual({ ok: true });
    expect(validatePaymentMode("upi")).toEqual({ ok: true });
  });
  it("rejects anything else", () => {
    expect(validatePaymentMode("bitcoin").ok).toBe(false);
    expect(validatePaymentMode("").ok).toBe(false);
    expect(validatePaymentMode(4).ok).toBe(false);
  });
});

describe("validateTableId", () => {
  it("accepts simple alphanumeric table ids", () => {
    expect(validateTableId("12")).toEqual({ ok: true });
    expect(validateTableId("A-3")).toEqual({ ok: true });
  });
  it("rejects empty, overlong, and junk values", () => {
    expect(validateTableId("").ok).toBe(false);
    expect(validateTableId("   ").ok).toBe(false);
    expect(validateTableId("x".repeat(11)).ok).toBe(false);
    expect(validateTableId("12; drop").ok).toBe(false);
    expect(validateTableId(null).ok).toBe(false);
  });
});
