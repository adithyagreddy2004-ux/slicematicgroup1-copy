export interface MenuItem {
  id: string;
  name: string;
  price: number;
}

export interface Menu {
  bases: MenuItem[];
  pizzas: MenuItem[];
  toppings: MenuItem[];
  beverages: MenuItem[];
}

export interface OrderItemRow {
  id: string;
  order_id: string;
  item_type: "base" | "pizza" | "topping" | "beverage";
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

export interface UpsellRuleRow {
  id: string;
  generation_id: string | null;
  trigger_type: "base" | "pizza" | "topping" | "beverage" | "any";
  trigger_id: string | null;
  suggest_type: "base" | "pizza" | "topping" | "beverage";
  suggest_id: string;
  priority: number;
  min_quantity: number;
  max_quantity: number | null;
  reason_template: string;
  active: boolean;
  source: "manual" | "ai" | "fallback";
  created_at: string;
}

export interface UpsellEventRow {
  id: string;
  order_id: string | null;
  rule_id: string | null;
  cart_signature: string;
  suggested_type: "base" | "pizza" | "topping" | "beverage";
  suggested_id: string;
  suggested_name: string;
  suggested_price: number;
  ai_message: string;
  displayed: boolean;
  accepted: boolean | null;
  quantity: number | null;
  revenue_impact: number;
  created_at: string;
  updated_at: string;
}

export interface UpsellRuleGenerationRow {
  id: string;
  status: "draft" | "published" | "failed";
  mode: "cold_start" | "data_driven";
  model: string;
  input_summary: unknown;
  ai_response: unknown;
  error_message: string | null;
  created_at: string;
  published_at: string | null;
}

export interface UpsellRuleSuggestionRow {
  id: string;
  generation_id: string;
  published_rule_id: string | null;
  trigger_type: "base" | "pizza" | "topping" | "beverage";
  trigger_id: string;
  suggest_type: "base" | "pizza" | "topping" | "beverage";
  suggest_id: string;
  reason_template: string;
  priority: number;
  confidence: "high" | "medium" | "low";
  active: boolean;
  created_at: string;
}
