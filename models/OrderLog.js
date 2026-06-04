const mongoose = require("mongoose");

const orderLogSchema = new mongoose.Schema(
  {
    orderId:       { type: String },
    orderDbId:     { type: String },
    customerName:  { type: String, default: "" },
    patientName:   { type: String, default: "" },
    mobileNumber:  { type: String, default: "" },
    totalAmount:   { type: Number, default: 0 },
    orderStatus:   { type: String, default: "" },
    paymentStatus: { type: String, default: "" },
    remark:        { type: String, default: "" },   // reason admin gave for deletion
    deletedBy:     { type: String, default: "Admin" },
    deletedAt:     { type: Date, default: Date.now },
    snapshot:      { type: Object, default: {} },   // full order object at time of deletion
  },
  { timestamps: true }
);

orderLogSchema.index({ deletedAt: -1 });

module.exports = mongoose.model("OrderLog", orderLogSchema);
