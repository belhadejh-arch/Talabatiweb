package com.example.talabat

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.rememberNavController
import com.example.talabat.data.*
import com.example.talabat.ui.screens.*
import com.example.talabat.ui.theme.TalabatTheme
import kotlinx.serialization.decodeFromString
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        setContent {
            TalabatTheme {
                val navController = rememberNavController()
                var checkoutRestaurantJson by rememberSaveable { mutableStateOf<String?>(null) }
                val checkoutRestaurant = remember(checkoutRestaurantJson) {
                    checkoutRestaurantJson?.let { Json.decodeFromString<Restaurant>(it) }
                }

                NavHost(navController = navController, startDestination = "home") {
                    composable("home") {
                        HomeScreen(
                            onNavigateCustomer = { navController.navigate("customer") },
                            onNavigateDriver = { navController.navigate("driver") },
                            onNavigateAdmin = { navController.navigate("admin") }
                        )
                    }
                    composable("customer") {
                        CustomerStorefrontScreen(
                            onBack = { navController.popBackStack() },
                            onCheckout = { rest ->
                                checkoutRestaurantJson = Json.encodeToString(rest)
                                navController.navigate("checkout")
                            }
                        )
                    }
                    composable("checkout") {
                        if (checkoutRestaurant != null) {
                            CheckoutScreen(
                                restaurant = checkoutRestaurant!!,
                                onBack = {
                                    checkoutRestaurantJson = null
                                    navController.popBackStack()
                                },
                                onOrderPlaced = {
                                    checkoutRestaurantJson = null
                                    navController.popBackStack("home", inclusive = false)
                                }
                            )
                        }
                    }
                    composable("driver") {
                        DriverPortalScreen(
                            onBack = { navController.popBackStack() }
                        )
                    }
                    composable("admin") {
                        AdminDashboardScreen(
                            onBack = { navController.popBackStack() },
                            onOpenDriverPortal = { navController.navigate("driver") }
                        )
                    }
                }
            }
        }
    }
}
