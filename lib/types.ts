export interface MenuItem {
  id: string;
  name: string;
  price: number;
}

export interface Menu {
  bases: MenuItem[];
  pizzas: MenuItem[];
  toppings: MenuItem[];
}

export interface OrderItemRow {
  id: string;
  order_id: string;
  item_type: "base" | "pizza" | "topping";
  item_id: string;
  item_name: string;
  unit_price: number;
  quantity: number;
}

export interface OrderRow {
  id: string;
  customer_name: string;
  phone: string;
  table_id: string;
  subtotal: number;
  discount: number;
  gst: number;
  total: number;
  payment_mode: "cash" | "card" | "upi";
  status: "received" | "preparing" | "ready";
  created_at: string;
  order_items?: OrderItemRow[];
}

export interface WaiterCallRow {
  id: string;
  table_id: string;
  status: "pending" | "acknowledged";
  created_at: string;
  resolved_at: string | null;
}
