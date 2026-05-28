const axios = require("axios");

/* ── Config ──────────────────────────────────────────────────────────────── */
const BASE_URL      = process.env.SHIPROCKET_BASE_URL     || "https://apiv2.shiprocket.in/v1/external";
const SR_EMAIL      = process.env.SHIPROCKET_EMAIL;
const SR_PASSWORD   = process.env.SHIPROCKET_PASSWORD;
const PICKUP_LOC    = process.env.SHIPROCKET_PICKUP_LOCATION || "warehouse";

/* ── In-memory token cache ───────────────────────────────────────────────── */
let _token   = null;
let _expires = 0; // epoch ms

/* ── Private helpers ─────────────────────────────────────────────────────── */
const _login = async () => {
  const res = await axios.post(`${BASE_URL}/auth/login`, {
    email: SR_EMAIL,
    password: SR_PASSWORD,
  });
  _token   = res.data.token;
  _expires = Date.now() + 23 * 60 * 60 * 1000; // 23 h (Shiprocket token is 24h)
  console.log("[Shiprocket] Token refreshed");
  return _token;
};

const _getToken = async () => {
  if (_token && Date.now() < _expires) return _token;
  return _login();
};

/**
 * Make an authenticated request to Shiprocket.
 * Automatically re-authenticates on 401 and retries once.
 */
const _req = async (method, endpoint, body = null, isRetry = false) => {
  const token = await _getToken();
  try {
    const cfg = {
      method,
      url: `${BASE_URL}${endpoint}`,
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    };
    if (body) cfg.data = body;
    const res = await axios(cfg);
    return res.data;
  } catch (err) {
    if (err.response?.status === 401 && !isRetry) {
      console.warn("[Shiprocket] 401 — regenerating token...");
      _token = null;
      _expires = 0;
      return _req(method, endpoint, body, true);
    }
    const msg = err.response?.data?.message || err.response?.data?.errors || err.message;
    throw new Error(`Shiprocket API error [${method} ${endpoint}]: ${JSON.stringify(msg)}`);
  }
};

/* ── Phone sanitiser ─────────────────────────────────────────────────────── */
const sanitisePhone = (raw) => {
  if (!raw) return null;
  const digits = raw.replace(/\D/g, "").slice(-10);
  return digits.length === 10 ? digits : null;
};

/* ── Public service methods ──────────────────────────────────────────────── */

/**
 * Authenticate and return the cached token (useful for health checks).
 */
const authenticate = async () => _login();

/**
 * Create an adhoc Shiprocket order from an internal Order document.
 * Returns the raw Shiprocket response.
 */
const createShiprocketOrder = async (order) => {
  const patient = order.patientDetails || {};
  const addr    = order.addressDetails  || {};

  const phone = sanitisePhone(patient.phone);
  if (!phone) throw new Error(`Invalid phone number for order ${order.orderId}: "${patient.phone}"`);

  const nameParts  = (patient.name || "Customer").trim().split(/\s+/);
  const firstName  = nameParts[0];
  const lastName   = nameParts.slice(1).join(" ") || ".";

  const items = (order.items || []).map((it, idx) => ({
    name:          it.description || it.name || `Medicine-${idx + 1}`,
    sku:           it.medicineId  ? it.medicineId.toString() : `SKU-${idx + 1}`,
    units:         it.qty         || 1,
    selling_price: String((it.netValue || it.price || 0).toFixed(2)),
    discount:      String(it.discPercent || 0),
    tax:           String(it.gstPercent  || 5),
    hsn:           it.hsnCode || "",
  }));

  const pincode = (addr.pincode || "570001").replace(/\D/g, "");

  const body = {
    order_id:                order.orderId || order._id.toString(),
    order_date:              new Date().toISOString().slice(0, 19).replace("T", " "),
    pickup_location:         PICKUP_LOC,
    billing_customer_name:   firstName,
    billing_last_name:       lastName,
    billing_address:         addr.fullAddress || addr.city || "Mysore, Karnataka",
    billing_address_2:       addr.landmark   || "",
    billing_city:            addr.city        || "Mysore",
    billing_pincode:         pincode,
    billing_state:           addr.state       || "Karnataka",
    billing_country:         "India",
    billing_email:           patient.email   || "customer@rgmedlink.com",
    billing_phone:           phone,
    shipping_is_billing:     true,
    order_items:             items,
    payment_method:          order.paymentStatus === "Paid" ? "Prepaid" : "COD",
    sub_total:               String((order.totalAmount || 0).toFixed(2)),
    length:                  15,
    breadth:                 10,
    height:                  10,
    weight:                  0.5,
  };

  console.log(`[Shiprocket] Creating order ${body.order_id}`);
  return _req("POST", "/orders/create/adhoc", body);
};

/**
 * Assign AWB to a shipment.
 */
const assignAWB = async (shipmentId) => {
  console.log(`[Shiprocket] Assigning AWB — shipment ${shipmentId}`);
  return _req("POST", "/courier/assign/awb", { shipment_id: shipmentId });
};

/**
 * Schedule pickup for a shipment.
 */
const generatePickup = async (shipmentId) => {
  console.log(`[Shiprocket] Generating pickup — shipment ${shipmentId}`);
  return _req("POST", "/courier/generate/pickup", { shipment_id: [shipmentId] });
};

/**
 * Track a shipment by AWB code.
 */
const trackByAWB = async (awbCode) => {
  console.log(`[Shiprocket] Tracking AWB ${awbCode}`);
  return _req("GET", `/courier/track/awb/${awbCode}`);
};

/**
 * Cancel shipments by AWB codes.
 */
const cancelShipment = async (awbCodes) => {
  const awbs = Array.isArray(awbCodes) ? awbCodes : [awbCodes];
  console.log(`[Shiprocket] Cancelling AWBs: ${awbs.join(", ")}`);
  return _req("POST", "/orders/cancel/shipment/awbs", { awbs });
};

/**
 * Get label URL for a shipment.
 */
const getLabel = async (shipmentIds) => {
  const ids = Array.isArray(shipmentIds) ? shipmentIds : [shipmentIds];
  return _req("POST", "/courier/generate/label", { shipment_id: ids });
};

module.exports = {
  authenticate,
  createShiprocketOrder,
  assignAWB,
  generatePickup,
  trackByAWB,
  cancelShipment,
  getLabel,
};
