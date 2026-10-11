// Hand-written mirrors of backend/models/schemas.py — keep in sync.
export type Role = "admin" | "worker";
export type Grade = "extra_vierge" | "vierge" | "lampante";

export interface User {
  id: string;
  username: string;
  full_name: string;
  role: Role;
  active: boolean;
  created_at: string;
}

export interface UserCreate {
  username: string;
  full_name: string;
  password: string;
  role: Role;
}

export interface UserUpdate {
  full_name?: string;
  role?: Role;
  active?: boolean;
  password?: string;
}

export interface LabAnalysis {
  id: string;
  load_id: string;
  code: string;
  client_name: string;
  acidity: number;
  peroxide: number | null;
  k232: number | null;
  k270: number | null;
  oil_content_pct: number | null;
  classification: Grade;
  notes: string;
  created_at: string;
  created_by: string;
}

export interface LabCreate {
  code: string;
  acidity: number;
  peroxide: number | null;
  k232: number | null;
  k270: number | null;
  oil_content_pct: number | null;
  classification?: Grade | null;
  notes: string;
}

export interface Load {
  id: string;
  code: string;
  client_name: string;
  phone: string;
  olive_kg: number;
  oil_kg: number | null;
  yield_pct: number | null;
  status: "pending" | "done";
  day: string;
  created_at: string;
  created_by: string;
  price_per_kg: number | null;
  amount: number | null;
  lab: LabAnalysis | null;
}

export interface LoadCreate {
  client_name: string;
  phone: string;
  olive_kg: number;
}

export interface DailyPoint {
  day: string;
  olive_kg: number;
  oil_kg: number;
  revenue: number | null;
}

export interface Stats {
  today: string;
  loads_today: number;
  loads_total: number;
  pending: number;
  olive_kg_today: number;
  oil_kg_today: number;
  olive_kg_total: number;
  oil_kg_total: number;
  avg_yield: number | null;
  revenue_today: number | null;
  revenue_total: number | null;
  daily: DailyPoint[];
}

export interface MillInfo {
  mill_name: string;
  mill_address: string;
  mill_phone: string;
}

export interface AppSettings extends MillInfo {
  price_per_kg: number;
}

export interface SmsLog {
  id: string;
  load_id: string;
  code: string;
  client_name: string;
  phone: string;
  kind: "arrival" | "ready";
  message: string;
  status: "simulated" | "sent" | "failed";
  created_at: string;
}

export interface ReportRow {
  period: string;
  loads: number;
  olive_kg: number;
  oil_kg: number;
  revenue: number;
}

export interface RevenueReport {
  period: "daily" | "monthly";
  start: string;
  end: string;
  rows: ReportRow[];
  total: ReportRow;
}

export interface ClientSummary {
  phone: string;
  client_name: string;
  loads_count: number;
  olive_kg: number;
  oil_kg: number;
  last_visit: string;
  amount: number | null;
}

export interface ClientHistory {
  phone: string;
  client_name: string;
  loads_count: number;
  olive_kg: number;
  oil_kg: number;
  avg_yield: number | null;
  amount: number | null;
  loads: Load[];
}

export interface Certificate {
  analysis: LabAnalysis;
  load: Load | null;
  mill: MillInfo;
}
