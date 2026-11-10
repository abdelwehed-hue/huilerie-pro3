/** Tunisian currency input helpers.
 * Monetary inputs are entered as integer millimes; API/storage values remain dinars (TND).
 */
export function millimesInputToDinars(value: string): string {
  const raw = String(value ?? "").trim();
  if (!/^\d+$/.test(raw)) throw new Error("Enter the amount as whole millimes");
  const millimes = BigInt(raw);
  const dinars = millimes / 1000n;
  const remainder = String(millimes % 1000n).padStart(3, "0");
  return `${dinars}.${remainder}`;
}

export function dinarsToMillimesInput(value: unknown): string {
  const amount = Number(value ?? 0);
  if (!Number.isFinite(amount)) return "";
  return String(Math.max(0, Math.round(amount * 1000)));
}

export function millimesInputNumber(value: string): number {
  const raw = String(value ?? "").trim();
  if (!/^\d+$/.test(raw)) return Number.NaN;
  const amount = Number(raw);
  return Number.isSafeInteger(amount) ? amount : Number.NaN;
}

/** Convert a millimes-per-unit price and a quantity (up to 3 decimals)
 * into a TND total, rounding once to the nearest millime.
 */
export function unitPriceMillimesToTotalDinars(unitPriceValue: string, quantityValue: string): string {
  const unitPrice = millimesInputNumber(unitPriceValue);
  const quantityMatch = String(quantityValue ?? "").trim().match(/^(\d+)(?:\.(\d{1,3}))?$/);
  if (!Number.isSafeInteger(unitPrice) || unitPrice < 0 || !quantityMatch) {
    throw new Error("Enter a whole-millime unit price and a quantity with up to 3 decimals");
  }
  const quantityMilliunits =
    BigInt(quantityMatch[1]) * 1000n +
    BigInt((quantityMatch[2] || "").padEnd(3, "0") || "0");
  if (quantityMilliunits <= 0n) throw new Error("Quantity must be positive");
  const totalMillimes = (BigInt(unitPrice) * quantityMilliunits + 500n) / 1000n;
  return millimesInputToDinars(totalMillimes.toString());
}
