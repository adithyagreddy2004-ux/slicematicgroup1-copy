# Stage 2 — Working MVP (CLI)

Self-contained command-line pizza ordering system. No dependencies.

## Run

```bash
cd submission/stage2
python3 order_cli.py
```

Menu is loaded at runtime from the three `.txt` files in this folder
(`Types_of_Base.txt`, `Types_of_Pizza.txt`, `Types_of_Toppings.txt`) — nothing is
hardcoded. Every completed order is appended to `orders_log.txt` (one block per
order, blank line between). A sample `orders_log.txt` with 2 completed orders is
included.

## Business rules

- **Name:** letters + spaces only, 2–40 chars.
- **Phone:** exactly 10 digits, must start with 6/7/8/9.
- **Quantity:** integer 1–10. Floats, words, 0, negatives, and >10 are rejected.
- **Discount:** 10% applied automatically when quantity ≥ 5.
- **GST:** 18%, calculated on the **post-discount** total.
- **Payment:** Cash / Card / UPI.

## Edge cases handled (all re-prompt / exit gracefully — no crash)

1. Name with only spaces → rejected, re-prompt.
2. Phone starting with 1 (10 digits) → rejected.
3. Quantity `0` and `11` → rejected.
4. Item selection `0` or greater than menu length → rejected.
5. Entering a price number instead of an item number → out-of-range → rejected.
6. Empty input at every prompt → rejected, re-prompt.
7. Non-integer quantity (`three`, `2.5`) → rejected.
8. Menu file with a missing price field → malformed line skipped; if a whole
   file is missing/empty, a clear error is shown and the program exits gracefully.

## Log format

Each order block records: timestamp, customer name, phone, base/pizza/topping
selections with unit prices, quantity, subtotal, discount, GST, final total, and
payment mode.
