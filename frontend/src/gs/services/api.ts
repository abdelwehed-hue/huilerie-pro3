const BASE = "/api/gs";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    credentials: "include",
    headers: { "Content-Type": "application/json", ...(init?.headers || {}) },
    ...init,
  });
  if (!res.ok) {
    let detail: unknown = null;
    try { detail = await res.json(); } catch { detail = await res.text(); }
    throw new Error(
      typeof detail === "object" && detail && "detail" in detail
        ? String((detail as { detail: unknown }).detail)
        : `HTTP ${res.status}`
    );
  }
  return res.json() as Promise<T>;
}

export const gsApi = {
  status: () => request<{ module: string; version: string }>("/status"),
  health: () => request<{ ok: boolean; transactions?: boolean }>("/health"),
  listCustomers: (q = "") => request<any[]>(`/customers?q=${encodeURIComponent(q)}`),
  createCustomer: (body: object) => request("/customers", { method: "POST", body: JSON.stringify(body) }),
  listSuppliers: (q = "") => request<any[]>(`/suppliers?q=${encodeURIComponent(q)}`),
  createSupplier: (body: object) => request("/suppliers", { method: "POST", body: JSON.stringify(body) }),
  listPurchases: () => request<any[]>("/purchases"),
  createPurchase: (body: object) => request("/purchases", { method: "POST", body: JSON.stringify(body) }),
  listMaterials: (q = "") => request<any[]>(`/materials?q=${encodeURIComponent(q)}`),
  materialHistory: (code: string) => request<any>(`/materials/${encodeURIComponent(code)}/history`),
  listTanks: () => request<any[]>("/tanks"),
  createTank: (body: object) => request("/tanks", { method: "POST", body: JSON.stringify(body) }),
  listReceptions: (code = "") => request<any[]>(`/reception?material_code=${encodeURIComponent(code)}`),
  createReception: (body: object) => request("/reception", { method: "POST", body: JSON.stringify(body) }),
  listSales: () => request<any[]>("/sales"),
  createSale: (body: object) => request("/sales", { method: "POST", body: JSON.stringify(body) }),
  listInvoices: () => request<any[]>("/invoices"),
  createInvoice: (body: object) => request("/invoices", { method: "POST", body: JSON.stringify(body) }),
  invoicePdfUrl: (id: string) => `/api/gs/invoices/${id}/pdf`,
};
