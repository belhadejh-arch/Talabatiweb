package com.example.talabat.data

import com.example.talabat.BuildConfig
import android.net.Uri
import java.net.HttpURLConnection
import java.net.URL
import java.net.URLEncoder
import java.nio.charset.StandardCharsets
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json

object BackendApi {
    private val json = Json {
        ignoreUnknownKeys = true
        explicitNulls = false
        encodeDefaults = true
        coerceInputValues = true
    }

    suspend fun catalog(): CatalogResponse = get("/api/catalog")

    suspend fun placeOrder(request: CreateOrderRequest, idempotencyKey: String): OrderResponse =
        post("/api/orders", request, headers = mapOf("Idempotency-Key" to idempotencyKey))

    suspend fun adminLogin(username: String, password: String): AuthResponse =
        post("/api/admin/login", AdminLoginRequest(username, password))

    suspend fun adminOverview(token: String): AdminOverviewResponse =
        get("/api/admin/overview", token = token)

    suspend fun adminStats(token: String, filters: StatsFilters): StatsResponse =
        get("/api/admin/stats${query(filters, includePeriod = true)}", token)

    suspend fun createDriver(token: String, driver: DriverInput): DriverCreationResponse =
        post("/api/admin/drivers", driver, token)

    suspend fun updateDriver(token: String, id: Int, driver: DriverInput): DriverResponse =
        request("/api/admin/drivers/$id", "PATCH", token, json.encodeToString(driver))

    suspend fun createRestaurant(token: String, restaurant: RestaurantInput): Restaurant =
        post<RestaurantResponse, RestaurantInput>("/api/admin/restaurants", restaurant, token).restaurant

    suspend fun driverLogin(serialNumber: String): AuthResponse =
        post("/api/driver/login", DriverLoginRequest(serialNumber))

    suspend fun driverOrders(token: String, filters: StatsFilters): OrdersResponse =
        get("/api/driver/orders${query(filters, includeDriver = false)}", token)

    suspend fun driverStats(token: String, filters: StatsFilters): StatsResponse =
        get("/api/driver/stats${query(filters, includeDriver = false, includePeriod = true)}", token)

    suspend fun completeOrder(token: String, orderId: Int): OrderResponse =
        request("/api/driver/orders/$orderId/complete", "POST", token, null)

    private suspend inline fun <reified T> get(path: String, token: String? = null): T =
        request(path, "GET", token, null)

    private suspend inline fun <reified T, reified B> post(
        path: String,
        body: B,
        token: String? = null,
        headers: Map<String, String> = emptyMap()
    ): T = request(path, "POST", token, json.encodeToString(body), headers)

    private suspend inline fun <reified T> request(
        path: String,
        method: String,
        token: String?,
        body: String?,
        headers: Map<String, String> = emptyMap()
    ): T = withContext(Dispatchers.IO) {
        val baseUrl = BuildConfig.API_BASE_URL.trimEnd('/')
        val parsedUrl = Uri.parse(baseUrl)
        val localHttpHost = BuildConfig.DEBUG && parsedUrl.host == "10.0.2.2"
        require(parsedUrl.scheme == "https" || (parsedUrl.scheme == "http" && localHttpHost)) {
            "يجب استخدام HTTPS للاتصال بالخادم."
        }

        val connection = (URL(baseUrl + path).openConnection() as HttpURLConnection).apply {
            requestMethod = method
            connectTimeout = 12_000
            readTimeout = 20_000
            setRequestProperty("Accept", "application/json")
            body?.let {
                doOutput = true
                setRequestProperty("Content-Type", "application/json; charset=utf-8")
            }
            token?.takeIf(String::isNotBlank)?.let {
                setRequestProperty("Authorization", "Bearer $it")
            }
            headers.forEach { (name, value) -> setRequestProperty(name, value) }
        }

        try {
            body?.let { payload ->
                connection.outputStream.use { output ->
                    output.write(payload.toByteArray(StandardCharsets.UTF_8))
                }
            }
            val status = connection.responseCode
            val stream = if (status in 200..299) connection.inputStream else connection.errorStream
            val response = stream?.bufferedReader(StandardCharsets.UTF_8)?.use { it.readText() }.orEmpty()
            if (status !in 200..299) {
                val message = runCatching { json.decodeFromString<ErrorResponse>(response) }.getOrNull()
                val detail = message?.message ?: message?.error ?: message?.detail
                throw BackendException(
                    detail?.takeIf(String::isNotBlank) ?: "تعذر إكمال الطلب للخادم (HTTP $status).",
                    status
                )
            }
            if (T::class == Unit::class || response.isBlank()) {
                Unit as T
            } else {
                json.decodeFromString<T>(response)
            }
        } finally {
            connection.disconnect()
        }
    }

    private fun query(
        filters: StatsFilters,
        includeDriver: Boolean = true,
        includePeriod: Boolean = false
    ): String {
        val values = buildList {
            filters.from?.takeIf(String::isNotBlank)?.let { add("from" to it) }
            filters.to?.takeIf(String::isNotBlank)?.let { add("to" to it) }
            if (includePeriod) filters.period?.takeIf(String::isNotBlank)?.let { add("period" to it) }
            filters.status?.takeIf(String::isNotBlank)?.let { add("status" to it) }
            filters.restaurantId?.let { add("restaurantId" to it.toString()) }
            if (includeDriver) filters.driverId?.let { add("driverId" to it.toString()) }
        }
        if (values.isEmpty()) return ""
        return values.joinToString("&", prefix = "?") { (key, value) ->
            "${encode(key)}=${encode(value)}"
        }
    }

    private fun encode(value: String): String =
        URLEncoder.encode(value, StandardCharsets.UTF_8.name())
}

class BackendException(message: String, val statusCode: Int? = null) : Exception(message)