package com.example.talabat.data

import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow

object TalabatRepository {
    // Central Bot Token reference (Backend environment variable TELEGRAM_MAIN_BOT_TOKEN)
    var centralBotToken: String = "123456789:ABCdefGhIJKlmNoPQRsTUVwxyZ"

    private val _restaurants = MutableStateFlow(
        listOf(
            Restaurant(
                id = 1,
                name = "برجر كينج — Burger King",
                slug = "burger-king",
                phone = "+218911234567",
                address = "طرابلس، شارع بن عاشور",
                description = "الوجبات السريعة المفضلة، برجر مشوي على الفحم",
                rating = 4.6,
                deliveryTime = "25-35 دقيقة",
                deliveryFee = 3.50,
                imageUrl = "https://images.unsplash.com/photo-1568901346375-23c9450c58cd?w=600"
            ),
            Restaurant(
                id = 2,
                name = "بيتزا هัท — Pizza Hut",
                slug = "pizza-hut",
                phone = "+218929876543",
                address = "بنغازي، الهواري",
                description = "أشهى البيتزا الإيطالية الطازجة والمعجنات",
                rating = 4.5,
                deliveryTime = "30-45 دقيقة",
                deliveryFee = 4.00,
                imageUrl = "https://images.unsplash.com/photo-1513104890138-7c749659a591?w=600"
            ),
            Restaurant(
                id = 3,
                name = "شاورما دمشق — Damascus Shawarma",
                slug = "damascus-shawarma",
                phone = "+218945556677",
                address = "مصراتة، وسط المدينة",
                description = "شاورما عربي وسوري على اصولها بلحمة وخضار طازجة",
                rating = 4.8,
                deliveryTime = "20-30 دقيقة",
                deliveryFee = 2.50,
                imageUrl = "https://images.unsplash.com/photo-1529006557810-274b9b2fc783?w=600"
            )
        )
    )
    val restaurants: StateFlow<List<Restaurant>> = _restaurants.asStateFlow()

    private val _products = MutableStateFlow(
        listOf(
            Product(1, 1, "ووبر وجبة مزدوجة", "برجر لحم بقري مشوي مع جبنة وصلصة خاصة وبطاطس ومشروب", 22.00, "وجبات", "https://images.unsplash.com/photo-1586190848861-99aa4a171e90?w=600"),
            Product(2, 1, "تشكين رويال", "دجاج مقرمش مع خس ومايونيز في خبز سمسم", 18.50, "وجبات", "https://images.unsplash.com/photo-1625813506062-0aeb1d7a094b?w=600"),
            Product(3, 1, "بطاطس مقلية كبيرة", "بطاطس ذهبية مقرمشة مع توابل", 7.00, "جانبية", "https://images.unsplash.com/photo-1573080496219-bb080dd4f877?w=600"),
            Product(4, 2, "بيتزا سوبر سوبريم كبيرة", "لحم بقر، ببروني، فطر، فلفل أخضر، زيتون وجبن موزارلا", 35.00, "بيتزا", "https://images.unsplash.com/photo-1565299624946-b28f40a0ae38?w=600"),
            Product(5, 2, "بيتزا مارجريتا", "صلصة طماطم إيطالية مع جبنة موزارلا وأوراق ريحان", 26.00, "بيتزا", "https://images.unsplash.com/photo-1604382355076-af4b0eb60143?w=600"),
            Product(6, 3, "صاروخ شاورما دجاج", "شاورما دجاج بخبز الصاج مع الثوم والبطاطس والمخلل", 12.00, "ساندويتشات", "https://images.unsplash.com/photo-1561651823-34feb02256e1?w=600")
        )
    )
    val products: StateFlow<List<Product>> = _products.asStateFlow()

    private val _orders = MutableStateFlow(
        listOf(
            Order(
                id = 101,
                restaurantId = 1,
                restaurantName = "برجر كينج — Burger King",
                customerName = "محمد أحمد",
                customerPhone = "+218911112222",
                orderType = "DELIVERY",
                latitude = 32.8872,
                longitude = 13.1913,
                itemsSummary = "ووبر وجبة مزدوجة (×2)",
                totalAmount = 47.50,
                status = "ASSIGNED",
                assignmentStatus = "PENDING",
                createdAt = "منذ 10 دقائق"
            ),
            Order(
                id = 102,
                restaurantId = 2,
                restaurantName = "بيتزا هัท — Pizza Hut",
                customerName = "فاطمة علي",
                customerPhone = "+218923334444",
                orderType = "RESERVATION",
                latitude = null,
                longitude = null,
                itemsSummary = "بيتزا سوبر سوبريم كبيرة (×1)",
                totalAmount = 39.00,
                status = "ACCEPTED",
                assignmentStatus = "ACCEPTED",
                createdAt = "منذ 25 دقيقة"
            )
        )
    )
    val orders: StateFlow<List<Order>> = _orders.asStateFlow()

    private val _drivers = MutableStateFlow(
        listOf(
            Driver(
                id = 1,
                name = "سامي الكاظمي",
                phone = "+218912345678",
                restaurantId = 1,
                botToken = "987654321:DriverBotTokenOneXYZ",
                botUsername = "@TalabatSamiBot",
                chatId = "12345678",
                status = "AVAILABLE",
                botStatus = "ACTIVE",
                linkStatus = "LINKED",
                lastConnected = "منذ دقيقتين",
                activeOrdersCount = 1
            ),
            Driver(
                id = 2,
                name = "علاء الدين صالح",
                phone = "+218923456789",
                restaurantId = 2,
                botToken = "112233445:DriverBotTokenTwoXYZ",
                botUsername = "@TalabatAlaaBot",
                chatId = "87654321",
                status = "AVAILABLE",
                botStatus = "ACTIVE",
                linkStatus = "LINKED",
                lastConnected = "منذ 5 دقائق",
                activeOrdersCount = 0
            )
        )
    )
    val drivers: StateFlow<List<Driver>> = _drivers.asStateFlow()

    private val _subscriptions = MutableStateFlow(
        listOf(
            Subscription(1, "برجر كينج — Burger King", "الباقة المميزة (سنوي)", "ACTIVE", "2027-01-15"),
            Subscription(2, "بيتزا هัท — Pizza Hut", "الباقة الأساسية (شهري)", "ACTIVE", "2026-10-10"),
            Subscription(3, "شاورما دمشق", "الباقة التجريبية", "PENDING", "2026-09-30")
        )
    )
    val subscriptions: StateFlow<List<Subscription>> = _subscriptions.asStateFlow()

    private val _cartItems = MutableStateFlow<List<CartItem>>(emptyList())
    val cartItems: StateFlow<List<CartItem>> = _cartItems.asStateFlow()

    fun addToCart(product: Product, size: String? = null, extra: Double = 0.0) {
        val current = _cartItems.value.toMutableList()
        val existingIndex = current.indexOfFirst { it.product.id == product.id && it.selectedSize == size }
        if (existingIndex >= 0) {
            val item = current[existingIndex]
            current[existingIndex] = item.copy(quantity = item.quantity + 1)
        } else {
            current.add(CartItem(product, 1, size, extra))
        }
        _cartItems.value = current
    }

    fun clearCart() {
        _cartItems.value = emptyList()
    }

    fun placeOrder(restaurant: Restaurant, customerName: String, customerPhone: String, orderType: String, total: Double, lat: Double?, lng: Double?): Order {
        val itemsSummary = _cartItems.value.joinToString(", ") { "${it.product.name} (×${it.quantity})" }
        val newOrder = Order(
            id = (100..999).random(),
            restaurantId = restaurant.id,
            restaurantName = restaurant.name,
            customerName = customerName,
            customerPhone = customerPhone,
            orderType = orderType,
            latitude = lat,
            longitude = lng,
            itemsSummary = itemsSummary,
            totalAmount = total,
            status = "NEW",
            assignmentStatus = "PENDING",
            createdAt = "الآن عبر النظام المركزي"
        )
        // Central Bot distributes order to eligible driver matching restaurantId
        val eligibleDriver = _drivers.value.find { it.restaurantId == restaurant.id && it.botStatus == "ACTIVE" && it.linkStatus == "LINKED" }
        val finalOrder = if (eligibleDriver != null) {
            newOrder.copy(status = "ASSIGNED", assignmentStatus = "PENDING")
        } else {
            newOrder.copy(status = "NEW", assignmentStatus = "PENDING")
        }

        _orders.value = listOf(finalOrder) + _orders.value
        clearCart()
        return finalOrder
    }

    fun updateOrderStatus(orderId: Int, newStatus: String, newAssignmentStatus: String) {
        _orders.value = _orders.value.map {
            if (it.id == orderId) it.copy(status = newStatus, assignmentStatus = newAssignmentStatus) else it
        }
    }

    fun addDriver(name: String, phone: String, restaurantId: Int, botToken: String, botUsername: String) {
        val newDriver = Driver(
            id = _drivers.value.size + 1,
            name = name,
            phone = phone,
            restaurantId = restaurantId,
            botToken = botToken,
            botUsername = botUsername,
            chatId = "غير مرتبط",
            status = "AVAILABLE",
            botStatus = "ACTIVE",
            linkStatus = "UNLINKED",
            lastConnected = "لم يتصل بعد",
            activeOrdersCount = 0
        )
        _drivers.value = _drivers.value + newDriver
    }

    fun updateDriverBot(driverId: Int, botToken: String, botUsername: String, restaurantId: Int, botStatus: String) {
        _drivers.value = _drivers.value.map {
            if (it.id == driverId) {
                it.copy(
                    botToken = botToken,
                    botUsername = botUsername,
                    restaurantId = restaurantId,
                    botStatus = botStatus
                )
            } else it
        }
    }

    fun simulateTelegramStart(driverId: Int) {
        _drivers.value = _drivers.value.map {
            if (it.id == driverId) {
                it.copy(
                    chatId = "TG_${(100000..999999).random()}",
                    linkStatus = "LINKED",
                    lastConnected = "الآن عبر /start"
                )
            } else it
        }
    }

    fun testConnection(driverId: Int) {
        _drivers.value = _drivers.value.map {
            if (it.id == driverId) {
                it.copy(
                    linkStatus = if (it.botToken.isNotBlank() && !it.botToken.contains("invalid")) "LINKED" else "ERROR",
                    lastConnected = "تم اختبار الاتصال بنجاح"
                )
            } else it
        }
    }

    fun addRestaurant(name: String, phone: String, address: String, desc: String) {
        val newRest = Restaurant(
            id = _restaurants.value.size + 1,
            name = name,
            slug = name.lowercase().replace(" ", "-"),
            phone = phone,
            address = address,
            description = desc,
            rating = 5.0,
            deliveryTime = "20-35 دقيقة",
            deliveryFee = 3.00,
            imageUrl = "https://images.unsplash.com/photo-1555396273-367ea4eb4db5?w=600"
        )
        _restaurants.value = _restaurants.value + newRest
    }
}
