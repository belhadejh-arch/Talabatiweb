import { useTranslation } from "react-i18next";
import { Card, CardContent } from "@/components/ui/card";

export default function AdminSettings() {
  const { t } = useTranslation();
  
  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold tracking-tight">{t("admin.sidebar.settings")}</h2>
      <Card className="border-none shadow-sm max-w-2xl">
        <CardContent className="p-6">
          <p className="text-muted-foreground">Platform settings (WhatsApp, Google Maps keys, Default Currency) will be configured here.</p>
        </CardContent>
      </Card>
    </div>
  );
}