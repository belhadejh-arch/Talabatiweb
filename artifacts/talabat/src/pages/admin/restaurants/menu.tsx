import { useState } from "react";
import { useParams, Link } from "wouter";
import { 
  useListCategories, 
  useListProducts, 
  useGetRestaurant,
  getGetRestaurantQueryKey,
  getListCategoriesQueryKey,
  getListProductsQueryKey,
} from "@workspace/api-client-react";
import { ArrowLeft, Plus, MoreVertical, Package, Image as ImageIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { formatCurrency } from "@/lib/currency";

export default function AdminRestaurantMenu() {
  const { id } = useParams();
  const restaurantId = Number(id);
  const [selectedCategoryId, setSelectedCategoryId] = useState<number | null>(null);

  const { data: restaurant } = useGetRestaurant(restaurantId, { query: { queryKey: getGetRestaurantQueryKey(restaurantId), enabled: !!restaurantId } });
  
  const { data: categories = [], isLoading: loadingCategories } = useListCategories(restaurantId, {
    query: { queryKey: getListCategoriesQueryKey(restaurantId), enabled: !!restaurantId }
  });

  const activeCategory = selectedCategoryId || (categories.length > 0 ? categories[0].id : null);

  const { data: products = [], isLoading: loadingProducts } = useListProducts(restaurantId, 
    { categoryId: activeCategory || undefined }, 
    { query: { queryKey: getListProductsQueryKey(restaurantId, { categoryId: activeCategory || undefined }), enabled: !!activeCategory } }
  );

  return (
    <div className="space-y-6 h-[calc(100vh-8rem)] flex flex-col">
      <div className="flex items-center justify-between shrink-0">
        <div className="flex items-center gap-4">
          <Link href={`/admin/restaurants/${restaurantId}`} className="p-2 rounded-md hover:bg-secondary transition-colors text-muted-foreground">
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <div>
            <h2 className="text-2xl font-bold tracking-tight">إدارة القائمة</h2>
            <p className="text-sm text-muted-foreground">{restaurant?.name || 'جاري التحميل...'}</p>
          </div>
        </div>
        <Button>
          <Plus className="mr-2 h-4 w-4" /> إضافة قسم
        </Button>
      </div>

      <div className="flex gap-6 flex-1 min-h-0">
        {/* Categories Sidebar */}
        <Card className="w-64 shrink-0 border-none shadow-sm flex flex-col">
          <div className="p-4 border-b border-border font-semibold">الأقسام</div>
          <ScrollArea className="flex-1">
            <div className="p-2 space-y-1">
              {loadingCategories ? (
                <div className="p-4 text-center text-sm text-muted-foreground">جاري التحميل...</div>
              ) : categories.length === 0 ? (
                <div className="p-4 text-center text-sm text-muted-foreground">لا توجد أقسام</div>
              ) : (
                categories.map(category => (
                  <button
                    key={category.id}
                    onClick={() => setSelectedCategoryId(category.id)}
                    className={`w-full text-left px-3 py-2.5 rounded-md text-sm font-medium transition-colors ${activeCategory === category.id ? 'bg-primary text-primary-foreground' : 'hover:bg-secondary text-foreground'}`}
                  >
                    <div className="flex justify-between items-center">
                      <span>{category.name}</span>
                      {!category.isAvailable && <Badge variant="secondary" className="text-[10px] h-4 px-1 py-0">مخفي</Badge>}
                    </div>
                  </button>
                ))
              )}
            </div>
          </ScrollArea>
        </Card>

        {/* Products Area */}
        <Card className="flex-1 border-none shadow-sm flex flex-col min-w-0">
          <div className="p-4 border-b border-border flex justify-between items-center bg-card/50">
            <h3 className="font-semibold">{categories.find(c => c.id === activeCategory)?.name || 'المنتجات'}</h3>
            <Button size="sm" variant="secondary" disabled={!activeCategory}>
              <Plus className="mr-2 h-4 w-4" /> إضافة منتج
            </Button>
          </div>
          <ScrollArea className="flex-1 bg-secondary/10">
            <div className="p-4 grid grid-cols-1 xl:grid-cols-2 gap-4">
              {loadingProducts ? (
                <div className="col-span-full p-8 text-center text-muted-foreground">جاري تحميل المنتجات...</div>
              ) : !activeCategory ? (
                <div className="col-span-full p-12 text-center text-muted-foreground flex flex-col items-center">
                  <Package className="h-12 w-12 opacity-20 mb-4" />
                  <p>اختر قسماً لعرض المنتجات</p>
                </div>
              ) : products.length === 0 ? (
                <div className="col-span-full p-12 text-center text-muted-foreground flex flex-col items-center border-2 border-dashed border-border rounded-xl">
                  <Package className="h-12 w-12 opacity-20 mb-4" />
                  <p>لا توجد منتجات في هذا القسم</p>
                  <Button variant="outline" className="mt-4">إضافة أول منتج</Button>
                </div>
              ) : (
                products.map(product => (
                  <div key={product.id} className="bg-card border border-border rounded-xl p-3 flex gap-4 hover-elevate transition-all">
                    <div className="h-20 w-20 rounded-md bg-secondary flex items-center justify-center shrink-0 overflow-hidden border border-border">
                      {product.imageUrl ? (
                        <img src={product.imageUrl} alt={product.name} className="h-full w-full object-cover" />
                      ) : (
                        <ImageIcon className="h-6 w-6 text-muted-foreground/50" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0 flex flex-col">
                      <div className="flex justify-between items-start">
                        <h4 className="font-semibold truncate pr-2">{product.name}</h4>
                        <button className="text-muted-foreground hover:text-foreground transition-colors">
                          <MoreVertical className="h-4 w-4" />
                        </button>
                      </div>
                      <p className="text-sm text-muted-foreground truncate">{product.description || 'لا يوجد وصف'}</p>
                      <div className="mt-auto pt-2 flex items-center justify-between">
                         <span className="font-bold text-primary">{formatCurrency(product.price)}</span>
                        <div className="flex items-center gap-2">
                          {product.addons && product.addons.length > 0 && (
                            <Badge variant="outline" className="text-[10px] h-5">{product.addons.length} إضافات</Badge>
                          )}
                          {!product.isAvailable && (
                            <Badge variant="secondary" className="text-[10px] h-5 bg-slate-500/10 text-slate-500 hover:bg-slate-500/20">مخفي</Badge>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </ScrollArea>
        </Card>
      </div>
    </div>
  );
}