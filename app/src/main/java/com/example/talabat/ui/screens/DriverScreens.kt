package com.example.talabat.ui.screens

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ArrowBack
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.List
import androidx.compose.material.icons.filled.Person
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.unit.dp
import com.example.talabat.data.*
import java.time.DayOfWeek
import java.time.LocalDate
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun DriverPortalScreen(onBack: () -> Unit) {
    val scope = rememberCoroutineScope()
    val token by TalabatRepository.driverToken.collectAsState()
    val driver by TalabatRepository.driver.collectAsState()
    val orders by TalabatRepository.driverOrders.collectAsState()
    val stats by TalabatRepository.driverStats.collectAsState()
    val restaurants by TalabatRepository.restaurants.collectAsState()

    var serialNumber by remember { mutableStateOf("") }
    var selectedTab by remember { mutableStateOf("orders") }
    var selectedPeriod by remember { mutableStateOf("هذا الأسبوع") }
    var appliedPeriod by remember { mutableStateOf("weekly") }
    val initialDate = remember { LocalDate.now() }
    val initialFrom = remember { initialDate.with(DayOfWeek.MONDAY).toString() }
    val initialTo = remember { initialDate.toString() }
    var from by remember { mutableStateOf(initialFrom) }
    var to by remember { mutableStateOf(initialTo) }
    var draftFrom by remember { mutableStateOf(initialFrom) }
    var draftTo by remember { mutableStateOf(initialTo) }
    var selectedStatus by remember { mutableStateOf("") }
    var selectedRestaurant by remember { mutableStateOf<Int?>(null) }
    var busy by remember { mutableStateOf(false) }
    var loadingData by remember { mutableStateOf(true) }
    var error by remember { mutableStateOf<String?>(null) }
    var success by remember { mutableStateOf<String?>(null) }

    LaunchedEffect(Unit) {
        try {
            TalabatRepository.loadCatalog()
        } catch (exception: Exception) {
            error = exception.message ?: "تعذر تحميل قائمة المطاعم."
        }
    }

    LaunchedEffect(token, from, to, selectedStatus, selectedRestaurant, appliedPeriod) {
        if (token.isNullOrBlank()) return@LaunchedEffect
        while (isActive) {
            loadingData = true
            try {
                error = null
                TalabatRepository.loadDriverData(
                    StatsFilters(
                        from = from.takeIf(String::isNotBlank),
                        to = to.takeIf(String::isNotBlank),
                        status = selectedStatus.takeIf(String::isNotBlank),
                        restaurantId = selectedRestaurant,
                        period = appliedPeriod
                    )
                )
            } catch (exception: Exception) {
                error = exception.message ?: "تعذر تحديث بيانات السائق."
            } finally {
                loadingData = false
            }
            delay(15_000)
        }
    }

    val currentDriver = driver
    if (token == null || currentDriver == null) {
        DriverLoginScreen(
            serialNumber = serialNumber,
            onSerialNumberChange = { serialNumber = it.filter(Char::isDigit).take(6) },
            busy = busy,
            error = error,
            onBack = onBack,
            onLogin = {
                scope.launch {
                    busy = true
                    error = null
                    try {
                        TalabatRepository.driverLogin(serialNumber)
                        serialNumber = ""
                        success = null
                    } catch (exception: Exception) {
                        error = exception.message ?: "تعذر تسجيل الدخول."
                    } finally {
                        busy = false
                    }
                }
            }
        )
        return
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("حساب السائق — ${currentDriver.name}") },
                navigationIcon = {
                    IconButton(onClick = onBack) {
                        Icon(Icons.Default.ArrowBack, contentDescription = "عودة")
                    }
                },
                actions = {
                    IconButton(onClick = {
                        scope.launch {
                            try {
                                TalabatRepository.loadDriverData(
                                    StatsFilters(
                                        from = from,
                                        to = to,
                                        status = selectedStatus,
                                        restaurantId = selectedRestaurant,
                                        period = appliedPeriod
                                    )
                                )
                            } catch (exception: Exception) {
                                error = exception.message ?: "تعذر تحديث البيانات."
                            }
                        }
                    }) {
                        Icon(Icons.Default.Refresh, contentDescription = "تحديث")
                    }
                    IconButton(onClick = { TalabatRepository.driverLogout() }) {
                        Icon(Icons.Default.Person, contentDescription = "تسجيل الخروج")
                    }
                }
            )
        },
        bottomBar = {
            NavigationBar {
                NavigationBarItem(
                    icon = { Icon(Icons.Default.List, contentDescription = null) },
                    label = { Text("الطلبات") },
                    selected = selectedTab == "orders",
                    onClick = { selectedTab = "orders" }
                )
                NavigationBarItem(
                    icon = { Icon(Icons.Default.CheckCircle, contentDescription = null) },
                    label = { Text("الإحصائيات") },
                    selected = selectedTab == "stats",
                    onClick = { selectedTab = "stats" }
                )
                NavigationBarItem(
                    icon = { Icon(Icons.Default.Person, contentDescription = null) },
                    label = { Text("الملف") },
                    selected = selectedTab == "profile",
                    onClick = { selectedTab = "profile" }
                )
            }
        }
    ) { padding ->
        Column(modifier = Modifier.fillMaxSize().padding(padding)) {
            if (loadingData) LinearProgressIndicator(modifier = Modifier.fillMaxWidth())
            error?.let {
                Text(it, modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 6.dp), color = MaterialTheme.colorScheme.error)
            }
            success?.let {
                Text(it, modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 6.dp), color = MaterialTheme.colorScheme.primary)
            }
            when (selectedTab) {
                "orders" -> DriverOrdersTab(
                    orders = orders,
                    restaurants = restaurants,
                    driverRestaurantId = currentDriver.restaurantId,
                    selectedPeriod = selectedPeriod,
                    from = from,
                    to = to,
                    selectedStatus = selectedStatus,
                    selectedRestaurant = selectedRestaurant,
                    busy = busy || loadingData,
                    onPeriodChange = { period ->
                        selectedPeriod = period
                        if (period != "فترة مخصصة") {
                            appliedPeriod = when (period) {
                                "اليوم", "أمس" -> "daily"
                                "هذا الأسبوع" -> "weekly"
                                "هذا الشهر" -> "monthly"
                                "هذه السنة" -> "yearly"
                                else -> appliedPeriod
                            }
                        }
                        val today = LocalDate.now()
                        val first = when (period) {
                            "اليوم" -> today
                            "أمس" -> today.minusDays(1)
                            "هذا الأسبوع" -> today.with(DayOfWeek.MONDAY)
                            "هذا الشهر" -> today.withDayOfMonth(1)
                            "هذه السنة" -> today.withDayOfYear(1)
                            "فترة مخصصة" -> null
                            else -> null
                        }
                        if (first != null) {
                            from = first.toString()
                            to = if (period == "أمس") today.minusDays(1).toString() else today.toString()
                            draftFrom = from
                            draftTo = to
                        }
                    },
                    draftFrom = draftFrom,
                    draftTo = draftTo,
                    onFromChange = { draftFrom = it; selectedPeriod = "فترة مخصصة" },
                    onToChange = { draftTo = it; selectedPeriod = "فترة مخصصة" },
                    onApplyDates = {
                        val valid = runCatching {
                            LocalDate.parse(draftFrom)
                            LocalDate.parse(draftTo)
                        }.isSuccess
                        if (valid && draftFrom <= draftTo) {
                            from = draftFrom
                            to = draftTo
                            appliedPeriod = "custom"
                            error = null
                        } else {
                            error = "أدخل تاريخي بداية ونهاية صحيحين."
                        }
                    },
                    onStatusChange = { selectedStatus = it },
                    onRestaurantChange = { selectedRestaurant = it },
                    onComplete = { orderId ->
                        scope.launch {
                            busy = true
                            error = null
                            success = null
                            try {
                                val completed = TalabatRepository.completeOrder(orderId)
                                success = "تم إكمال الطلب #${completed.id} وتحديثه في قاعدة البيانات."
                            } catch (exception: Exception) {
                                error = exception.message ?: "تعذر إكمال الطلب."
                            } finally {
                                busy = false
                            }
                        }
                    }
                )
                "stats" -> DriverStatisticsTab(stats)
                else -> DriverProfileTab(currentDriver)
            }
        }
    }
}

@Composable
@OptIn(ExperimentalMaterial3Api::class)
private fun DriverLoginScreen(
    serialNumber: String,
    onSerialNumberChange: (String) -> Unit,
    busy: Boolean,
    error: String?,
    onBack: () -> Unit,
    onLogin: () -> Unit
) {
    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("دخول السائق") },
                navigationIcon = {
                    IconButton(onClick = onBack) {
                        Icon(Icons.Default.ArrowBack, contentDescription = "عودة")
                    }
                }
            )
        }
    ) { padding ->
        Column(
            modifier = Modifier.fillMaxSize().padding(padding).padding(24.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
            horizontalAlignment = Alignment.CenterHorizontally
        ) {
            Text("أدخل الرقم التسلسلي المكوّن من 6 أرقام.", style = MaterialTheme.typography.bodyMedium)
            OutlinedTextField(
                value = serialNumber,
                onValueChange = onSerialNumberChange,
                label = { Text("الرقم التسلسلي") },
                visualTransformation = PasswordVisualTransformation(),
                modifier = Modifier.fillMaxWidth(),
                singleLine = true
            )
            error?.let { Text(it, color = MaterialTheme.colorScheme.error) }
            Button(
                onClick = onLogin,
                enabled = !busy && serialNumber.length == 6,
                modifier = Modifier.fillMaxWidth()
            ) {
                if (busy) CircularProgressIndicator(Modifier.size(18.dp), strokeWidth = 2.dp)
                else Text("تسجيل الدخول")
            }
        }
    }
}

@Composable
private fun DriverOrdersTab(
    orders: List<Order>,
    restaurants: List<Restaurant>,
    driverRestaurantId: Int,
    selectedPeriod: String,
    from: String,
    to: String,
    draftFrom: String,
    draftTo: String,
    selectedStatus: String,
    selectedRestaurant: Int?,
    busy: Boolean,
    onPeriodChange: (String) -> Unit,
    onFromChange: (String) -> Unit,
    onToChange: (String) -> Unit,
    onApplyDates: () -> Unit,
    onStatusChange: (String) -> Unit,
    onRestaurantChange: (Int?) -> Unit,
    onComplete: (Int) -> Unit
) {
    val periodOptions = listOf("اليوم", "أمس", "هذا الأسبوع", "هذا الشهر", "هذه السنة", "فترة مخصصة")
    val statuses = listOf("", "NEW", "ASSIGNED", "ACCEPTED", "REJECTED", "TIMEOUT", "CANCELLED", "COMPLETED")
    LazyColumn(
        modifier = Modifier.fillMaxSize(),
        contentPadding = PaddingValues(16.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp)
    ) {
        item {
            Text("سجل الطلبات", style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold)
            Text("تُحدّث البيانات تلقائياً كل 15 ثانية ما دامت الشاشة مفتوحة.", style = MaterialTheme.typography.bodySmall)
            DriverFilterDropdown(
                label = "الفترة",
                selected = selectedPeriod,
                options = periodOptions.map { it to it },
                onSelect = onPeriodChange
            )
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                OutlinedTextField(
                    draftFrom,
                    onFromChange,
                    label = { Text("من YYYY-MM-DD") },
                    modifier = Modifier.weight(1f),
                    singleLine = true
                )
                OutlinedTextField(
                    draftTo,
                    onToChange,
                    label = { Text("إلى YYYY-MM-DD") },
                    modifier = Modifier.weight(1f),
                    singleLine = true
                )
            }
            if (selectedPeriod == "فترة مخصصة") {
                OutlinedButton(onClick = onApplyDates, modifier = Modifier.fillMaxWidth()) {
                    Text("تطبيق الفترة")
                }
            }
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                DriverFilterDropdown(
                    label = "الحالة",
                    selected = selectedStatus,
                    options = statuses.map { (it.ifBlank { "ALL" }) to (it.ifBlank { "كل الحالات" }) },
                    onSelect = { onStatusChange(if (it == "ALL") "" else it) },
                    modifier = Modifier.weight(1f)
                )
                DriverFilterDropdown(
                    label = "المطعم",
                    selected = selectedRestaurant?.toString().orEmpty(),
                    options = listOf("" to "كل المطاعم") + restaurants
                        .filter { it.id == driverRestaurantId }
                        .map { it.id.toString() to it.name },
                    onSelect = { onRestaurantChange(it.toIntOrNull()) },
                    modifier = Modifier.weight(1f)
                )
            }
            if (busy) LinearProgressIndicator(modifier = Modifier.fillMaxWidth())
        }
        if (orders.isEmpty()) {
            item { Text("لا توجد طلبات مطابقة للفلاتر.", color = MaterialTheme.colorScheme.onSurfaceVariant) }
        } else {
            items(orders, key = { it.id }) { order ->
                DriverOrderCard(order, busy, onComplete)
            }
        }
    }
}

@Composable
private fun DriverOrderCard(order: Order, busy: Boolean, onComplete: (Int) -> Unit) {
    Card(modifier = Modifier.fillMaxWidth()) {
        Column(modifier = Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(5.dp)) {
            Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                Text("طلب #${order.id}", fontWeight = FontWeight.Bold)
                Text(order.status, style = MaterialTheme.typography.labelLarge, color = MaterialTheme.colorScheme.primary)
            }
            Text(order.restaurantName, style = MaterialTheme.typography.titleSmall)
            Text("الحالة في التوزيع: ${order.assignmentStatus ?: "—"}")
            Text("النوع: ${if (order.orderType == "DELIVERY") "توصيل" else "حجز"}")
            Text("الزبون: ${order.customerName} · ${order.customerPhone}")
            if (order.items.isNotEmpty()) {
                order.items.forEach { item ->
                    Text("• ${item.productName} ×${item.quantity} — ${money(item.subtotal)}", style = MaterialTheme.typography.bodySmall)
                }
            } else if (order.itemsSummary.isNotBlank()) {
                Text("المنتجات: ${order.itemsSummary}", style = MaterialTheme.typography.bodySmall)
            }
            if (order.orderType == "DELIVERY" && order.latitude != null && order.longitude != null) {
                Text("الموقع: ${order.latitude}, ${order.longitude}", style = MaterialTheme.typography.bodySmall)
            }
            if (order.orderType == "RESERVATION") {
                Text("الحجز: ${order.reservationDate.orEmpty()} · ${order.reservationTime.orEmpty()} · ${order.partySize ?: "—"} أشخاص")
            }
            if (!order.notes.isNullOrBlank()) Text("ملاحظات: ${order.notes}")
            Text("الإجمالي: ${money(order.totalAmount)}", fontWeight = FontWeight.Bold)
            Text("التاريخ: ${order.createdAt}", style = MaterialTheme.typography.bodySmall)
            if (order.status.equals("ACCEPTED", ignoreCase = true)) {
                Button(onClick = { onComplete(order.id) }, enabled = !busy, modifier = Modifier.fillMaxWidth()) {
                    Text("إكمال الطلب")
                }
            }
        }
    }
}

@Composable
private fun DriverStatisticsTab(stats: StatsData) {
    LazyColumn(
        modifier = Modifier.fillMaxSize(),
        contentPadding = PaddingValues(16.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp)
    ) {
        item {
            Text("إحصائياتي", style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold)
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                StatCard("الطلبات", stats.summary.totalOrders.toString(), Icons.Default.List, Modifier.weight(1f))
                StatCard("المكتملة", stats.summary.completed.toString(), Icons.Default.CheckCircle, Modifier.weight(1f))
            }
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                StatCard("قيمة الطلبات", money(stats.summary.totalOrderValue), Icons.Default.CheckCircle, Modifier.weight(1f))
                StatCard("المستحقات", stats.summary.totalEarnings?.let(::money) ?: "—", Icons.Default.Person, Modifier.weight(1f))
            }
            Text("مقبولة: ${stats.summary.accepted} · مرفوضة: ${stats.summary.rejected} · انتهت مهلتها: ${stats.summary.timeout} · ملغاة: ${stats.summary.cancelled}")
            Text("متوسط الطلب: ${money(stats.summary.averageOrderValue)} · القبول: ${percent(stats.summary.acceptanceRate)} · الرفض: ${percent(stats.summary.rejectionRate)}")
        }
        if (stats.periods.isNotEmpty()) {
            item { Text("الأداء حسب التاريخ", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold) }
            items(stats.periods) { DataLine(it.period, "${it.orders} طلب · ${money(it.earnings)}") }
        }
        if (stats.byRestaurant.isNotEmpty()) {
            item { Text("الأداء حسب المطعم", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold) }
            items(stats.byRestaurant) { DataLine(it.name, "${it.orders} طلب · ${money(it.earnings)}") }
        }
    }
}

@Composable
private fun DriverProfileTab(driver: Driver) {
    Column(
        modifier = Modifier.fillMaxSize().padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(8.dp)
    ) {
        Text("الملف الشخصي", style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold)
        Text("الاسم: ${driver.name}")
        Text("الهاتف: ${driver.phone}")
        Text("البريد: ${driver.email.orEmpty()}")
        Text("حالة الحساب: ${if (driver.isActive) "نشط" else "غير نشط"}")
    }
}

@Composable
private fun DriverFilterDropdown(
    label: String,
    selected: String,
    options: List<Pair<String, String>>,
    onSelect: (String) -> Unit,
    modifier: Modifier = Modifier
) {
    var expanded by remember { mutableStateOf(false) }
    Box(modifier) {
        OutlinedButton(onClick = { expanded = true }, modifier = Modifier.fillMaxWidth()) {
            Text(options.firstOrNull { it.first == selected }?.second ?: label)
        }
        DropdownMenu(expanded = expanded, onDismissRequest = { expanded = false }) {
            options.forEach { (value, text) ->
                DropdownMenuItem(
                    text = { Text(text) },
                    onClick = {
                        onSelect(value)
                        expanded = false
                    }
                )
            }
        }
    }
}

private fun money(value: Double): String = String.format("%.2f د.ل", value)
private fun percent(value: Double): String = String.format("%.1f%%", value)

@Composable
private fun StatCard(title: String, value: String, icon: androidx.compose.ui.graphics.vector.ImageVector, modifier: Modifier = Modifier) {
    Card(modifier = modifier) {
        Column(modifier = Modifier.padding(16.dp)) {
            Icon(icon, contentDescription = null, tint = MaterialTheme.colorScheme.primary)
            Spacer(modifier = Modifier.height(8.dp))
            Text(value, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold)
            Text(title, style = MaterialTheme.typography.bodySmall)
        }
    }
}

@Composable
private fun DataLine(title: String, subtitle: String) {
    Card(modifier = Modifier.fillMaxWidth()) {
        Row(
            modifier = Modifier.fillMaxWidth().padding(16.dp),
            horizontalArrangement = Arrangement.SpaceBetween
        ) {
            Text(title, fontWeight = FontWeight.Bold)
            Text(subtitle)
        }
    }
}