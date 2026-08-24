import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Search, Plus } from "lucide-react";
import { Badge } from "@/components/ui/badge";

export default function AdminDrivers() {
  const { t } = useTranslation();
  
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold tracking-tight">{t("admin.sidebar.drivers")}</h2>
        <Button>
          <Plus className="mr-2 h-4 w-4" /> Add Driver
        </Button>
      </div>
      
      <Card className="border-none shadow-sm">
        <CardContent className="p-12 text-center text-muted-foreground flex flex-col items-center">
          <p>Global driver fleet management.</p>
          <p className="text-sm mt-2">Will be integrated with useListDrivers.</p>
        </CardContent>
      </Card>
    </div>
  );
}