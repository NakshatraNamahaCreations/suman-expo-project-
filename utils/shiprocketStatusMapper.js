/* ── Shiprocket Status Mapper ──────────────────────────────────────────── */

const SHIPROCKET_TO_APP = {
  "NEW":                   "Order Confirmed",
  "READY TO SHIP":         "Shipment Created",
  "MANIFEST GENERATED":    "Shipment Created",
  "SHIPMENT CREATED":      "Shipment Created",
  "AWB ASSIGNED":          "AWB Assigned",
  "PICKUP PENDING":        "Pickup Scheduled",
  "PICKUP QUEUED":         "Pickup Scheduled",
  "PICKUP SCHEDULED":      "Pickup Scheduled",
  "PICKUP ERROR":          "Pickup Scheduled",
  "PICKUP EXCEPTION":      "Pickup Scheduled",
  "PICKED UP":             "Picked Up",
  "IN TRANSIT":            "In Transit",
  "TRANSIT":               "In Transit",
  "REACHED AT DESTINATION":"In Transit",
  "MISROUTED":             "In Transit",
  "OUT FOR DELIVERY":      "Out For Delivery",
  "DELIVERY ATTEMPTED":    "Out For Delivery",
  "DELIVERED":             "Delivered",
  "CANCELLED":             "Cancelled",
  "CANCELLATION REQUESTED":"Cancelled",
  "RTO INITIATED":         "RTO Initiated",
  "RTO IN TRANSIT":        "RTO In Transit",
  "RTO DELIVERED":         "RTO Delivered",
  "RTO OUT FOR DELIVERY":  "RTO In Transit",
  "LOST":                  "Failed",
  "DAMAGED":               "Failed",
  "SHIPMENT HELD":         "In Transit",
};

const STATUS_FLOW = [
  "Order Confirmed",
  "Shipment Created",
  "AWB Assigned",
  "Pickup Scheduled",
  "Picked Up",
  "In Transit",
  "Out For Delivery",
  "Delivered",
];

const RTO_FLOW = ["RTO Initiated", "RTO In Transit", "RTO Delivered"];

/**
 * Map a Shiprocket status string to an app-friendly status.
 * Falls back to the original string if not found in the map.
 */
const mapStatus = (shiprocketStatus) => {
  if (!shiprocketStatus) return "Shipment Created";
  const key = shiprocketStatus.toUpperCase().trim();
  return SHIPROCKET_TO_APP[key] || shiprocketStatus;
};

/**
 * Get 0-based index of a status in the delivery flow.
 * Returns -1 if not in the main flow.
 */
const getStepIndex = (status) => STATUS_FLOW.indexOf(status);

/**
 * Check if a status represents a completed delivery.
 */
const isDelivered = (status) => status === "Delivered";

/**
 * Check if a status represents an RTO scenario.
 */
const isRTO = (status) => RTO_FLOW.includes(status);

module.exports = { mapStatus, getStepIndex, STATUS_FLOW, RTO_FLOW, isDelivered, isRTO };
