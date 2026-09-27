import { useEffect, useState, type ReactNode } from 'react';
import { useForm } from 'react-hook-form';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Form } from '@/components/ui/form';
import { AlertCircle, Inbox } from 'lucide-react';

export type Write = <T>(path: string, method: string, body?: unknown) => Promise<T>;
export type Field = { key: string; label: string; type?: 'text' | 'number' | 'tel' | 'email' | 'password' | 'date' | 'textarea' | 'select' | 'checkbox'; required?: boolean; options?: { value: string; label: string }[]; min?: number; step?: string; minLength?: number };
export function EntityDialog({ open, onClose, title, description, fields, initial = {}, onSave, testId }: { open: boolean; onClose: () => void; title: string; description?: string; fields: Field[]; initial?: Record<string, unknown>; onSave: (values: Record<string, string | boolean>) => Promise<void>; testId: string }) {
  const form = useForm<Record<string, string | boolean>>({ defaultValues: {} });
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  useEffect(() => { if (open) { form.reset(Object.fromEntries(fields.map(f => [f.key, f.type === 'checkbox' ? Boolean(initial[f.key]) : String(initial[f.key] ?? '')]))); setError(''); } }, [open]); // eslint-disable-line react-hooks/exhaustive-deps
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
  return <Dialog open={open} onOpenChange={v => { if (!v && !saving) onClose(); }}><DialogContent className="admin-dialog-content" data-testid={`dialog-${testId}`}><DialogHeader><DialogTitle>{title}</DialogTitle>{description && <DialogDescription>{description}</DialogDescription>}</DialogHeader><Form {...form}><form onSubmit={submit} className="admin-form mt-4" noValidate><div className="admin-form-grid">{fields.map(field => <label key={field.key} style={field.type === 'textarea' ? { gridColumn: '1/-1' } : undefined}>{field.label}{field.type === 'select' ? <select className="admin-input" {...form.register(field.key, rules(field))} required={field.required} aria-invalid={!!form.formState.errors[field.key]} aria-describedby={form.formState.errors[field.key] ? `error-${testId}-${field.key}` : undefined} data-testid={`input-${testId}-${field.key}`}><option value="">اختر...</option>{field.options?.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}</select> : field.type === 'textarea' ? <textarea className="admin-input" {...form.register(field.key, rules(field))} required={field.required} aria-invalid={!!form.formState.errors[field.key]} data-testid={`input-${testId}-${field.key}`}/> : field.type === 'checkbox' ? <input type="checkbox" {...form.register(field.key)} data-testid={`input-${testId}-${field.key}`}/> : <input className="admin-input" type={field.type || 'text'} min={field.min} step={field.step} minLength={field.minLength} required={field.required} aria-invalid={!!form.formState.errors[field.key]} aria-describedby={form.formState.errors[field.key] ? `error-${testId}-${field.key}` : undefined} {...form.register(field.key, rules(field))} data-testid={`input-${testId}-${field.key}`}/ >}{form.formState.errors[field.key] && <span id={`error-${testId}-${field.key}`} className="text-xs text-rose-700" role="alert">{String(form.formState.errors[field.key]?.message || 'تحقق من القيمة المدخلة')}</span>}</label>)}</div>{error && <div className="admin-flash error" role="alert" data-testid={`error-${testId}`}>{error}</div>}<div className="admin-dialog-footer"><button className="admin-action" type="button" onClick={onClose} data-testid={`button-cancel-${testId}`}>تراجع</button><button className="admin-action primary" type="submit" disabled={saving} data-testid={`button-save-${testId}`}>{saving ? 'جارٍ الحفظ...' : 'حفظ التغييرات'}</button></div></form></Form></DialogContent></Dialog>;
}
export function ConfirmDialog({ open, onClose, title, description, action, onConfirm, testId }: { open: boolean; onClose: () => void; title: string; description: string; action: string; onConfirm: () => Promise<void>; testId: string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  return <Dialog open={open} onOpenChange={v => { if (!v && !busy) { onClose(); setError(''); } }}><DialogContent className="admin-dialog-content" data-testid={`dialog-confirm-${testId}`}><DialogHeader><DialogTitle>{title}</DialogTitle><DialogDescription>{description}</DialogDescription></DialogHeader>{error && <div className="admin-flash error" role="alert">{error}</div>}<div className="admin-dialog-footer"><button className="admin-action" onClick={onClose} disabled={busy} data-testid={`button-dismiss-${testId}`}>تراجع</button><button className="admin-action danger" disabled={busy} data-testid={`button-confirm-${testId}`} onClick={async () => { setBusy(true); setError(''); try { await onConfirm(); onClose(); } catch (e) { setError(e instanceof Error ? e.message : 'تعذّر تنفيذ العملية.'); } finally { setBusy(false); } }}>{busy ? 'جارٍ التنفيذ...' : action}</button></div></DialogContent></Dialog>;
}
export function SectionHeading({ title, subtitle, children }: { title: string; subtitle: string; children?: ReactNode }) { return <div className="admin-heading"><div><h2>{title}</h2><p>{subtitle}</p></div><div className="admin-actions">{children}</div></div>; }
export function EmptyBlock({ title, text }: { title: string; text: string }) { return <div className="admin-empty-block"><Inbox size={28}/><strong>{title}</strong><p>{text}</p></div>; }
export function SectionError({ error, retry }: { error: Error; retry: () => void }) { return <div className="admin-card admin-empty-block" role="alert"><AlertCircle size={26}/><strong>تعذّر تحميل البيانات</strong><p>{error.message}</p><button className="admin-action mt-4" onClick={retry}>إعادة المحاولة</button></div>; }
export function SectionLoading() { return <div className="admin-card admin-card-pad" aria-label="جارٍ تحميل البيانات"><div className="skeleton h-5 w-48 mb-8"/><div className="skeleton h-12 mb-3"/><div className="skeleton h-12 mb-3"/><div className="skeleton h-12 w-3/4"/></div>; }
export const text = (v: unknown) => String(v ?? '');
export const number = (v: unknown) => Number(v) || 0;