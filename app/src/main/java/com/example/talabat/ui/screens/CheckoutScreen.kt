package com.example.talabat.ui.screens

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ArrowBack
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.example.talabat.data.*

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun CheckoutScreen(
    restaurant: Restaurant,
    onBack: () -> Unit,
    onOrderPlaced: (Order) -> Unit
) {
    val cartItems by TalabatRepository.cartItems.collectAsState()
    var customerName by remember { mutableStateOf("") }
    var customerPhone by remember { mutableStateOf("") }
    var orderType by remember { mutableStateOf("DELIVERY") } // DELIVERY or RESERVATION
    var latitude by remember { mutableStateOf("32.8872") }
    var longitude by remember { mutableStateOf("13.1913") }
    var orderSuccess by remember { mutableStateOf<Order?>(null) }

    val subtotal = cartItems.sumOf { (it.product.price + it.extraPrice) * it.quantity }
    val deliveryFee = if (orderType == "DELIVERY") restaurant.deliveryFee else 0.0
    val total = subtotal + deliveryFee

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("إتمام الطلب — ${restaurant.name}") },
                navigationIcon = {
                    IconButton(onClick = onBack) {
                        Icon(Icons.Default.ArrowBack, contentDescription = "عودة")
                    }
                }
            )
        }
    ) { padding ->
        if (orderSuccess != null) {
            Column(
                modifier = Modifier
                    .fillMaxSize()
                    .padding(padding)
                    .padding(24.dp),
                verticalArrangement = Arrangement.Center,
                horizontalAlignment = Alignment.CenterHorizontally
            ) {
                Icon(Icons.Default.ArrowBack, contentDescription = null, modifier = Modifier.size(64.dp), tint = MaterialTheme.colorScheme.primary)
                Spacer(Modifier.height(16.dp))
                Text("تم حفظ الطلب وإرساله للبوت المركزي بنجاح!", style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold)
                Text("رقم الطلب: #${orderSuccess!!.id}", style = MaterialTheme.typography.bodyLarge)
                Text("تم التوزيع التلقائي لبوت السائق النشط عبر Telegram", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                Spacer(Modifier.height(24.dp))
                Button(onClick = { onOrderPlaced(orderSuccess!!) }) {
                    Text("العودة للرئيسية")
                }
            }
        } else {
            LazyColumn(
                modifier = Modifier
                    .fillMaxSize()
                    .padding(padding),
                contentPadding = PaddingValues(16.dp),
                verticalArrangement = Arrangement.spacedBy(16.dp)
            ) {
                item {
                    Text("نوع الطلب", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold)
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.spacedBy(8.dp)
                    ) {
                        Button(
                            onClick = { orderType = "DELIVERY" },
                            modifier = Modifier.weight(1f),
                            colors = ButtonDefaults.buttonColors(
                                containerColor = if (orderType == "DELIVERY") MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.surfaceVariant
                            )
                        ) {
                            Text("توصيل (Delivery)")
                        }
                        Button(
                            onClick = { orderType = "RESERVATION" },
                            modifier = Modifier.weight(1f),
                            colors = ButtonDefaults.buttonColors(
                                containerColor = if (orderType == "RESERVATION") MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.surfaceVariant
                            )
                        ) {
                            Text("حجز طاولة (Reservation)")
                        }
                    }
                }

                item {
                    Text("ملخص المنتجات", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold)
                }
                items(cartItems) { item ->
                    Card(modifier = Modifier.fillMaxWidth()) {
                        Row(
                            modifier = Modifier
                                .fillMaxWidth()
                                .padding(12.dp),
                            horizontalArrangement = Arrangement.SpaceBetween
                        ) {
                            Column {
                                Text(item.product.name, fontWeight = FontWeight.Bold)
                                Text("الكمية: ${item.quantity}", style = MaterialTheme.typography.bodySmall)
                            }
                            Text("${(item.product.price + item.extraPrice) * item.quantity} د.ل", fontWeight = FontWeight.Bold)
                        }
                    }
                }

                item {
                    Card(modifier = Modifier.fillMaxWidth()) {
                        Column(modifier = Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                            Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                                Text("المجموع الفرعي")
                                Text("$subtotal د.ل")
                            }
                            if (orderType == "DELIVERY") {
                                Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                                    Text("رسوم التوصيل")
                                    Text("$deliveryFee د.ل")
                                }
                            }
                            Divider()
                            Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                                Text("الإجمالي الكلي", fontWeight = FontWeight.Bold)
                                Text("$total د.ل", fontWeight = FontWeight.Bold, color = MaterialTheme.colorScheme.primary)
                            }
                        }
                    }
                }

                item {
                    Text("بيانات الزبون", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold)
                    Spacer(Modifier.height(8.dp))
                    OutlinedTextField(
                        value = customerName,
                        onValueChange = { customerName = it },
                        label = { Text("الاسم الكامل") },
                        modifier = Modifier.fillMaxWidth()
                    )
                    Spacer(Modifier.height(8.dp))
                    OutlinedTextField(
                        value = customerPhone,
                        onValueChange = { customerPhone = it },
                        label = { Text("رقم الهاتف") },
                        modifier = Modifier.fillMaxWidth()
                    )

                    if (orderType == "DELIVERY") {
                        Spacer(Modifier.height(8.dp))
                        Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                            OutlinedTextField(
                                value = latitude,
                                onValueChange = { latitude = it },
                                label = { Text("خط العرض (Latitude)") },
                                modifier = Modifier.weight(1f)
                            )
                            OutlinedTextField(
                                value = longitude,
                                onValueChange = { longitude = it },
                                label = { Text("خط الطول (Longitude)") },
                                modifier = Modifier.weight(1f)
                            )
                        }
                    }

                    Spacer(Modifier.height(16.dp))
                    Button(
                        onClick = {
                            if (customerName.isNotBlank() && customerPhone.isNotBlank()) {
                                val lat = if (orderType == "DELIVERY") latitude.toDoubleOrNull() else null
                                val lng = if (orderType == "DELIVERY") longitude.toDoubleOrNull() else null
                                val placed = TalabatRepository.placeOrder(restaurant, customerName, customerPhone, orderType, total, lat, lng)
                                orderSuccess = placed
                            }
                        },
                        modifier = Modifier.fillMaxWidth(),
                        enabled = customerName.isNotBlank() && customerPhone.isNotBlank() && cartItems.isNotEmpty()
                    ) {
                        Text("إرسال الطلب للبوت المركزي وتوزيعە")
                    }
                }
            }
        }
    }
}
