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
import androidx.compose.ui.unit.dp
import com.example.talabat.data.*

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun AdminDashboardScreen(
    onBack: () -> Unit,
    onOpenDriverPortal: () -> Unit
) {
    var selectedTab by remember { mutableStateOf(0) } // 0: Dashboard, 1: Restaurants, 2: Drivers & Telegram, 3: Subscriptions
    val orders by TalabatRepository.orders.collectAsState()
    val restaurants by TalabatRepository.restaurants.collectAsState()
    val drivers by TalabatRepository.drivers.collectAsState()
    val subscriptions by TalabatRepository.subscriptions.collectAsState()

    var showAddRestaurantDialog by remember { mutableStateOf(false) }
    var showAddDriverDialog by remember { mutableStateOf(false) }

    // New restaurant form state
    var newRestName by remember { mutableStateOf("") }
    var newRestPhone by remember { mutableStateOf("") }
    var newRestAddress by remember { mutableStateOf("") }
    var newRestDesc by remember { mutableStateOf("") }

    // New driver bot form state
    var newDriverName by remember { mutableStateOf("") }
    var newDriverPhone by remember { mutableStateOf("") }
    var newDriverToken by remember { mutableStateOf("") }
    var newDriverUsername by remember { mutableStateOf("") }
    var selectedRestId by remember { mutableStateOf(1) }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("لوحة تحكم المشرف — نظام Telegram المركزي") },
                navigationIcon = {
                    IconButton(onClick = onBack) {
                        Icon(Icons.Default.ArrowBack, contentDescription = "عودة")
                    }
                },
                actions = {
                    IconButton(onClick = onOpenDriverPortal) {
                        Icon(Icons.Default.PhoneAndroid, contentDescription = "بوابة السائقين")
                    }
                }
            )
        },
        bottomBar = {
            NavigationBar {
                NavigationBarItem(
                    icon = { Icon(Icons.Default.Dashboard, contentDescription = null) },
                    label = { Text("الرئيسية") },
                    selected = selectedTab == 0,
                    onClick = { selectedTab = 0 }
                )
                NavigationBarItem(
                    icon = { Icon(Icons.Default.Store, contentDescription = null) },
                    label = { Text("المطاعم") },
                    selected = selectedTab == 1,
                    onClick = { selectedTab = 1 }
                )
                NavigationBarItem(
                    icon = { Icon(Icons.Default.SmartToy, contentDescription = null) },
                    label = { Text("بوتات السائقين") },
                    selected = selectedTab == 2,
                    onClick = { selectedTab = 2 }
                )
                NavigationBarItem(
                    icon = { Icon(Icons.Default.CreditCard, contentDescription = null) },
                    label = { Text("الاشتراكات") },
                    selected = selectedTab == 3,
                    onClick = { selectedTab = 3 }
                )
            }
        }
    ) { padding ->
        Box(modifier = Modifier.padding(padding).fillMaxSize()) {
            when (selectedTab) {
                0 -> {
                    // Dashboard Overview
                    LazyColumn(
                        modifier = Modifier.fillMaxSize(),
                        contentPadding = PaddingValues(16.dp),
                        verticalArrangement = Arrangement.spacedBy(16.dp)
                    ) {
                        item {
                            Card(modifier = Modifier.fillMaxWidth()) {
                                Column(modifier = Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                                    Text("🤖 إعدادات البوت المركزي (Telegram Main Bot)", fontWeight = FontWeight.Bold, style = MaterialTheme.typography.titleMedium)
                                    Text("Token: ${TalabatRepository.centralBotToken.take(10)}••••••••••", style = MaterialTheme.typography.bodySmall)
                                    Text("الحالة: متصل بنظام PostgreSQL ويبث التوزيع تلقائياً", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.primary)
                                }
                            }
                        }

                        item {
                            Row(
                                modifier = Modifier.fillMaxWidth(),
                                horizontalArrangement = Arrangement.spacedBy(12.dp)
                            ) {
                                StatCard("إجمالي الطلبات", "${orders.size}", Icons.Default.ShoppingCart, Modifier.weight(1f))
                                StatCard("المطاعم النشطة", "${restaurants.size}", Icons.Default.Store, Modifier.weight(1f))
                            }
                            Spacer(Modifier.height(12.dp))
                            Row(
                                modifier = Modifier.fillMaxWidth(),
                                horizontalArrangement = Arrangement.spacedBy(12.dp)
                            ) {
                                StatCard("بوتات السائقين", "${drivers.size}", Icons.Default.SmartToy, Modifier.weight(1f))
                                StatCard("الاشتراكات", "${subscriptions.size}", Icons.Default.CreditCard, Modifier.weight(1f))
                            }
                        }

                        item {
                            Text("أحدث الطلبات وحالات التوزيع والتليجرام", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold)
                        }

                        items(orders) { order ->
                            Card(modifier = Modifier.fillMaxWidth()) {
                                Column(modifier = Modifier.padding(16.dp)) {
                                    Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                                        Text("طلب #${order.id} — ${order.restaurantName}", fontWeight = FontWeight.Bold)
                                        Text("${order.totalAmount} د.ل", fontWeight = FontWeight.Bold, color = MaterialTheme.colorScheme.primary)
                                    }
                                    Spacer(Modifier.height(4.dp))
                                    Text("الزبون: ${order.customerName} (${order.customerPhone})", style = MaterialTheme.typography.bodySmall)
                                    Text("نوع الطلب: ${order.orderType} | الحالة: ${order.status} | إسناد البوت: ${order.assignmentStatus}", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.secondary)
                                }
                            }
                        }
                    }
                }
                1 -> {
                    // Restaurants Management
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
                                Button(onClick = { showAddRestaurantDialog = true }) {
                                    Icon(Icons.Default.Add, contentDescription = null)
                                    Spacer(Modifier.width(4.dp))
                                    Text("إضافة مطعم")
                                }
                            }
                        }
                        items(restaurants) { rest ->
                            Card(modifier = Modifier.fillMaxWidth()) {
                                Column(modifier = Modifier.padding(16.dp)) {
                                    Text(rest.name, fontWeight = FontWeight.Bold, style = MaterialTheme.typography.titleMedium)
                                    Text(rest.address, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                                    Text("📞 ${rest.phone} | التقييم: ${rest.rating} ⭐", style = MaterialTheme.typography.bodySmall)
                                }
                            }
                        }
                    }
                }
                2 -> {
                    // Drivers & Telegram Bots Management
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
                                Text("إدارة السائقين وبوتات Telegram", style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold)
                                Button(onClick = { showAddDriverDialog = true }) {
                                    Icon(Icons.Default.Add, contentDescription = null)
                                    Spacer(Modifier.width(4.dp))
                                    Text("إضافة سائق وبوت")
                                }
                            }
                            Text("كل سائق يربط بوت مستقل عبر Bot Token ويستقبل طلبات مطعمه فقط تلقائياً.", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                        }

                        items(drivers) { driver ->
                            val linkedRest = restaurants.find { it.id == driver.restaurantId }
                            Card(modifier = Modifier.fillMaxWidth()) {
                                Column(modifier = Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                                    Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                                        Text(driver.name, fontWeight = FontWeight.Bold, style = MaterialTheme.typography.titleMedium)
                                        Surface(
                                            color = if (driver.botStatus == "ACTIVE") MaterialTheme.colorScheme.primaryContainer else MaterialTheme.colorScheme.surfaceVariant,
                                            shape = MaterialTheme.shapes.small
                                        ) {
                                            Text(driver.botStatus, modifier = Modifier.padding(horizontal = 8.dp, vertical = 2.dp), style = MaterialTheme.typography.labelSmall)
                                        }
                                    }
                                    Text("📞 الهاتف: ${driver.phone}", style = MaterialTheme.typography.bodySmall)
                                    Text("🤖 البوت: ${driver.botUsername} (Token: ${driver.botToken.take(8)}••••)", style = MaterialTheme.typography.bodySmall)
                                    Text("🔗 Chat ID: ${driver.chatId} | الربط: ${driver.linkStatus}", style = MaterialTheme.typography.bodySmall)
                                    Text("🍔 المطعم المرتبط: ${linkedRest?.name ?: "غير محدد"}", style = MaterialTheme.typography.bodySmall)
                                    Text("⏰ آخر اتصال: ${driver.lastConnected}", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)

                                    Spacer(Modifier.height(4.dp))
                                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                                        OutlinedButton(onClick = { TalabatRepository.testConnection(driver.id) }) {
                                            Text("اختبار الاتصال")
                                        }
                                        OutlinedButton(onClick = { TalabatRepository.simulateTelegramStart(driver.id) }) {
                                            Text("إعادة الربط (/start)")
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
                3 -> {
                    // Subscriptions
                    LazyColumn(
                        modifier = Modifier.fillMaxSize(),
                        contentPadding = PaddingValues(16.dp),
                        verticalArrangement = Arrangement.spacedBy(12.dp)
                    ) {
                        item {
                            Text("إدارة الاشتراكات", style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold)
                        }
                        items(subscriptions) { sub ->
                            Card(modifier = Modifier.fillMaxWidth()) {
                                Column(modifier = Modifier.padding(16.dp)) {
                                    Text(sub.restaurantName, fontWeight = FontWeight.Bold)
                                    Text("الباقة: ${sub.planName}", style = MaterialTheme.typography.bodyMedium)
                                    Text("الحالة: ${sub.status} | التجديد: ${sub.renewalDate}", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                                }
                            }
                        }
                    }
                }
            }
        }
    }

    // Add Restaurant Dialog
    if (showAddRestaurantDialog) {
        AlertDialog(
            onDismissRequest = { showAddRestaurantDialog = false },
            title = { Text("إضافة مطعم جديد") },
            text = {
                Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    OutlinedTextField(value = newRestName, onValueChange = { newRestName = it }, label = { Text("اسم المطعم") })
                    OutlinedTextField(value = newRestPhone, onValueChange = { newRestPhone = it }, label = { Text("رقم الهاتف") })
                    OutlinedTextField(value = newRestAddress, onValueChange = { newRestAddress = it }, label = { Text("العنوان") })
                    OutlinedTextField(value = newRestDesc, onValueChange = { newRestDesc = it }, label = { Text("الوصف") })
                }
            },
            confirmButton = {
                Button(onClick = {
                    if (newRestName.isNotBlank()) {
                        TalabatRepository.addRestaurant(newRestName, newRestPhone, newRestAddress, newRestDesc)
                        newRestName = ""; newRestPhone = ""; newRestAddress = ""; newRestDesc = ""
                        showAddRestaurantDialog = false
                    }
                }) {
                    Text("إضافة")
                }
            },
            dismissButton = {
                TextButton(onClick = { showAddRestaurantDialog = false }) { Text("إلغاء") }
            }
        )
    }

    // Add Driver Bot Dialog
    if (showAddDriverDialog) {
        AlertDialog(
            onDismissRequest = { showAddDriverDialog = false },
            title = { Text("إضافة سائق وبوت تليجرام مستقل") },
            text = {
                Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    OutlinedTextField(value = newDriverName, onValueChange = { newDriverName = it }, label = { Text("اسم السائق") })
                    OutlinedTextField(value = newDriverPhone, onValueChange = { newDriverPhone = it }, label = { Text("رقم الهاتف") })
                    OutlinedTextField(value = newDriverToken, onValueChange = { newDriverToken = it }, label = { Text("Bot Token") })
                    OutlinedTextField(value = newDriverUsername, onValueChange = { newDriverUsername = it }, label = { Text("Telegram Username (@bot)") })
                    Text("المطعم المرتبط:", style = MaterialTheme.typography.bodySmall)
                    restaurants.forEach { rest ->
                        Row(
                            verticalAlignment = Alignment.CenterVertically,
                            modifier = Modifier.fillMaxWidth()
                        ) {
                            RadioButton(
                                selected = selectedRestId == rest.id,
                                onClick = { selectedRestId = rest.id }
                            )
                            Spacer(Modifier.width(4.dp))
                            Text(rest.name, style = MaterialTheme.typography.bodySmall)
                        }
                    }
                }
            },
            confirmButton = {
                Button(onClick = {
                    if (newDriverName.isNotBlank() && newDriverToken.isNotBlank()) {
                        TalabatRepository.addDriver(newDriverName, newDriverPhone, selectedRestId, newDriverToken, newDriverUsername)
                        newDriverName = ""; newDriverPhone = ""; newDriverToken = ""; newDriverUsername = ""
                        showAddDriverDialog = false
                    }
                }) {
                    ButtonContent()
                }
            },
            dismissButton = {
                TextButton(onClick = { showAddDriverDialog = false }) { Text("إلغاء") }
            }
        )
    }
}

@Composable
fun ButtonContent() {
    Text("حفظ وربط البوت")
}

@Composable
fun StatCard(title: String, value: String, icon: androidx.compose.ui.graphics.vector.ImageVector, modifier: Modifier = Modifier) {
    Card(modifier = modifier) {
        Column(
            modifier = Modifier.padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(8.dp)
        ) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Text(title, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
                Icon(icon, contentDescription = null, tint = MaterialTheme.colorScheme.primary)
            }
            Text(value, style = MaterialTheme.typography.headlineMedium, fontWeight = FontWeight.Bold)
        }
    }
}
