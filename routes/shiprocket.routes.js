const router = require("express").Router();
const ctrl   = require("../controllers/shiprocket.controller");

/* Shipment lifecycle */
router.post("/create-shipment/:orderId",  ctrl.createShipment);
router.post("/generate-awb/:orderId",     ctrl.generateAWB);
router.post("/generate-pickup/:orderId",  ctrl.generatePickup);

/* Tracking */
router.post("/refresh-tracking/:orderId", ctrl.refreshTracking);

/* Admin actions */
router.post("/cancel-shipment/:orderId",  ctrl.cancelShipment);
router.post("/retry/:orderId",            ctrl.retryShipment);

/* Inbound webhook from Shiprocket (no auth) */
router.post("/webhook", ctrl.webhook);

module.exports = router;
