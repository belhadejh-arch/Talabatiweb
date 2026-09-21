package com.example.talabat.ui.screens

import androidx.compose.foundation.layout.*
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun HomeScreen(
    onNavigateCustomer: () -> Unit,
    onNavigateDriver: () -> Unit,
    onNavigateAdmin: () -> Unit
) {
    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("TALABAT — طلبات للتوصيل وإدارة المطاعم") }
            )
        }
    ) { padding ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding)
                .padding(24.dp),
            verticalArrangement = Arrangement.Center,
            horizontalAlignment = Alignment.CenterHorizontally
        ) {
            Surface(
                modifier = Modifier.size(96.dp),
                shape = MaterialTheme.shapes.extraLarge,
                color = MaterialTheme.colorScheme.primaryContainer
            ) {
                Box(contentAlignment = Alignment.Center) {
                    Icon(
                        Icons.Default.RestaurantMenu,
                        contentDescription = null,
                        modifier = Modifier.size(48.dp),
                        tint = MaterialTheme.colorScheme.primary
                    )
                }
            }

            Spacer(Modifier.height(24.dp))
            Text("مرحباً بك في منصة طلبات", style = MaterialTheme.typography.headlineMedium, fontWeight = FontWeight.Bold)
            Text("اختر القسم للبدء", style = MaterialTheme.typography.bodyLarge, color = MaterialTheme.colorScheme.onSurfaceVariant)
            Spacer(Modifier.height(36.dp))

            Button(
                onClick = onNavigateCustomer,
                modifier = Modifier.fillMaxWidth().height(56.dp)
            ) {
                Icon(Icons.Default.Store, contentDescription = null)
                Spacer(Modifier.width(12.dp))
                Text("تصفح المطاعم وطلب الطعام (العملاء)")
            }

            Spacer(Modifier.height(16.dp))

            OutlinedButton(
                onClick = onNavigateDriver,
                modifier = Modifier.fillMaxWidth().height(56.dp)
            ) {
                Icon(Icons.Default.LocalShipping, contentDescription = null)
                Spacer(Modifier.width(12.dp))
                Text("بوابة السائقين وتوصيل الطلبات")
            }

            Spacer(Modifier.height(16.dp))

            OutlinedButton(
                onClick = onNavigateAdmin,
                modifier = Modifier.fillMaxWidth().height(56.dp)
            ) {
                Icon(Icons.Default.AdminPanelSettings, contentDescription = null)
                Spacer(Modifier.width(12.dp))
                Text("لوحة تحكم المشرف وإدارة المنصة")
            }
        }
    }
}
