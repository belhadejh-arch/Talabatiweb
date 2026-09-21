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
fun DriverPortalScreen(onBack: () -> Unit) {
    val drivers by TalabatRepository.drivers.collectAsState()
    val orders by TalabatRepository.orders.collectAsState()
    var selectedDriverId by remember { mutableStateOf<Int?>(null) }
    var currentCommand by remember { mutableStateOf("new") } // new, accepted, rejected, orders, profile, help

    val currentDriver = drivers.find { it.id == selectedDriverId }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text(if (currentDriver != null) "بوت Telegram — ${currentDriver.name} (${currentDriver.botUsername})" else "بوابة السائقين وبوتات Telegram") },
                navigationIcon = {
                    IconButton(onClick = {
                        if (selectedDriverId != null) {
                            selectedDriverId = null
                        } else {
                            onBack()
                        }
                    }) {
                        Icon(Icons.Default.ArrowBack, contentDescription = "عودة")
                    }
                }
            )
        },
        bottomBar = {
            if (currentDriver != null) {
                NavigationBar {
                    NavigationBarItem(
                        icon = { Icon(Icons.Default.NewReleases, contentDescription = null) },
                        label = { Text("الجديدة") },
                        selected = currentCommand == "new",
                        onClick = { currentCommand = "new" }
                    )
                    NavigationBarItem(
                        icon = { Icon(Icons.Default.CheckCircle, contentDescription = null) },
                        label = { Text("المقبولة") },
                        selected = currentCommand == "accepted",
                        onClick = { currentCommand = "accepted" }
                    )
                    NavigationBarItem(
                        icon = { Icon(Icons.Default.List, contentDescription = null) },
                        label = { Text("الكل") },
                        selected = currentCommand == "orders",
                        onClick = { currentCommand = "orders" }
                    )
                    NavigationBarItem(
                        icon = { Icon(Icons.Default.Person, contentDescription = null) },
                        label = { Text("الملف") },
                        selected = currentCommand == "profile",
                        onClick = { currentCommand = "profile" }
                    )
                }
            }
        }
    ) { padding ->
        Box(modifier = Modifier.padding(padding).fillMaxSize()) {
            if (currentDriver == null) {
                // Driver Selection List
                LazyColumn(
                    modifier = Modifier.fillMaxSize(),
                    contentPadding = PaddingValues(16.dp),
                    verticalArrangement = Arrangement.spacedBy(12.dp)
                ) {
                    item {
                        Text("اختر سائقاً لمحاكاة بوت Telegram الخاص به", style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold)
                        Text("كل سائق يمتلك بوت Telegram مستقل متصل بالبوت المركزي", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    }
                    items(drivers) { driver ->
                        Card(modifier = Modifier.fillMaxWidth()) {
                            Column(modifier = Modifier.padding(16.dp)) {
                                Row(
                                    modifier = Modifier.fillMaxWidth(),
                                    horizontalArrangement = Arrangement.SpaceBetween,
                                    verticalAlignment = Alignment.CenterVertically
                                ) {
                                    Column {
                                        Text(driver.name, fontWeight = FontWeight.Bold, style = MaterialTheme.typography.titleMedium)
                                        Text("البوت: ${driver.botUsername}", style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.primary)
                                        Text("Chat ID: ${driver.chatId} | الحالة: ${driver.linkStatus}", style = MaterialTheme.typography.bodySmall)
                                    }
                                    Button(onClick = { selectedDriverId = driver.id }) {
                                        Text("فتح بوت Telegram")
                                    }
                                }
                                Spacer(Modifier.height(8.dp))
                                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                                    OutlinedButton(onClick = { TalabatRepository.simulateTelegramStart(driver.id) }) {
                                        Icon(Icons.Default.PlayArrow, contentDescription = null, modifier = Modifier.size(16.dp))
                                        Spacer(Modifier.width(4.dp))
                                        Text("محاكاة /start للربط")
                                    }
                                }
                            }
                        }
                    }
                }
            } else {
                // Telegram Bot Simulation View for Selected Driver
                val driverOrders = orders.filter { it.restaurantId == currentDriver.restaurantId }
                LazyColumn(
                    modifier = Modifier.fillMaxSize(),
                    contentPadding = PaddingValues(16.dp),
                    verticalArrangement = Arrangement.spacedBy(12.dp)
                ) {
                    item {
                        Card(modifier = Modifier.fillMaxWidth()) {
                            Column(modifier = Modifier.padding(16.dp)) {
                                Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                                    Text("🤖 ${currentDriver.botUsername}", fontWeight = FontWeight.Bold)
                                    Surface(
                                        color = if (currentDriver.linkStatus == "LINKED") MaterialTheme.colorScheme.primaryContainer else MaterialTheme.colorScheme.errorContainer,
                                        shape = MaterialTheme.shapes.small
                                    ) {
                                        Text(currentDriver.linkStatus, modifier = Modifier.padding(horizontal = 8.dp, vertical = 4.dp), style = MaterialTheme.typography.labelSmall)
                                    }
                                }
                                Spacer(Modifier.height(4.dp))
                                Text("معرف الشات Chat ID: ${currentDriver.chatId}", style = MaterialTheme.typography.bodySmall)
                                Text("آخر اتصال: ${currentDriver.lastConnected}", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                            }
                        }
                    }

                    when (currentCommand) {
                        "new" -> {
                            item {
                                Text("الطلبات الجديدة الموزعة من البوت المركزي (/new)", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold)
                            }
                            val pendingOrders = driverOrders.filter { it.status == "ASSIGNED" || it.status == "NEW" }
                            if (pendingOrders.isEmpty()) {
                                item {
                                    Text("لا توجد طلبات جديدة حالياً في بوتك.", style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
                                }
                            } else {
                                items(pendingOrders) { order ->
                                    Card(modifier = Modifier.fillMaxWidth(), colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceVariant)) {
                                        Column(modifier = Modifier.padding(16.dp)) {
                                            Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                                                Text("طلب #${order.id} (${if (order.orderType == "DELIVERY") "توصيل" else "حجز"})", fontWeight = FontWeight.Bold)
                                                Text("${order.totalAmount} د.ل", fontWeight = FontWeight.Bold, color = MaterialTheme.colorScheme.primary)
                                            }
                                            Spacer(Modifier.height(8.dp))
                                            Text("المطعم: ${order.restaurantName}", style = MaterialTheme.typography.bodyMedium)
                                            Text("الزبون: ${order.customerName} (${order.customerPhone})", style = MaterialTheme.typography.bodyMedium)
                                            Text("المنتجات: ${order.itemsSummary}", style = MaterialTheme.typography.bodySmall)
                                            if (order.orderType == "DELIVERY" && order.latitude != null) {
                                                Spacer(Modifier.height(4.dp))
                                                Text("📍 موقع التوصيل: (${order.latitude}, ${order.longitude})", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.secondary)
                                            }
                                            Spacer(Modifier.height(12.dp))
                                            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                                                Button(
                                                    onClick = { TalabatRepository.updateOrderStatus(order.id, "ACCEPTED", "ACCEPTED") },
                                                    modifier = Modifier.weight(1f)
                                                ) {
                                                    Text("قبول الطلب ✓")
                                                }
                                                OutlinedButton(
                                                    onClick = { TalabatRepository.updateOrderStatus(order.id, "REJECTED", "REJECTED") },
                                                    modifier = Modifier.weight(1f)
                                                ) {
                                                    Text("رفض الطلب ✕")
                                                }
                                            }
                                        }
                                    }
                                }
                            }
                        }
                        "accepted" -> {
                            item {
                                Text("الطلبات المقبولة (/accepted)", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold)
                            }
                            val acceptedOrders = driverOrders.filter { it.status == "ACCEPTED" }
                            if (acceptedOrders.isEmpty()) {
                                item { Text("لا توجد طلبات مقبولة حالياً.", style = MaterialTheme.typography.bodyMedium) }
                            } else {
                                items(acceptedOrders) { order ->
                                    Card(modifier = Modifier.fillMaxWidth()) {
                                        Column(modifier = Modifier.padding(16.dp)) {
                                            Text("طلب #${order.id} — ${order.customerName}", fontWeight = FontWeight.Bold)
                                            Text("المبلغ: ${order.totalAmount} د.ل", color = MaterialTheme.colorScheme.primary)
                                            Spacer(Modifier.height(8.dp))
                                            Button(onClick = { TalabatRepository.updateOrderStatus(order.id, "COMPLETED", "ACCEPTED") }) {
                                                Text("إتمام وتسليم الطلب")
                                            }
                                        }
                                    }
                                }
                            }
                        }
                        "orders" -> {
                            item {
                                Text("سجل كافة طلبات المطعم المرتبط (/orders)", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold)
                            }
                            items(driverOrders) { order ->
                                Card(modifier = Modifier.fillMaxWidth()) {
                                    Column(modifier = Modifier.padding(12.dp)) {
                                        Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                                            Text("طلب #${order.id}", fontWeight = FontWeight.Bold)
                                            Text(order.status, style = MaterialTheme.typography.labelSmall)
                                        }
                                        Text("الزبون: ${order.customerName} — ${order.totalAmount} د.ل", style = MaterialTheme.typography.bodySmall)
                                    }
                                }
                            }
                        }
                        "profile" -> {
                            item {
                                Card(modifier = Modifier.fillMaxWidth()) {
                                    Column(modifier = Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                                        Text("بيانات السائق والمطعم المرتبط", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold)
                                        Text("الاسم: ${currentDriver.name}")
                                        Text("الهاتف: ${currentDriver.phone}")
                                        Text("معرف بوت التليجرام: ${currentDriver.botUsername}")
                                        Text("معرف الشات Chat ID: ${currentDriver.chatId}")
                                        Text("حالة الاتصال: ${currentDriver.linkStatus}")
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
    }
}
