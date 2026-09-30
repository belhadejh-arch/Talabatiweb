import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useForm } from 'react-hook-form';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Form } from '@/components/ui/form';
import { AlertCircle, Inbox, Upload, Trash2, Printer, Receipt } from 'lucide-react';
import { CURRENCY, money, dateLabel, type Order } from '../lib/api';

export type Write = <T>(path: string, method: string, body?: unknown) => Promise<T>;
export type Field = { key: string; label: string; type?: 'text' | 'number' | 'tel' | 'email' | 'password' | 'date' | 'textarea' | 'select' | 'checkbox' | 'image-upload'; required?: boolean; options?: { value: string; label: string }[]; min?: number; step?: string; minLength?: number };

export function EntityDialog({ open, onClose, title, description, fields, initial = {}, onSave, testId }: { open: boolean; onClose: () => void; title: string; description?: string; fields: Field[]; initial?: Record<string, unknown>; onSave: (values: Record<string, string | boolean>) => Promise<void>; testId: string }) {
  const form = useForm<Record<string, string | boolean>>({ defaultValues: {} });
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const fileInputRefs = useRef<Record<string, HTMLInputElement | null>>({});

  useEffect(() => {
    if (open) {
      form.reset(Object.fromEntries(fields.map(f => [f.key, f.type === 'checkbox' ? Boolean(initial[f.key]) : String(initial[f.key] ?? '')])));
      setError('');
    }
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const submit = form.handleSubmit(async values => {
    setSaving(true); setError('');
    try { await onSave(values); onClose(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'تعذّر حفظ التغييرات.'); }
    finally { setSaving(false); }
  }, () => setError('راجع الحقول المحددة أدناه وصحّحها قبل الحفظ.'));

  const rules = (field: Field) => ({
    required: field.required ? `${field.label} حقل مطلوب` : false,
    minLength: field.minLength ? { value: field.minLength, message: `${field.label} يجب أن يتكون من ${field.minLength} حرفاً على الأقل` } : undefined,
    min: field.min != null ? { value: field.min, message: `${field.label} يجب ألا يقل عن ${field.min}` } : undefined,
    validate: (value: string | boolean) => field.required && typeof value === 'string' && !value.trim() ? `${field.label} لا يمكن أن يكون فارغاً` : true,
  });

  return <Dialog open={open} onOpenChange={v => { if (!v && !saving) onClose(); }}><DialogContent className="admin-dialog-content max-h-[90vh] overflow-y-auto" data-testid={`dialog-${testId}`}><DialogHeader><DialogTitle>{title}</DialogTitle>{description && <DialogDescription>{description}</DialogDescription>}</DialogHeader><Form {...form}><form onSubmit={submit} className="admin-form mt-4" noValidate><div className="admin-form-grid">
    {fields.map(field => {
      if (field.type === 'image-upload') {
        const currentVal = String(form.watch(field.key) || '');
        return <div key={field.key} style={{ gridColumn: '1/-1' }} className="flex flex-col gap-2">
          <span className="font-medium text-sm">{field.label}</span>
          <div className="flex items-center gap-4 p-3 border-2 border-dashed border-border rounded-xl bg-card">
            {currentVal ? (
              <div className="relative group">
                <img src={currentVal} alt="معاينة الصورة" className="w-20 h-20 object-cover rounded-lg border border-border" />
                <button type="button" onClick={() => form.setValue(field.key, '')} className="absolute -top-2 -left-2 bg-destructive text-white p-1 rounded-full shadow hover:opacity-90" title="إزالة الصورة">
                  <Trash2 size={13} />
                </button>
              </div>
            ) : (
              <div className="w-20 h-20 bg-muted/60 rounded-lg flex items-center justify-center text-muted-foreground border border-border">
                <Upload size={24} />
              </div>
            )}
            <div className="flex-1 min-w-0">
              <input
                ref={el => { fileInputRefs.current[field.key] = el; }}
                type="file"
                accept="image/*"
                className="hidden"
                id={`file-input-${field.key}`}
                onChange={e => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  if (file.size > 8 * 1024 * 1024) {
                    setError('حجم الصورة كبير جداً، يرجى اختيار صورة أصغر من 8 ميغابايت.');
                    return;
                  }
                  const reader = new FileReader();
                  reader.onload = ev => {
                    const dataUrl = ev.target?.result as string;
                    if (dataUrl) form.setValue(field.key, dataUrl);
                  };
                  reader.readAsDataURL(file);
                }}
              />
              <button
                type="button"
                className="btn btn-outline text-xs px-3 py-1.5 flex items-center gap-1.5"
                onClick={() => fileInputRefs.current[field.key]?.click()}
                data-testid={`button-upload-${field.key}`}
              >
                <Upload size={14} />
                <span>{currentVal ? 'تغيير الصورة من الجهاز' : 'رفع صورة من الجهاز'}</span>
              </button>
              <p className="text-xs text-muted-foreground mt-1">يدعم ملفات JPG و PNG و WebP (رفع مباشر من جهازك)</p>
            </div>
          </div>
        </div>;
      }
      return <label key={field.key} style={field.type === 'textarea' ? { gridColumn: '1/-1' } : undefined}>
        {field.label}
        {field.type === 'select' ? <select className="admin-input" {...form.register(field.key, rules(field))} required={field.required} aria-invalid={!!form.formState.errors[field.key]} aria-describedby={form.formState.errors[field.key] ? `error-${testId}-${field.key}` : undefined} data-testid={`input-${testId}-${field.key}`}><option value="">اختر...</option>{field.options?.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}</select> : field.type === 'textarea' ? <textarea className="admin-input" {...form.register(field.key, rules(field))} required={field.required} aria-invalid={!!form.formState.errors[field.key]} data-testid={`input-${testId}-${field.key}`}/> : field.type === 'checkbox' ? <input type="checkbox" {...form.register(field.key)} data-testid={`input-${testId}-${field.key}`}/> : <input className="admin-input" type={field.type || 'text'} min={field.min} step={field.step} minLength={field.minLength} required={field.required} aria-invalid={!!form.formState.errors[field.key]} aria-describedby={form.formState.errors[field.key] ? `error-${testId}-${field.key}` : undefined} {...form.register(field.key, rules(field))} data-testid={`input-${testId}-${field.key}`}/ >}
        {form.formState.errors[field.key] && <span id={`error-${testId}-${field.key}`} className="text-xs text-rose-700" role="alert">{String(form.formState.errors[field.key]?.message || 'تحقق من القيمة المدخلة')}</span>}
      </label>;
    })}
  </div>{error && <div className="admin-flash error" role="alert" data-testid={`error-${testId}`}>{error}</div>}<div className="admin-dialog-footer"><button className="admin-action" type="button" onClick={onClose} data-testid={`button-cancel-${testId}`}>تراجع</button><button className="admin-action primary" type="submit" disabled={saving} data-testid={`button-save-${testId}`}>{saving ? 'جارٍ الحفظ...' : 'حفظ التغييرات'}</button></div></form></Form></DialogContent></Dialog>;
}

export function ConfirmDialog({ open, onClose, title, description, action, onConfirm, testId }: { open: boolean; onClose: () => void; title: string; description: string; action: string; onConfirm: () => Promise<void>; testId: string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  return <Dialog open={open} onOpenChange={v => { if (!v && !busy) { onClose(); setError(''); } }}><DialogContent className="admin-dialog-content" data-testid={`dialog-confirm-${testId}`}><DialogHeader><DialogTitle>{title}</DialogTitle><DialogDescription>{description}</DialogDescription></DialogHeader>{error && <div className="admin-flash error" role="alert">{error}</div>}<div className="admin-dialog-footer"><button className="admin-action" onClick={onClose} disabled={busy} data-testid={`button-dismiss-${testId}`}>تراجع</button><button className="admin-action danger" disabled={busy} data-testid={`button-confirm-${testId}`} onClick={async () => { setBusy(true); setError(''); try { await onConfirm(); onClose(); } catch (e) { setError(e instanceof Error ? e.message : 'تعذّر تنفيذ العملية.'); } finally { setBusy(false); } }}>{busy ? 'جارٍ التنفيذ...' : action}</button></div></DialogContent></Dialog>;
}

export function InvoiceDialog({ open, onClose, order, restaurantSummary }: { open: boolean; onClose: () => void; order?: Order | null; restaurantSummary?: { restaurantName: string; date: string; ordersCount: number; totalRevenue: number; deliveryFees: number; orders: Order[] } | null }) {
  if (!open) return null;
  const handlePrint = () => {
    window.print();
  };

  return <Dialog open={open} onOpenChange={v => { if (!v) onClose(); }}>
    <DialogContent className="admin-dialog-content max-w-2xl max-h-[90vh] overflow-y-auto print:p-0 print:border-none print:shadow-none" data-testid="dialog-invoice">
      <DialogHeader className="flex flex-row items-center justify-between border-b pb-3">
        <DialogTitle className="flex items-center gap-2">
          <Receipt size={20} className="text-primary"/>
          <span>{restaurantSummary ? `فاتورة مداخيل مطعم: ${restaurantSummary.restaurantName}` : `فاتورة طلب #${order?.id}`}</span>
        </DialogTitle>
        <button type="button" onClick={handlePrint} className="admin-action primary text-xs flex items-center gap-1.5 px-3 py-1 print:hidden" data-testid="button-print-invoice">
          <Printer size={15}/>
          <span>طباعة الفاتورة</span>
        </button>
      </DialogHeader>

      {restaurantSummary ? (
        <div className="p-4 space-y-4 text-right" dir="rtl">
          <div className="flex justify-between items-start border-b pb-4">
            <div>
              <h2 className="text-xl font-bold">{restaurantSummary.restaurantName}</h2>
              <p className="text-xs text-muted-foreground mt-1">كشف المداخيل اليومية · {restaurantSummary.date}</p>
            </div>
            <div className="text-left" dir="ltr">
              <span className="text-xs text-muted-foreground block">تاريخ الاستخراج</span>
              <span className="text-sm font-semibold">{new Intl.DateTimeFormat('ar', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date())}</span>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3 p-3 bg-muted/40 rounded-xl text-center">
            <div>
              <span className="text-xs text-muted-foreground block">عدد الطلبات اليوم</span>
              <strong className="text-lg font-bold">{restaurantSummary.ordersCount}</strong>
            </div>
            <div>
              <span className="text-xs text-muted-foreground block">إجمالي رسوم التوصيل</span>
              <strong className="text-lg font-bold">{money(restaurantSummary.deliveryFees)} {CURRENCY}</strong>
            </div>
            <div>
              <span className="text-xs text-muted-foreground block">المداخيل اليومية الإجمالية</span>
              <strong className="text-lg font-bold text-primary">{money(restaurantSummary.totalRevenue)} {CURRENCY}</strong>
            </div>
          </div>

          <table className="w-full text-sm border-collapse mt-4">
            <thead>
              <tr className="border-b text-muted-foreground text-xs">
                <th className="py-2 text-right">رقم الطلب</th>
                <th className="py-2 text-right">العميل</th>
                <th className="py-2 text-right">النوع</th>
                <th className="py-2 text-right">الوقت</th>
                <th className="py-2 text-left" dir="ltr">الإجمالي</th>
              </tr>
            </thead>
            <tbody>
              {restaurantSummary.orders.map(o => (
                <tr key={o.id} className="border-b border-border/50 text-xs">
                  <td className="py-2 font-bold" dir="ltr">#{o.id}</td>
                  <td className="py-2">{o.customerName}</td>
                  <td className="py-2">{o.orderType === 'DELIVERY' ? 'توصيل' : 'حجز'}</td>
                  <td className="py-2 text-muted-foreground">{dateLabel(o.createdAt)}</td>
                  <td className="py-2 font-bold text-left" dir="ltr">{money(o.totalAmount)} {CURRENCY}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : order ? (
        <div className="p-4 space-y-4 text-right" dir="rtl">
          <div className="flex justify-between items-start border-b pb-4">
            <div>
              <h2 className="text-xl font-extrabold">{order.restaurantName || 'مطعم طلبات'}</h2>
              <p className="text-xs text-muted-foreground mt-0.5">فاتورة ضريبية / إيصال طلب رسمي</p>
            </div>
            <div className="text-left" dir="ltr">
              <span className="font-bold text-base block">#{order.id}</span>
              <span className="text-xs text-muted-foreground">{dateLabel(order.createdAt)}</span>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 p-3 bg-muted/40 rounded-xl text-xs">
            <div>
              <span className="text-muted-foreground block">بيانات العميل:</span>
              <strong className="text-sm block">{order.customerName}</strong>
              <span dir="ltr" className="text-muted-foreground">{order.customerPhone}</span>
            </div>
            <div>
              <span className="text-muted-foreground block">نوع الطلب والحالة:</span>
              <strong className="text-sm block">{order.orderType === 'DELIVERY' ? 'توصيل طلب' : 'حجز طاولة'}</strong>
              <span className="text-primary font-medium">{order.status}</span>
            </div>
          </div>

          <div className="mt-4">
            <h4 className="font-bold text-xs mb-2 text-muted-foreground">تفاصيل الأصناف</h4>
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr className="border-b text-muted-foreground">
                  <th className="py-2 text-right">الصنف</th>
                  <th className="py-2 text-center">الكمية</th>
                  <th className="py-2 text-center">السعر</th>
                  <th className="py-2 text-left" dir="ltr">المجموع</th>
                </tr>
              </thead>
              <tbody>
                {order.items?.length ? order.items.map((item, idx) => (
                  <tr key={idx} className="border-b border-border/50">
                    <td className="py-2 font-medium">{item.productName || `منتج #${item.productId}`}</td>
                    <td className="py-2 text-center">{item.quantity}</td>
                    <td className="py-2 text-center">{money(item.unitPrice)} {CURRENCY}</td>
                    <td className="py-2 text-left font-bold" dir="ltr">{money((item.unitPrice || 0) * item.quantity)} {CURRENCY}</td>
                  </tr>
                )) : (
                  <tr className="border-b border-border/50">
                    <td className="py-2" colSpan={3}>{order.itemsSummary || 'طلب وجبات'}</td>
                    <td className="py-2 text-left font-bold" dir="ltr">{money(order.subtotal || order.totalAmount)} {CURRENCY}</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="space-y-1.5 pt-3 border-t text-xs">
            <div className="flex justify-between">
              <span className="text-muted-foreground">المجموع الفرعي:</span>
              <span className="font-semibold">{money(order.subtotal || (order.totalAmount - (order.deliveryFee || 0)))} {CURRENCY}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">رسوم التوصيل:</span>
              <span className="font-semibold">{money(order.deliveryFee)} {CURRENCY}</span>
            </div>
            <div className="flex justify-between text-base font-extrabold pt-2 border-t text-primary">
              <span>المجموع الكلي:</span>
              <span>{money(order.totalAmount)} {CURRENCY}</span>
            </div>
          </div>

          {order.notes && (
            <div className="p-2.5 bg-muted/30 rounded-lg text-xs mt-3">
              <strong className="block mb-0.5">ملاحظات الطلب:</strong>
              <p className="text-muted-foreground">{order.notes}</p>
            </div>
          )}
        </div>
      ) : null}

      <div className="flex justify-end pt-3 border-t print:hidden">
        <button type="button" onClick={onClose} className="admin-action" data-testid="button-close-invoice">إغلاق</button>
      </div>
    </DialogContent>
  </Dialog>;
}

export function SectionHeading({ title, subtitle, children }: { title: string; subtitle: string; children?: ReactNode }) { return <div className="admin-heading"><div><h2>{title}</h2><p>{subtitle}</p></div><div className="admin-actions">{children}</div></div>; }
export function EmptyBlock({ title, text }: { title: string; text: string }) { return <div className="admin-empty-block"><Inbox size={28}/><strong>{title}</strong><p>{text}</p></div>; }
export function SectionError({ error, retry }: { error: Error; retry: () => void }) { return <div className="admin-card admin-empty-block" role="alert"><AlertCircle size={26}/><strong>تعذّر تحميل البيانات</strong><p>{error.message}</p><button className="admin-action mt-4" onClick={retry}>إعادة المحاولة</button></div>; }
export function SectionLoading() { return <div className="admin-card admin-card-pad" aria-label="جارٍ تحميل البيانات"><div className="skeleton h-5 w-48 mb-8"/><div className="skeleton h-12 mb-3"/><div className="skeleton h-12 mb-3"/><div className="skeleton h-12 w-3/4"/></div>; }
export const text = (v: unknown) => String(v ?? '');
export const number = (v: unknown) => Number(v) || 0;