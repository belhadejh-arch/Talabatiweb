import { useState } from 'react';
import { LockKeyhole, Timer } from 'lucide-react';
import { useAdminSettings } from '../hooks/use-admin';
import { EntityDialog, SectionError, SectionHeading, SectionLoading, type Write, number } from './admin-ui';
import AdminGmail from './admin-gmail';

export default function AdminSettingsPage({ token, write }: { token: string; write: Write }) {
  const settings = useAdminSettings(token);
  const [timeoutOpen, setTimeoutOpen] = useState(false);
  const [credentialsOpen, setCredentialsOpen] = useState(false);
  const [message, setMessage] = useState('');
  const value = settings.data?.settings;
  return <div className="admin-workspace"><SectionHeading title="الإعدادات" subtitle="بيانات الوصول وضوابط تشغيل الإسناد"/>{settings.isLoading ? <SectionLoading/> : settings.error ? <SectionError error={settings.error} retry={() => { void settings.refetch(); }}/> : value ? <>
    {message && <div className="admin-flash" role="status" data-testid="status-settings-saved">{message}</div>}
    <div className="admin-inline-card flex items-center justify-between gap-5 flex-wrap"><div className="flex items-start gap-4"><span className="metric-icon"><Timer size={20}/></span><div><h3>مهلة إسناد الطلب</h3><p className="subtle text-sm mt-1">المدة قبل انتهاء انتظار الإسناد التلقائي.</p><strong className="block mt-3" data-testid="text-dispatch-timeout">{value.dispatchTimeoutMinutes} دقيقة</strong></div></div><button className="admin-action" onClick={() => setTimeoutOpen(true)} data-testid="button-edit-dispatch-timeout">تعديل المهلة</button></div>
    <div className="admin-inline-card flex items-center justify-between gap-5 flex-wrap"><div className="flex items-start gap-4"><span className="metric-icon"><LockKeyhole size={20}/></span><div><h3>بيانات المشرف</h3><p className="subtle text-sm mt-1">يمكن استخدام بريد إلكتروني كمعرّف دخول؛ تغييره أو تغيير كلمة المرور يتطلب كلمة المرور الحالية.</p><strong className="block mt-3" data-testid="text-admin-username">{value.adminUsername}</strong></div></div><button className="admin-action" onClick={() => setCredentialsOpen(true)} data-testid="button-edit-admin-credentials">تحديث بيانات الدخول</button></div>
    <EntityDialog open={timeoutOpen} onClose={() => setTimeoutOpen(false)} title="مهلة إسناد الطلب" fields={[{key:'dispatchTimeoutMinutes',label:'عدد الدقائق',type:'number',required:true,min:1,step:'1'}]} initial={value} testId="timeout" onSave={async v => { await write('/api/admin/settings','PATCH',{dispatchTimeoutMinutes:number(v.dispatchTimeoutMinutes)}); await settings.refetch(); setMessage('تم تحديث مهلة الإسناد.'); }}/>
    <EntityDialog open={credentialsOpen} onClose={() => setCredentialsOpen(false)} title="تحديث بيانات الدخول" description="أدخل كلمة المرور الحالية للتحقق من هويتك. يمكن كتابة بريد إلكتروني في حقل معرّف الدخول؛ كلمة المرور الجديدة لا تقل عن ١٢ حرفاً." fields={[{key:'currentPassword',label:'كلمة المرور الحالية',type:'password',required:true},{key:'newUsername',label:'معرّف الدخول الجديد (اسم مستخدم أو بريد إلكتروني)'},{key:'newPassword',label:'كلمة المرور الجديدة (١٢ حرفاً على الأقل)',type:'password',minLength:12}]} testId="credentials" onSave={async v => { if (!v.newUsername && !v.newPassword) throw new Error('أدخل معرّف دخول جديداً أو كلمة مرور جديدة.'); if (v.newPassword && String(v.newPassword).length < 12) throw new Error('كلمة المرور الجديدة يجب أن تتكون من ١٢ حرفاً على الأقل.'); await write('/api/admin/settings/credentials','POST',{currentPassword:v.currentPassword,...(v.newUsername ? {newUsername:String(v.newUsername).trim()} : {}),...(v.newPassword ? {newPassword:v.newPassword} : {})}); await settings.refetch(); setMessage('تم تحديث بيانات الدخول بنجاح.'); }}/>
  </> : <SectionError error={new Error('الإعدادات غير متاحة.')} retry={() => { void settings.refetch(); }}/>}
    <AdminGmail token={token} write={write}/>
  </div>;
}