const Order = require("../models/Order");
const Medicine = require("../models/Medicine");
const Patient = require("../models/Patient");
const LoginUser = require("../models/LoginUser");

/* =========================
   SALES REPORT
========================= */
exports.getSalesSummary = async (req, res) => {
  try {
    // Single aggregation with $facet instead of two separate ones
    const [result] = await Order.aggregate([
      { $match: { paymentStatus: "Paid" } },
      {
        $facet: {
          trend: [
            {
              $group: {
                _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } },
                sales: { $sum: "$totalAmount" },
                orders: { $sum: 1 },
              },
            },
            { $sort: { _id: 1 } },
          ],
          summary: [
            {
              $group: {
                _id: null,
                total: { $sum: "$totalAmount" },
                orders: { $sum: 1 },
              },
            },
          ],
        },
      },
    ]);

    const summary = result.summary[0] || { total: 0, orders: 0 };

    res.json({
      trend: result.trend,
      summary: {
        totalSales: summary.total,
        orders: summary.orders,
        avgOrder: summary.orders ? Math.round(summary.total / summary.orders) : 0,
      },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Sales report error" });
  }
};

/* =========================
   ORDERS REPORT
========================= */
exports.getOrdersTrend = async (req, res) => {
  try {
    // Single aggregation for trend + counts
    const [result] = await Order.aggregate([
      {
        $facet: {
          trend: [
            {
              $group: {
                _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } },
                orders: { $sum: 1 },
                amount: { $sum: "$totalAmount" },
              },
            },
            { $sort: { _id: 1 } },
          ],
          byStatus: [
            { $group: { _id: "$orderStatus", count: { $sum: 1 } } },
          ],
          total: [{ $count: "count" }],
        },
      },
    ]);

    const statusMap = {};
    result.byStatus.forEach((s) => { statusMap[s._id] = s.count; });

    const ordersList = await Order.find()
      .populate("patient", "name")
      .sort({ createdAt: -1 })
      .limit(10)
      .select("orderId totalAmount orderStatus createdAt patient")
      .lean();

    const table = ordersList.map((o) => ({
      orderId: o.orderId,
      customer: o.patient?.name || "Guest",
      date: o.createdAt.toISOString().slice(0, 10),
      amount: o.totalAmount,
      status: o.orderStatus,
    }));

    res.json({
      trend: result.trend,
      summary: {
        total: result.total[0]?.count || 0,
        completed: statusMap["Delivered"] || 0,
        pending: statusMap["Created"] || 0,
        cancelled: 0,
      },
      table,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Orders report error" });
  }
};

/* =========================
   REVENUE REPORT
========================= */
exports.getRevenueTrend = async (req, res) => {
  try {
    // Single aggregation with $facet
    const [result] = await Order.aggregate([
      { $match: { paymentStatus: "Paid" } },
      {
        $facet: {
          trend: [
            {
              $group: {
                _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } },
                revenue: { $sum: "$totalAmount" },
                orders: { $sum: 1 },
              },
            },
            { $sort: { _id: 1 } },
          ],
          summary: [
            {
              $group: {
                _id: null,
                revenue: { $sum: "$totalAmount" },
                orders: { $sum: 1 },
              },
            },
          ],
        },
      },
    ]);

    const summary = result.summary[0] || { revenue: 0, orders: 0 };

    res.json({
      trend: result.trend,
      summary: {
        total: summary.revenue,
        paid: summary.orders,
        avg: summary.orders ? Math.round(summary.revenue / summary.orders) : 0,
      },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Revenue report error" });
  }
};

/* =========================
   INVENTORY REPORT (lean)
========================= */
exports.getInventoryReport = async (req, res) => {
  try {
    // Use aggregation for summary, lean() for items
    const [summary, items] = await Promise.all([
      Medicine.aggregate([
        {
          $facet: {
            total: [{ $count: "count" }],
            lowStock: [
              { $match: { $expr: { $lte: ["$stock", "$minStock"] } } },
              { $count: "count" },
            ],
          },
        },
      ]),
      Medicine.find().sort({ createdAt: -1 }).lean(),
    ]);

    res.json({
      summary: {
        total: summary[0].total[0]?.count || 0,
        lowStock: summary[0].lowStock[0]?.count || 0,
      },
      items,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Inventory report error" });
  }
};

/* =========================
   CA REPORT (Payment/Transaction Details)
========================= */
exports.getCAReport = async (req, res) => {
  try {
    const orders = await Order.find()
      .populate("patient", "name phone")
      .sort({ createdAt: -1 })
      .select("orderId totalAmount paymentStatus paymentDate orderStatus patient createdAt")
      .lean();

    const caData = orders.map((order, index) => ({
      transactionId: `TXN-${order._id.toString().slice(-10).toUpperCase()}`,
      orderId: order.orderId || "N/A",
      amount: order.totalAmount || 0,
      paymentStatus: order.paymentStatus || "Pending",
      paymentDate: order.paymentDate ? new Date(order.paymentDate).toISOString().split("T")[0] : order.createdAt ? new Date(order.createdAt).toISOString().split("T")[0] : "N/A",
      patientName: order.patient?.name || "Unknown",
      mobileNumber: order.patient?.phone || "N/A",
      orderStatus: order.orderStatus || "Created",
    }));

    // Summary statistics
    const summary = {
      totalTransactions: caData.length,
      totalAmount: caData.reduce((sum, t) => sum + (t.amount || 0), 0),
      paidAmount: caData
        .filter((t) => t.paymentStatus === "Paid")
        .reduce((sum, t) => sum + (t.amount || 0), 0),
      pendingAmount: caData
        .filter((t) => t.paymentStatus === "Pending")
        .reduce((sum, t) => sum + (t.amount || 0), 0),
      paidCount: caData.filter((t) => t.paymentStatus === "Paid").length,
      pendingCount: caData.filter((t) => t.paymentStatus === "Pending").length,
    };

    res.json({
      success: true,
      data: caData,
      summary,
    });
  } catch (err) {
    console.error("CA Report error:", err);
    res.status(500).json({ success: false, message: "CA report error", error: err.message });
  }
};
