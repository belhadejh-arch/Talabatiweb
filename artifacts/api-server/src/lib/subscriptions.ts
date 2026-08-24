/**
 * Subscription helpers — compute start/expiry dates from a plan.
 */

export function computeSubscriptionDates(plan: string): { startDate: string; expiryDate: string; status: string } {
  const now = new Date();
  const start = now.toISOString().slice(0, 10);

  let days = 7;
  let status = "TRIAL";

  if (plan === "MONTHLY") {
    days = 30;
    status = "ACTIVE";
  } else if (plan === "YEARLY") {
    days = 365;
    status = "ACTIVE";
  }

  const expiry = new Date(now);
  expiry.setDate(expiry.getDate() + days);

  return { startDate: start, expiryDate: expiry.toISOString().slice(0, 10), status };
}

export function isSubscriptionActive(status: string, expiryDate: string): boolean {
  if (status === "SUSPENDED" || status === "INACTIVE" || status === "EXPIRED") return false;
  const expiry = new Date(expiryDate);
  return expiry >= new Date();
}
