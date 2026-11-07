/** Tunisian currency input helpers.
 * Monetary inputs are entered as integer millimes; API/storage values remain dinars (TND).
 */
export function millimesInputToDinars(value: string): string {
  const raw = String(value ?? "").trim();
  if (!/^\\d+$/.test(raw)) throw new Error("Enter the amount as whole millimes");
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
  if (!/^\\d+$/.test(raw)) return Number.NaN;
  const amount = Number(raw);
  return Number.isSafeInteger(amount) ? amount : Number.NaN;
}
