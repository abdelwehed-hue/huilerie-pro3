/** Shared Tunisian dinar input helpers.
 * UI inputs are TND with up to three decimal places (millimes), e.g. 1,100.
 * API and existing MongoDB monetary fields continue to receive decimal TND strings.
 */
export function parseTndInputToMillimes(value: string): number {
  const raw = String(value ?? "").trim().replace(/[\s\u00a0\u202f]/g, "");
  const match = raw.match(/^(\d+)(?:[.,](\d{0,3}))?$/);
  if (!match) return Number.NaN;
  const millimes = BigInt(match[1]) * 1000n + BigInt((match[2] || "").padEnd(3, "0") || "0");
  return millimes <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(millimes) : Number.NaN;
}

function millimesToTndString(millimes: bigint): string {
  const dinars = millimes / 1000n;
  const remainder = String(millimes % 1000n).padStart(3, "0");
  return `${dinars}.${remainder}`;
}

export function tndInputToDinars(value: string): string {
  const millimes = parseTndInputToMillimes(value);
  if (!Number.isSafeInteger(millimes)) throw new Error("Enter a TND amount with up to 3 decimal places");
  return millimesToTndString(BigInt(millimes));
}

export function dinarsToTndInput(value: unknown): string {
  const amount = Number(value ?? 0);
  if (!Number.isFinite(amount) || amount < 0) return "";
  const millimes = Math.round(amount * 1000);
  return millimesToTndString(BigInt(millimes));
}

/** Calculate a TND total from a TND unit price and quantity (up to 3 decimals).
 * Uses integer millimes internally and rounds the final amount only once.
 */
export function unitPriceTndToTotalDinars(unitPriceValue: string, quantityValue: string): string {
  const unitPriceMillimes = parseTndInputToMillimes(unitPriceValue);
  const quantityMatch = String(quantityValue ?? "").trim().match(/^(\d+)(?:[.,](\d{1,3}))?$/);
  if (!Number.isSafeInteger(unitPriceMillimes) || unitPriceMillimes < 0 || !quantityMatch) {
    throw new Error("Enter a TND unit price and a quantity with up to 3 decimals");
  }
  const quantityMilliunits =
    BigInt(quantityMatch[1]) * 1000n +
    BigInt((quantityMatch[2] || "").padEnd(3, "0") || "0");
  if (quantityMilliunits <= 0n) throw new Error("Quantity must be positive");
  const totalMillimes = (BigInt(unitPriceMillimes) * quantityMilliunits + 500n) / 1000n;
  return millimesToTndString(totalMillimes);
}
