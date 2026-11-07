//! Operaciones del catálogo de Stripe test; solo se exponen al operador por Control Plane.

use axum::{
    Json,
    extract::{Path, State},
    http::{HeaderMap, StatusCode},
    response::{IntoResponse, Response},
};
use serde::Deserialize;
use serde_json::{Value, json};
use tracing::warn;
use uuid::Uuid;

use super::{App, authorized, required_str, stripe_get, stripe_post};

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub(super) struct PlanInput {
    request_id: Uuid,
    name: String,
    tax_code: String,
    currency: String,
    unit_amount: i64,
    interval_name: String,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub(super) struct PriceInput {
    request_id: Uuid,
    currency: String,
    unit_amount: i64,
    interval_name: String,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub(super) struct ArchiveInput {
    request_id: Uuid,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub(super) struct UpdateProductInput {
    request_id: Uuid,
    name: String,
    tax_code: String,
}

fn valid_price(currency: &str, amount: i64, interval: &str) -> bool {
    matches!(currency, "usd" | "mxn")
        && amount > 0
        && amount < 9_000_000_000_000
        && matches!(interval, "month" | "year")
}

fn valid_id(value: &str, prefix: &str) -> bool {
    value.starts_with(prefix)
        && value.len() <= 255
        && value
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || byte == b'_')
}

fn managed_product(product: &Value) -> bool {
    product["livemode"] == false && product["metadata"]["tobot_catalog"] == "true"
}

fn safe_price(price: &Value) -> Value {
    json!({
        "id":price["id"], "product_id":price["product"], "active":price["active"],
        "currency":price["currency"], "unit_amount":price["unit_amount"],
        "interval_name":price["recurring"]["interval"],
        "interval_count":price["recurring"]["interval_count"],
        "usage_type":price["recurring"]["usage_type"],
    })
}

async fn product_has_revision(app: &App, product_id: &str) -> Result<bool, ()> {
    let (prices, has_more) = stripe_pages(app, &format!("prices?product={product_id}")).await?;
    if has_more {
        return Err(());
    }
    for price in prices {
        let id = price["id"].as_str().ok_or(())?;
        let used: bool = sqlx::query_scalar(
            "SELECT EXISTS(SELECT 1 FROM billing.catalog_revision WHERE provider_price_ref=$1)",
        )
        .bind(id)
        .fetch_one(&app.pool)
        .await
        .map_err(|_| ())?;
        if used {
            return Ok(true);
        }
    }
    Ok(false)
}

async fn stripe_pages(app: &App, resource: &str) -> Result<(Vec<Value>, bool), ()> {
    let mut all = Vec::new();
    let mut cursor = None::<String>;
    for _ in 0..20 {
        let separator = if resource.contains('?') { '&' } else { '?' };
        let path = cursor.as_ref().map_or_else(
            || format!("{resource}{separator}limit=100"),
            |id| format!("{resource}{separator}limit=100&starting_after={id}"),
        );
        let page = stripe_get(app, &path).await.map_err(|_| ())?;
        let items = page["data"].as_array().ok_or(())?;
        cursor = items
            .last()
            .and_then(|item| item["id"].as_str())
            .map(str::to_owned);
        all.extend(items.iter().cloned());
        if page["has_more"] != true {
            return Ok((all, false));
        }
        if cursor.is_none() {
            return Err(());
        }
    }
    Ok((all, true))
}

pub(super) async fn list(State(app): State<App>, headers: HeaderMap) -> Response {
    if !authorized(&headers, "x-billing-command-token", &app.command_token) {
        return StatusCode::UNAUTHORIZED.into_response();
    }
    let (products, prices) =
        tokio::join!(stripe_pages(&app, "products"), stripe_pages(&app, "prices"),);
    let (Ok(products), Ok(prices)) = (products, prices) else {
        return StatusCode::BAD_GATEWAY.into_response();
    };
    let managed: Vec<Value> = products
        .0
        .iter()
        .filter(|product| managed_product(product))
        .map(|product| {
            json!({
                "id":product["id"], "name":product["name"], "active":product["active"],
                "tax_code":product["tax_code"],
            })
        })
        .collect();
    let ids: std::collections::HashSet<&str> = managed
        .iter()
        .filter_map(|product| product["id"].as_str())
        .collect();
    let has_more = products.1 || prices.1;
    let prices: Vec<Value> = prices
        .0
        .iter()
        .filter(|price| price["product"].as_str().is_some_and(|id| ids.contains(id)))
        .map(safe_price)
        .collect();
    Json(json!({"products":managed,"prices":prices,"has_more":has_more})).into_response()
}

pub(super) async fn price(
    State(app): State<App>,
    Path(price_id): Path<String>,
    headers: HeaderMap,
) -> Response {
    if !authorized(&headers, "x-billing-command-token", &app.command_token) {
        return StatusCode::UNAUTHORIZED.into_response();
    }
    if !valid_id(&price_id, "price_") {
        return StatusCode::BAD_REQUEST.into_response();
    }
    let Ok(price) = stripe_get(&app, &format!("prices/{price_id}")).await else {
        return StatusCode::NOT_FOUND.into_response();
    };
    let Some(product_id) = price["product"].as_str() else {
        return StatusCode::BAD_GATEWAY.into_response();
    };
    let Ok(product) = stripe_get(&app, &format!("products/{product_id}")).await else {
        return StatusCode::BAD_GATEWAY.into_response();
    };
    if !managed_product(&product) || price["livemode"] != false {
        return StatusCode::NOT_FOUND.into_response();
    }
    Json(json!({"price":safe_price(&price),"product":{"id":product["id"],"name":product["name"],"active":product["active"],"tax_code":product["tax_code"]}})).into_response()
}

pub(super) async fn create(
    State(app): State<App>,
    headers: HeaderMap,
    Json(input): Json<PlanInput>,
) -> Response {
    if !authorized(&headers, "x-billing-command-token", &app.command_token) {
        return StatusCode::UNAUTHORIZED.into_response();
    }
    if input.name.trim().is_empty()
        || input.name.len() > 120
        || !input.tax_code.starts_with("txcd_")
        || input.tax_code.len() > 120
        || !input
            .tax_code
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || byte == b'_')
        || !valid_price(&input.currency, input.unit_amount, &input.interval_name)
    {
        return StatusCode::BAD_REQUEST.into_response();
    }
    let product = stripe_post(
        &app,
        "products",
        &format!("tobot-catalog-product-{}", input.request_id),
        &[
            ("name", input.name.trim().to_owned()),
            ("tax_code", input.tax_code),
            ("metadata[tobot_catalog]", "true".to_owned()),
            ("metadata[tobot_request_id]", input.request_id.to_string()),
        ],
    )
    .await;
    let Ok(product) = product else {
        warn!("Stripe test Product creation failed");
        return StatusCode::BAD_GATEWAY.into_response();
    };
    let Ok(product_id) = required_str(&product, "id") else {
        return StatusCode::BAD_GATEWAY.into_response();
    };
    if !managed_product(&product) || product["active"] != true {
        return StatusCode::BAD_GATEWAY.into_response();
    }
    create_price_for(
        &app,
        product_id,
        input.request_id,
        &input.currency,
        input.unit_amount,
        &input.interval_name,
    )
    .await
}

async fn create_price_for(
    app: &App,
    product_id: &str,
    request_id: Uuid,
    currency: &str,
    amount: i64,
    interval: &str,
) -> Response {
    let price = stripe_post(
        app,
        "prices",
        &format!("tobot-catalog-price-{request_id}"),
        &[
            ("product", product_id.to_owned()),
            ("currency", currency.to_owned()),
            ("unit_amount", amount.to_string()),
            ("recurring[interval]", interval.to_owned()),
            ("recurring[interval_count]", "1".to_owned()),
            ("metadata[tobot_catalog]", "true".to_owned()),
        ],
    )
    .await;
    let Ok(price) = price else {
        warn!(%product_id, "Stripe test Price creation failed");
        return StatusCode::BAD_GATEWAY.into_response();
    };
    if price["livemode"] != false || price["active"] != true || price["product"] != product_id {
        return StatusCode::BAD_GATEWAY.into_response();
    }
    (
        StatusCode::CREATED,
        Json(json!({"product_id":product_id,"price":safe_price(&price)})),
    )
        .into_response()
}

pub(super) async fn create_price(
    State(app): State<App>,
    Path(product_id): Path<String>,
    headers: HeaderMap,
    Json(input): Json<PriceInput>,
) -> Response {
    if !authorized(&headers, "x-billing-command-token", &app.command_token) {
        return StatusCode::UNAUTHORIZED.into_response();
    }
    if !valid_id(&product_id, "prod_")
        || !valid_price(&input.currency, input.unit_amount, &input.interval_name)
    {
        return StatusCode::BAD_REQUEST.into_response();
    }
    let Ok(product) = stripe_get(&app, &format!("products/{product_id}")).await else {
        return StatusCode::NOT_FOUND.into_response();
    };
    if !managed_product(&product) || product["active"] != true {
        return StatusCode::CONFLICT.into_response();
    }
    create_price_for(
        &app,
        &product_id,
        input.request_id,
        &input.currency,
        input.unit_amount,
        &input.interval_name,
    )
    .await
}

pub(super) async fn update_product(
    State(app): State<App>,
    Path(product_id): Path<String>,
    headers: HeaderMap,
    Json(input): Json<UpdateProductInput>,
) -> Response {
    if !authorized(&headers, "x-billing-command-token", &app.command_token) {
        return StatusCode::UNAUTHORIZED.into_response();
    }
    if !valid_id(&product_id, "prod_")
        || input.name.trim().is_empty()
        || input.name.len() > 120
        || !input.tax_code.starts_with("txcd_")
        || input.tax_code.len() > 120
        || !input
            .tax_code
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || byte == b'_')
    {
        return StatusCode::BAD_REQUEST.into_response();
    }
    let Ok(product) = stripe_get(&app, &format!("products/{product_id}")).await else {
        return StatusCode::NOT_FOUND.into_response();
    };
    if !managed_product(&product) || product["active"] != true {
        return StatusCode::CONFLICT.into_response();
    }
    match product_has_revision(&app, &product_id).await {
        Ok(true) => return StatusCode::CONFLICT.into_response(),
        Err(()) => return StatusCode::BAD_GATEWAY.into_response(),
        Ok(false) => {}
    }
    match stripe_post(
        &app,
        &format!("products/{product_id}"),
        &format!("tobot-update-product-{}", input.request_id),
        &[
            ("name", input.name.trim().to_owned()),
            ("tax_code", input.tax_code),
        ],
    )
    .await
    {
        Ok(result) if managed_product(&result) => {
            Json(json!({"id":result["id"],"name":result["name"],"tax_code":result["tax_code"]}))
                .into_response()
        }
        _ => StatusCode::BAD_GATEWAY.into_response(),
    }
}

pub(super) async fn archive_price(
    State(app): State<App>,
    Path(price_id): Path<String>,
    headers: HeaderMap,
    Json(input): Json<ArchiveInput>,
) -> Response {
    if !authorized(&headers, "x-billing-command-token", &app.command_token) {
        return StatusCode::UNAUTHORIZED.into_response();
    }
    let detail = price(State(app.clone()), Path(price_id.clone()), headers.clone()).await;
    if detail.status() != StatusCode::OK {
        return detail;
    }
    let used: Result<bool, _> = sqlx::query_scalar(
        "SELECT EXISTS(SELECT 1 FROM billing.catalog_revision WHERE provider_price_ref=$1)",
    )
    .bind(&price_id)
    .fetch_one(&app.pool)
    .await;
    if used.unwrap_or(true) {
        return StatusCode::CONFLICT.into_response();
    }
    match stripe_post(
        &app,
        &format!("prices/{price_id}"),
        &format!("tobot-archive-price-{}", input.request_id),
        &[("active", "false".to_owned())],
    )
    .await
    {
        Ok(result) if result["active"] == false => StatusCode::NO_CONTENT.into_response(),
        _ => StatusCode::BAD_GATEWAY.into_response(),
    }
}

pub(super) async fn archive_product(
    State(app): State<App>,
    Path(product_id): Path<String>,
    headers: HeaderMap,
    Json(input): Json<ArchiveInput>,
) -> Response {
    if !authorized(&headers, "x-billing-command-token", &app.command_token) {
        return StatusCode::UNAUTHORIZED.into_response();
    }
    if !valid_id(&product_id, "prod_") {
        return StatusCode::BAD_REQUEST.into_response();
    }
    let Ok(product) = stripe_get(&app, &format!("products/{product_id}")).await else {
        return StatusCode::NOT_FOUND.into_response();
    };
    if !managed_product(&product) {
        return StatusCode::NOT_FOUND.into_response();
    }
    let prices = stripe_get(&app, &format!("prices?product={product_id}&limit=100")).await;
    let Ok(prices) = prices else {
        return StatusCode::BAD_GATEWAY.into_response();
    };
    if prices["has_more"] == true {
        return StatusCode::CONFLICT.into_response();
    }
    for item in prices["data"].as_array().into_iter().flatten() {
        let Some(id) = item["id"].as_str() else {
            return StatusCode::BAD_GATEWAY.into_response();
        };
        let used: Result<bool, _> = sqlx::query_scalar(
            "SELECT EXISTS(SELECT 1 FROM billing.catalog_revision WHERE provider_price_ref=$1)",
        )
        .bind(id)
        .fetch_one(&app.pool)
        .await;
        if used.unwrap_or(true) {
            return StatusCode::CONFLICT.into_response();
        }
    }
    match stripe_post(
        &app,
        &format!("products/{product_id}"),
        &format!("tobot-archive-product-{}", input.request_id),
        &[("active", "false".to_owned())],
    )
    .await
    {
        Ok(result) if result["active"] == false => StatusCode::NO_CONTENT.into_response(),
        _ => StatusCode::BAD_GATEWAY.into_response(),
    }
}
