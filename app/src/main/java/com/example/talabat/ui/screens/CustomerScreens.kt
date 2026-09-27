package com.example.talabat.ui.screens

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import coil.compose.AsyncImage
import com.example.talabat.data.*
import kotlinx.coroutines.launch

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun CustomerStorefrontScreen(
    onBack: () -> Unit,
    onCheckout: (Restaurant) -> Unit
) {
    val restaurants by TalabatRepository.restaurants.collectAsState()
    val cartItems by TalabatRepository.cartItems.collectAsState()
    var selectedRestaurant by remember { mutableStateOf<Restaurant?>(null) }
    val products by TalabatRepository.products.collectAsState()
    val scope = rememberCoroutineScope()
    var catalogLoading by remember { mutableStateOf(true) }
    var catalogError by remember { mutableStateOf<String?>(null) }

    LaunchedEffect(Unit) {
        catalogLoading = true
        catalogError = null
        try {
            TalabatRepository.loadCatalog()
        } catch (error: Exception) {
            catalogError = error.message ?: "تعذر تحميل بيانات المطاعم."
        } finally {
            catalogLoading = false
        }
    }

    val totalCartCount = cartItems.sumOf { it.quantity }
    val totalCartAmount = cartItems.sumOf { (it.product.price + it.extraPrice) * it.quantity }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text(selectedRestaurant?.name ?: "طلبات — المطاعم المتاحة") },
                navigationIcon = {
                    IconButton(onClick = {
                        if (selectedRestaurant != null) {
                            selectedRestaurant = null
                        } else {
                            onBack()
                        }
                    }) {
                        Icon(Icons.Default.ArrowBack, contentDescription = "عودة")
                    }
                },
                actions = {
                    if (selectedRestaurant != null && totalCartCount > 0) {
                        BadgeBox(count = totalCartCount) {
                            IconButton(onClick = { selectedRestaurant?.let { onCheckout(it) } }) {
                                Icon(Icons.Default.ShoppingCart, contentDescription = "السلة")
                            }
                        }
                    }
                }
            )
        },
        bottomBar = {
            if (selectedRestaurant != null && totalCartCount > 0) {
                Surface(
                    tonalElevation = 8.dp,
                    modifier = Modifier.fillMaxWidth()
                ) {
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(16.dp),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Column {
                            Text("المجموع: ${String.format("%.2f", totalCartAmount)} د.ل", fontWeight = FontWeight.Bold)
                            Text("$totalCartCount منتج في السلة", style = MaterialTheme.typography.bodySmall)
                        }
                        Button(onClick = { selectedRestaurant?.let { onCheckout(it) } }) {
                            Text("إتمام الطلب")
                            Spacer(Modifier.width(8.dp))
                            Icon(Icons.Default.ArrowForward, contentDescription = null)
                        }
                    }
                }
            }
        }
    ) { padding ->
        Box(modifier = Modifier.padding(padding).fillMaxSize()) {
            if (selectedRestaurant == null) {
                when {
                    catalogLoading && restaurants.isEmpty() -> CircularProgressIndicator(
                        modifier = Modifier.align(Alignment.Center)
                    )
                    catalogError != null && restaurants.isEmpty() -> Column(
                        modifier = Modifier.align(Alignment.Center).padding(24.dp),
                        horizontalAlignment = Alignment.CenterHorizontally,
                        verticalArrangement = Arrangement.spacedBy(12.dp)
                    ) {
                        Text(catalogError.orEmpty(), color = MaterialTheme.colorScheme.error)
                        Button(onClick = {
                            scope.launch {
                                catalogLoading = true
                                catalogError = null
                                try {
                                    TalabatRepository.loadCatalog()
                                } catch (error: Exception) {
                                    catalogError = error.message ?: "تعذر تحميل بيانات المطاعم."
                                } finally {
                                    catalogLoading = false
                                }
                            }
                        }) { Text("إعادة المحاولة") }
                    }
                    restaurants.isEmpty() -> Text(
                        "لا توجد مطاعم متاحة حالياً.",
                        modifier = Modifier.align(Alignment.Center),
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                    else -> LazyColumn(
                        modifier = Modifier.fillMaxSize(),
                        contentPadding = PaddingValues(16.dp),
                        verticalArrangement = Arrangement.spacedBy(16.dp)
                    ) {
                    if (catalogError != null) {
                        item {
                            Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                                Text(catalogError.orEmpty(), color = MaterialTheme.colorScheme.error)
                                TextButton(onClick = {
                                    scope.launch {
                                        catalogLoading = true
                                        catalogError = null
                                        try {
                                            TalabatRepository.loadCatalog()
                                        } catch (error: Exception) {
                                            catalogError = error.message ?: "تعذر تحميل بيانات المطاعم."
                                        } finally {
                                            catalogLoading = false
                                        }
                                    }
                                }) { Text("إعادة تحميل القائمة") }
                            }
                        }
                    }
                    item {
                        Text(
                            "اختر مطعماً للطلب",
                            style = MaterialTheme.typography.titleLarge,
                            fontWeight = FontWeight.Bold
                        )
                    }
                    items(restaurants) { restaurant ->
                        Card(
                            modifier = Modifier
                                .fillMaxWidth()
                                .clickable { selectedRestaurant = restaurant },
                            elevation = CardDefaults.cardElevation(4.dp)
                        ) {
                            Column {
                                AsyncImage(
                                    model = restaurant.displayImageUrl,
                                    contentDescription = restaurant.name,
                                    modifier = Modifier
                                        .fillMaxWidth()
                                        .height(160.dp),
                                    contentScale = ContentScale.Crop
                                )
                                Column(modifier = Modifier.padding(16.dp)) {
                                    Row(
                                        modifier = Modifier.fillMaxWidth(),
                                        horizontalArrangement = Arrangement.SpaceBetween
                                    ) {
                                        Text(restaurant.name, fontWeight = FontWeight.Bold, style = MaterialTheme.typography.titleMedium)
                                        if (restaurant.rating > 0) {
                                            Row(verticalAlignment = Alignment.CenterVertically) {
                                                Icon(Icons.Default.Star, contentDescription = null, tint = MaterialTheme.colorScheme.primary, modifier = Modifier.size(16.dp))
                                                Text(" ${restaurant.rating}", style = MaterialTheme.typography.bodyMedium)
                                            }
                                        }
                                    }
                                    Spacer(Modifier.height(4.dp))
                                    Text(restaurant.description, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
                                    Spacer(Modifier.height(8.dp))
                                    Row(horizontalArrangement = Arrangement.spacedBy(16.dp)) {
                                        if (restaurant.deliveryTime.isNotBlank()) {
                                            Text("⏱ ${restaurant.deliveryTime}", style = MaterialTheme.typography.bodySmall)
                                        }
                                        Text("🛵 التوصيل: ${restaurant.deliveryFee} د.ل", style = MaterialTheme.typography.bodySmall)
                                    }
                                }
                            }
                        }
                    }
                    }
                }
            } else {
                val restProducts = products.filter { it.restaurantId == selectedRestaurant?.id }
                LazyColumn(
                    modifier = Modifier.fillMaxSize(),
                    contentPadding = PaddingValues(16.dp),
                    verticalArrangement = Arrangement.spacedBy(12.dp)
                ) {
                    item {
                        Card(modifier = Modifier.fillMaxWidth()) {
                            Column(modifier = Modifier.padding(16.dp)) {
                                Text(selectedRestaurant!!.name, style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold)
                                Text(selectedRestaurant!!.address, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
                                Text("📞 ${selectedRestaurant!!.phone}", style = MaterialTheme.typography.bodySmall)
                            }
                        }
                        Spacer(Modifier.height(8.dp))
                        Text("قائمة الطعام", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold)
                    }

                    if (restProducts.isEmpty()) {
                        item { Text("لا توجد منتجات متاحة في هذا المطعم.", color = MaterialTheme.colorScheme.onSurfaceVariant) }
                    } else items(restProducts) { product ->
                        Card(modifier = Modifier.fillMaxWidth()) {
                            Row(
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .padding(12.dp),
                                horizontalArrangement = Arrangement.SpaceBetween,
                                verticalAlignment = Alignment.CenterVertically
                            ) {
                                AsyncImage(
                                    model = product.imageUrl,
                                    contentDescription = product.name,
                                    modifier = Modifier
                                        .size(80.dp)
                                        .clip(MaterialTheme.shapes.medium),
                                    contentScale = ContentScale.Crop
                                )
                                Spacer(Modifier.width(12.dp))
                                Column(modifier = Modifier.weight(1f)) {
                                    Text(product.name, fontWeight = FontWeight.Bold)
                                    Text(product.description, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                                    Spacer(Modifier.height(4.dp))
                                    Text("${product.price} د.ل", fontWeight = FontWeight.Bold, color = MaterialTheme.colorScheme.primary)
                                }
                                Button(
                                    onClick = { TalabatRepository.addToCart(product) },
                                    shape = MaterialTheme.shapes.small
                                ) {
                                    Icon(Icons.Default.Add, contentDescription = "إضافة")
                                }
                            }
                        }
                    }
                }
            }
        }
    }
}

@Composable
fun BadgeBox(count: Int, content: @Composable () -> Unit) {
    Box {
        content()
        Badge(
            modifier = Modifier
                .align(Alignment.TopEnd)
                .offset(x = (-4).dp, y = 4.dp)
        ) {
            Text("$count")
        }
    }
}
