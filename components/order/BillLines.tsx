import type { Bill } from "@/lib/pricing";
import { formatINR, GST_RATE, DISCOUNT_RATE } from "@/lib/pricing";

export default function BillLines({ bill, quantity }: { bill: Bill; quantity: number }) {
  return (
    <div className="space-y-1 text-sm">
      <div className="flex justify-between text-zinc-300">
        <span>Per pizza</span>
        <span>{formatINR(bill.unitPrice)}</span>
      </div>
      <div className="flex justify-between text-zinc-300">
        <span>Subtotal ({quantity} × {formatINR(bill.unitPrice)})</span>
        <span>{formatINR(bill.subtotal)}</span>
      </div>
      {bill.discount > 0 && (
        <div className="flex justify-between text-emerald-400">
          <span>Bulk discount ({DISCOUNT_RATE * 100}%)</span>
          <span>−{formatINR(bill.discount)}</span>
        </div>
      )}
      <div className="flex justify-between text-zinc-300">
        <span>GST ({GST_RATE * 100}%)</span>
        <span>{formatINR(bill.gst)}</span>
      </div>
      <div className="mt-2 flex justify-between border-t border-white/10 pt-2 text-base font-bold">
        <span>Total</span>
        <span className="text-[var(--accent)]">{formatINR(bill.total)}</span>
      </div>
    </div>
  );
}
