package com.example.talabat.ui.screens

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.unit.dp
import com.example.talabat.data.*
import java.time.LocalDate
import kotlinx.coroutines.launch

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun AdminDashboardScreen(
    onBack: () -> Unit,
    onOpenDriverPortal: () -> Unit
) {
    val scope = rememberCoroutineScope()
    val token by TalabatRepository.adminToken.collectAsState()
    val orders by TalabatRepository.adminOrders.collectAsState()
    val restaurants by TalabatRepository.restaurants.collectAsState()
    val drivers by TalabatRepository.drivers.collectAsState()
    val subscriptions by TalabatRepository.subscriptions.collectAsState()
    val stats by TalabatRepository.adminStats.collectAsState()

    var selectedTab by remember { mutableIntStateOf(0) }
    var busy by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }
    var showDriverDialog by remember { mutableStateOf(false) }
    var driverToEdit by remember { mutableStateOf<Driver?>(null) }
    var createdDriverSerial by remember { mutableStateOf<String?>(null) }
    var showRestaurantDialog by remember { mutableStateOf(false) }
    var filterFrom by remember { mutableStateOf("") }
    var filterTo by remember { mutableStateOf("") }
    var filterPeriod by remember { mutableStateOf("monthly") }
    var filterStatus by remember { mutableStateOf("") }
    var filterRestaurant by remember { mutableStateOf<Int?>(null) }
    var filterDriver by remember { mutableStateOf<Int?>(null) }

    suspend fun refreshOverview() {
        busy = true
        error = null
        try {
            TalabatRepository.loadAdminOverview()
        } catch (exception: Exception) {
            error = exception.message ?: "تعذر تحميل بيانات الإدارة."
        } finally {
            busy = false
        }
    }

    LaunchedEffect(token) {
        if (token != null) refreshOverview()
    }

    if (token == null) {
        AdminLoginScreen(
            busy = busy,
            error = error,
            onBack = onBack,
            onLogin = { username, password ->
                scope.launch {
                    busy = true
                    error = null
                    try {
                        TalabatRepository.adminLogin(username.trim(), password)
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
                title = { Text("لوحة الإدارة") },
                navigationIcon = {
                    IconButton(onClick = onBack) {
                        Icon(Icons.Default.ArrowBack, contentDescription = "عودة")
                    }
                },
                actions = {
                    IconButton(onClick = { scope.launch { refreshOverview() } }, enabled = !busy) {
                        Icon(Icons.Default.Refresh, contentDescription = "تحديث البيانات")
                    }
                    IconButton(onClick = onOpenDriverPortal) {
                        Icon(Icons.Default.DeliveryDining, contentDescription = "بوابة السائق")
                    }
                    IconButton(onClick = { TalabatRepository.adminLogout() }) {
                        Icon(Icons.Default.Logout, contentDescription = "تسجيل الخروج")
                    }
                }
            )
        },
        bottomBar = {
            NavigationBar {
                val tabs = listOf("الإحصائيات", "المطاعم", "السائقون", "الاشتراكات")
                val icons = listOf(Icons.Default.Dashboard, Icons.Default.Store, Icons.Default.DeliveryDining, Icons.Default.CreditCard)
                tabs.forEachIndexed { index, label ->
                    NavigationBarItem(
                        icon = { Icon(icons[index], contentDescription = null) },
                        label = { Text(label) },
                        selected = selectedTab == index,
                        onClick = { selectedTab = index }
                    )
                }
            }
        }
    ) { padding ->
        Column(modifier = Modifier.fillMaxSize().padding(padding)) {
            error?.let {
                Text(
                    it,
                    modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 8.dp),
                    color = MaterialTheme.colorScheme.error
                )
            }
            if (busy) {
                LinearProgressIndicator(modifier = Modifier.fillMaxWidth())
            }
            when (selectedTab) {
                0 -> AdminStatisticsTab(
                    orders = orders,
                    restaurants = restaurants,
                    drivers = drivers,
                    stats = stats,
                    from = filterFrom,
                    to = filterTo,
                    onPeriodChange = { filterPeriod = it },
                    selectedStatus = filterStatus,
                    selectedRestaurant = filterRestaurant,
                    selectedDriver = filterDriver,
                    onFromChange = { filterFrom = it; filterPeriod = "custom" },
                    onToChange = { filterTo = it; filterPeriod = "custom" },
                    onStatusChange = { filterStatus = it },
                    onRestaurantChange = { filterRestaurant = it },
                    onDriverChange = { filterDriver = it },
                    onApply = {
                        scope.launch {
                            busy = true
                            error = null
                            try {
                                TalabatRepository.loadAdminStats(
                                    StatsFilters(
                                        from = filterFrom.trim().takeIf(String::isNotBlank),
                                        to = filterTo.trim().takeIf(String::isNotBlank),
                                        period = filterPeriod,
                                        status = filterStatus.takeIf(String::isNotBlank),
                                        restaurantId = filterRestaurant,
                                        driverId = filterDriver
                                    )
                                )
                            } catch (exception: Exception) {
                                error = exception.message ?: "تعذر تحميل الإحصائيات."
                            } finally {
                                busy = false
                            }
                        }
                    }
                )
                1 -> RestaurantManagementTab(
                    restaurants = restaurants,
                    busy = busy,
                    onAdd = { showRestaurantDialog = true }
                )
                2 -> DriverManagementTab(
                    drivers = drivers,
                    restaurants = restaurants,
                    busy = busy,
                    onAdd = {
                        driverToEdit = null
                        showDriverDialog = true
                    },
                    onEdit = {
                        driverToEdit = it
                        showDriverDialog = true
                    }
                )
                else -> SubscriptionTab(subscriptions)
            }
        }
    }

    if (showDriverDialog) {
        DriverEditorDialog(
            initial = driverToEdit,
            restaurants = restaurants,
            busy = busy,
            error = error,
            onDismiss = { showDriverDialog = false },
            onSave = { input ->
                scope.launch {
                    busy = true
                    error = null
                    try {
                        val existing = driverToEdit
                        if (existing == null) {
                            val created = TalabatRepository.createDriver(input)
                            createdDriverSerial = created.serialNumber
                        } else {
                            TalabatRepository.updateDriver(existing.id, input)
                        }
                        showDriverDialog = false
                        refreshOverview()
                    } catch (exception: Exception) {
                        error = exception.message ?: "تعذر حفظ بيانات السائق."
                    } finally {
                        busy = false
                    }
                }
            }
        )
    }

    createdDriverSerial?.let { serialNumber ->
        AlertDialog(
            onDismissRequest = { createdDriverSerial = null },
            title = { Text("تم إنشاء حساب السائق") },
            text = {
                Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    Text("الرقم التسلسلي للسائق. أرسله إليه ليتمكن من تسجيل الدخول:")
                    Text(
                        serialNumber,
                        style = MaterialTheme.typography.headlineMedium,
                        fontWeight = FontWeight.Bold
                    )
                }
            },
            confirmButton = {
                TextButton(onClick = { createdDriverSerial = null }) { Text("تم") }
            }
        )
    }

    if (showRestaurantDialog) {
        RestaurantEditorDialog(
            busy = busy,
            onDismiss = { showRestaurantDialog = false },
            onSave = { input ->
                scope.launch {
                    busy = true
                    error = null
                    try {
                        TalabatRepository.createRestaurant(input)
                        showRestaurantDialog = false
                        refreshOverview()
                    } catch (exception: Exception) {
                        error = exception.message ?: "تعذر إضافة المطعم."
                    } finally {
                        busy = false
                    }
                }
            }
        )
    }
}

@Composable
@OptIn(ExperimentalMaterial3Api::class)
private fun AdminLoginScreen(
    busy: Boolean,
    error: String?,
    onBack: () -> Unit,
    onLogin: (String, String) -> Unit
) {
    var username by remember { mutableStateOf("") }
    var password by remember { mutableStateOf("") }
    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("تسجيل دخول الإدارة") },
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
            OutlinedTextField(
                value = username,
                onValueChange = { username = it },
                label = { Text("اسم المستخدم") },
                modifier = Modifier.fillMaxWidth(),
                singleLine = true
            )
            OutlinedTextField(
                value = password,
                onValueChange = { password = it },
                label = { Text("كلمة المرور") },
                visualTransformation = PasswordVisualTransformation(),
                modifier = Modifier.fillMaxWidth(),
                singleLine = true
            )
            error?.let { Text(it, color = MaterialTheme.colorScheme.error) }
            Button(
                onClick = { onLogin(username, password) },
                enabled = !busy && username.isNotBlank() && password.isNotBlank(),
                modifier = Modifier.fillMaxWidth()
            ) {
                if (busy) CircularProgressIndicator(Modifier.size(18.dp), strokeWidth = 2.dp)
                else Text("تسجيل الدخول")
            }
        }
    }
}

@Composable
private fun AdminStatisticsTab(
    orders: List<Order>,
    restaurants: List<Restaurant>,
    drivers: List<Driver>,
    stats: StatsData,
    from: String,
    to: String,
    onPeriodChange: (String) -> Unit,
    selectedStatus: String,
    selectedRestaurant: Int?,
    selectedDriver: Int?,
    onFromChange: (String) -> Unit,
    onToChange: (String) -> Unit,
    onStatusChange: (String) -> Unit,
    onRestaurantChange: (Int?) -> Unit,
    onDriverChange: (Int?) -> Unit,
    onApply: () -> Unit
) {
    LazyColumn(
        modifier = Modifier.fillMaxSize(),
        contentPadding = PaddingValues(16.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp)
    ) {
        item {
            Text("إحصائيات الطلبات", style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold)
            Text("تعرض هذه الأرقام بيانات PostgreSQL.", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
        item {
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                StatCard("كل الطلبات", stats.summary.totalOrders.toString(), Icons.Default.ShoppingCart, Modifier.weight(1f))
                StatCard("المكتملة", stats.summary.completed.toString(), Icons.Default.CheckCircle, Modifier.weight(1f))
            }
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                StatCard("قيمة الطلبات", money(stats.summary.totalOrderValue), Icons.Default.Payments, Modifier.weight(1f))
                StatCard("المستحقات", stats.summary.totalEarnings?.let(::money) ?: "—", Icons.Default.AccountBalanceWallet, Modifier.weight(1f))
            }
            Text(
                "مقبولة ${stats.summary.accepted} · مرفوضة ${stats.summary.rejected} · مهلة منتهية ${stats.summary.timeout} · ملغاة ${stats.summary.cancelled}",
                style = MaterialTheme.typography.bodyMedium
            )
            Text(
                "متوسط الطلب ${money(stats.summary.averageOrderValue)} · قبول ${percent(stats.summary.acceptanceRate)} · رفض ${percent(stats.summary.rejectionRate)}",
                style = MaterialTheme.typography.bodySmall
            )
        }
        item {
            Text("الفترة والتصفية", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold)
            Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                listOf("اليوم", "الأسبوع", "الشهر", "السنة").forEach { preset ->
                    TextButton(onClick = {
                        val today = LocalDate.now()
                        val start = when (preset) {
                            "اليوم" -> today
                            "الأسبوع" -> today.minusDays(6)
                            "الشهر" -> today.withDayOfMonth(1)
                            else -> today.withDayOfYear(1)
                        }
                        onFromChange(start.toString())
                        onToChange(today.toString())
                        onPeriodChange(
                            when (preset) {
                                "اليوم" -> "daily"
                                "الأسبوع" -> "weekly"
                                "الشهر" -> "monthly"
                                else -> "yearly"
                            }
                        )
                    }) { Text(preset) }
                }
            }
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                OutlinedTextField(from, onFromChange, label = { Text("من YYYY-MM-DD") }, modifier = Modifier.weight(1f), singleLine = true)
                OutlinedTextField(to, onToChange, label = { Text("إلى YYYY-MM-DD") }, modifier = Modifier.weight(1f), singleLine = true)
            }
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                FilterDropdown(
                    label = "الحالة",
                    selected = selectedStatus,
                    options = listOf("" to "كل الحالات") + listOf("NEW", "ASSIGNED", "ACCEPTED", "REJECTED", "TIMEOUT", "CANCELLED", "COMPLETED").map { it to it },
                    onSelected = onStatusChange,
                    modifier = Modifier.weight(1f)
                )
                FilterDropdown(
                    label = "المطعم",
                    selected = selectedRestaurant?.toString().orEmpty(),
                    options = listOf("" to "كل المطاعم") + restaurants.map { it.id.toString() to it.name },
                    onSelected = { onRestaurantChange(it.toIntOrNull()) },
                    modifier = Modifier.weight(1f)
                )
            }
            FilterDropdown(
                label = "السائق",
                selected = selectedDriver?.toString().orEmpty(),
                options = listOf("" to "كل السائقين") + drivers.map { it.id.toString() to it.name },
                onSelected = { onDriverChange(it.toIntOrNull()) },
                modifier = Modifier.fillMaxWidth()
            )
            Button(onClick = onApply, modifier = Modifier.fillMaxWidth()) { Text("تطبيق الفلاتر") }
        }
        if (stats.periods.isNotEmpty()) {
            item { Text("الاتجاه حسب التاريخ", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold) }
            items(stats.periods) { period ->
                DataLine(period.period, "${period.orders} طلب · ${money(period.earnings)}")
            }
        }
        if (stats.byRestaurant.isNotEmpty()) {
            item { Text("الأداء حسب المطعم", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold) }
            items(stats.byRestaurant) { group -> DataLine(group.name, "${group.orders} طلب · ${money(group.earnings)}") }
        }
        if (stats.byDriver.isNotEmpty()) {
            item { Text("الأداء حسب السائق", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold) }
            items(stats.byDriver) { group -> DataLine(group.name, "${group.orders} طلب · ${money(group.earnings)}") }
        }
        item { Text("أحدث الطلبات", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold) }
        if (orders.isEmpty()) {
            item { EmptyText("لا توجد طلبات.") }
        } else {
            items(orders) { order ->
                Card(modifier = Modifier.fillMaxWidth()) {
                    Column(modifier = Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                        Text("طلب #${order.id} — ${order.restaurantName}", fontWeight = FontWeight.Bold)
                        Text("${order.customerName} · ${order.customerPhone}", style = MaterialTheme.typography.bodySmall)
                        Text("${order.orderType} · ${order.status} · ${order.assignmentStatus ?: "—"} · ${order.createdAt}", style = MaterialTheme.typography.bodySmall)
                        if (order.itemsSummary.isNotBlank()) Text(order.itemsSummary, style = MaterialTheme.typography.bodySmall)
                        Text(money(order.totalAmount), color = MaterialTheme.colorScheme.primary)
                    }
                }
            }
        }
    }
}

@Composable
private fun RestaurantManagementTab(
    restaurants: List<Restaurant>,
    busy: Boolean,
    onAdd: () -> Unit
) {
    LazyColumn(
        modifier = Modifier.fillMaxSize(),
        contentPadding = PaddingValues(16.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp)
    ) {
        item {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Text("إدارة المطاعم", style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold)
                Button(onClick = onAdd, enabled = !busy) {
                    Icon(Icons.Default.Add, contentDescription = null)
                    Text("إضافة")
                }
            }
        }
        if (restaurants.isEmpty()) {
            item { EmptyText("لا توجد مطاعم.") }
        } else {
            items(restaurants) { restaurant ->
                Card(modifier = Modifier.fillMaxWidth()) {
                    Column(modifier = Modifier.padding(16.dp)) {
                        Text(restaurant.name, fontWeight = FontWeight.Bold, style = MaterialTheme.typography.titleMedium)
                        Text(restaurant.address, style = MaterialTheme.typography.bodySmall)
                        Text("الهاتف: ${restaurant.phone} · التوصيل: ${money(restaurant.deliveryFee)}", style = MaterialTheme.typography.bodySmall)
                    }
                }
            }
        }
    }
}

@Composable
private fun DriverManagementTab(
    drivers: List<Driver>,
    restaurants: List<Restaurant>,
    busy: Boolean,
    onAdd: () -> Unit,
    onEdit: (Driver) -> Unit
) {
    LazyColumn(
        modifier = Modifier.fillMaxSize(),
        contentPadding = PaddingValues(16.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp)
    ) {
        item {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Text("إدارة السائقين", style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold)
                Button(onClick = onAdd, enabled = !busy) {
                    Icon(Icons.Default.Add, contentDescription = null)
                    Text("إضافة")
                }
            }
            Text("كل سائق نشط يستقبل طلبات المطعم المرتبط به فقط عبر البريد الإلكتروني.", style = MaterialTheme.typography.bodySmall)
        }
        if (drivers.isEmpty()) {
            item { EmptyText("لا يوجد سائقون مسجلون.") }
        } else {
            items(drivers, key = { it.id }) { driver ->
                val restaurantName = restaurants.firstOrNull { it.id == driver.restaurantId }?.name ?: "غير محدد"
                Card(modifier = Modifier.fillMaxWidth()) {
                    Column(modifier = Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                        Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                            Text(driver.name, fontWeight = FontWeight.Bold, style = MaterialTheme.typography.titleMedium)
                            Text(if (driver.isActive) "نشط" else "غير نشط")
                        }
                        Text("البريد: ${driver.email.orEmpty()}", style = MaterialTheme.typography.bodySmall)
                        Text("الهاتف: ${driver.phone}", style = MaterialTheme.typography.bodySmall)
                        Text("المطعم: $restaurantName", style = MaterialTheme.typography.bodySmall)
                        OutlinedButton(onClick = { onEdit(driver) }, enabled = !busy) { Text("تعديل") }
                    }
                }
            }
        }
    }
}

@Composable
private fun SubscriptionTab(subscriptions: List<Subscription>) {
    LazyColumn(
        modifier = Modifier.fillMaxSize(),
        contentPadding = PaddingValues(16.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp)
    ) {
        item { Text("إدارة الاشتراكات", style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold) }
        if (subscriptions.isEmpty()) {
            item { EmptyText("لا توجد اشتراكات.") }
        } else {
            items(subscriptions) { subscription ->
                Card(modifier = Modifier.fillMaxWidth()) {
                    Column(modifier = Modifier.padding(16.dp)) {
                        Text(subscription.restaurantName, fontWeight = FontWeight.Bold)
                        Text("الباقة: ${subscription.plan ?: subscription.planName}")
                        Text("الحالة: ${subscription.status} · التجديد: ${subscription.expiryDate ?: subscription.renewalDate}", style = MaterialTheme.typography.bodySmall)
                    }
                }
            }
        }
    }
}

@Composable
private fun DriverEditorDialog(
    initial: Driver?,
    restaurants: List<Restaurant>,
    busy: Boolean,
    error: String?,
    onDismiss: () -> Unit,
    onSave: (DriverInput) -> Unit
) {
    var name by remember(initial) { mutableStateOf(initial?.name.orEmpty()) }
    var phone by remember(initial) { mutableStateOf(initial?.phone.orEmpty()) }
    var email by remember(initial) { mutableStateOf(initial?.email.orEmpty()) }
    var restaurantId by remember(initial, restaurants) { mutableIntStateOf(initial?.restaurantId ?: restaurants.firstOrNull()?.id ?: 0) }
    var active by remember(initial) { mutableStateOf(initial?.isActive ?: true) }
    var validation by remember { mutableStateOf<String?>(null) }
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(if (initial == null) "إضافة سائق" else "تعديل السائق") },
        text = {
            LazyColumn(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                item {
                    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                        OutlinedTextField(name, { name = it }, label = { Text("اسم السائق") }, modifier = Modifier.fillMaxWidth(), singleLine = true)
                        OutlinedTextField(phone, { phone = it }, label = { Text("رقم الهاتف") }, modifier = Modifier.fillMaxWidth(), singleLine = true)
                        OutlinedTextField(email, { email = it }, label = { Text("البريد الإلكتروني") }, modifier = Modifier.fillMaxWidth(), singleLine = true)
                        Text("المطعم", style = MaterialTheme.typography.titleSmall)
                    }
                }
                items(restaurants, key = { it.id }) { restaurant ->
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        RadioButton(selected = restaurantId == restaurant.id, onClick = { restaurantId = restaurant.id })
                        Text(restaurant.name)
                    }
                }
                item {
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Text(if (active) "السائق نشط" else "السائق غير نشط")
                        Switch(checked = active, onCheckedChange = { active = it })
                    }
                    validation?.let { Text(it, color = MaterialTheme.colorScheme.error) }
                    error?.let { Text(it, color = MaterialTheme.colorScheme.error) }
                }
            }
        },
        confirmButton = {
            Button(
                enabled = !busy && restaurants.isNotEmpty(),
                onClick = {
                    val validEmail = email.trim().matches(Regex("^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\\.[A-Za-z]{2,}$"))
                    if (name.isBlank() || phone.isBlank() || !validEmail || restaurantId <= 0) {
                        validation = "أدخل الاسم والهاتف وبريداً إلكترونياً صحيحاً واختر مطعماً."
                    } else {
                        validation = null
                        onSave(DriverInput(name.trim(), phone.trim(), email.trim(), restaurantId, active))
                    }
                }
            ) { Text(if (busy) "جارٍ الحفظ…" else "حفظ") }
        },
        dismissButton = { TextButton(onClick = onDismiss) { Text("إلغاء") } }
    )
}

@Composable
private fun RestaurantEditorDialog(
    busy: Boolean,
    onDismiss: () -> Unit,
    onSave: (RestaurantInput) -> Unit
) {
    var name by remember { mutableStateOf("") }
    var phone by remember { mutableStateOf("") }
    var address by remember { mutableStateOf("") }
    var description by remember { mutableStateOf("") }
    var validation by remember { mutableStateOf<String?>(null) }
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("إضافة مطعم") },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                OutlinedTextField(name, { name = it }, label = { Text("اسم المطعم") })
                OutlinedTextField(phone, { phone = it }, label = { Text("الهاتف") })
                OutlinedTextField(address, { address = it }, label = { Text("العنوان") })
                OutlinedTextField(description, { description = it }, label = { Text("الوصف") })
                validation?.let { Text(it, color = MaterialTheme.colorScheme.error) }
            }
        },
        confirmButton = {
            Button(enabled = !busy, onClick = {
                if (name.isBlank() || phone.isBlank() || address.isBlank()) {
                    validation = "اسم المطعم والهاتف والعنوان مطلوبة."
                } else {
                    onSave(RestaurantInput(name.trim(), phone.trim(), address.trim(), description.trim()))
                }
            }) { Text(if (busy) "جارٍ الحفظ…" else "إضافة") }
        },
        dismissButton = { TextButton(onClick = onDismiss) { Text("إلغاء") } }
    )
}

@Composable
private fun FilterDropdown(
    label: String,
    selected: String,
    options: List<Pair<String, String>>,
    onSelected: (String) -> Unit,
    modifier: Modifier = Modifier
) {
    var expanded by remember { mutableStateOf(false) }
    Box(modifier) {
        OutlinedButton(onClick = { expanded = true }, modifier = Modifier.fillMaxWidth()) {
            Text(options.firstOrNull { it.first == selected }?.second ?: label)
        }
        DropdownMenu(expanded = expanded, onDismissRequest = { expanded = false }) {
            options.forEach { (value, title) ->
                DropdownMenuItem(
                    text = { Text(title) },
                    onClick = {
                        onSelected(value)
                        expanded = false
                    }
                )
            }
        }
    }
}

@Composable
private fun DataLine(title: String, value: String) {
    Card(modifier = Modifier.fillMaxWidth()) {
        Row(
            modifier = Modifier.fillMaxWidth().padding(12.dp),
            horizontalArrangement = Arrangement.SpaceBetween
        ) {
            Text(title)
            Text(value, color = MaterialTheme.colorScheme.primary)
        }
    }
}

@Composable
private fun EmptyText(message: String) {
    Text(message, color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.padding(vertical = 12.dp))
}

@Composable
fun StatCard(
    title: String,
    value: String,
    icon: androidx.compose.ui.graphics.vector.ImageVector,
    modifier: Modifier = Modifier
) {
    Card(modifier = modifier.padding(vertical = 4.dp)) {
        Column(modifier = Modifier.padding(12.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Text(title, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                Icon(icon, contentDescription = null, tint = MaterialTheme.colorScheme.primary)
            }
            Text(value, style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold)
        }
    }
}

private fun money(value: Double): String = String.format("%.2f د.ل", value)
private fun percent(value: Double): String = String.format("%.1f%%", value)