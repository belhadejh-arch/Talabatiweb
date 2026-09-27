package com.example.talabat.ui.screens

import android.Manifest
import android.content.Context
import android.content.pm.PackageManager
import android.location.Location
import android.location.LocationListener
import android.location.LocationManager
import android.os.Bundle
import android.os.Looper
import androidx.activity.compose.BackHandler
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ArrowBack
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.core.content.ContextCompat
import com.example.talabat.data.*
import java.time.LocalDate
import java.time.LocalTime
import java.util.UUID
import kotlin.coroutines.resume
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.launch
import kotlinx.coroutines.suspendCancellableCoroutine
import kotlinx.coroutines.withTimeoutOrNull
import kotlinx.serialization.decodeFromString
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun CheckoutScreen(
    restaurant: Restaurant,
    onBack: () -> Unit,
    onOrderPlaced: (Order) -> Unit
) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    val cartItems by TalabatRepository.cartItems.collectAsState()
    var idempotencyKey by rememberSaveable { mutableStateOf<String?>(UUID.randomUUID().toString()) }
    var pendingOrderJson by rememberSaveable { mutableStateOf<String?>(null) }
    var orderSuccessJson by rememberSaveable { mutableStateOf<String?>(null) }
    val orderSuccess = remember(orderSuccessJson) {
        orderSuccessJson?.let { Json.decodeFromString<Order>(it) }
    }
    val confirmedOrder = orderSuccess
    var customerName by rememberSaveable { mutableStateOf("") }
    var customerPhone by rememberSaveable { mutableStateOf("") }
    var orderType by rememberSaveable { mutableStateOf("DELIVERY") }
    var latitude by rememberSaveable { mutableStateOf("") }
    var longitude by rememberSaveable { mutableStateOf("") }
    var locationCaptured by rememberSaveable { mutableStateOf(false) }
    var locationLoading by remember { mutableStateOf(false) }
    var locationError by rememberSaveable { mutableStateOf<String?>(null) }
    var reservationDate by rememberSaveable { mutableStateOf("") }
    var reservationTime by rememberSaveable { mutableStateOf("") }
    var partySize by rememberSaveable { mutableStateOf("") }
    var notes by rememberSaveable { mutableStateOf("") }
    var submitting by remember { mutableStateOf(false) }
    var submitError by rememberSaveable { mutableStateOf<String?>(null) }
    val attemptLocked = pendingOrderJson != null
    val draftEditable = !attemptLocked && !submitting

    BackHandler(enabled = attemptLocked && orderSuccess == null) {}

    val subtotal = cartItems.sumOf { (it.product.price + it.extraPrice) * it.quantity }
    val deliveryFee = if (orderType == "DELIVERY") restaurant.deliveryFee else 0.0
    val total = subtotal + deliveryFee
    val reservationValid = runCatching {
        LocalDate.parse(reservationDate)
        LocalTime.parse(reservationTime)
        partySize.toInt() > 0
    }.getOrDefault(false)
    val deliveryValid = locationCaptured &&
        (latitude.toDoubleOrNull()?.let { it in -90.0..90.0 } == true) &&
        (longitude.toDoubleOrNull()?.let { it in -180.0..180.0 } == true)

    suspend fun captureLocation() {
        locationLoading = true
        locationError = null
        try {
            val location = getCurrentLocation(context)
                ?: throw IllegalStateException("لم يتم الحصول على موقع حديث. تحقق من تشغيل GPS.")
            latitude = location.latitude.toString()
            longitude = location.longitude.toString()
            locationCaptured = true
        } catch (error: Exception) {
            if (error is CancellationException) throw error
            locationCaptured = false
            locationError = error.message ?: "تعذر تحديد الموقع."
        } finally {
            locationLoading = false
        }
    }

    val locationPermissionLauncher = rememberLauncherForActivityResult(
        ActivityResultContracts.RequestMultiplePermissions()
    ) { permissions ->
        if (permissions[Manifest.permission.ACCESS_FINE_LOCATION] == true) {
            scope.launch { captureLocation() }
        } else {
            locationError = "يلزم السماح بالموقع الدقيق لإرسال طلب توصيل."
        }
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("إتمام الطلب — ${restaurant.name}") },
                navigationIcon = {
                    IconButton(
                        onClick = onBack,
                        enabled = !attemptLocked || orderSuccess != null
                    ) {
                        Icon(Icons.Default.ArrowBack, contentDescription = "عودة")
                    }
                }
            )
        }
    ) { padding ->
        if (confirmedOrder != null) {
            Column(
                modifier = Modifier.fillMaxSize().padding(padding).padding(24.dp),
                verticalArrangement = Arrangement.Center,
                horizontalAlignment = Alignment.CenterHorizontally
            ) {
                Text("تم حفظ الطلب في النظام بنجاح.", style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold)
                Text("رقم الطلب: #${confirmedOrder.id}", style = MaterialTheme.typography.bodyLarge)
                Text("الحالة: ${confirmedOrder.status}", style = MaterialTheme.typography.bodyMedium)
                Spacer(Modifier.height(24.dp))
                Button(onClick = { onOrderPlaced(confirmedOrder) }) {
                    Text("العودة للرئيسية")
                }
            }
        } else {
            LazyColumn(
                modifier = Modifier.fillMaxSize().padding(padding),
                contentPadding = PaddingValues(16.dp),
                verticalArrangement = Arrangement.spacedBy(16.dp)
            ) {
                item {
                    Text("نوع الطلب", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold)
                    Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        Button(
                            onClick = { orderType = "DELIVERY"; locationError = null },
                            enabled = draftEditable,
                            modifier = Modifier.weight(1f),
                            colors = ButtonDefaults.buttonColors(
                                containerColor = if (orderType == "DELIVERY") MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.surfaceVariant
                            )
                        ) { Text("توصيل") }
                        Button(
                            onClick = { orderType = "RESERVATION"; submitError = null },
                            enabled = draftEditable,
                            modifier = Modifier.weight(1f),
                            colors = ButtonDefaults.buttonColors(
                                containerColor = if (orderType == "RESERVATION") MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.surfaceVariant
                            )
                        ) { Text("حجز طاولة") }
                    }
                }

                item { Text("ملخص المنتجات", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold) }
                items(cartItems) { item ->
                    Card(modifier = Modifier.fillMaxWidth()) {
                        Row(
                            modifier = Modifier.fillMaxWidth().padding(12.dp),
                            horizontalArrangement = Arrangement.SpaceBetween
                        ) {
                            Column {
                                Text(item.product.name, fontWeight = FontWeight.Bold)
                                Text("الكمية: ${item.quantity}", style = MaterialTheme.typography.bodySmall)
                                item.selectedSize?.let { Text("الحجم: $it", style = MaterialTheme.typography.bodySmall) }
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
                    OutlinedTextField(
                        value = customerName,
                        onValueChange = { customerName = it },
                        label = { Text("الاسم الكامل") },
                        modifier = Modifier.fillMaxWidth(),
                        enabled = draftEditable,
                        singleLine = true
                    )
                    OutlinedTextField(
                        value = customerPhone,
                        onValueChange = { customerPhone = it },
                        label = { Text("رقم الهاتف") },
                        modifier = Modifier.fillMaxWidth(),
                        enabled = draftEditable,
                        singleLine = true
                    )

                    if (orderType == "DELIVERY") {
                        Spacer(Modifier.height(8.dp))
                        Text("موقع التوصيل مطلوب", style = MaterialTheme.typography.titleSmall)
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.spacedBy(8.dp),
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            OutlinedTextField(
                                value = latitude,
                                onValueChange = {},
                                readOnly = true,
                                enabled = draftEditable,
                                label = { Text("Latitude") },
                                modifier = Modifier.weight(1f),
                                singleLine = true
                            )
                            OutlinedTextField(
                                value = longitude,
                                onValueChange = {},
                                readOnly = true,
                                enabled = draftEditable,
                                label = { Text("Longitude") },
                                modifier = Modifier.weight(1f),
                                singleLine = true
                            )
                        }
                        OutlinedButton(
                            onClick = {
                                val granted = ContextCompat.checkSelfPermission(
                                    context,
                                    Manifest.permission.ACCESS_FINE_LOCATION
                                ) == PackageManager.PERMISSION_GRANTED
                                if (granted) {
                                    scope.launch { captureLocation() }
                                } else {
                                    locationPermissionLauncher.launch(
                                        arrayOf(
                                            Manifest.permission.ACCESS_FINE_LOCATION,
                                            Manifest.permission.ACCESS_COARSE_LOCATION
                                        )
                                    )
                                }
                            },
                            enabled = !locationLoading && draftEditable,
                            modifier = Modifier.fillMaxWidth()
                        ) {
                            if (locationLoading) CircularProgressIndicator(
                                modifier = Modifier.size(18.dp),
                                strokeWidth = 2.dp
                            ) else Text(if (locationCaptured) "تحديث موقعي الحالي" else "تحديد موقعي الحالي")
                        }
                        locationError?.let { Text(it, color = MaterialTheme.colorScheme.error) }
                        if (locationCaptured) {
                            Text("تم التقاط الموقع من الجهاز.", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.primary)
                        }
                    }

                    if (orderType == "RESERVATION") {
                        Spacer(Modifier.height(8.dp))
                        Text("تفاصيل الحجز مطلوبة", style = MaterialTheme.typography.titleSmall)
                        OutlinedTextField(
                            value = reservationDate,
                            onValueChange = { reservationDate = it },
                            label = { Text("تاريخ الحجز (YYYY-MM-DD)") },
                            modifier = Modifier.fillMaxWidth(),
                            enabled = draftEditable,
                            singleLine = true
                        )
                        OutlinedTextField(
                            value = reservationTime,
                            onValueChange = { reservationTime = it },
                            label = { Text("وقت الحجز (HH:MM)") },
                            modifier = Modifier.fillMaxWidth(),
                            enabled = draftEditable,
                            singleLine = true
                        )
                        OutlinedTextField(
                            value = partySize,
                            onValueChange = { partySize = it.filter(Char::isDigit).take(2) },
                            label = { Text("عدد الأشخاص") },
                            modifier = Modifier.fillMaxWidth(),
                            enabled = draftEditable,
                            singleLine = true
                        )
                        if (reservationDate.isNotBlank() && !reservationValid) {
                            Text("أدخل تاريخاً ووقتاً صحيحين وعدداً موجباً للأشخاص.", color = MaterialTheme.colorScheme.error)
                        }
                    }

                    Spacer(Modifier.height(8.dp))
                    OutlinedTextField(
                        value = notes,
                        onValueChange = { notes = it },
                        label = { Text("ملاحظات الزبون") },
                        modifier = Modifier.fillMaxWidth(),
                        enabled = draftEditable,
                        minLines = 2
                    )

                    if (attemptLocked) {
                        Text(
                            "تم تثبيت بيانات هذه المحاولة. إعادة المحاولة سترسل الطلب نفسه بالمفتاح نفسه؛ لا يمكن تعديل التفاصيل أثناء انتظار تأكيد الخادم.",
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant
                        )
                    }
                    submitError?.let {
                        Spacer(Modifier.height(8.dp))
                        Text(it, color = MaterialTheme.colorScheme.error)
                    }
                    Spacer(Modifier.height(8.dp))
                    Button(
                        onClick = {
                            scope.launch {
                                submitting = true
                                submitError = null
                                try {
                                    val payload = pendingOrderJson ?: Json.encodeToString(
                                        CreateOrderRequest(
                                            restaurantId = restaurant.id,
                                            customerName = customerName.trim(),
                                            customerPhone = customerPhone.trim(),
                                            orderType = orderType,
                                            latitude = latitude.toDoubleOrNull().takeIf { orderType == "DELIVERY" },
                                            longitude = longitude.toDoubleOrNull().takeIf { orderType == "DELIVERY" },
                                            notes = notes.trim().takeIf(String::isNotBlank),
                                            reservationDate = reservationDate.trim()
                                                .takeIf { orderType == "RESERVATION" && it.isNotBlank() },
                                            reservationTime = reservationTime.trim()
                                                .takeIf { orderType == "RESERVATION" && it.isNotBlank() },
                                            partySize = partySize.toIntOrNull().takeIf { orderType == "RESERVATION" },
                                            items = cartItems.map {
                                                OrderItemRequest(
                                                    productId = it.product.id,
                                                    quantity = it.quantity,
                                                    selectedSize = it.selectedSize,
                                                    extraPrice = it.extraPrice
                                                )
                                            }
                                        )
                                    ).also { pendingOrderJson = it }
                                    val request = Json.decodeFromString<CreateOrderRequest>(payload)
                                    val attemptKey = idempotencyKey
                                        ?: throw IllegalStateException("لا يمكن إعادة إرسال طلب تم تأكيده.")
                                    val order = TalabatRepository.placeOrder(request, attemptKey)
                                    orderSuccessJson = Json.encodeToString(order)
                                    pendingOrderJson = null
                                    idempotencyKey = null
                                } catch (error: CancellationException) {
                                    throw error
                                } catch (error: Exception) {
                                    submitError = error.message
                                        ?: "تعذر تأكيد حفظ الطلب. أعد المحاولة بنفس بيانات الطلب."
                                } finally {
                                    submitting = false
                                }
                            }
                        },
                        modifier = Modifier.fillMaxWidth(),
                        enabled = !submitting && idempotencyKey != null &&
                            (attemptLocked ||
                                (customerName.isNotBlank() &&
                                    customerPhone.isNotBlank() &&
                                    cartItems.isNotEmpty() &&
                                    (orderType != "DELIVERY" || deliveryValid) &&
                                    (orderType != "RESERVATION" || reservationValid)))
                    ) {
                        if (submitting) CircularProgressIndicator(
                            modifier = Modifier.size(18.dp),
                            strokeWidth = 2.dp
                        ) else Text(if (attemptLocked) "إعادة محاولة إرسال الطلب نفسه" else "إرسال الطلب")
                    }
                }
            }
        }
    }
}

@Suppress("MissingPermission")
private suspend fun getCurrentLocation(context: Context): Location? {
    val locationManager = context.getSystemService(Context.LOCATION_SERVICE) as LocationManager
    if (ContextCompat.checkSelfPermission(
            context,
            Manifest.permission.ACCESS_FINE_LOCATION
        ) != PackageManager.PERMISSION_GRANTED
    ) {
        throw SecurityException("يلزم السماح بالموقع الدقيق لإرسال طلب توصيل.")
    }
    val provider = LocationManager.GPS_PROVIDER
    if (!runCatching { locationManager.isProviderEnabled(provider) }.getOrDefault(false)) {
        throw IllegalStateException("شغّل GPS ثم أعد المحاولة.")
    }

    return withTimeoutOrNull(30_000) {
        suspendCancellableCoroutine { continuation ->
            val listener = object : LocationListener {
                override fun onLocationChanged(location: Location) {
                    if (continuation.isActive) continuation.resume(location)
                }

                @Deprecated("Deprecated by Android")
                override fun onStatusChanged(provider: String?, status: Int, extras: Bundle?) = Unit
                override fun onProviderEnabled(provider: String) = Unit
                override fun onProviderDisabled(provider: String) = Unit
            }
            try {
                locationManager.requestLocationUpdates(
                    provider,
                    0L,
                    0f,
                    listener,
                    Looper.getMainLooper()
                )
                continuation.invokeOnCancellation { locationManager.removeUpdates(listener) }
            } catch (error: Exception) {
                if (continuation.isActive) continuation.resumeWith(Result.failure(error))
            }
        }
    } ?: throw IllegalStateException("انتهت مهلة تحديد الموقع. حاول مرة أخرى.")
}