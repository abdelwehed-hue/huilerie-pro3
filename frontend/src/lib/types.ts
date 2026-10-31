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
  username?: string;
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
  oil_type: string | null;
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
  oil_type?: string | null;
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
  status: LoadStatus;
  season: string;
  created_by_name: string | null;
  bags: number | null;
  variety: string | null;
  notes: string | null;
  oil_ready_at: string | null;
  delivered_at: string | null;
  delivered_by: string | null;
  reminder_sent_at: string | null;
  cancel_reason: string | null;
  cancelled_at: string | null;
  cancelled_by: string | null;
  day: string;
  created_at: string;
  created_by: string;
  price_per_kg: number | null;
  amount: number | null;
  lab: LabAnalysis | null;
}

export type LoadStatus = "pending" | "pressing" | "done" | "delivered" | "cancelled";

export interface LoadCreate {
  client_name: string;
  phone: string;
  olive_kg: number;
  bags?: number | null;
  variety?: string | null;
  notes?: string | null;
  initial_status?: "pending" | "pressing";
}

export interface StatusUpdate {
  status: "pending" | "pressing" | "done" | "delivered";
}

export interface SeasonInfo {
  current: string;
  active: string;
  auto: boolean;
  available: string[];
}

export interface SeasonSet {
  season: string;
}

export interface Varieties {
  varieties: string[];
}

export interface ClientCreate {
  client_name: string;
  phone: string;
}

export interface DailyPoint {
  day: string;
  olive_kg: number;
  oil_kg: number;
  revenue: number | null;
}

export interface Stats {
  today: string;
  season: string;
  loads_today: number;
  non_terminated: number;
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
  mill_logo: string;
}

export interface AppSettings extends MillInfo {
  price_per_kg: number;
  login_image: string;
  tv_image: string;
  tv_youtube_url: string;
  tv_video_source: "youtube" | "direct";
  tv_display_mode: "background" | "split" | "fullscreen";
  tv_video_enabled: boolean;
  tv_receipt_duration: number;
  sms_enabled: boolean;
  sms_arrival_template: string;
  sms_ready_template: string;
  sms_reminder_template: string;
}

export interface TvMediaSettings {
  tv_image: string;
  tv_youtube_url: string;
  tv_video_source: "youtube" | "direct";
  tv_display_mode: "background" | "split" | "fullscreen";
  tv_video_enabled: boolean;
  tv_receipt_duration: number;
}

// Mirrors DEFAULT_SMS_REMINDER in backend/models/schemas.py
export const DEFAULT_SMS_REMINDER =
  "{mill}: {name}, rappel: votre huile ({oil_kg} kg, code {code}) vous attend.\n{mill}: {name}، تذكير: الزيت متاعك ({oil_kg} كغ، الكود {code}) في انتظارك.";

export interface TwilioConfigOut {
  account_sid: string;
  from_number: string;
  messaging_service_sid: string;
  has_token: boolean;
  source: "db" | "env" | "none";
  mode: "simulated" | "live";
}

export interface TwilioConfigIn {
  account_sid: string;
  auth_token: string;
  from_number: string;
  messaging_service_sid: string;
}

export interface SmsTestResult {
  status: "simulated" | "sent" | "failed" | "disabled";
  error: string | null;
  to_number: string;
  mode: "simulated" | "live";
}

export interface ReminderRunResult {
  sent: number;
}

export interface ClientUpdate {
  client_name: string;
  phone: string;
}

export interface ClientDeleteResult {
  deleted: number;
}

// Mirrors DEFAULT_SMS_ARRIVAL / DEFAULT_SMS_READY in backend/models/schemas.py
export const DEFAULT_SMS_ARRIVAL =
  "{mill}: Bonjour {name}, votre code: {code} - Olives: {olive_kg} kg.\n{mill}: مرحبا {name}، الكود متاعك: {code} - الزيتون: {olive_kg} كغ.";
export const DEFAULT_SMS_READY =
  "{mill}: {name}, votre huile est prête: {oil_kg} kg (code {code}).\n{mill}: {name}، الزيت متاعك جاهز: {oil_kg} كغ (الكود {code}).";

export interface SmsStatus {
  mode: "simulated" | "live";
  enabled: boolean;
}

export interface WorkerRow {
  day: string;
  username: string;
  full_name: string;
  loads: number;
  olive_kg: number;
  oil_kg: number;
  revenue: number;
}

export interface WorkerReport {
  start: string;
  end: string;
  rows: WorkerRow[];
  totals: WorkerRow[];
}

export interface SmsLog {
  id: string;
  load_id: string;
  code: string;
  client_name: string;
  phone: string;
  kind: "arrival" | "ready" | "reminder" | "test";
  message: string;
  status: "simulated" | "sent" | "failed" | "disabled";
  to_number: string | null;
  error: string | null;
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

export interface TvItem {
  id: string;
  code: string | null;
  finished_at: string;
}

export interface TvArrival { id: string; code: string; created_at: string; }

export interface TvBoard {
  today: string;
  items: TvItem[];
  arrivals: TvArrival[];
  sound_enabled: boolean;
  server_time: string;
}

export interface TvAdminItem {
  id: string;
  code: string;
  finished_at: string;
  hidden: boolean;
  removed: boolean;
}

export interface TvItemUpdate {
  hidden?: boolean;
  removed?: boolean;
}
