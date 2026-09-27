import { ArrowRight, Compass } from 'lucide-react';
import { Link } from 'wouter';
import { Header } from '../components/common';

export default function NotFoundAr() {
  return <div dir="rtl" className="min-h-[100dvh]"><Header/><main className="shell py-24 text-center"><div className="empty-illustration"><Compass size={31}/></div><span className="eyebrow" style={{ color: 'hsl(var(--primary))' }}>404 / الطريق غير موجود</span><h1 className="section-title mt-4">يبدو أنك انعطفت بعيداً.</h1><p className="subtle mt-4 mb-8">الصفحة التي تبحث عنها غير موجودة، لكن الطعام الجيد قريب.</p><Link href="/" className="btn btn-primary" data-testid="link-not-found-home"><ArrowRight size={17}/> العودة للرئيسية</Link></main></div>;
}