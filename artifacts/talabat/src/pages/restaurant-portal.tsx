import { useEffect, useRef, useState, type FormEvent } from "react";
import { Link } from "wouter";
import {
  CalendarDays,
  BellRing,
  ClipboardList,
  LogOut,
  RefreshCw,
  Receipt,
  Search,
  Store,
  X,
  ChartNoAxesCombined,
  CircleDollarSign,
} from "lucide-react";
import { driverApprovalLabel, InvoiceDialog } from "./admin-ui";
import {
  api,
  ApiError,
  CURRENCY,
  dateLabel,
  money,
  statusLabel,
  type Order,
  type RestaurantIdentity,
} from "../lib/api";
import "./restaurant-portal.css";

type RestaurantSession = { token: string; restaurant: RestaurantIdentity };
type ViewFilter = "all" | "active" | "archived";
type StatusFilter =
  "all" | "waiting" | "accepted" | "fallback" | "cancelled" | "completed";
type ReportPeriod = "daily" | "weekly" | "monthly" | "yearly";
const storageKey = "talabat-restaurant-session";
const fallbackAckKey = (restaurantId: number) =>
  `${storageKey}:fallback-ack:${restaurantId}`;
const orderAlertAudioUrl = `${import.meta.env.BASE_URL}order-alert.mp3`;
const reportPeriods: { value: ReportPeriod; label: string }[] = [
  { value: "daily", label: "يومي" },
  { value: "weekly", label: "أسبوعي" },
  { value: "monthly", label: "شهري" },
  { value: "yearly", label: "سنوي" },
];
const normalizeDigits = (value: string) =>
  value
    .replace(/[٠-٩]/g, (digit) => String(digit.charCodeAt(0) - 0x660))
    .replace(/[۰-۹]/g, (digit) => String(digit.charCodeAt(0) - 0x6f0));
const normalizeSearch = (value: string) =>
  normalizeDigits(value)
    .toLocaleLowerCase()
    .normalize("NFD")
    .replace(/[\u064B-\u065F\u0670\u06D6-\u06ED]/g, "")
    .replace(/[أإآ]/g, "ا")
    .replace(/ى/g, "ي")
    .trim();
const statusGroups: {
  value: StatusFilter;
  label: string;
  statuses: string[];
}[] = [
  { value: "all", label: "كل الفواتير", statuses: [] },
  {
    value: "waiting",
    label: "جديدة / بانتظار السائق",
    statuses: [
      "NEW",
      "PENDING",
      "WAITING_FOR_DRIVER",
      "ASSIGNED",
    ],
  },
  {
    value: "accepted",
    label: "مقبولة / مؤكدة",
    statuses: ["ACCEPTED", "CONFIRMED", "PREPARING", "READY", "ON_THE_WAY"],
  },
  {
    value: "fallback",
    label: "تعذّر إسنادها",
    statuses: ["NOT_ASSIGNED"],
  },
  { value: "cancelled", label: "ملغاة", statuses: ["CANCELLED"] },
  { value: "completed", label: "مكتملة", statuses: ["COMPLETED", "DELIVERED"] },
];

function readSession(): RestaurantSession | null {
  try {
    const parsed = JSON.parse(
      sessionStorage.getItem(storageKey) || "null",
    ) as RestaurantSession | null;
    return parsed &&
      typeof parsed.token === "string" &&
      typeof parsed.restaurant?.id === "number"
      ? parsed
      : null;
  } catch {
    return null;
  }
}

function readAcknowledgedFallbackOrders(restaurantId?: number) {
  if (!restaurantId) return new Set<number>();
  try {
    const saved = JSON.parse(
      sessionStorage.getItem(fallbackAckKey(restaurantId)) || "[]",
    );
    return new Set<number>(
      Array.isArray(saved)
        ? saved.filter((id): id is number => Number.isSafeInteger(id))
        : [],
    );
  } catch {
    return new Set<number>();
  }
}

function driverAttemptOutcomeLabel(status: string) {
  switch (status.toUpperCase()) {
    case "REJECTED":
      return "رفض الطلب";
    case "TIMEOUT":
      return "انتهت مهلة الرد";
    case "CANCELLED":
      return "أُلغي إسناده";
    default:
      return driverApprovalLabel(status);
  }
}

function canRestaurantDecide(order: Order) {
  if (["CANCELLED", "COMPLETED", "DELIVERED"].includes(order.status.toUpperCase())) {
    return false;
  }
  if (order.restaurantDecisionStatus === "DEFERRED") {
    return !order.restaurantDeferredUntil ||
      new Date(order.restaurantDeferredUntil).getTime() <= Date.now();
  }
  return !order.restaurantDecisionStatus ||
    order.restaurantDecisionStatus === "PENDING";
}

function restaurantDecisionLabel(order: Order) {
  if (order.restaurantDecisionStatus === "ACCEPTED") return "وافق المطعم";
  if (order.restaurantDecisionStatus === "REJECTED") return "رفض المطعم";
  if (order.restaurantDecisionStatus === "DEFERRED" &&
      order.restaurantDeferredUntil &&
      new Date(order.restaurantDeferredUntil).getTime() > Date.now()) {
    return `مؤجّل حتى ${dateLabel(order.restaurantDeferredUntil)}`;
  }
  return "بانتظار قرار المطعم";
}

function driverEmailLabel(status?: string | null) {
  switch (status) {
    case "SENT": return "أُرسل بريد السائق";
    case "SENDING": return "جارٍ إرسال بريد السائق";
    case "FAILED": return "تعذّر الإرسال؛ إعادة المحاولة مستمرة";
    case "PENDING": return "البريد محفوظ في قائمة الإرسال";
    default: return "بانتظار تعيين سائق لإرسال البريد";
  }
}

export default function RestaurantPortalPage() {
  const [session, setSession] = useState<RestaurantSession | null>(readSession);
  const [serialNumber, setSerialNumber] = useState("");
  const [loginError, setLoginError] = useState("");
  const [loggingIn, setLoggingIn] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [filter, setFilter] = useState<ViewFilter>("all");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [reportPeriod, setReportPeriod] = useState<ReportPeriod>("monthly");
  const [search, setSearch] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const [portal, setPortal] = useState<Awaited<
    ReturnType<typeof api.restaurantOverview>
  > | null>(null);
  const [portalError, setPortalError] = useState("");
  const [loading, setLoading] = useState(false);
  const [audioEnabled, setAudioEnabled] = useState(false);
  const [audioError, setAudioError] = useState("");
  const [isConnected, setIsConnected] = useState(true);
  const [busyOrderIds, setBusyOrderIds] = useState<Set<number>>(() => new Set());
  const [acknowledgedFallbackOrderIds, setAcknowledgedFallbackOrderIds] =
    useState<Set<number>>(() =>
      readAcknowledgedFallbackOrders(readSession()?.restaurant.id),
    );
  const portalRequestInFlight = useRef(false);
  const alertAudio = useRef<HTMLAudioElement | null>(null);
  const fallbackOrders = (portal?.orders || []).filter(
    (order) => order.status.toUpperCase() === "NOT_ASSIGNED",
  );
  const unacknowledgedFallbackOrders = fallbackOrders.filter(
    (order) => !acknowledgedFallbackOrderIds.has(order.id),
  );
  const hasUnacknowledgedFallbackOrders =
    unacknowledgedFallbackOrders.length > 0;
  const actionableOrders = (portal?.orders || []).filter(canRestaurantDecide);
  const hasActionableOrders = actionableOrders.length > 0;

  const logout = async () => {
    if (session) {
      try {
        await api.adminRequest(
          session.token,
          "/api/restaurant/logout",
          "POST",
          {},
        );
      } catch {
        /* Local credentials are cleared even when the network is unavailable. */
      }
    }
    sessionStorage.removeItem(storageKey);
    setSession(null);
    setPortal(null);
    setPortalError("");
    setSelectedOrder(null);
  };

  const loadPortal = async (quiet = false) => {
    if (!session) return;
    if (portalRequestInFlight.current) {
      if (!quiet) setRefreshing(false);
      return;
    }
    portalRequestInFlight.current = true;
    if (!quiet) setLoading(true);
    setPortalError("");
    try {
      const result = await api.restaurantOverview(session.token);
      setIsConnected(true);
      setPortal(result);
      setSelectedOrder((current) =>
        current
          ? result.orders.find((order) => order.id === current.id) || current
          : null,
      );
    } catch (error) {
      setIsConnected(false);
      if (error instanceof ApiError && error.status === 401) {
        sessionStorage.removeItem(storageKey);
        setSession(null);
        setPortal(null);
      } else {
        setPortalError(
          error instanceof Error ? error.message : "تعذّر تحميل بيانات المطعم.",
        );
      }
    } finally {
      portalRequestInFlight.current = false;
      if (!quiet) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  };

  useEffect(() => {
    if (!session) return;
    void loadPortal();
    const interval = window.setInterval(() => void loadPortal(true), 2_000);
    const refreshOnReconnect = () => {
      void loadPortal(true);
    };
    const refreshWhenVisible = () => {
      if (document.visibilityState === "visible" && navigator.onLine) {
        void loadPortal(true);
      }
    };
    const markOffline = () => setIsConnected(false);
    window.addEventListener("online", refreshOnReconnect);
    window.addEventListener("offline", markOffline);
    document.addEventListener("visibilitychange", refreshWhenVisible);
    // The token is the ownership boundary; clear polling when the session changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    return () => {
      window.clearInterval(interval);
      window.removeEventListener("online", refreshOnReconnect);
      window.removeEventListener("offline", markOffline);
      document.removeEventListener("visibilitychange", refreshWhenVisible);
    };
  }, [session?.token]);

  useEffect(() => {
    const audio = alertAudio.current;
    if (!audio) return;
    if (audioEnabled && isConnected && hasActionableOrders) {
      void audio.play().catch(() => {
        setAudioEnabled(false);
        setAudioError(
          "منع المتصفح تشغيل الصوت. اضغط «تفعيل صوت التنبيه» للسماح به.",
        );
      });
    } else {
      audio.pause();
      audio.currentTime = 0;
    }
  }, [audioEnabled, hasActionableOrders, isConnected]);

  useEffect(
    () => () => {
      alertAudio.current?.pause();
    },
    [],
  );

  const enableAudio = async () => {
    const audio = alertAudio.current || new Audio(orderAlertAudioUrl);
    audio.loop = true;
    audio.preload = "auto";
    alertAudio.current = audio;
    try {
      await audio.play();
      setAudioEnabled(true);
      setAudioError("");
      if (!hasActionableOrders) {
        audio.pause();
        audio.currentTime = 0;
      }
    } catch {
      setAudioError(
        "تعذر تشغيل الصوت تلقائياً. اضغط الزر للسماح بالتنبيه الصوتي.",
      );
    }
  };

  const runOrderAction = async (
    order: Order,
    action: "ACCEPTED" | "REJECTED" | "DEFERRED" | "FORWARD",
  ) => {
    if (!session || busyOrderIds.has(order.id)) return;
    if (action === "REJECTED" &&
        !window.confirm(`هل تريد رفض الطلب #${order.id} وإيقاف إرساله للسائقين؟`)) {
      return;
    }
    if (action === "FORWARD" &&
        !window.confirm(`توجيه الطلب #${order.id} الآن إلى السائق التالي؟`)) {
      return;
    }
    setBusyOrderIds((current) => new Set(current).add(order.id));
    setPortalError("");
    try {
      if (action === "FORWARD") {
        await api.restaurantForwardOrder(session.token, order.id);
      } else {
        await api.restaurantOrderDecision(session.token, order.id, action);
      }
      await loadPortal(true);
    } catch (error) {
      setPortalError(
        error instanceof Error ? error.message : "تعذّر تحديث حالة الطلب.",
      );
    } finally {
      setBusyOrderIds((current) => {
        const next = new Set(current);
        next.delete(order.id);
        return next;
      });
    }
  };

  const acknowledgeFallbackOrder = (orderId: number) => {
    const next = new Set(acknowledgedFallbackOrderIds);
    next.add(orderId);
    setAcknowledgedFallbackOrderIds(next);
    if (session) {
      sessionStorage.setItem(
        fallbackAckKey(session.restaurant.id),
        JSON.stringify([...next]),
      );
    }
  };

  const submitLogin = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setLoggingIn(true);
    setLoginError("");
    try {
      const result = await api.restaurantLogin(
        normalizeDigits(serialNumber).trim(),
      );
      const next = { token: result.token, restaurant: result.restaurant };
      sessionStorage.setItem(storageKey, JSON.stringify(next));
      setAcknowledgedFallbackOrderIds(
        readAcknowledgedFallbackOrders(result.restaurant.id),
      );
      setSession(next);
      setSerialNumber("");
    } catch (error) {
      setLoginError(
        error instanceof Error ? error.message : "تعذّر تسجيل الدخول.",
      );
    } finally {
      setLoggingIn(false);
    }
  };

  if (!session)
    return (
      <div className="restaurant-portal" dir="rtl">
        <div className="restaurant-login-shell">
          <header className="restaurant-portal-nav">
            <Link href="/" className="restaurant-portal-brand">
              <span className="restaurant-portal-mark">T</span>
              <span>طلبات</span>
            </Link>
            <span className="restaurant-portal-caption">لوحة المطعم</span>
          </header>
          <main className="restaurant-login-layout">
            <section className="restaurant-login-intro">
              <div className="restaurant-login-icon">
                <Store size={25} />
              </div>
              <span className="restaurant-kicker">مساحة مخصصة للمطاعم</span>
              <h1>
                أدر طلبات
                <br />
                مطعمك بسهولة.
              </h1>
              <p>تابع الطلبات والفواتير وبيانات حساب مطعمك من مكان واحد.</p>
            </section>
            <form className="restaurant-login-card" onSubmit={submitLogin}>
              <h2>تسجيل دخول المطعم</h2>
              <p>
                أدخل الرقم التسلسلي المكوّن من ستة أرقام الذي زوّدك به المشرف.
              </p>
              <label htmlFor="restaurant-serial">الرقم التسلسلي</label>
              <input
                id="restaurant-serial"
                value={serialNumber}
                onChange={(event) =>
                  setSerialNumber(
                    normalizeDigits(event.target.value)
                      .replace(/\D/g, "")
                      .slice(0, 6),
                  )
                }
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                pattern="[0-9]{6}"
                dir="ltr"
                placeholder="000000"
                required
                data-testid="input-restaurant-serial"
              />
              {loginError && (
                <div
                  className="restaurant-portal-error"
                  role="alert"
                  data-testid="status-restaurant-login-error"
                >
                  {loginError}
                </div>
              )}
              <button
                className="restaurant-primary-button"
                type="submit"
                disabled={loggingIn || serialNumber.length !== 6}
                data-testid="button-restaurant-login"
              >
                {loggingIn ? "جارٍ التحقق..." : "دخول لوحة المطعم"}
              </button>
              <Link href="/" className="restaurant-back-link">
                العودة إلى المتجر
              </Link>
            </form>
          </main>
        </div>
      </div>
    );

  const scopedOrders = (portal?.orders || []).filter((order) => {
    if (filter === "active") return !order.isArchived;
    if (filter === "archived") return !!order.isArchived;
    return true;
  });
  const searchTerm = normalizeSearch(search);
  const matchesStatus = (order: Order, selected: StatusFilter) => {
    if (selected === "all") return true;
    return (
      statusGroups
        .find((group) => group.value === selected)
        ?.statuses.includes(order.status.toUpperCase()) || false
    );
  };
  const displayedOrders = scopedOrders.filter((order) => {
    const haystack = normalizeSearch(
      [
        order.id,
        order.orderNumber,
        order.invoiceNumber,
        order.customerName,
        order.customerPhone,
      ]
        .filter((value) => value != null)
        .join(" "),
    );
    const orderDate = new Date(order.createdAt);
    const dateKey = Number.isNaN(orderDate.getTime())
      ? ""
      : [
          orderDate.getFullYear(),
          String(orderDate.getMonth() + 1).padStart(2, "0"),
          String(orderDate.getDate()).padStart(2, "0"),
        ].join("-");
    return (
      matchesStatus(order, statusFilter) &&
      (!searchTerm || haystack.includes(searchTerm)) &&
      (!dateFrom || (dateKey && dateKey >= dateFrom)) &&
      (!dateTo || (dateKey && dateKey <= dateTo))
    );
  });
  const clearFilters = () => {
    setSearch("");
    setDateFrom("");
    setDateTo("");
    setStatusFilter("all");
  };

  return (
    <div className="restaurant-portal" dir="rtl">
      <header className="restaurant-dashboard-top">
        <div className="restaurant-dashboard-nav">
          <Link href="/" className="restaurant-portal-brand">
            <span className="restaurant-portal-mark">T</span>
            <span>طلبات</span>
          </Link>
          <div className="restaurant-nav-account">
            <div>
              <strong>
                {portal?.restaurant.name || session.restaurant.name}
              </strong>
              <small>حساب المطعم · #{session.restaurant.id}</small>
            </div>
            <button
              type="button"
              className="restaurant-logout-button"
              onClick={() => void logout()}
              data-testid="button-restaurant-logout"
            >
              <LogOut size={16} />
              <span>تسجيل الخروج</span>
            </button>
          </div>
        </div>
        <div className="restaurant-dashboard-heading">
          <span className="restaurant-kicker">لوحة التحكم</span>
          <h1>مرحباً، {portal?.restaurant.name || session.restaurant.name}</h1>
          <p>هذه المساحة تعرض بيانات مطعمك فقط.</p>
        </div>
      </header>
      <main className="restaurant-dashboard-main">
        <section className="restaurant-profile-card">
          <div className="restaurant-profile-icon">
            <Store size={20} />
          </div>
          <div>
            <strong>بيانات المطعم</strong>
            <span>
              {portal?.restaurant.phone ||
                session.restaurant.phone ||
                "لا يوجد هاتف مسجل"}
            </span>
            <span>
              {portal?.restaurant.address ||
                session.restaurant.address ||
                "لا يوجد عنوان مسجل"}
            </span>
          </div>
        </section>
        <section
          className="restaurant-audio-settings"
          aria-label="إعدادات التنبيه الصوتي"
        >
          <div>
            <strong>تنبيهات الطلبات الصوتية</strong>
            <small>
              فعّل الصوت الآن للسماح برنين الطلبات التي تنتظر قرار المطعم.
              يلزم إبقاء لوحة المطعم مفتوحة.
            </small>
          </div>
          {audioEnabled ? (
            <span data-testid="restaurant-alert-audio-enabled">الصوت مفعل</span>
          ) : (
            <button
              type="button"
              onClick={() => void enableAudio()}
              data-testid="button-enable-restaurant-alert-audio"
            >
              تفعيل صوت التنبيه
            </button>
          )}
          {audioError && <small role="alert">{audioError}</small>}
        </section>
        {hasActionableOrders && (
          <section
            className="restaurant-pending-alert"
            role="status"
            aria-live="polite"
            data-testid="restaurant-pending-order-alert"
          >
            <div className="restaurant-pending-alert-icon">
              <BellRing size={20} />
            </div>
            <div className="restaurant-pending-alert-content">
              <strong>
                {actionableOrders.length === 1
                  ? "طلب واحد ينتظر قرار المطعم"
                  : `${actionableOrders.length} طلبات تنتظر قرار المطعم`}
              </strong>
              <ul>
                {actionableOrders.map((order) => (
                  <li key={order.id}>
                    <span>
                      طلب #{order.id} · {order.customerName} ·{" "}
                      {dateLabel(order.createdAt)}
                      <small>
                        قرار السائق: {driverApprovalLabel(
                          order.driverApprovalStatus || order.assignmentStatus || undefined,
                        )} · {driverEmailLabel(order.currentDriverEmailStatus)}
                      </small>
                    </span>
                    <button
                      type="button"
                      className="restaurant-fallback-ack"
                      onClick={() => setSelectedOrder(order)}
                      aria-label={`فتح فاتورة الطلب ${order.id}`}
                      data-testid={`button-open-pending-order-${order.id}`}
                    >
                      فتح الفاتورة
                    </button>
                  </li>
                ))}
              </ul>
              <small>
                اقبل الطلب أو أجّله أو ارفضه. ستظهر تفاصيل الأصناف والموقع
                والفاتورة في كل طلب.
              </small>
            </div>
          </section>
        )}
        {!isConnected && (
          <div
            className="restaurant-connection-notice"
            role="status"
            data-testid="restaurant-connection-notice"
          >
            انقطع الاتصال بالخادم. سيُعاد تحميل حالات الطلبات من PostgreSQL عند
            عودة الاتصال.
          </div>
        )}
        <section className="restaurant-metrics" aria-label="ملخص المطعم">
          <article>
            <span>إجمالي الطلبات</span>
            <strong>{portal?.summary.totalOrders ?? "—"}</strong>
            <small>كل الطلبات المسجلة</small>
          </article>
          <article>
            <span>الطلبات المؤكدة</span>
            <strong>{portal?.summary.confirmedOrders ?? "—"}</strong>
            <small>مؤكدة من السائق</small>
          </article>
          <article>
            <span>الطلبات المكتملة</span>
            <strong>{portal?.summary.completedOrders ?? "—"}</strong>
            <small>مكتملة أو تم توصيلها</small>
          </article>
          <article>
            <span>الطلبات الملغاة</span>
            <strong>{portal?.summary.cancelledOrders ?? "—"}</strong>
            <small>حسب سجل الطلبات</small>
          </article>
          <article>
            <span>طلبات رُفضت من سائق</span>
            <strong>{portal?.summary.rejectedOrders ?? "—"}</strong>
            <small>يُحتسب الطلب مرة واحدة</small>
          </article>
          <article>
            <span>إجمالي قيمة الطلبات</span>
            <strong>
              {portal ? money(portal.summary.totalOrderValue) : "—"}{" "}
              <small>{portal && CURRENCY}</small>
            </strong>
            <small>تشمل الطلبات الملغاة</small>
          </article>
          <article>
            <span>قيمة الطلبات المكتملة</span>
            <strong>
              {portal ? money(portal.summary.completedOrderValue) : "—"}{" "}
              <small>{portal && CURRENCY}</small>
            </strong>
            <small>من الطلبات المكتملة فقط</small>
          </article>
          <article>
            <span>رسوم التوصيل المسجلة</span>
            <strong>
              {portal ? money(portal.summary.deliveryFees) : "—"}{" "}
              <small>{portal && CURRENCY}</small>
            </strong>
            <small>كما حُفظت في الفواتير</small>
          </article>
          <article>
            <span>الطلبات النشطة / المؤرشفة</span>
            <strong>
              {portal
                ? `${portal.summary.activeOrders} / ${portal.summary.archivedOrders}`
                : "—"}
            </strong>
            <small>كل الطلبات غير مؤرشفة / المؤرشفة</small>
          </article>
        </section>
        <section
          className="restaurant-reports-section"
          aria-labelledby="restaurant-reports-title"
        >
          <div className="restaurant-orders-heading">
            <div>
              <h2 id="restaurant-reports-title">
                <ChartNoAxesCombined size={20} /> التقارير حسب الفترة
              </h2>
              <p>ملخص مباشر من الطلبات المسجلة في قاعدة البيانات.</p>
            </div>
          </div>
          <div
            className="restaurant-report-tabs"
            role="tablist"
            aria-label="فترة التقرير"
          >
            {reportPeriods.map((period) => (
              <button
                key={period.value}
                type="button"
                role="tab"
                aria-selected={reportPeriod === period.value}
                className={reportPeriod === period.value ? "is-active" : ""}
                onClick={() => setReportPeriod(period.value)}
              >
                {period.label}
              </button>
            ))}
          </div>
          <div className="restaurant-report-table-wrap">
            <table className="restaurant-report-table">
              <thead>
                <tr>
                  <th>
                    {reportPeriod === "weekly" ? "بداية الأسبوع" : "الفترة"}
                  </th>
                  <th>الطلبات</th>
                  <th>المؤكدة</th>
                  <th>المكتملة</th>
                  <th>الملغاة</th>
                  <th>المرفوضة من سائق</th>
                  <th>قيمة الطلبات</th>
                  <th>قيمة المكتمل</th>
                  <th>التوصيل</th>
                </tr>
              </thead>
              <tbody>
                {(portal?.reports[reportPeriod] || []).map((row) => (
                  <tr key={row.period}>
                    <td dir="ltr">{row.period}</td>
                    <td>{row.orders}</td>
                    <td>{row.confirmedOrders}</td>
                    <td>{row.completedOrders}</td>
                    <td>{row.cancelledOrders}</td>
                    <td>{row.rejectedOrders}</td>
                    <td>
                      {money(row.orderValue)} {CURRENCY}
                    </td>
                    <td>
                      {money(row.completedValue)} {CURRENCY}
                    </td>
                    <td>
                      {money(row.deliveryFees)} {CURRENCY}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {portal && !portal.reports[reportPeriod].length && (
              <div className="restaurant-report-empty">
                لا توجد طلبات مسجلة في هذه الفترات.
              </div>
            )}
          </div>
        </section>
        <section
          className="restaurant-accounting-notice"
          aria-label="حالة التسويات المالية"
        >
          <div className="restaurant-profile-icon">
            <CircleDollarSign size={20} />
          </div>
          <div>
            <strong>المستحقات والمدفوعات</strong>
            {portal?.accounting.settlementTrackingAvailable ? (
              <p>
                المستحق: {money(portal.accounting.amountDue)} {CURRENCY} ·
                المسدد: {money(portal.accounting.amountPaid)} {CURRENCY}
              </p>
            ) : (
              <p>
                قاعدة بيانات المشروع لا تحتوي حالياً على سجل لتسويات المطاعم أو
                الدفعات؛ لذلك لا يمكن تأكيد مبلغ مستحق أو مسدد. الفواتير
                المعروضة أدناه هي سجلات الطلبات الفعلية فقط.
              </p>
            )}
          </div>
        </section>
        <section className="restaurant-orders-section">
          <div className="restaurant-orders-heading">
            <div>
              <h2>
                <ClipboardList size={20} /> سجل الفواتير والطلبات
              </h2>
              <p>
                فواتير الطلبات المحفوظة لهذا المطعم، مع إمكانية فتح تفاصيل كل
                فاتورة.
              </p>
            </div>
            <button
              className="restaurant-refresh-button"
              type="button"
              disabled={loading}
              onClick={() => {
                setRefreshing(true);
                void loadPortal();
              }}
              data-testid="button-restaurant-refresh"
            >
              <RefreshCw size={15} />
              {refreshing ? "جارٍ التحديث..." : "تحديث"}
            </button>
          </div>
          <div
            className="restaurant-archive-tabs"
            role="tablist"
            aria-label="نطاق الأرشيف"
          >
            {(
              [
                ["active", "النشطة"],
                ["archived", "الأرشيف"],
                ["all", "الكل"],
              ] as const
            ).map(([value, label]) => (
              <button
                type="button"
                role="tab"
                aria-selected={filter === value}
                className={filter === value ? "is-active" : ""}
                key={value}
                onClick={() => setFilter(value)}
                data-testid={`tab-restaurant-${value}`}
              >
                {label}
              </button>
            ))}
          </div>
          <div className="restaurant-order-tools">
            <label className="restaurant-search-field">
              <Search size={17} aria-hidden="true" />
              <span className="sr-only">
                البحث برقم الطلب أو اسم العميل أو الهاتف
              </span>
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="ابحث برقم الطلب، العميل أو الهاتف"
                aria-label="البحث برقم الطلب أو اسم العميل أو الهاتف"
                data-testid="input-restaurant-order-search"
              />
            </label>
            <div className="restaurant-date-filters">
              <label>
                <CalendarDays size={15} aria-hidden="true" />
                <span>من</span>
                <input
                  type="date"
                  value={dateFrom}
                  onChange={(event) => setDateFrom(event.target.value)}
                  aria-label="تاريخ الطلب من"
                  data-testid="input-restaurant-date-from"
                />
              </label>
              <label>
                <span>إلى</span>
                <input
                  type="date"
                  value={dateTo}
                  onChange={(event) => setDateTo(event.target.value)}
                  aria-label="تاريخ الطلب إلى"
                  data-testid="input-restaurant-date-to"
                />
              </label>
            </div>
            {(search || dateFrom || dateTo || statusFilter !== "all") && (
              <button
                type="button"
                className="restaurant-clear-filters"
                onClick={clearFilters}
                data-testid="button-restaurant-clear-filters"
              >
                <X size={14} />
                مسح الفلاتر
              </button>
            )}
          </div>
          <div
            className="restaurant-status-tabs"
            role="tablist"
            aria-label="تصنيف الفواتير"
          >
            {statusGroups.map((group) => (
              <button
                type="button"
                role="tab"
                aria-selected={statusFilter === group.value}
                className={statusFilter === group.value ? "is-active" : ""}
                key={group.value}
                onClick={() => setStatusFilter(group.value)}
                data-testid={`tab-restaurant-status-${group.value}`}
              >
                <span>{group.label}</span>
                <small>
                  {
                    scopedOrders.filter((order) =>
                      matchesStatus(order, group.value),
                    ).length
                  }
                </small>
              </button>
            ))}
          </div>
          {portalError && (
            <div className="restaurant-portal-error" role="alert">
              {portalError}
              <button type="button" onClick={() => void loadPortal()}>
                إعادة المحاولة
              </button>
            </div>
          )}
          {loading && !portal ? (
            <div className="restaurant-orders-empty" role="status">
              جارٍ تحميل الطلبات...
            </div>
          ) : displayedOrders.length ? (
            <div
              className="restaurant-order-list"
              aria-live="polite"
              data-testid="list-restaurant-orders"
            >
              {displayedOrders.map((order) => (
                <article
                  className="restaurant-order-card"
                  key={order.id}
                  data-testid={`card-restaurant-order-${order.id}`}
                >
                  <div className="restaurant-order-card-head">
                    <div>
                      <strong>
                        طلب <span dir="ltr">#{order.id}</span>
                      </strong>
                      <small
                        dir="ltr"
                        style={{
                          display: "block",
                          marginTop: 4,
                          color: "var(--rp-soft)",
                          fontWeight: 700,
                        }}
                      >
                        {order.invoiceNumber}
                      </small>
                      <time>{dateLabel(order.createdAt)}</time>
                    </div>
                    <div className="restaurant-order-status-group">
                      <span
                        className={`restaurant-order-status status-${order.status.toLowerCase()}`}
                      >
                        {statusLabel(order.status)}
                      </span>
                      <small
                        className="restaurant-driver-decision"
                        data-testid={`text-restaurant-driver-decision-${order.id}`}
                      >
                        قرار السائق:{" "}
                        {driverApprovalLabel(
                          order.driverApprovalStatus ||
                            order.assignmentStatus ||
                            undefined,
                        )}
                      </small>
                      <small
                        className="restaurant-driver-decision"
                        data-testid={`text-restaurant-order-decision-${order.id}`}
                      >
                        قرار المطعم: {restaurantDecisionLabel(order)}
                      </small>
                      <small
                        className="restaurant-driver-decision"
                        data-testid={`text-restaurant-email-status-${order.id}`}
                      >
                        البريد: {driverEmailLabel(order.currentDriverEmailStatus)}
                      </small>
                      <small
                        className="restaurant-driver-decision"
                        data-testid={`text-restaurant-forward-status-${order.id}`}
                      >
                        التوجيه: {order.lastForwardedAt &&
                        (!order.currentDriverAssignedAt ||
                          new Date(order.currentDriverAssignedAt).getTime() <=
                            new Date(order.lastForwardedAt).getTime())
                          ? `طُلب توجيهه إلى سائق آخر · بانتظار التأكيد (${dateLabel(order.lastForwardedAt)})`
                          : order.currentDriverName
                            ? `تم توجيهه إلى ${order.currentDriverName}`
                            : order.status === "NOT_ASSIGNED"
                              ? "لم يُعيّن سائق بعد"
                              : "بانتظار تعيين سائق"}
                      </small>
                      {order.currentDriverName && (
                        <small className="restaurant-driver-decision">
                          السائق الحالي: {order.currentDriverName}
                        </small>
                      )}
                      {order.status === "NOT_ASSIGNED" && (
                        <div
                          className="restaurant-fallback-card-alert"
                          role="alert"
                          data-testid={`text-restaurant-driver-fallback-${order.id}`}
                        >
                          <BellRing size={16} aria-hidden="true" />
                          <div>
                            <strong>وصل الطلب إلى المطعم</strong>
                            <span>
                              {order.driverAttempts?.length
                                ? "تعذّر الإسناد بعد مراجعة محاولات السائقين:"
                                : "لم يتوفر سائق مؤهل لقبول الطلب."}
                            </span>
                            {!!order.driverAttempts?.length && (
                              <ul>
                                {order.driverAttempts.map((attempt, index) => (
                                  <li key={`${attempt.driverId}-${index}`}>
                                    {attempt.driverName ||
                                      `السائق #${attempt.driverId}`}
                                    {" — "}
                                    {driverAttemptOutcomeLabel(attempt.status)}
                                    {attempt.emailStatus
                                      ? ` · ${driverEmailLabel(attempt.emailStatus)}`
                                      : ""}
                                  </li>
                                ))}
                              </ul>
                            )}
                            {order.mapsUrl && (
                              <a
                                href={order.mapsUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                data-testid={`link-fallback-order-map-${order.id}`}
                              >
                                فتح موقع العميل على الخريطة
                              </a>
                            )}
                          </div>
                        </div>
                      )}
                      {order.status === "CANCELLED" && (
                        <small
                          className="restaurant-cancellation-details"
                          data-testid={`text-restaurant-cancellation-${order.id}`}
                        >
                          {order.cancellationReason
                            ? `السبب: ${order.cancellationReason}`
                            : "لم يُسجّل سبب الإلغاء"}
                          {order.cancelledAt
                            ? ` · ${dateLabel(order.cancelledAt)}`
                            : ""}
                        </small>
                      )}
                    </div>
                  </div>
                  <p className="restaurant-order-items">
                    {order.orderType === "RESERVATION" ? "حجز" : "توصيل"} ·{" "}
                    {order.itemsSummary ||
                      order.items
                        .map(
                          (item) =>
                            `${item.quantity} × ${item.productName || "صنف"}`,
                        )
                        .join("، ") ||
                      "لا توجد أصناف"}
                  </p>
                  {order.notes && (
                    <p className="restaurant-order-note">
                      <strong>ملاحظة العميل:</strong> {order.notes}
                    </p>
                  )}
                  {order.mapsUrl && (
                    <a
                      className="restaurant-order-map-link"
                      href={order.mapsUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      data-testid={`link-restaurant-order-map-${order.id}`}
                    >
                      فتح موقع العميل على الخريطة
                    </a>
                  )}
                  <div className="restaurant-order-card-foot">
                    <div>
                      <span>العميل: {order.customerName}</span>
                      <span dir="ltr">{order.customerPhone}</span>
                    </div>
                    <strong>
                      {money(order.totalAmount)} {CURRENCY}
                    </strong>
                    <button
                      type="button"
                      className="restaurant-invoice-button"
                      onClick={() => setSelectedOrder(order)}
                      data-testid={`button-restaurant-invoice-${order.id}`}
                    >
                      <Receipt size={15} />
                      عرض الفاتورة
                    </button>
                  </div>
                  <div className="restaurant-order-actions">
                    {canRestaurantDecide(order) && (
                      <>
                        <button
                          type="button"
                          className="restaurant-order-action accept"
                          onClick={() => void runOrderAction(order, "ACCEPTED")}
                          disabled={busyOrderIds.has(order.id)}
                          data-testid={`button-restaurant-accept-${order.id}`}
                        >
                          قبول الطلب
                        </button>
                        <button
                          type="button"
                          className="restaurant-order-action defer"
                          onClick={() => void runOrderAction(order, "DEFERRED")}
                          disabled={busyOrderIds.has(order.id)}
                          data-testid={`button-restaurant-defer-${order.id}`}
                        >
                          تأجيل 15 دقيقة
                        </button>
                        <button
                          type="button"
                          className="restaurant-order-action reject"
                          onClick={() => void runOrderAction(order, "REJECTED")}
                          disabled={busyOrderIds.has(order.id)}
                          data-testid={`button-restaurant-reject-${order.id}`}
                        >
                          رفض الطلب
                        </button>
                      </>
                    )}
                    {order.orderType === "DELIVERY" &&
                      !["CONFIRMED", "ACCEPTED", "COMPLETED", "DELIVERED", "CANCELLED"].includes(order.status.toUpperCase()) &&
                      order.driverId == null && (
                        <button
                          type="button"
                          className="restaurant-order-action forward"
                          onClick={() => void runOrderAction(order, "FORWARD")}
                          disabled={busyOrderIds.has(order.id)}
                          data-testid={`button-restaurant-forward-${order.id}`}
                        >
                          توجيه لسائق آخر الآن
                        </button>
                      )}
                    {busyOrderIds.has(order.id) && (
                      <span role="status">جارٍ تحديث الطلب...</span>
                    )}
                  </div>
                </article>
              ))}
            </div>
          ) : (
            !portalError && (
              <div
                className="restaurant-orders-empty"
                data-testid="empty-restaurant-orders"
              >
                <ClipboardList size={26} />
                <strong>لا توجد فواتير تطابق الاختيار</strong>
                <span>
                  {search || dateFrom || dateTo || statusFilter !== "all"
                    ? "جرّب تعديل البحث أو نطاق التاريخ أو تصنيف الحالة."
                    : "ستظهر الفواتير الجديدة هنا تلقائياً بعد وصول الطلب."}
                </span>
              </div>
            )
          )}
        </section>
      </main>
      <InvoiceDialog
        open={!!selectedOrder}
        onClose={() => setSelectedOrder(null)}
        order={selectedOrder}
      />
    </div>
  );
}
