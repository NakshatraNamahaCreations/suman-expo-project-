const Order   = require("../models/Order");
const SR      = require("../services/shiprocket.service");
const { mapStatus } = require("../utils/shiprocketStatusMapper");

/* ── Shared: find order by orderId or _id ─────────────────────────────── */
const findOrder = async (param) => {
  return Order.findOne({
    $or: [{ orderId: param }, { _id: param.match(/^[a-f\d]{24}$/i) ? param : undefined }].filter(Boolean),
  });
};

/* ── Step helpers (reusable for retry) ───────────────────────────────── */

const _doCreateShipment = async (order) => {
  const result = await SR.createShiprocketOrder(order);
  // Shiprocket returns order_id and shipment_id
  const srOrderId    = result.order_id;
  const srShipmentId = result.shipment_id;

  if (!srOrderId || !srShipmentId) {
    throw new Error("Shiprocket did not return order_id/shipment_id: " + JSON.stringify(result));
  }

  order.shipping = {
    ...(order.shipping?.toObject?.() || order.shipping || {}),
    provider:             "Shiprocket",
    shiprocketOrderId:    String(srOrderId),
    shiprocketShipmentId: String(srShipmentId),
    pickupLocation:       process.env.SHIPROCKET_PICKUP_LOCATION || "warehouse",
    currentStatus:        "Shipment Created",
    shiprocketError:      null,
  };
  await order.save();
  console.log(`[Shiprocket] Shipment created for order ${order.orderId} — SR order ${srOrderId}`);
  return order;
};

const _doAssignAWB = async (order) => {
  const shipmentId = order.shipping?.shiprocketShipmentId;
  if (!shipmentId) throw new Error("No shiprocketShipmentId to assign AWB");

  const result = await SR.assignAWB(shipmentId);

  const awb         = result.response?.data?.awb_code    || result.awb_code    || result.awb;
  const courierId   = result.response?.data?.courier_company_id || result.courier_company_id;
  const courierName = result.response?.data?.courier_name || result.courier_name || "";

  if (!awb) throw new Error("AWB not returned by Shiprocket: " + JSON.stringify(result));

  order.shipping = {
    ...(order.shipping?.toObject?.() || order.shipping || {}),
    awbCode:           awb,
    courierCompanyId:  String(courierId || ""),
    courierName,
    currentStatus:     "AWB Assigned",
  };
  await order.save();
  console.log(`[Shiprocket] AWB ${awb} assigned for order ${order.orderId}`);
  return order;
};

const _doGeneratePickup = async (order) => {
  const shipmentId = order.shipping?.shiprocketShipmentId;
  if (!shipmentId) throw new Error("No shiprocketShipmentId for pickup");

  const result = await SR.generatePickup(shipmentId);

  order.shipping = {
    ...(order.shipping?.toObject?.() || order.shipping || {}),
    pickupStatus:  "Pickup Scheduled",
    currentStatus: "Pickup Scheduled",
  };
  await order.save();
  console.log(`[Shiprocket] Pickup scheduled for order ${order.orderId}`, result);
  return order;
};

/* ═══════════════════════════════════════════════════════════════════════════
   CONTROLLER EXPORTS
═══════════════════════════════════════════════════════════════════════════ */

/* POST /api/shiprocket/create-shipment/:orderId */
exports.createShipment = async (req, res) => {
  try {
    const order = await findOrder(req.params.orderId);
    if (!order) return res.status(404).json({ message: "Order not found" });

    if (order.shipping?.shiprocketOrderId) {
      return res.status(400).json({
        message: "Shiprocket shipment already exists",
        shipping: order.shipping,
      });
    }

    await _doCreateShipment(order);

    // Auto-chain AWB
    try { await _doAssignAWB(order); } catch (e) {
      console.warn("[Shiprocket] Auto-AWB failed (non-fatal):", e.message);
    }

    // Auto-chain pickup
    try { await _doGeneratePickup(order); } catch (e) {
      console.warn("[Shiprocket] Auto-pickup failed (non-fatal):", e.message);
    }

    return res.json({ success: true, message: "Shipment created", shipping: order.shipping });
  } catch (err) {
    console.error("[Shiprocket] createShipment error:", err.message);
    return res.status(500).json({ success: false, message: err.message });
  }
};

/* POST /api/shiprocket/generate-awb/:orderId */
exports.generateAWB = async (req, res) => {
  try {
    const order = await findOrder(req.params.orderId);
    if (!order) return res.status(404).json({ message: "Order not found" });

    if (order.shipping?.awbCode) {
      return res.status(400).json({ message: "AWB already assigned", shipping: order.shipping });
    }

    await _doAssignAWB(order);
    return res.json({ success: true, message: "AWB assigned", shipping: order.shipping });
  } catch (err) {
    console.error("[Shiprocket] generateAWB error:", err.message);
    return res.status(500).json({ success: false, message: err.message });
  }
};

/* POST /api/shiprocket/generate-pickup/:orderId */
exports.generatePickup = async (req, res) => {
  try {
    const order = await findOrder(req.params.orderId);
    if (!order) return res.status(404).json({ message: "Order not found" });

    await _doGeneratePickup(order);
    return res.json({ success: true, message: "Pickup scheduled", shipping: order.shipping });
  } catch (err) {
    console.error("[Shiprocket] generatePickup error:", err.message);
    return res.status(500).json({ success: false, message: err.message });
  }
};

/* GET /api/orders/:orderId/tracking  (mounted in orderRoutes) */
exports.getTracking = async (req, res) => {
  try {
    const order = await findOrder(req.params.orderId);
    if (!order) return res.status(404).json({ message: "Order not found" });

    const awb = order.shipping?.awbCode;
    if (!awb) {
      return res.json({
        orderId:      order.orderId,
        currentStatus: order.shipping?.currentStatus || "Shipment Pending",
        awbCode:      null,
        message:      "AWB not yet assigned",
        shipping:     order.shipping || {},
      });
    }

    // Fetch live tracking from Shiprocket
    let trackData = null;
    try {
      trackData = await SR.trackByAWB(awb);
    } catch (e) {
      console.warn("[Shiprocket] Live tracking fetch failed:", e.message);
    }

    // Parse tracking events
    if (trackData) {
      const activities = trackData?.tracking_data?.shipment_track_activities || [];
      const newEvents = activities
        .map((a) => ({
          status:          mapStatus(a["sr-status-label"] || a.activity),
          shiprocketStatus:a["sr-status-label"] || a.activity || "",
          message:         a.activity || "",
          location:        a.location || "",
          date:            a.date ? new Date(a.date) : new Date(),
          rawData:         a,
        }))
        .filter((e) => e.date);

      // Deduplicate: keep only new events not already in DB
      const existingDates = new Set(
        (order.shipping?.trackingHistory || []).map((e) => e.date?.toISOString())
      );
      const uniqueNew = newEvents.filter((e) => !existingDates.has(e.date.toISOString()));

      if (uniqueNew.length > 0) {
        order.shipping.trackingHistory = [
          ...(order.shipping.trackingHistory || []),
          ...uniqueNew,
        ];
      }

      // Update current status from latest activity
      if (activities.length > 0) {
        const latest = activities[0];
        const newStatus = mapStatus(latest["sr-status-label"] || latest.activity || "");
        if (newStatus) order.shipping.currentStatus = newStatus;
      }

      // Update estimated delivery
      const edd = trackData?.tracking_data?.shipment_track?.[0]?.edd;
      if (edd) order.shipping.estimatedDeliveryDate = new Date(edd);

      order.shipping.lastTrackingUpdate = new Date();
      await order.save();
    }

    return res.json({
      orderId:              order.orderId,
      awbCode:              awb,
      courierName:          order.shipping.courierName,
      currentStatus:        order.shipping.currentStatus,
      estimatedDeliveryDate:order.shipping.estimatedDeliveryDate,
      trackingUrl:          order.shipping.trackingUrl,
      trackingHistory:      order.shipping.trackingHistory || [],
      shiprocketOrderId:    order.shipping.shiprocketOrderId,
      shiprocketShipmentId: order.shipping.shiprocketShipmentId,
      pickupLocation:       order.shipping.pickupLocation,
      pickupStatus:         order.shipping.pickupStatus,
      labelUrl:             order.shipping.labelUrl,
    });
  } catch (err) {
    console.error("[Shiprocket] getTracking error:", err.message);
    return res.status(500).json({ success: false, message: err.message });
  }
};

/* POST /api/shiprocket/refresh-tracking/:orderId */
exports.refreshTracking = async (req, res) => {
  return exports.getTracking(req, res);
};

/* POST /api/shiprocket/cancel-shipment/:orderId */
exports.cancelShipment = async (req, res) => {
  try {
    const order = await findOrder(req.params.orderId);
    if (!order) return res.status(404).json({ message: "Order not found" });

    const awb = order.shipping?.awbCode;
    if (!awb) return res.status(400).json({ message: "No AWB to cancel" });

    await SR.cancelShipment([awb]);

    order.shipping.currentStatus = "Cancelled";
    await order.save();

    return res.json({ success: true, message: "Shipment cancelled", shipping: order.shipping });
  } catch (err) {
    console.error("[Shiprocket] cancelShipment error:", err.message);
    return res.status(500).json({ success: false, message: err.message });
  }
};

/* POST /api/shiprocket/webhook */
exports.webhook = async (req, res) => {
  try {
    const payload = req.body;
    console.log("[Shiprocket Webhook] Received:", JSON.stringify(payload).slice(0, 300));

    const awb = payload.awb || payload.awb_code;
    if (!awb) return res.status(200).json({ received: true, note: "No AWB in payload" });

    const order = await Order.findOne({ "shipping.awbCode": awb });
    if (!order) {
      console.warn(`[Shiprocket Webhook] No order found for AWB ${awb}`);
      return res.status(200).json({ received: true, note: "Order not found" });
    }

    const srStatus  = payload.current_status || payload.status || "";
    const appStatus = mapStatus(srStatus);
    const eventDate = payload.updated_at ? new Date(payload.updated_at) : new Date();

    // Dedup by date+status
    const alreadyExists = (order.shipping.trackingHistory || []).some(
      (e) => e.date?.toISOString() === eventDate.toISOString() && e.shiprocketStatus === srStatus
    );

    if (!alreadyExists) {
      if (!order.shipping.trackingHistory) order.shipping.trackingHistory = [];
      order.shipping.trackingHistory.push({
        status:          appStatus,
        shiprocketStatus:srStatus,
        message:         payload.current_status_description || srStatus,
        location:        payload.current_city || "",
        date:            eventDate,
        rawData:         payload,
      });
    }

    order.shipping.currentStatus      = appStatus;
    order.shipping.lastTrackingUpdate = new Date();
    if (payload.edd) order.shipping.estimatedDeliveryDate = new Date(payload.edd);

    await order.save();
    console.log(`[Shiprocket Webhook] Order ${order.orderId} updated → ${appStatus}`);
    return res.status(200).json({ received: true });
  } catch (err) {
    console.error("[Shiprocket Webhook] error:", err.message);
    return res.status(200).json({ received: true, error: err.message });
  }
};

/* POST /api/shiprocket/retry/:orderId — smart retry */
exports.retryShipment = async (req, res) => {
  try {
    const order = await findOrder(req.params.orderId);
    if (!order) return res.status(404).json({ message: "Order not found" });

    const shipping = order.shipping || {};
    let step = "";

    try {
      if (!shipping.shiprocketOrderId) {
        await _doCreateShipment(order);
        step = "shipment_created";
        await _doAssignAWB(order);
        step += "+awb_assigned";
        await _doGeneratePickup(order);
        step += "+pickup_scheduled";
      } else if (!shipping.awbCode) {
        await _doAssignAWB(order);
        step = "awb_assigned";
        await _doGeneratePickup(order);
        step += "+pickup_scheduled";
      } else if (shipping.pickupStatus !== "Pickup Scheduled") {
        await _doGeneratePickup(order);
        step = "pickup_scheduled";
      } else {
        return res.json({ success: true, message: "Nothing to retry — all steps complete", shipping: order.shipping });
      }
    } catch (innerErr) {
      order.shipping = {
        ...(order.shipping?.toObject?.() || order.shipping || {}),
        shiprocketError: innerErr.message,
      };
      await order.save();
      return res.status(500).json({ success: false, message: innerErr.message, step });
    }

    return res.json({ success: true, message: `Retry complete: ${step}`, shipping: order.shipping });
  } catch (err) {
    console.error("[Shiprocket] retryShipment error:", err.message);
    return res.status(500).json({ success: false, message: err.message });
  }
};

/* ── Exported helper (used by orderController.js) ──────────────────────── */
exports._doCreateShipment  = _doCreateShipment;
exports._doAssignAWB       = _doAssignAWB;
exports._doGeneratePickup  = _doGeneratePickup;
