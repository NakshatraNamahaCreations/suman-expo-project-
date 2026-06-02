const Order = require("../models/Order");
const PatientDetails = require("../models/PatientDetails");
const Address = require("../models/Address");
const Patient = require("../models/Patient");
const Medicine = require("../models/Medicine");
const Prescription = require("../models/Prescription");
const ShiprocketCtrl = require("./shiprocket.controller");


const Razorpay = require("razorpay");
const crypto = require("crypto");

const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET,
});


// exports.createRazorpayOrder = async (req, res) => {
//   try {
//     const { orderId } = req.body;

//     const order = await Order.findById(orderId);

//     if (!order) {
//       return res.status(404).json({
//         success: false,
//         message: "Order not found",
//       });
//     }

//     if (order.paymentStatus === "Paid") {
//       return res.json({
//         success: true,
//         message: "Already paid",
//       });
//     }

//     const razorpayOrder = await razorpay.orders.create({
//       amount: Math.round(order.totalAmount * 100),
//       currency: "INR",
//       receipt: order.orderId,
//     });

//     // ✅ SAVE THIS (IMPORTANT)
//     order.razorpayOrderId = razorpayOrder.id;
//     await order.save();

//     res.json({
//       success: true,
//       razorpayOrder,
//       amount: order.totalAmount,
//     });

//   } catch (err) {
//     res.status(500).json({
//       success: false,
//       message: "Razorpay order failed",
//       error: err.message,
//     });
//   }
// };


// exports.verifyRazorpayPayment = async (req, res) => {
//   try {
//     const {
//       razorpay_order_id,
//       razorpay_payment_id,
//       razorpay_signature,
//       orderId,
//     } = req.body;

//     // 🔒 Step 1: Verify signature
//     const body = razorpay_order_id + "|" + razorpay_payment_id;

//     const expectedSignature = crypto
//       .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
//       .update(body)
//       .digest("hex");

//     if (expectedSignature !== razorpay_signature) {
//       return res.status(400).json({
//         success: false,
//         message: "Invalid signature",
//       });
//     }

//     // 🔍 Step 2: Find order
//     const order = await Order.findById(orderId);

//     if (!order) {
//       return res.status(404).json({
//         success: false,
//         message: "Order not found",
//       });
//     }

//     // 🚫 Step 3: Prevent duplicate payment
//     if (order.paymentStatus === "Paid") {
//       return res.json({
//         success: true,
//         message: "Already paid",
//         order,
//       });
//     }

//     // 🔒 Step 4: Validate Razorpay order ID (VERY IMPORTANT)
//     if (order.razorpayOrderId !== razorpay_order_id) {
//       return res.status(400).json({
//         success: false,
//         message: "Order mismatch",
//       });
//     }

//     // ✅ Step 5: Save payment details
//     order.paymentStatus = "Paid";
//     order.paymentDate = new Date();

//     order.razorpayPaymentId = razorpay_payment_id;
//     order.razorpaySignature = razorpay_signature;

//     await order.save();

//     res.json({
//       success: true,
//       message: "Payment successful",
//       order,
//     });

//   } catch (err) {
//     res.status(500).json({
//       success: false,
//       message: "Payment verification failed",
//       error: err.message,
//     });
//   }
// };

// exports.createRazorpayOrder = async (req, res) => {
//   try {
//     const { amount, currency = "INR", receipt } = req.body;

//     if (!amount || Number(amount) <= 0) {
//       return res.status(400).json({
//         success: false,
//         message: "Valid amount is required",
//       });
//     }

//     const razorpayOrder = await razorpay.orders.create({
//       amount: Math.round(Number(amount) * 100),
//       currency,
//       receipt: receipt || `receipt_${Date.now()}`,
//       payment_capture: 1,
//     });

//     return res.status(200).json({
//       success: true,
//       message: "Razorpay order created successfully",
//       razorpayOrder,
//       amount: Number(amount),
//     });
//   } catch (err) {
//     console.error("❌ Razorpay order failed:", err);

//     return res.status(500).json({
//       success: false,
//       message: "Razorpay order failed",
//       error: err.message,
//     });
//   }
// };
exports.createRazorpayOrder = async (req, res) => {
  try {
    console.log("📥 createRazorpayOrder body:", req.body);

    const { amount, currency = "INR", receipt } = req.body;

    if (!amount || Number(amount) <= 0) {
      return res.status(400).json({
        success: false,
        message: "Valid amount is required",
        receivedBody: req.body,
      });
    }

    const razorpayOrder = await razorpay.orders.create({
      amount: Math.round(Number(amount) * 100),
      currency,
      receipt: receipt || `receipt_${Date.now()}`,
      payment_capture: 1,
    });

    return res.status(200).json({
      success: true,
      message: "Razorpay order created successfully",
      razorpayOrder,
      amount: Number(amount),
    });
  } catch (err) {
    console.error("❌ Razorpay order failed:", err);

    return res.status(500).json({
      success: false,
      message: "Razorpay order failed",
      error: err.message,
    });
  }
};

exports.verifyRazorpayPayment = async (req, res) => {
  try {
    const {
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature,
    } = req.body;

    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
      return res.status(400).json({
        success: false,
        message: "Missing Razorpay payment details",
      });
    }

    const body = `${razorpay_order_id}|${razorpay_payment_id}`;

    const expectedSignature = crypto
      .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
      .update(body)
      .digest("hex");

    if (expectedSignature !== razorpay_signature) {
      return res.status(400).json({
        success: false,
        message: "Invalid payment signature",
      });
    }

    return res.status(200).json({
      success: true,
      message: "Payment verified successfully",
      payment: {
        razorpayOrderId: razorpay_order_id,
        razorpayPaymentId: razorpay_payment_id,
        razorpaySignature: razorpay_signature,
      },
    });
  } catch (err) {
    console.error("❌ Payment verification failed:", err);

    return res.status(500).json({
      success: false,
      message: "Payment verification failed",
      error: err.message,
    });
  }
};

/* ─────────────────────────────────────────────────────────────
   POST /orders/:id/generate-payment-link
   Admin generates a Razorpay Payment Link for an order so the
   customer can pay via QR code or the short URL.
───────────────────────────────────────────────────────────── */
exports.generatePaymentLink = async (req, res) => {
  try {
    const order = await Order.findById(req.params.id);
    if (!order) return res.status(404).json({ success: false, message: "Order not found" });
    if (order.paymentStatus === "Paid") {
      return res.status(400).json({ success: false, message: "Order is already paid" });
    }

    // Re-use existing link if still valid
    if (order.razorpayPaymentLinkUrl) {
      return res.json({ success: true, paymentLinkUrl: order.razorpayPaymentLinkUrl, paymentLinkId: order.razorpayPaymentLinkId });
    }

    const paymentLink = await razorpay.paymentLink.create({
      amount: Math.round((order.totalAmount || 0) * 100), // paise
      currency: "INR",
      description: `Payment for Order ${order.orderId}`,
      reference_id: order.orderId,
      notify: { sms: false, email: false },
      reminder_enable: false,
    });

    order.razorpayPaymentLinkId  = paymentLink.id;
    order.razorpayPaymentLinkUrl = paymentLink.short_url;
    await order.save();

    return res.json({ success: true, paymentLinkUrl: paymentLink.short_url, paymentLinkId: paymentLink.id });
  } catch (err) {
    console.error("❌ generatePaymentLink error:", err);
    return res.status(500).json({ success: false, message: "Failed to generate payment link", error: err.message });
  }
};

/* ─────────────────────────────────────────────────────────────
   POST /orders/razorpay-webhook
   Razorpay calls this when a Payment Link is paid.
   Configure the webhook URL in Razorpay Dashboard:
     https://<backend-url>/api/orders/razorpay-webhook
   Events to enable: payment_link.paid
───────────────────────────────────────────────────────────── */
exports.razorpayWebhook = async (req, res) => {
  try {
    const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET;
    if (webhookSecret) {
      const signature = req.headers["x-razorpay-signature"];
      const expectedSig = crypto
        .createHmac("sha256", webhookSecret)
        .update(req.rawBody || JSON.stringify(req.body))
        .digest("hex");
      if (signature !== expectedSig) {
        return res.status(400).json({ success: false, message: "Invalid webhook signature" });
      }
    }

    const event = req.body?.event;
    const entity = req.body?.payload?.payment_link?.entity;

    if (event === "payment_link.paid" && entity?.id) {
      await Order.findOneAndUpdate(
        { razorpayPaymentLinkId: entity.id },
        { paymentStatus: "Paid", paymentDate: new Date(), razorpayPaymentId: entity.payments?.[0]?.payment?.entity?.id || null }
      );
      console.log("✅ Webhook: payment_link.paid for", entity.id);
    }

    return res.json({ success: true });
  } catch (err) {
    console.error("❌ Razorpay webhook error:", err);
    return res.status(500).json({ success: false, error: err.message });
  }
};

/* ── pagination helper ───────────────────────────────────────── */
function paginate(query) {
  const page = Math.max(1, parseInt(query.page) || 1);
  const raw = parseInt(query.limit);
  const all = raw === 0;                       // limit=0 → return everything (exports)
  const limit = all ? 0 : Math.min(Math.max(raw || 10, 1), 100);
  const skip = all ? 0 : (page - 1) * limit;
  return { page, limit, skip, all };
}



exports.createOrder = async (req, res) => {
  try {
    const { patientId, addressId, prescriptionId, items, pharmacistReview, unmatchedMedicines, totalAmount, deliveryFee, gst, cgst, sgst, itemTotal, userId: requestUserId, prescriptionFile, userPrescriptionFile, razorpayOrderId, razorpayPaymentId, razorpaySignature } = req.body;

    // ✅ VALIDATE PATIENT ID
    if (!patientId) {
      return res.status(400).json({
        success: false,
        message: "patientId is required",
      });
    }

    const patient = await PatientDetails.findById(patientId);

    if (!patient) {
      return res.status(404).json({
        success: false,
        message: "Patient not found",
      });
    }

    // ✅ VALIDATE ITEMS - allow empty if pharmacistReview is true
    if ((!items || !Array.isArray(items) || items.length === 0) && !pharmacistReview) {
      return res.status(400).json({
        success: false,
        message: "No medicines provided",
      });
    }

    // ✅ VALIDATE medicineId (skip if pharmacistReview)
    if (!pharmacistReview) {
      for (const m of items) {
        if (!m.medicineId) {
          return res.status(400).json({
            success: false,
            message: "medicineId missing in items",
          });
        }
      }
    }

    // ✅ Use userId from request body if provided, otherwise get from patient
    const userId = requestUserId || patient.userId;

    let medMap = {};
    // Use frontend-calculated values directly - NO recalculation
    const serverSubtotal = itemTotal || 0;
    const serverGst = gst || (cgst || 0) + (sgst || 0) || 0;
    const serverDeliveryFee = deliveryFee || 0;
    const serverTotal = totalAmount || 0;

    // 🔥 FETCH MEDICINES (skip if pharmacistReview with no items)
    if (items && items.length > 0) {
      const medicineIds = items.map(i => i.medicineId);

      const medicines = await Medicine.find({
        _id: { $in: medicineIds }
      });

      medicines.forEach(m => {
        medMap[m._id.toString()] = m;
      });

      // ✅ VALIDATE MEDICINE EXISTENCE (but allow orders even if stock is 0)
      for (const item of items) {
        const med = medMap[item.medicineId.toString()];

        if (!med) {
          return res.status(404).json({
            success: false,
            message: "Medicine not found",
          });
        }
      }
      // ✅ NO CALCULATION: Frontend Order Summary values are already correct
      // Backend only validates medicine existence and stores received values
      // Stock can be 0 or negative - orders are allowed regardless of stock availability
    }

    // ✅ GET ADDRESS
    let address = null;

    // ✅ 1. If addressId provided
    if (addressId) {
      address = await Address.findById(addressId);
    }

    // ✅ 2. If not → try patient address
    if (!address && patient.addressId) {
      address = await Address.findById(patient.addressId);
    }

    // ✅ 3. If not → fallback default
    if (!address) {
      address = await Address.findOne({ userId, isDefault: true });
    }

    // ❌ Final validation
    if (!address) {
      return res.status(400).json({
        success: false,
        message: "No address found for this patient"
      });
    }

    // ✅ CREATE ORDER
    const orderData = {
      userId,
      prescription: prescriptionId,
      prescriptionFile: prescriptionFile || null,
      // Cloudinary-backed prescription file (from user's prescription library)
      userPrescriptionFile: userPrescriptionFile
        ? {
            fileId: userPrescriptionFile.fileId || userPrescriptionFile._id || null,
            cloudinaryUrl: userPrescriptionFile.cloudinaryUrl || "",
            publicId: userPrescriptionFile.publicId || "",
            fileType: userPrescriptionFile.fileType || "image",
            originalFileName: userPrescriptionFile.originalFileName || "",
          }
        : undefined,
      patient: patient._id,
      orderSource: "mobile",
      subtotal: serverSubtotal,
      deliveryFee: serverDeliveryFee,
      gst: serverGst,
      cgst: cgst || 0,
      sgst: sgst || 0,
      totalAmount: serverTotal,
      items: (items || []).map((item) => {
        const med = medMap[item.medicineId.toString()];
        // Store frontend Order Summary values exactly as received - no recalculation
        return {
          medicineId: item.medicineId,
          name: item.name || item.description || med.description || "",
          description: item.description || med.description || "",
          mfr: item.mfr || med.mfr || "",
          pack: item.pack || med.pack || "",
          batchNo: item.batchNo || med.batchNo || "",
          hsnCode: item.hsnCode || med.hsnCode || "",
          gstPercent: item.gstPercent !== undefined ? Number(item.gstPercent) : (med.gstPercent || 5),
          netValue: Number(item.netValue || item.price || 0),
          qty: Number(item.qty || 0),
          duration: Number(item.duration || 1),
          frequency: item.frequency || "",
          price: Number(item.price || item.netValue || 0),
          basePrice: Number(item.basePrice || 0),
          gstAmount: Number(item.gstAmount || 0),
          cgst: Number(item.cgst || 0),
          sgst: Number(item.sgst || 0),
          subtotal: Number(item.subtotal || 0),
        };
      }),

      patientDetails: {
        patientId: patient.patientId,
        name: patient.name,
        age: patient.age || null,
        email: patient.email || "",
        phone: patient.primaryPhone,
        secondaryPhone: patient.secondaryPhone || "",
        gender: patient.gender,
        orderingFor: patient.orderingFor || "myself",
      },

      addressDetails: {
        fullAddress: address.fullAddress,
        city: address.city,
        state: address.state,
        pincode: address.pincode,
      },

      deliveryAddress: address.fullAddress,
    };

    // Add pharmacist review flag if present
    if (pharmacistReview) {
      orderData.pharmacistReview = true;
      orderData.orderStatus = "Created";
    }

    // Add unmatched medicines if present
    if (unmatchedMedicines && unmatchedMedicines.length > 0) {
      orderData.unmatchedMedicines = unmatchedMedicines;
    }

    // Handle payment status based on Razorpay payment details
    if (razorpayOrderId && razorpayPaymentId && razorpaySignature) {
      // Payment details provided - set order as Paid
      orderData.paymentStatus = "Paid";
      orderData.razorpayOrderId = razorpayOrderId;
      orderData.razorpayPaymentId = razorpayPaymentId;
      orderData.razorpaySignature = razorpaySignature;
      orderData.paymentDate = new Date();
      console.log("✅ Order created with Paid status (payment details provided)");
    } else {
      // No payment details - set order as Pending
      orderData.paymentStatus = "Pending";
      console.log("⏳ Order created with Pending status (no payment details)");
    }

    const order = await Order.create(orderData);

    // ✅ 🔥 DEDUCT STOCK (only if items exist)
    if (items && items.length > 0) {
      await Medicine.bulkWrite(
        items.map((item) => ({
          updateOne: {
            filter: { _id: item.medicineId },
            update: {
              $inc: {
                qty: -item.qty,
              },
            },
          },
        }))
      );
    }

    // ✅ RESPOND FIRST — do not block client on Shiprocket
    res.status(201).json({
      success: true,
      message: "Order created successfully",
      order,
    });

    // ✅ SHIPROCKET INTEGRATION (async, non-blocking)
    setImmediate(async () => {
      try {
        console.log(`[Shiprocket] Auto-creating shipment for order ${order.orderId}`);
        await ShiprocketCtrl._doCreateShipment(order);
        await ShiprocketCtrl._doAssignAWB(order);
        await ShiprocketCtrl._doGeneratePickup(order);
        console.log(`[Shiprocket] Full flow complete for order ${order.orderId}`);
      } catch (srErr) {
        console.error(`[Shiprocket] Auto-flow failed for order ${order.orderId}:`, srErr.message);
        try {
          await Order.findByIdAndUpdate(order._id, {
            $set: { "shipping.shiprocketError": srErr.message, "shipping.currentStatus": "Shipment Pending" },
          });
        } catch (dbErr) {
          console.error("[Shiprocket] Could not save error to DB:", dbErr.message);
        }
      }
    });

    return;

  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Order creation failed",
      error: error.message,
    });
  }
};
// ============================
// BILLING TABLE  (server-side paginated)
// ============================
exports.getBillingTable = async (req, res) => {
  try {
    const { page, limit, skip, all } = paginate(req.query);
    const { search, invoiceStatus, paymentStatus, from, to } = req.query;

    // ✅ FIXED: always use queryFilter
    const queryFilter = {
      isDeleted: { $ne: true } // 🔥 important
    };

    if (invoiceStatus) queryFilter.invoiceStatus = invoiceStatus;
    if (paymentStatus) queryFilter.paymentStatus = paymentStatus;

    if (search) {
      queryFilter.$or = [
        { orderId: { $regex: search, $options: "i" } },
        { invoiceNumber: { $regex: search, $options: "i" } },
        { "patientDetails.name": { $regex: search, $options: "i" } },
      ];
    }

    if (from || to) {
      queryFilter.createdAt = {};
      if (from) queryFilter.createdAt.$gte = new Date(from);
      if (to) {
        queryFilter.createdAt.$lte = new Date(
          new Date(to).setHours(23, 59, 59, 999)
        );
      }
    }

    let q = Order.find(queryFilter)
      .select(
        "orderId invoiceNumber invoiceStatus invoiceDate paymentStatus totalAmount patientDetails createdAt items"
      )
      .sort({ createdAt: -1 })
      .lean();

    if (!all) q = q.skip(skip).limit(limit);

    const [orders, total] = await Promise.all([
      q,
      Order.countDocuments(queryFilter)
    ]);

    // ✅ Calculate accurate counts for all filtered records (not just current page)
    const allOrdersForStats = await Order.find(queryFilter).select("invoiceStatus paymentStatus totalAmount").lean();
    const stats = {
      generated: allOrdersForStats.filter(o => o.invoiceStatus === "Generated").length,
      pending: allOrdersForStats.filter(o => o.invoiceStatus === "Pending").length,
      paid: allOrdersForStats.filter(o => o.paymentStatus === "Paid").length,
      unpaid: allOrdersForStats.filter(o => o.paymentStatus !== "Paid").length,
      totalAmount: allOrdersForStats.reduce((sum, o) => sum + (o.totalAmount || 0), 0),
      paidAmount: allOrdersForStats.filter(o => o.paymentStatus === "Paid").reduce((sum, o) => sum + (o.totalAmount || 0), 0),
    };

    const table = orders.map((o) => ({
      id: o._id,
      orderId: o.orderId || "-",
      invoiceNumber:
        o.invoiceStatus === "Generated" ? o.invoiceNumber : "-",
      invoiceDate: o.invoiceDate || "-",
      customerName: o.patientDetails?.name || "Unknown",
      billAmount: o.totalAmount || 0,
      invoiceStatus: o.invoiceStatus,
      paymentStatus: o.paymentStatus,
    }));

    res.json({
      success: true,
      data: table,
      pagination: {
        page: all ? 1 : page,
        limit: all ? total : limit,
        total,
        totalPages: all ? 1 : Math.ceil(total / limit) || 1,
      },
      stats,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};


// ============================
// GET ALL ORDERS  (server-side paginated)
// ============================
exports.getOrders = async (req, res) => {
  try {
    const { page, limit, skip, all } = paginate(req.query);
    const { search, orderStatus, paymentStatus, from, to, filter, userId } = req.query;

    const queryFilter = {
      isDeleted: { $ne: true } // ✅ prevent deleted data
    };

    // ✅ Filter by userId if provided
    if (userId) {
      queryFilter.userId = userId;
    }

    if (orderStatus) queryFilter.orderStatus = orderStatus;
    if (paymentStatus) queryFilter.paymentStatus = paymentStatus;

    if (search) {
      queryFilter.$or = [
        { orderId: { $regex: search, $options: "i" } },
        { "patientDetails.name": { $regex: search, $options: "i" } },
      ];
    }

    if (from || to) {
      queryFilter.createdAt = {};
      if (from) queryFilter.createdAt.$gte = new Date(from);
      if (to) queryFilter.createdAt.$lte = new Date(
        new Date(to).setHours(23, 59, 59, 999)
      );
    }

    const now = new Date();
    const next7 = new Date();
    next7.setDate(now.getDate() + 7);

    // 🔥 STEP 1: Fetch ALL matching orders (no skip/limit yet)
    const allOrders = await Order.find(queryFilter)
      .populate({
        path: "prescription",
        match:
          filter === "active"
            ? { expiry: { $gt: next7 } }
            : filter === "expiring"
              ? { expiry: { $gt: now, $lte: next7 } }
              : filter === "expired"
                ? { expiry: { $lte: now } }
                : {},
      })
      .sort({ createdAt: -1 });

    // 🔥 STEP 2: Remove unmatched (important)
    const filteredOrders = allOrders.filter(o => o.prescription !== null);

    // 🔥 STEP 3: TOTAL (correct)
    const total = filteredOrders.length;

    // 🔥 STEP 4: Apply pagination AFTER filtering
    const paginatedOrders = all
      ? filteredOrders
      : filteredOrders.slice(skip, skip + limit);

    res.json({
      success: true,
      data: paginatedOrders,
      pagination: {
        page: all ? 1 : page,
        limit: all ? total : limit,
        total,
        totalPages: all ? 1 : Math.ceil(total / limit) || 1,
      },
    });

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};


// ============================
// GET SINGLE ORDER
// ============================
exports.getOrderById = async (req, res) => {
  try {
    const order = await Order.findById(req.params.id)
      .populate({ path: "prescription", populate: { path: "meds.medicine" } })
      .populate("patient");

    if (!order) return res.status(404).json({ success: false, message: "Order not found" });

    res.json({ success: true, data: order });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};


// ============================
// GENERATE INVOICE
// ============================
exports.generateInvoice = async (req, res) => {
  try {
    const order = await Order.findById(req.params.id);
    if (!order) return res.status(404).json({ success: false, message: "Order not found" });

    if (order.invoiceStatus === "Generated") {
      return res.json({ success: true, message: "Invoice already generated", order });
    }

    order.invoiceStatus = "Generated";
    order.invoiceDate = new Date();
    await order.save();

    res.json({ success: true, message: "Invoice generated successfully", order });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};


// ============================
// DELETE ORDER
// ============================
exports.deleteOrder = async (req, res) => {
  try {
    const order = await Order.findById(req.params.id);

    if (!order) {
      return res.status(404).json({
        success: false,
        message: "Order not found"
      });
    }

    // ✅ SOFT DELETE
    order.isDeleted = true;
    await order.save();

    res.json({
      success: true,
      message: "Order deleted successfully"
    });

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};


exports.markPaymentPaid = async (req, res) => {
  try {
    const order = await Order.findById(req.params.id);

    if (!order) {
      return res.status(404).json({
        success: false,
        message: "Order not found",
      });
    }

    // ✅ Already paid check
    if (order.paymentStatus === "Paid") {
      return res.json({
        success: true,
        message: "Already paid",
        data: order,
      });
    }



    // ✅ Update payment
    order.paymentStatus = "Paid";
    order.paymentDate = new Date();

    await order.save();

    res.json({
      success: true,
      message: "Payment marked as Paid",
      data: order,
    });

  } catch (err) {
    res.status(500).json({
      success: false,
      message: "Payment update failed",
      error: err.message,
    });
  }
};

// ============================
// ADMIN: CREATE ORDER DIRECTLY
// ============================
exports.createAdminOrder = async (req, res) => {
  try {
    const { patientId, addressId, items, totalAmount, deliveryFee = 0, gst = 0, cgst = 0, sgst = 0, itemTotal = 0, pharmacistReview = "" } = req.body;

    // Minimal validation only
    if (!patientId) {
      return res.status(400).json({
        success: false,
        message: "patientId is required",
      });
    }

    if (!addressId) {
      return res.status(400).json({
        success: false,
        message: "addressId is required",
      });
    }

    if (!items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({
        success: false,
        message: "items array is required",
      });
    }

    const patient = await PatientDetails.findById(patientId);
    if (!patient) {
      return res.status(404).json({
        success: false,
        message: "Patient not found",
      });
    }

    const address = await Address.findById(addressId);
    if (!address) {
      return res.status(404).json({
        success: false,
        message: "Address not found",
      });
    }

    // Store order exactly as frontend sends it - NO RECALCULATION
    const order = await Order.create({
      userId: patient.userId,
      patientId: patient._id,
      addressId: address._id,
      orderSource: "admin",
      items: items,
      subtotal: itemTotal,
      deliveryFee: deliveryFee,
      gst: gst,
      cgst: cgst,
      sgst: sgst,
      totalAmount: totalAmount,
      pharmacistReview: pharmacistReview,
      orderStatus: "Processing",
      paymentStatus: "Paid",
      patientDetails: {
        name: patient.name,
        patientId: patient.patientId,
        age: patient.age || null,
        email: patient.email || "",
        phone: patient.primaryPhone,
        secondaryPhone: patient.secondaryPhone || "",
        gender: patient.gender || "",
        orderingFor: "admin",
      },
      addressDetails: {
        fullAddress: address.fullAddress,
        city: address.city || "",
        state: address.state || "",
        pincode: address.pincode || "",
      },
      deliveryAddress: address.fullAddress,
      createdAt: new Date(),
    });

    res.status(201).json({
      success: true,
      message: "Order created successfully",
      data: order,
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Failed to create order",
      error: error.message,
    });
  }
};


// ============================
// UPDATE ORDER STATUS
// ============================
exports.updateOrderStatus = async (req, res) => {
  try {
    const { status } = req.body;
    const validStatuses = ["Created", "Processing", "Packed", "Shipped", "Delivered"];

    if (!validStatuses.includes(status)) {
      return res.status(400).json({ success: false, message: "Invalid status" });
    }

    const order = await Order.findByIdAndUpdate(req.params.id, { orderStatus: status }, { new: true });
    if (!order) return res.status(404).json({ success: false, message: "Order not found" });

    res.json({ success: true, order });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};


exports.updatePaymentStatus = async (req, res) => {
  try {
    const { status } = req.body;

    const validStatuses = ["Pending", "Paid", "Failed", "Refunded"];

    if (!validStatuses.includes(status)) {
      return res.status(400).json({
        success: false,
        message: "Invalid payment status",
      });
    }

    const order = await Order.findById(req.params.id);

    if (!order) {
      return res.status(404).json({
        success: false,
        message: "Order not found",
      });
    }

    // 🚫 Prevent Paid → Pending (important)
    if (order.paymentStatus === "Paid" && status === "Pending") {
      return res.status(400).json({
        success: false,
        message: "Cannot revert Paid to Pending. Use refund instead.",
      });
    }

    // ✅ Update status
    order.paymentStatus = status;

    if (status === "Paid") {
      order.paymentDate = new Date();
    }

    if (status === "Refunded") {
      order.paymentDate = null;
    }

    await order.save();

    res.json({
      success: true,
      message: "Payment status updated",
      data: order,
    });

  } catch (err) {
    res.status(500).json({
      success: false,
      message: "Update failed",
      error: err.message,
    });
  }
};

// ════════════════════════════════════════════════════════════════
// REORDER: Create new order from existing order
// ════════════════════════════════════════════════════════════════
exports.reorderOrder = async (req, res) => {
  try {
    console.log("🔄 Reorder request for orderId:", req.params.id);

    // ── Step 1: Fetch original order ──
    const original = await Order.findById(req.params.id);
    if (!original) {
      return res.status(404).json({ success: false, message: "Original order not found" });
    }

    console.log(`✅ Found original order: ${original.orderId}`);
    console.log(`   Items: ${original.items?.length || 0}, Total: ${original.totalAmount}, Status: ${original.orderStatus}`);

    // ── Step 2: Verify original order has items ──
    if (!original.items || original.items.length === 0) {
      return res.status(400).json({ success: false, message: "Original order has no items" });
    }

    console.log(`📋 Reordering ${original.items.length} medicines with exact original data`);

    // ── Step 3: Create new order with exact same data (no recalculation) ──
    const newOrderData = {
      userId: original.userId,
      patient: original.patient,
      patientDetails: original.patientDetails,
      addressDetails: original.addressDetails,
      deliveryAddress: original.deliveryAddress,
      prescription: original.prescription,
      items: original.items,
      subtotal: original.subtotal,
      gst: original.gst,
      deliveryFee: original.deliveryFee,
      totalAmount: original.totalAmount,
      orderSource: "mobile",
      orderStatus: "Created",
      paymentStatus: "Pending",
      pharmacistReview: false,
    };

    const newOrder = await Order.create(newOrderData);
    console.log(`✅ Created new order: ${newOrder.orderId} (ID: ${newOrder._id})`);
    console.log(`💰 Preserved amounts - Subtotal: ${original.subtotal}, GST: ${original.gst}, Delivery: ${original.deliveryFee}, Total: ${original.totalAmount}`);

    res.json({
      success: true,
      message: "Reorder placed successfully",
      order: newOrder,
    });
  } catch (err) {
    console.error("❌ Reorder error:", err.message);
    console.error("Stack trace:", err.stack);
    res.status(500).json({
      success: false,
      message: "Failed to create reorder",
      error: err.message,
    });
  }
};