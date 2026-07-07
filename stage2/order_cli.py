#!/usr/bin/env python3
"""
SliceMatic — Stage 2 Working MVP (CLI)

A self-contained pizza ordering system that replaces Rajan's Google Form.
No third-party dependencies — run with:  python3 order_cli.py

Business rules (identical to the full-stack app):
  - Name: letters + spaces only, 2-40 chars
  - Phone: exactly 10 digits, starts with 6/7/8/9
  - Quantity: integer 1-10 (reject floats, words, 0, negatives, >10)
  - Discount: 10% when quantity >= 5
  - GST: 18% on the post-discount total
  - Payment: Cash / Card / UPI
Menu is loaded from the three .txt files at runtime (never hardcoded).
Every completed order is appended to orders_log.txt.
"""

import os
import re
import sys
from datetime import datetime

# ---- business rule constants (change here to change policy) ----------------
DISCOUNT_THRESHOLD = 5      # pizzas
DISCOUNT_RATE = 0.10        # 10%
GST_RATE = 0.18             # 18%
MIN_QTY, MAX_QTY = 1, 10

MENU_FILES = {
    "base":    "Types_of_Base.txt",
    "pizza":   "Types_of_Pizza.txt",
    "topping": "Types_of_Toppings.txt",
}
LOG_FILE = "orders_log.txt"


# ---- defensive menu parsing ------------------------------------------------
def parse_menu_line(line):
    """Parse one `ID ; Name ; Price` line. Return dict or None if malformed."""
    parts = [p.strip() for p in line.split(";")]
    if len(parts) != 3:
        return None
    item_id, name, price_raw = parts
    if not item_id or not name or not price_raw:
        return None
    try:
        price = float(price_raw)
    except ValueError:
        return None
    if price <= 0:
        return None
    return {"id": item_id, "name": name, "price": price}


def load_menu_file(path):
    """Load one menu file. Exit gracefully on missing file or zero valid rows."""
    if not os.path.exists(path):
        print(f"ERROR: menu file '{path}' is missing. Cannot start.")
        sys.exit(1)
    try:
        with open(path, "r", encoding="utf-8") as fh:
            raw = fh.read()
    except OSError as exc:
        print(f"ERROR: could not read '{path}': {exc}")
        sys.exit(1)

    items, skipped = [], 0
    for line in raw.splitlines():
        if line.strip() == "":
            continue
        parsed = parse_menu_line(line)
        if parsed:
            items.append(parsed)
        else:
            skipped += 1  # malformed line (e.g. missing price) — skip, don't crash
    if skipped:
        print(f"  (note: skipped {skipped} malformed line(s) in {os.path.basename(path)})")
    if not items:
        print(f"ERROR: '{path}' has no valid menu items. Cannot start.")
        sys.exit(1)
    return items


def load_menu(base_dir):
    menu = {}
    for kind, fname in MENU_FILES.items():
        menu[kind] = load_menu_file(os.path.join(base_dir, fname))
    return menu


# ---- input helpers (never crash on any input) ------------------------------
def prompt(text):
    """Read a line. Treat EOF (piped input ending) as an abort."""
    try:
        return input(text)
    except EOFError:
        print("\nNo more input — exiting.")
        sys.exit(0)


def read_name():
    while True:
        raw = prompt("Your name: ")
        name = raw.strip()
        if name == "":
            print("  ! Please enter your name.")
        elif len(name) < 2:
            print("  ! Name must be at least 2 characters.")
        elif len(name) > 40:
            print("  ! Name must be 40 characters or fewer.")
        elif not re.fullmatch(r"[A-Za-z ]+", name):
            print("  ! Name can only contain letters and spaces.")
        else:
            return name


def read_phone():
    while True:
        phone = prompt("Phone (10 digits): ").strip()
        if phone == "":
            print("  ! Please enter your phone number.")
        elif not re.fullmatch(r"\d{10}", phone):
            print("  ! Phone must be exactly 10 digits.")
        elif phone[0] not in "6789":
            print("  ! Phone must start with 6, 7, 8 or 9.")
        else:
            return phone


def read_quantity():
    while True:
        raw = prompt(f"How many pizzas? ({MIN_QTY}-{MAX_QTY}): ").strip()
        if raw == "":
            print("  ! Please enter a quantity.")
            continue
        # reject anything that is not a plain integer (floats, words, etc.)
        if not re.fullmatch(r"-?\d+", raw):
            print("  ! Quantity must be a whole number — no decimals or words.")
            continue
        qty = int(raw)
        if qty < MIN_QTY:
            print(f"  ! Quantity must be at least {MIN_QTY}.")
        elif qty > MAX_QTY:
            print(f"  ! Maximum {MAX_QTY} pizzas per order.")
        else:
            return qty


def choose_one(items, label):
    """Select a single item by its list number. Reject letters/out-of-range/empty."""
    print(f"\n{label}:")
    for i, it in enumerate(items, 1):
        print(f"  {i:>2}. {it['name']:<22} Rs. {it['price']:.2f}")
    while True:
        raw = prompt(f"Select {label} number: ").strip()
        if raw == "":
            print("  ! Please enter a number.")
        elif not re.fullmatch(r"\d+", raw):
            print("  ! Enter the item NUMBER, not text.")
        else:
            n = int(raw)
            if 1 <= n <= len(items):
                return items[n - 1]
            print(f"  ! Choose a number between 1 and {len(items)}.")


def choose_toppings(items):
    """Select zero or more toppings by comma-separated numbers. 0 = none."""
    print("\nToppings (optional):")
    for i, it in enumerate(items, 1):
        print(f"  {i:>2}. {it['name']:<22} Rs. {it['price']:.2f}")
    while True:
        raw = prompt("Topping numbers (comma-separated, 0 for none): ").strip()
        if raw == "":
            print("  ! Enter 0 for no toppings, or numbers like 1,3.")
            continue
        if raw == "0":
            return []
        tokens = [t.strip() for t in raw.split(",")]
        if any(not re.fullmatch(r"\d+", t) for t in tokens):
            print("  ! Use item NUMBERS only, e.g. 1,3.")
            continue
        nums = [int(t) for t in tokens]
        if any(n < 1 or n > len(items) for n in nums):
            print(f"  ! Each number must be between 1 and {len(items)}.")
            continue
        # de-dupe, preserve order
        seen, chosen = set(), []
        for n in nums:
            if n not in seen:
                seen.add(n)
                chosen.append(items[n - 1])
        return chosen


def read_payment():
    modes = {"1": "Cash", "2": "Card", "3": "UPI"}
    print("\nPayment mode:")
    for k, v in modes.items():
        print(f"  {k}. {v}")
    while True:
        raw = prompt("Select payment (1-3): ").strip()
        if raw in modes:
            return modes[raw]
        print("  ! Invalid choice — enter 1 (Cash), 2 (Card) or 3 (UPI).")


# ---- billing ---------------------------------------------------------------
def compute_bill(base, pizza, toppings, qty):
    unit_price = round(base["price"] + pizza["price"] + sum(t["price"] for t in toppings), 2)
    subtotal = round(unit_price * qty, 2)
    discount = round(subtotal * DISCOUNT_RATE, 2) if qty >= DISCOUNT_THRESHOLD else 0.0
    gst = round((subtotal - discount) * GST_RATE, 2)
    total = round(subtotal - discount + gst, 2)
    return {
        "unit_price": unit_price, "subtotal": subtotal,
        "discount": discount, "gst": gst, "total": total,
    }


def print_bill(base, pizza, toppings, qty, bill):
    print("\n" + "=" * 44)
    print("  ITEMISED BILL".ljust(44))
    print("=" * 44)
    print(f"  {'Base:':<12}{base['name']:<20}Rs.{base['price']:>7.2f}")
    print(f"  {'Pizza:':<12}{pizza['name']:<20}Rs.{pizza['price']:>7.2f}")
    if toppings:
        for t in toppings:
            print(f"  {'Topping:':<12}{t['name']:<20}Rs.{t['price']:>7.2f}")
    else:
        print(f"  {'Topping:':<12}{'(none)':<20}Rs.{0:>7.2f}")
    print("-" * 44)
    print(f"  {'Unit price':<24}Rs.{bill['unit_price']:>10.2f}")
    print(f"  {'Quantity':<24}{qty:>13}")
    print(f"  {'Subtotal':<24}Rs.{bill['subtotal']:>10.2f}")
    if bill["discount"] > 0:
        print(f"  {'Discount (10%, qty>=5)':<24}-Rs.{bill['discount']:>9.2f}")
    print(f"  {'GST (18%)':<24}Rs.{bill['gst']:>10.2f}")
    print("=" * 44)
    print(f"  {'TOTAL PAYABLE':<24}Rs.{bill['total']:>10.2f}")
    print("=" * 44)


# ---- persistence -----------------------------------------------------------
def append_order(path, ts, name, phone, base, pizza, toppings, qty, bill, payment):
    topping_str = ", ".join(f"{t['name']} (Rs.{t['price']:.2f})" for t in toppings) or "none"
    block = [
        f"Timestamp   : {ts}",
        f"Customer    : {name}",
        f"Phone       : {phone}",
        f"Base        : {base['name']} (Rs.{base['price']:.2f})",
        f"Pizza       : {pizza['name']} (Rs.{pizza['price']:.2f})",
        f"Toppings    : {topping_str}",
        f"Unit price  : Rs.{bill['unit_price']:.2f}",
        f"Quantity    : {qty}",
        f"Subtotal    : Rs.{bill['subtotal']:.2f}",
        f"Discount    : Rs.{bill['discount']:.2f}",
        f"GST (18%)   : Rs.{bill['gst']:.2f}",
        f"Total       : Rs.{bill['total']:.2f}",
        f"Payment     : {payment}",
    ]
    with open(path, "a", encoding="utf-8") as fh:
        fh.write("\n".join(block))
        fh.write("\n\n")  # blank line between orders


# ---- main flow -------------------------------------------------------------
def main():
    base_dir = os.path.dirname(os.path.abspath(__file__))
    print("=" * 44)
    print("  SliceMatic — Pizza Ordering (Stage 2 CLI)")
    print("=" * 44)

    menu = load_menu(base_dir)

    session_ts = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    print(f"\nSession started: {session_ts}\n")

    name = read_name()
    phone = read_phone()

    base = choose_one(menu["base"], "Base")
    pizza = choose_one(menu["pizza"], "Pizza")
    toppings = choose_toppings(menu["topping"])
    qty = read_quantity()

    bill = compute_bill(base, pizza, toppings, qty)
    print_bill(base, pizza, toppings, qty, bill)

    payment = read_payment()
    print(f"\nPayment confirmed: {payment}. Thank you, {name}!")

    order_ts = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    append_order(os.path.join(base_dir, LOG_FILE), order_ts, name, phone,
                 base, pizza, toppings, qty, bill, payment)
    print(f"Order logged to {LOG_FILE}.\n")


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        print("\nCancelled.")
        sys.exit(0)
