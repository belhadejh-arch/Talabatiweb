package com.example.talabat.data

import kotlinx.serialization.Serializable

@Serializable
data class Restaurant(
    val id: Int,
    val name: String,
    val slug: String,
    val phone: String,
    val address: String,
    val description: String,
    val rating: Double,
    val deliveryTime: String,
    val deliveryFee: Double,
    val imageUrl: String
)

@Serializable
data class Product(
    val id: Int,
    val restaurantId: Int,
    val name: String,
    val description: String,
    val price: Double,
    val category: String,
    val imageUrl: String
)

@Serializable
data class CartItem(
    val product: Product,
    val quantity: Int,
    val selectedSize: String? = null,
    val extraPrice: Double = 0.0
)

@Serializable
data class Order(
    val id: Int,
    val restaurantId: Int,
    val restaurantName: String,
    val customerName: String,
    val customerPhone: String,
    val orderType: String, // DELIVERY, RESERVATION
    val latitude: Double? = null,
    val longitude: Double? = null,
    val itemsSummary: String,
    val totalAmount: Double,
    val status: String, // NEW, ASSIGNED, ACCEPTED, REJECTED, TIMEOUT, COMPLETED, CANCELLED
    val assignmentStatus: String, // PENDING, ACCEPTED, REJECTED, TIMEOUT, CANCELLED
    val createdAt: String
)

@Serializable
data class Driver(
    val id: Int,
    val name: String,
    val phone: String,
    val restaurantId: Int,
    val botToken: String,
    val botUsername: String,
    val chatId: String,
    val status: String, // AVAILABLE, BUSY, OFFLINE
    val botStatus: String, // ACTIVE, INACTIVE
    val linkStatus: String, // LINKED, UNLINKED, ERROR
    val lastConnected: String,
    val activeOrdersCount: Int
)

@Serializable
data class Subscription(
    val id: Int,
    val restaurantName: String,
    val planName: String,
    val status: String, // ACTIVE, EXPIRED, PENDING
    val renewalDate: String
)
