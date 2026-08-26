/** TALABAT operates exclusively in Libyan dinars. */
export function formatCurrency(amount: number): string {
  return `${Number(amount || 0).toFixed(2)} د.ل`;
}