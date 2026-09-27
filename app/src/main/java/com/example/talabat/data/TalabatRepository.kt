package com.example.talabat.data

import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow

object TalabatRepository {
    private val _restaurants = MutableStateFlow<List<Restaurant>>(emptyList())
    val restaurants: StateFlow<List<Restaurant>> = _restaurants.asStateFlow()

    private val _products = MutableStateFlow<List<Product>>(emptyList())
    val products: StateFlow<List<Product>> = _products.asStateFlow()

    private val _adminOrders = MutableStateFlow<List<Order>>(emptyList())
    val adminOrders: StateFlow<List<Order>> = _adminOrders.asStateFlow()

    private val _driverOrders = MutableStateFlow<List<Order>>(emptyList())
    val driverOrders: StateFlow<List<Order>> = _driverOrders.asStateFlow()

    private val _drivers = MutableStateFlow<List<Driver>>(emptyList())
    val drivers: StateFlow<List<Driver>> = _drivers.asStateFlow()

    private val _subscriptions = MutableStateFlow<List<Subscription>>(emptyList())
    val subscriptions: StateFlow<List<Subscription>> = _subscriptions.asStateFlow()

    private val _adminStats = MutableStateFlow(StatsData())
    val adminStats: StateFlow<StatsData> = _adminStats.asStateFlow()

    private val _driverStats = MutableStateFlow(StatsData())
    val driverStats: StateFlow<StatsData> = _driverStats.asStateFlow()

    private val _cartItems = MutableStateFlow<List<CartItem>>(emptyList())
    val cartItems: StateFlow<List<CartItem>> = _cartItems.asStateFlow()

    private val _adminToken = MutableStateFlow<String?>(null)
    val adminToken: StateFlow<String?> = _adminToken.asStateFlow()

    private val _driverToken = MutableStateFlow<String?>(null)
    val driverToken: StateFlow<String?> = _driverToken.asStateFlow()

    private val _driver = MutableStateFlow<Driver?>(null)
    val driver: StateFlow<Driver?> = _driver.asStateFlow()

    suspend fun loadCatalog(): CatalogResponse {
        val catalog = BackendApi.catalog()
        _restaurants.value = catalog.restaurants
        _products.value = catalog.products
        _subscriptions.value = catalog.subscriptions
        return catalog
    }

    fun addToCart(product: Product, size: String? = null, extra: Double = 0.0) {
        val current = _cartItems.value.toMutableList()
        val existingIndex = current.indexOfFirst {
            it.product.id == product.id && it.selectedSize == size
        }
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

    suspend fun placeOrder(request: CreateOrderRequest, idempotencyKey: String): Order {
        val response = BackendApi.placeOrder(request, idempotencyKey)
        clearCart()
        return response.order
    }

    suspend fun adminLogin(username: String, password: String): AdminOverviewResponse {
        val response = BackendApi.adminLogin(username, password)
        _adminToken.value = response.token
        return loadAdminOverview(response.token)
    }

    suspend fun loadAdminOverview(token: String? = _adminToken.value): AdminOverviewResponse {
        val authorizedToken = token?.takeIf(String::isNotBlank)
            ?: throw BackendException("يرجى تسجيل الدخول إلى لوحة الإدارة.")
        val overview = BackendApi.adminOverview(authorizedToken)
        if (_adminToken.value != authorizedToken) return overview
        _adminOrders.value = overview.orders
        _drivers.value = overview.drivers
        _subscriptions.value = overview.subscriptions
        _restaurants.value = overview.restaurants
        _adminStats.value = overview.stats
        return overview
    }

    suspend fun loadAdminStats(filters: StatsFilters): StatsData {
        val authorizedToken = _adminToken.value
            ?: throw BackendException("انتهت جلسة الإدارة. يرجى تسجيل الدخول مجدداً.")
        val stats = BackendApi.adminStats(authorizedToken, filters).asStatsData()
        if (_adminToken.value == authorizedToken) _adminStats.value = stats
        return stats
    }

    suspend fun createDriver(input: DriverInput): DriverCreationResponse {
        val token = _adminToken.value
            ?: throw BackendException("يرجى تسجيل الدخول إلى لوحة الإدارة.")
        val created = BackendApi.createDriver(token, input)
        if (_adminToken.value == token) {
            _drivers.value = (_drivers.value.filterNot { it.id == created.driver.id } + created.driver)
        }
        return created
    }

    suspend fun updateDriver(id: Int, input: DriverInput): Driver {
        val token = _adminToken.value
            ?: throw BackendException("يرجى تسجيل الدخول إلى لوحة الإدارة.")
        val driver = BackendApi.updateDriver(token, id, input).driver
        if (_adminToken.value == token) {
            _drivers.value = _drivers.value.map { if (it.id == id) driver else it }
        }
        return driver
    }

    suspend fun createRestaurant(input: RestaurantInput): Restaurant {
        val token = _adminToken.value
            ?: throw BackendException("يرجى تسجيل الدخول إلى لوحة الإدارة.")
        val restaurant = BackendApi.createRestaurant(token, input)
        if (_adminToken.value == token) _restaurants.value = _restaurants.value + restaurant
        return restaurant
    }

    fun adminLogout() {
        _adminToken.value = null
        _adminOrders.value = emptyList()
        _drivers.value = emptyList()
        _adminStats.value = StatsData()
    }

    suspend fun driverLogin(serialNumber: String): Driver {
        val response = BackendApi.driverLogin(serialNumber)
        val authenticatedDriver = response.driver
            ?: throw BackendException("لم يُرجع الخادم حساب السائق.")
        _driverToken.value = response.token
        _driver.value = authenticatedDriver
        return authenticatedDriver
    }

    suspend fun loadDriverData(filters: StatsFilters): Pair<List<Order>, StatsData> {
        val token = _driverToken.value
            ?: throw BackendException("انتهت جلسة السائق. يرجى تسجيل الدخول مجدداً.")
        val orders = BackendApi.driverOrders(token, filters).orders
        val stats = BackendApi.driverStats(token, filters).asStatsData()
        if (_driverToken.value == token) {
            _driverOrders.value = orders
            _driverStats.value = stats
        }
        return orders to stats
    }

    suspend fun completeOrder(orderId: Int): Order {
        val token = _driverToken.value
            ?: throw BackendException("انتهت جلسة السائق. يرجى تسجيل الدخول مجدداً.")
        val completed = BackendApi.completeOrder(token, orderId).order
        if (_driverToken.value == token) {
            _driverOrders.value = _driverOrders.value.map { if (it.id == orderId) completed else it }
        }
        return completed
    }

    fun driverLogout() {
        _driverToken.value = null
        _driver.value = null
        _driverOrders.value = emptyList()
        _driverStats.value = StatsData()
    }
}