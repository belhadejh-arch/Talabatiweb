import { useEffect, useState } from "react";
import { useParams, Link } from "wouter";
import {
  useListCategories,
  useListProducts,
  useGetRestaurant,
  useCreateCategory,
  useUpdateCategory,
  useDeleteCategory,
  useCreateProduct,
  useUpdateProduct,
  useDeleteProduct,
  useCreateAddon,
  useUpdateAddon,
  useDeleteAddon,
  useCreateProductSize,
  useUpdateProductSize,
  useDeleteProductSize,
  getGetRestaurantQueryKey,
  getListCategoriesQueryKey,
  getListProductsQueryKey,
  type Product,
  type Category,
} from "@workspace/api-client-react";
import { ArrowLeft, Plus, Pencil, Trash2, Package, Image as ImageIcon, Copy, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { formatCurrency } from "@/lib/currency";
import { useQueryClient } from "@tanstack/react-query";

type CategoryFormState = { name: string; nameAr: string; imageUrl: string; sortOrder: string; isAvailable: boolean };
const emptyCategoryForm: CategoryFormState = { name: "", nameAr: "", imageUrl: "", sortOrder: "0", isAvailable: true };

type ProductFormState = {
  name: string; nameAr: string; description: string; price: string; imageUrl: string;
  isAvailable: boolean; stockQuantity: string; sortOrder: string;
};
const emptyProductForm: ProductFormState = {
  name: "", nameAr: "", description: "", price: "", imageUrl: "",
  isAvailable: true, stockQuantity: "", sortOrder: "0",
};

type AddonFormState = { name: string; nameAr: string; price: string; isAvailable: boolean };
const emptyAddonForm: AddonFormState = { name: "", nameAr: "", price: "", isAvailable: true };

type SizeFormState = { name: string; nameAr: string; price: string; sortOrder: string; isAvailable: boolean };
const emptySizeForm: SizeFormState = { name: "", nameAr: "", price: "", sortOrder: "0", isAvailable: true };

export default function AdminRestaurantMenu() {
  const { id } = useParams();
  const restaurantId = Number(id);
  const qc = useQueryClient();

  const [selectedCategoryId, setSelectedCategoryId] = useState<number | null>(null);
  const [showCategoryForm, setShowCategoryForm] = useState(false);
  const [categoryForm, setCategoryForm] = useState<CategoryFormState>(emptyCategoryForm);
  const [editingCategoryId, setEditingCategoryId] = useState<number | null>(null);

  const [showProductForm, setShowProductForm] = useState(false);
  const [productForm, setProductForm] = useState<ProductFormState>(emptyProductForm);
  const [editingProductId, setEditingProductId] = useState<number | null>(null);

  const [expandedAddonsProductId, setExpandedAddonsProductId] = useState<number | null>(null);
  const [addonForm, setAddonForm] = useState<AddonFormState>(emptyAddonForm);
  const [editingAddonId, setEditingAddonId] = useState<number | null>(null);

  const [expandedSizesProductId, setExpandedSizesProductId] = useState<number | null>(null);
  const [sizeForm, setSizeForm] = useState<SizeFormState>(emptySizeForm);
  const [editingSizeId, setEditingSizeId] = useState<number | null>(null);

  const { data: restaurant } = useGetRestaurant(restaurantId, { query: { queryKey: getGetRestaurantQueryKey(restaurantId), enabled: !!restaurantId } });

  const categoriesKey = getListCategoriesQueryKey(restaurantId);
  const { data: categories = [], isLoading: loadingCategories } = useListCategories(restaurantId, {
    query: { queryKey: categoriesKey, enabled: !!restaurantId },
  });

  const activeCategory = selectedCategoryId || (categories.length > 0 ? categories[0].id : null);

  useEffect(() => {
    if (!selectedCategoryId && categories.length > 0) setSelectedCategoryId(categories[0].id);
  }, [categories, selectedCategoryId]);

  const productsParams = { categoryId: activeCategory || undefined };
  const productsKey = getListProductsQueryKey(restaurantId, productsParams);
  const { data: products = [], isLoading: loadingProducts } = useListProducts(restaurantId, productsParams, {
    query: { queryKey: productsKey, enabled: !!activeCategory },
  });

  const invalidateCategories = () => qc.invalidateQueries({ queryKey: categoriesKey });
  const invalidateProducts = () => qc.invalidateQueries({ queryKey: productsKey });

  const createCategory = useCreateCategory();
  const updateCategory = useUpdateCategory();
  const deleteCategory = useDeleteCategory();

  const createProduct = useCreateProduct();
  const updateProduct = useUpdateProduct();
  const deleteProduct = useDeleteProduct();

  const createAddon = useCreateAddon();
  const updateAddon = useUpdateAddon();
  const deleteAddon = useDeleteAddon();

  const createSize = useCreateProductSize();
  const updateSize = useUpdateProductSize();
  const deleteSize = useDeleteProductSize();

  const resetCategoryForm = () => { setCategoryForm(emptyCategoryForm); setEditingCategoryId(null); setShowCategoryForm(false); };
  const resetProductForm = () => { setProductForm(emptyProductForm); setEditingProductId(null); setShowProductForm(false); };
  const resetAddonForm = () => { setAddonForm(emptyAddonForm); setEditingAddonId(null); };
  const resetSizeForm = () => { setSizeForm(emptySizeForm); setEditingSizeId(null); };

  const startEditCategory = (c: Category) => {
    setEditingCategoryId(c.id);
    setCategoryForm({ name: c.name, nameAr: c.nameAr || "", imageUrl: c.imageUrl || "", sortOrder: String(c.sortOrder), isAvailable: c.isAvailable });
    setShowCategoryForm(true);
  };

  const submitCategory = (e: React.FormEvent) => {
    e.preventDefault();
    if (!categoryForm.name.trim()) return;
    const data = {
      name: categoryForm.name,
      nameAr: categoryForm.nameAr || undefined,
      imageUrl: categoryForm.imageUrl || undefined,
      sortOrder: Number(categoryForm.sortOrder) || 0,
      isAvailable: categoryForm.isAvailable,
    };
    if (editingCategoryId) {
      updateCategory.mutate({ id: editingCategoryId, data }, { onSuccess: () => { invalidateCategories(); resetCategoryForm(); } });
    } else {
      createCategory.mutate({ id: restaurantId, data }, {
        onSuccess: (created) => { invalidateCategories(); resetCategoryForm(); setSelectedCategoryId(created.id); },
      });
    }
  };

  const removeCategory = (categoryId: number) => {
    if (!confirm("حذف هذا القسم وكل منتجاته نهائياً؟")) return;
    deleteCategory.mutate({ id: categoryId }, {
      onSuccess: () => {
        invalidateCategories();
        if (activeCategory === categoryId) setSelectedCategoryId(null);
      },
    });
  };

  const startEditProduct = (p: Product) => {
    setEditingProductId(p.id);
    setProductForm({
      name: p.name, nameAr: p.nameAr || "", description: p.description || "",
      price: String(p.price), imageUrl: p.imageUrl || "", isAvailable: p.isAvailable,
      stockQuantity: p.stockQuantity != null ? String(p.stockQuantity) : "", sortOrder: String(p.sortOrder),
    });
    setShowProductForm(true);
  };

  const submitProduct = (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeCategory || !productForm.name.trim() || !productForm.price) return;
    const data = {
      categoryId: activeCategory,
      name: productForm.name,
      nameAr: productForm.nameAr || undefined,
      description: productForm.description || undefined,
      price: Number(productForm.price),
      imageUrl: productForm.imageUrl || undefined,
      isAvailable: productForm.isAvailable,
      stockQuantity: productForm.stockQuantity === "" ? null : Number(productForm.stockQuantity),
      sortOrder: Number(productForm.sortOrder) || 0,
    };
    if (editingProductId) {
      updateProduct.mutate({ id: editingProductId, data }, { onSuccess: () => { invalidateProducts(); resetProductForm(); } });
    } else {
      createProduct.mutate({ id: restaurantId, data }, { onSuccess: () => { invalidateProducts(); resetProductForm(); } });
    }
  };

  const removeProduct = (productId: number) => {
    if (!confirm("حذف هذا المنتج نهائياً؟")) return;
    deleteProduct.mutate({ id: productId }, { onSuccess: invalidateProducts });
  };

  const toggleProductAvailability = (p: Product) => {
    updateProduct.mutate({ id: p.id, data: { isAvailable: !p.isAvailable } }, { onSuccess: invalidateProducts });
  };

  const submitAddon = (e: React.FormEvent, productId: number) => {
    e.preventDefault();
    if (!addonForm.name.trim()) return;
    const data = { name: addonForm.name, nameAr: addonForm.nameAr || undefined, price: Number(addonForm.price) || 0, isAvailable: addonForm.isAvailable };
    if (editingAddonId) {
      updateAddon.mutate({ id: editingAddonId, data }, { onSuccess: () => { invalidateProducts(); resetAddonForm(); } });
    } else {
      createAddon.mutate({ id: productId, data }, { onSuccess: () => { invalidateProducts(); resetAddonForm(); } });
    }
  };

  const removeAddon = (addonId: number) => {
    if (!confirm("حذف هذه الإضافة؟")) return;
    deleteAddon.mutate({ id: addonId }, { onSuccess: invalidateProducts });
  };

  const submitSize = (e: React.FormEvent, productId: number) => {
    e.preventDefault();
    if (!sizeForm.name.trim() || !sizeForm.price) return;
    const data = {
      name: sizeForm.name,
      nameAr: sizeForm.nameAr || undefined,
      price: Number(sizeForm.price) || 0,
      sortOrder: Number(sizeForm.sortOrder) || 0,
      isAvailable: sizeForm.isAvailable,
    };
    if (editingSizeId) {
      updateSize.mutate({ id: editingSizeId, data }, { onSuccess: () => { invalidateProducts(); resetSizeForm(); } });
    } else {
      createSize.mutate({ id: productId, data }, { onSuccess: () => { invalidateProducts(); resetSizeForm(); } });
    }
  };

  const removeSize = (sizeId: number) => {
    if (!confirm("حذف هذا الحجم؟")) return;
    deleteSize.mutate({ id: sizeId }, { onSuccess: invalidateProducts });
  };

  const storeUrl = restaurant ? `${window.location.origin}/${restaurant.slug}` : "";

  return (
    <div className="space-y-6 h-[calc(100vh-8rem)] flex flex-col">
      <div className="flex items-center justify-between shrink-0 flex-wrap gap-3">
        <div className="flex items-center gap-4">
          <Link href={`/admin/restaurants/${restaurantId}`} className="p-2 rounded-md hover:bg-secondary transition-colors text-muted-foreground">
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <div>
            <h2 className="text-2xl font-bold tracking-tight">🍔 إدارة قائمة الطعام</h2>
            <p className="text-sm text-muted-foreground">{restaurant?.name || "جاري التحميل..."}</p>
          </div>
        </div>
        {restaurant && (
          <div className="flex items-center gap-2">
            <code className="text-xs bg-secondary px-2 py-1.5 rounded-md truncate max-w-[220px]">{storeUrl}</code>
            <Button size="sm" variant="outline" onClick={() => navigator.clipboard.writeText(storeUrl)}>
              <Copy className="ml-1 h-3.5 w-3.5" /> نسخ الرابط
            </Button>
            <a href={storeUrl} target="_blank" rel="noreferrer"><Button size="sm" variant="outline"><ExternalLink className="ml-1 h-3.5 w-3.5" /> معاينة</Button></a>
          </div>
        )}
      </div>

      <div className="flex gap-6 flex-1 min-h-0">
        {/* Categories Sidebar */}
        <Card className="w-72 shrink-0 border-none shadow-sm flex flex-col">
          <div className="p-4 border-b border-border flex items-center justify-between">
            <span className="font-semibold">الأقسام</span>
            <Button size="sm" variant="ghost" onClick={() => { resetCategoryForm(); setShowCategoryForm(true); }}>
              <Plus className="h-4 w-4" />
            </Button>
          </div>

          {showCategoryForm && (
            <form onSubmit={submitCategory} className="p-3 border-b border-border space-y-2 bg-secondary/20">
              <Input placeholder="اسم القسم" value={categoryForm.name} onChange={(e) => setCategoryForm({ ...categoryForm, name: e.target.value })} required />
              <Input placeholder="رابط صورة القسم (اختياري)" value={categoryForm.imageUrl} onChange={(e) => setCategoryForm({ ...categoryForm, imageUrl: e.target.value })} />
              <div className="flex items-center gap-2">
                <Input type="number" placeholder="الترتيب" className="w-20" value={categoryForm.sortOrder} onChange={(e) => setCategoryForm({ ...categoryForm, sortOrder: e.target.value })} />
                <label className="flex items-center gap-1.5 text-sm">
                  <input type="checkbox" checked={categoryForm.isAvailable} onChange={(e) => setCategoryForm({ ...categoryForm, isAvailable: e.target.checked })} /> ظاهر للعملاء
                </label>
              </div>
              <div className="flex gap-2">
                <Button size="sm" type="submit" disabled={createCategory.isPending || updateCategory.isPending}>{editingCategoryId ? "حفظ" : "إضافة"}</Button>
                <Button size="sm" type="button" variant="outline" onClick={resetCategoryForm}>إلغاء</Button>
              </div>
            </form>
          )}

          <ScrollArea className="flex-1">
            <div className="p-2 space-y-1">
              {loadingCategories ? (
                <div className="p-4 text-center text-sm text-muted-foreground">جاري التحميل...</div>
              ) : categories.length === 0 ? (
                <div className="p-4 text-center text-sm text-muted-foreground">لا توجد أقسام. أضف قسماً للبدء.</div>
              ) : (
                categories.map((category) => (
                  <div key={category.id} className={`w-full rounded-md text-sm font-medium transition-colors flex items-center justify-between gap-1 pr-1 ${activeCategory === category.id ? "bg-primary text-primary-foreground" : "hover:bg-secondary text-foreground"}`}>
                    <button onClick={() => setSelectedCategoryId(category.id)} className="flex-1 text-right px-3 py-2.5 min-w-0">
                      <div className="flex justify-between items-center gap-2">
                        <span className="truncate">{category.name}</span>
                        {!category.isAvailable && <Badge variant="secondary" className="text-[10px] h-4 px-1 py-0 shrink-0">مخفي</Badge>}
                      </div>
                    </button>
                    <button onClick={() => startEditCategory(category)} className="p-1.5 opacity-70 hover:opacity-100"><Pencil className="h-3.5 w-3.5" /></button>
                    <button onClick={() => removeCategory(category.id)} className="p-1.5 opacity-70 hover:opacity-100"><Trash2 className="h-3.5 w-3.5" /></button>
                  </div>
                ))
              )}
            </div>
          </ScrollArea>
        </Card>

        {/* Products Area */}
        <Card className="flex-1 border-none shadow-sm flex flex-col min-w-0">
          <div className="p-4 border-b border-border flex justify-between items-center bg-card/50">
            <h3 className="font-semibold">{categories.find((c) => c.id === activeCategory)?.name || "المنتجات"}</h3>
            <Button size="sm" variant="secondary" disabled={!activeCategory} onClick={() => { resetProductForm(); setShowProductForm(true); }}>
              <Plus className="ml-2 h-4 w-4" /> إضافة منتج
            </Button>
          </div>

          {showProductForm && (
            <form onSubmit={submitProduct} className="p-4 border-b border-border bg-secondary/20 grid gap-3 md:grid-cols-2">
              <Input placeholder="اسم المنتج" value={productForm.name} onChange={(e) => setProductForm({ ...productForm, name: e.target.value })} required />
              <Input type="number" step="0.01" min="0" placeholder="السعر (د.ل)" value={productForm.price} onChange={(e) => setProductForm({ ...productForm, price: e.target.value })} required />
              <Input placeholder="رابط صورة المنتج" className="md:col-span-2" value={productForm.imageUrl} onChange={(e) => setProductForm({ ...productForm, imageUrl: e.target.value })} />
              <Textarea placeholder="الوصف (اختياري)" className="md:col-span-2" value={productForm.description} onChange={(e) => setProductForm({ ...productForm, description: e.target.value })} />
              <Input type="number" min="0" placeholder="الكمية المتوفرة (اتركه فارغاً = غير محدود)" value={productForm.stockQuantity} onChange={(e) => setProductForm({ ...productForm, stockQuantity: e.target.value })} />
              <Input type="number" placeholder="الترتيب" value={productForm.sortOrder} onChange={(e) => setProductForm({ ...productForm, sortOrder: e.target.value })} />
              <label className="flex items-center gap-1.5 text-sm md:col-span-2">
                <input type="checkbox" checked={productForm.isAvailable} onChange={(e) => setProductForm({ ...productForm, isAvailable: e.target.checked })} /> متوفر للطلب
              </label>
              <div className="flex gap-2 md:col-span-2">
                <Button type="submit" disabled={createProduct.isPending || updateProduct.isPending}>{editingProductId ? "حفظ التعديلات" : "إضافة المنتج"}</Button>
                <Button type="button" variant="outline" onClick={resetProductForm}>إلغاء</Button>
              </div>
            </form>
          )}

          <ScrollArea className="flex-1 bg-secondary/10">
            <div className="p-4 grid grid-cols-1 xl:grid-cols-2 gap-4">
              {loadingProducts ? (
                <div className="col-span-full p-8 text-center text-muted-foreground">جاري تحميل المنتجات...</div>
              ) : !activeCategory ? (
                <div className="col-span-full p-12 text-center text-muted-foreground flex flex-col items-center">
                  <Package className="h-12 w-12 opacity-20 mb-4" />
                  <p>أضف قسماً واختره لعرض منتجاته</p>
                </div>
              ) : products.length === 0 ? (
                <div className="col-span-full p-12 text-center text-muted-foreground flex flex-col items-center border-2 border-dashed border-border rounded-xl">
                  <Package className="h-12 w-12 opacity-20 mb-4" />
                  <p>لا توجد منتجات في هذا القسم</p>
                  <Button variant="outline" className="mt-4" onClick={() => { resetProductForm(); setShowProductForm(true); }}>إضافة أول منتج</Button>
                </div>
              ) : (
                products.map((product) => (
                  <div key={product.id} className="bg-card border border-border rounded-xl p-3 flex flex-col gap-3 hover-elevate transition-all">
                    <div className="flex gap-4">
                      <div className="h-20 w-20 rounded-md bg-secondary flex items-center justify-center shrink-0 overflow-hidden border border-border">
                        {product.imageUrl ? (
                          <img src={product.imageUrl} alt={product.name} className="h-full w-full object-cover" />
                        ) : (
                          <ImageIcon className="h-6 w-6 text-muted-foreground/50" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0 flex flex-col">
                        <div className="flex justify-between items-start gap-2">
                          <h4 className="font-semibold truncate pr-2">{product.name}</h4>
                          <div className="flex items-center gap-1 shrink-0">
                            <button onClick={() => startEditProduct(product)} className="text-muted-foreground hover:text-foreground transition-colors p-1"><Pencil className="h-4 w-4" /></button>
                            <button onClick={() => removeProduct(product.id)} className="text-muted-foreground hover:text-destructive transition-colors p-1"><Trash2 className="h-4 w-4" /></button>
                          </div>
                        </div>
                        <p className="text-sm text-muted-foreground truncate">{product.description || "لا يوجد وصف"}</p>
                        <div className="mt-auto pt-2 flex items-center justify-between flex-wrap gap-2">
                          <span className="font-bold text-primary">{formatCurrency(product.price)}</span>
                          <div className="flex items-center gap-2">
                            {product.stockQuantity != null && (
                              <Badge variant="outline" className="text-[10px] h-5">الكمية: {product.stockQuantity}</Badge>
                            )}
                            <button onClick={() => toggleProductAvailability(product)}>
                              <Badge variant={product.isAvailable ? "outline" : "secondary"} className="text-[10px] h-5 cursor-pointer">
                                {product.isAvailable ? "متوفر" : "غير متوفر"}
                              </Badge>
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="border-t border-border pt-2">
                      <button
                        className="text-xs text-primary font-medium"
                        onClick={() => { setExpandedSizesProductId(expandedSizesProductId === product.id ? null : product.id); resetSizeForm(); }}
                        data-testid={`button-toggle-sizes-${product.id}`}
                      >
                        {product.sizes && product.sizes.length > 0 ? `📏 الأحجام (${product.sizes.length})` : "📏 إضافة أحجام (صغير/وسط/كبير)"} {expandedSizesProductId === product.id ? "▲" : "▼"}
                      </button>

                      {expandedSizesProductId === product.id && (
                        <div className="mt-2 space-y-2">
                          {(product.sizes ?? []).map((size) => (
                            <div key={size.id} className="flex items-center justify-between text-sm bg-secondary/30 rounded-md px-2 py-1.5">
                              <span>{size.name} — {formatCurrency(size.price)}{!size.isAvailable && " (مخفي)"}</span>
                              <div className="flex items-center gap-1">
                                <button onClick={() => { setEditingSizeId(size.id); setSizeForm({ name: size.name, nameAr: size.nameAr || "", price: String(size.price), sortOrder: String(size.sortOrder), isAvailable: size.isAvailable }); }}><Pencil className="h-3.5 w-3.5" /></button>
                                <button onClick={() => removeSize(size.id)}><Trash2 className="h-3.5 w-3.5" /></button>
                              </div>
                            </div>
                          ))}
                          <form onSubmit={(e) => submitSize(e, product.id)} className="flex items-center gap-2 flex-wrap">
                            <Input placeholder="اسم الحجم (مثال: كبير)" className="h-8 flex-1 min-w-[100px]" value={sizeForm.name} onChange={(e) => setSizeForm({ ...sizeForm, name: e.target.value })} required data-testid="input-size-name" />
                            <Input type="number" step="0.01" min="0" placeholder="السعر الكامل" className="h-8 w-28" value={sizeForm.price} onChange={(e) => setSizeForm({ ...sizeForm, price: e.target.value })} required data-testid="input-size-price" />
                            <Button size="sm" type="submit" className="h-8" data-testid="button-submit-size">{editingSizeId ? "حفظ" : "إضافة"}</Button>
                            {editingSizeId && <Button size="sm" type="button" variant="outline" className="h-8" onClick={resetSizeForm}>إلغاء</Button>}
                          </form>
                          <p className="text-[11px] text-muted-foreground">سعر الحجم يحل محل سعر المنتج الأساسي عند اختياره من قبل العميل.</p>
                        </div>
                      )}
                    </div>

                    <div className="border-t border-border pt-2">
                      <button
                        className="text-xs text-primary font-medium"
                        onClick={() => { setExpandedAddonsProductId(expandedAddonsProductId === product.id ? null : product.id); resetAddonForm(); }}
                      >
                        {product.addons && product.addons.length > 0 ? `الإضافات (${product.addons.length})` : "إضافة إضافات خاصة"} {expandedAddonsProductId === product.id ? "▲" : "▼"}
                      </button>

                      {expandedAddonsProductId === product.id && (
                        <div className="mt-2 space-y-2">
                          {(product.addons ?? []).map((addon) => (
                            <div key={addon.id} className="flex items-center justify-between text-sm bg-secondary/30 rounded-md px-2 py-1.5">
                              <span>{addon.name} — {formatCurrency(addon.price)}{!addon.isAvailable && " (مخفي)"}</span>
                              <div className="flex items-center gap-1">
                                <button onClick={() => { setEditingAddonId(addon.id); setAddonForm({ name: addon.name, nameAr: addon.nameAr || "", price: String(addon.price), isAvailable: addon.isAvailable }); }}><Pencil className="h-3.5 w-3.5" /></button>
                                <button onClick={() => removeAddon(addon.id)}><Trash2 className="h-3.5 w-3.5" /></button>
                              </div>
                            </div>
                          ))}
                          <form onSubmit={(e) => submitAddon(e, product.id)} className="flex items-center gap-2 flex-wrap">
                            <Input placeholder="اسم الإضافة" className="h-8 flex-1 min-w-[100px]" value={addonForm.name} onChange={(e) => setAddonForm({ ...addonForm, name: e.target.value })} required />
                            <Input type="number" step="0.01" min="0" placeholder="السعر" className="h-8 w-24" value={addonForm.price} onChange={(e) => setAddonForm({ ...addonForm, price: e.target.value })} />
                            <Button size="sm" type="submit" className="h-8">{editingAddonId ? "حفظ" : "إضافة"}</Button>
                            {editingAddonId && <Button size="sm" type="button" variant="outline" className="h-8" onClick={resetAddonForm}>إلغاء</Button>}
                          </form>
                        </div>
                      )}
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
