export interface PublishedCatalog {
    revision_id: string;
    product_key: string;
    display_name: string;
  provider_price_ref: string;
  currency: string;
  unit_amount: number;
    interval_name: string;
    benefits: Array<{kind:"feature"|"perk";key:string}|{kind:"limit";key:string;quantity:number;unit:string}>;
  regions: string[];
  tax_classification: string;
  merchant_of_record: string;
  terms_url: string;
  privacy_url: string;
  support_url: string;
}

export interface CatalogStatus {
  revision: PublishedCatalog;
  state: "Pending" | "Active" | "Retired";
  last_error: string | null;
}

const controlUrl = process.env.TOBOT_CONTROL_URL ?? "http://control-plane:8080";

export function validMutation(request: Request): boolean {
  return request.headers.get("origin") === "https://admin.tobot.test"
    && request.headers.get("content-type")?.startsWith("application/json") === true;
}

export async function controlCatalog(path: string, method: "GET" | "POST", payload?: object): Promise<Response> {
  const token = process.env.TOBOT_CATALOG_ADMIN_TOKEN;
  if (!token || token.length < 32) return new Response(null, { status: 503 });
  try {
    return await fetch(`${controlUrl}${path}`, {
      method,
      headers: { "x-catalog-admin-token": token, ...(payload ? { "content-type": "application/json" } : {}) },
      body: payload ? JSON.stringify(payload) : undefined,
      signal: AbortSignal.timeout(8_000),
    });
  } catch {
    return new Response(null, { status: 503 });
  }
}

export function validHttpsUrl(value: unknown): value is string {
  if (typeof value !== "string" || value.length > 500) return false;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && Boolean(url.hostname) && !url.username && !url.password && !url.hash;
  } catch {
    return false;
  }
}
