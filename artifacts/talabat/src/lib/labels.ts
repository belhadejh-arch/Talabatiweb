/**
 * Arabic display labels for backend enum values (restaurant status, subscription plan/status).
 * Keep the underlying enum values in English (they are API contract), only translate what's shown to the user.
 */

export function restaurantStatusLabel(status?: string | null): string {
  switch (status) {
    case "ACTIVE":
      return "نشط";
    case "INACTIVE":
      return "غير نشط";
    case "SUSPENDED":
      return "موقوف";
    default:
      return status || "—";
  }
}

export function subscriptionStatusLabel(status?: string | null): string {
  switch (status) {
    case "ACTIVE":
      return "نشط";
    case "TRIAL":
      return "تجريبي";
    case "EXPIRED":
      return "منتهي";
    case "SUSPENDED":
      return "موقوف";
    case "INACTIVE":
      return "غير مفعّل";
    default:
      return status || "—";
  }
}

export function orderStatusLabel(status?: string | null): string {
  switch (status) {
    case "NEW":
      return "جديد";
    case "ACCEPTED":
      return "مقبول";
    case "PREPARING":
      return "قيد التحضير";
    case "READY":
      return "جاهز";
    case "OUT_FOR_DELIVERY":
      return "قيد التوصيل";
    case "DELIVERED":
      return "تم التوصيل";
    case "CANCELLED":
      return "ملغي";
    default:
      return status || "—";
  }
}

export function subscriptionPlanLabel(plan?: string | null): string {
  switch (plan) {
    case "TRIAL":
      return "تجربة مجانية";
    case "MONTHLY":
      return "شهري";
    case "YEARLY":
      return "سنوي";
    default:
      return plan || "—";
  }
}
