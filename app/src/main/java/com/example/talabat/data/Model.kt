package com.example.talabat.data

import kotlinx.serialization.Serializable

@Serializable
data class Restaurant(
    val id: Int,
    val name: String,
    val slug: String = "",
    val phone: String = "",
    val address: String = "",
    val description: String = "",
    val rating: Double = 0.0,
    val deliveryTime: String = "",
    val deliveryFee: Double = 0.0,
    val imageUrl: String = "",
    val logoUrl: String? = null,
    val coverUrl: String? = null
) {
    val displayImageUrl: String
        get() = imageUrl.ifBlank { coverUrl ?: logoUrl.orEmpty() }
}

@Serializable
data class Product(
    val id: Int,
    val restaurantId: Int,
    val name: String,
    val description: String = "",
    val price: Double,
    val category: String = "",
    val imageUrl: String = ""
)

@Serializable
data class CartItem(
    val product: Product,
    val quantity: Int,
    val selectedSize: String? = null,
    val extraPrice: Double = 0.0
)

@Serializable
data class OrderItem(
    val productId: Int? = null,
    val productName: String = "",
    val quantity: Int,
    val unitPrice: Double = 0.0,
    val subtotal: Double = 0.0,
    val selectedSize: String? = null
)

@Serializable
data class Order(
    val id: Int,
    val restaurantId: Int,
    val restaurantName: String = "",
    val customerName: String,
    val customerPhone: String,
    val orderType: String,
    val latitude: Double? = null,
    val longitude: Double? = null,
    val reservationDate: String? = null,
    val reservationTime: String? = null,
    val partySize: Int? = null,
    val notes: String? = null,
    val items: List<OrderItem> = emptyList(),
    val itemsSummary: String = "",
    val subtotal: Double = 0.0,
    val deliveryFee: Double = 0.0,
    val totalAmount: Double,
    val status: String,
    val assignmentStatus: String? = null,
    val driverId: Int? = null,
    val createdAt: String
)

@Serializable
data class Driver(
    val id: Int,
    val name: String,
    val phone: String,
    val email: String? = null,
    val restaurantId: Int,
    val isActive: Boolean = false,
    val status: String = ""
)

@Serializable
data class Subscription(
    val id: Int,
    val restaurantName: String = "",
    val planName: String = "",
    val plan: String? = null,
    val status: String,
    val renewalDate: String = "",
    val expiryDate: String? = null
)

@Serializable
data class OrderItemRequest(
    val productId: Int,
    val quantity: Int,
    val selectedSize: String? = null,
    val extraPrice: Double = 0.0
)

@Serializable
data class CreateOrderRequest(
    val restaurantId: Int,
    val customerName: String,
    val customerPhone: String,
    val orderType: String,
    val latitude: Double? = null,
    val longitude: Double? = null,
    val notes: String? = null,
    val reservationDate: String? = null,
    val reservationTime: String? = null,
    val partySize: Int? = null,
    val items: List<OrderItemRequest>
)

@Serializable
data class DriverInput(
    val name: String,
    val phone: String,
    val email: String,
    val restaurantId: Int,
    val isActive: Boolean
)

@Serializable
data class RestaurantInput(
    val name: String,
    val phone: String,
    val address: String,
    val description: String
)

@Serializable
data class StatsSummary(
    val totalOrders: Int = 0,
    val accepted: Int = 0,
    val rejected: Int = 0,
    val timeout: Int = 0,
    val cancelled: Int = 0,
    val completed: Int = 0,
    val totalOrderValue: Double = 0.0,
    val totalEarnings: Double? = null,
    val averageOrderValue: Double = 0.0,
    val acceptanceRate: Double = 0.0,
    val rejectionRate: Double = 0.0
)

@Serializable
data class StatsPeriod(
    val period: String,
    val orders: Int = 0,
    val earnings: Double = 0.0
)

@Serializable
data class StatsGroup(
    val name: String,
    val orders: Int = 0,
    val earnings: Double = 0.0
)

@Serializable
data class StatsData(
    val summary: StatsSummary = StatsSummary(),
    val periods: List<StatsPeriod> = emptyList(),
    val byRestaurant: List<StatsGroup> = emptyList(),
    val byDriver: List<StatsGroup> = emptyList()
)

@Serializable
data class CatalogResponse(
    val restaurants: List<Restaurant> = emptyList(),
    val products: List<Product> = emptyList(),
    val subscriptions: List<Subscription> = emptyList()
)

@Serializable
data class AdminOverviewResponse(
    val orders: List<Order> = emptyList(),
    val drivers: List<Driver> = emptyList(),
    val subscriptions: List<Subscription> = emptyList(),
    val restaurants: List<Restaurant> = emptyList(),
    val stats: StatsData = StatsData()
)

@Serializable
data class OrdersResponse(val orders: List<Order> = emptyList())

@Serializable
data class OrderResponse(val order: Order)

@Serializable
data class DriverResponse(val driver: Driver)

@Serializable
data class DriverCreationResponse(
    val driver: Driver,
    val serialNumber: String
)

@Serializable
data class RestaurantResponse(val restaurant: Restaurant)

@Serializable
data class StatsResponse(
    val summary: StatsSummary = StatsSummary(),
    val periods: List<StatsPeriod> = emptyList(),
    val byRestaurant: List<StatsGroup> = emptyList(),
    val byDriver: List<StatsGroup> = emptyList()
) {
    fun asStatsData() = StatsData(summary, periods, byRestaurant, byDriver)
}

@Serializable
data class AdminLoginRequest(val username: String, val password: String)

@Serializable
data class DriverLoginRequest(val serialNumber: String)

@Serializable
data class AuthResponse(val token: String, val driver: Driver? = null)

@Serializable
data class ErrorResponse(
    val error: String? = null,
    val message: String? = null,
    val detail: String? = null
)

data class StatsFilters(
    val from: String? = null,
    val to: String? = null,
    val status: String? = null,
    val restaurantId: Int? = null,
    val driverId: Int? = null,
    val period: String? = null
)