import { useState } from 'react';
import { Archive, Pencil, Plus, BadgeCheck } from 'lucide-react';
import { money, type Restaurant } from '../lib/api';
import { ConfirmDialog, EmptyBlock, EntityDialog, SectionHeading, type Field, type Write, number, text } from './admin-ui';

type Driver = Record<string, unknown>;
export default function AdminDrivers({ drivers, restaurants, write }: { drivers: Driver[]; restaurants: Restaurant[]; write: Write }) {
  const [editing, setEditing] = useState<Driver | 'new' | null>(null);
  const [archiving, setArchiving] = useState<Driver | null>(null);
  const [serial, setSerial] = useState('');
  const fields: Field[] = [
    {key:'name',label:'اسم السائق',required:true},{key:'phone',label:'رقم الهاتف',type:'tel',required:true},
    {key:'email',label:'البريد الإلكتروني',type:'email',required:true},
    {key:'restaurantId',label:'المطعم',type:'select',required:true,options:restaurants.map(r => ({ value:String(r.id),label:r.name }))},
    {key:'isActive',label:'نشط',type:'checkbox'},
  ];
  return <div className="admin-workspace"><SectionHeading title="السائقون" subtitle={`${money(drivers.length)} سائق مدرج · بيانات الإسناد والتواصل`}><button className="admin-action primary" disabled={!restaurants.length} onClick={() => setEditing('new')} data-testid="button-add-driver"><Plus size={16}/>إضافة سائق</button></SectionHeading>
  <p className="subtle text-sm">الرقم التسلسلي هو بيانات دخول السائق؛ يظهر مرة واحدة فقط عند إنشاء الحساب. احفظه وسلّمه للسائق بطريقة آمنة.</p>
  {serial && <div className="admin-flash flex items-center justify-between gap-3 flex-wrap" role="status" data-testid="status-driver-serial"><span><BadgeCheck size={17} className="inline ml-2"/>تم إنشاء السائق. احفظ بيانات الدخول الآن؛ لن يُعرض هذا الرقم مرة أخرى: <strong dir="ltr">{serial}</strong></span><button className="admin-action" onClick={() => setSerial('')} data-testid="button-dismiss-driver-serial">إغلاق</button></div>}
  <div className="admin-card">{drivers.length ? <div className="admin-table-scroll"><table className="admin-table"><thead><tr><th>السائق</th><th>التواصل</th><th>المطعم</th><th>الحالة</th><th>الإجراءات</th></tr></thead><tbody>{drivers.map((d,i) => <tr key={text(d.id) || i} data-testid={`row-driver-${d.id}`}><td><strong>{text(d.name)}</strong></td><td><span dir="ltr">{text(d.phone)}</span><small dir="ltr">{text(d.email)}</small></td><td>{text(d.restaurantName) || restaurants.find(r => r.id === number(d.restaurantId))?.name || '—'}</td><td><span className="status-pill">{d.status === 'ARCHIVED' ? 'مؤرشف' : d.isActive === false ? 'غير نشط' : 'نشط'}</span></td><td><div className="admin-actions"><button className="admin-action" onClick={() => setEditing(d)} data-testid={`button-edit-driver-${d.id}`}><Pencil size={14}/>تعديل</button><button className="admin-action danger" onClick={() => setArchiving(d)} data-testid={`button-archive-driver-${d.id}`}><Archive size={14}/>أرشفة</button></div></td></tr>)}</tbody></table></div> : <EmptyBlock title="لا سائقين بعد" text="أضف السائقين لتظهر تفاصيلهم وإسنادهم هنا."/>}</div>
  <EntityDialog open={!!editing} onClose={() => setEditing(null)} title={editing === 'new' ? 'إضافة سائق' : 'تعديل السائق'} fields={fields} initial={editing === 'new' ? {isActive:true} : editing || {}} testId="driver" onSave={async v => { const body = { name:text(v.name).trim(), phone:text(v.phone).trim(),email:text(v.email).trim(),restaurantId:number(v.restaurantId),isActive:!!v.isActive }; if (editing === 'new') { const result = await write<{ driver:Driver;serialNumber:string }>('/api/admin/drivers','POST',body); setSerial(result.serialNumber); } else if (editing) await write(`/api/admin/drivers/${editing.id}`,'PATCH',body); }}/>
  <ConfirmDialog open={!!archiving} onClose={() => setArchiving(null)} title="أرشفة السائق؟" description={`سيُخفى ${text(archiving?.name)} من قائمة السائقين النشطين دون المساس بسجل الطلبات.`} action="أرشفة السائق" testId="driver" onConfirm={async () => { if (archiving) await write(`/api/admin/drivers/${archiving.id}`,'DELETE'); }}/>
  </div>;
}