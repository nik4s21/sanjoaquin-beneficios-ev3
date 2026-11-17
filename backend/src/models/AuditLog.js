const mongoose = require('mongoose');

// Colección NoSQL Inmutable para Fiscalización de Contraloría General de la República
const AuditLogSchema = new mongoose.Schema({
  timestamp: { type: Date, default: Date.now, immutable: true },
  usuario_id: { type: String, required: true, immutable: true },
  usuario_rol: { type: String, required: true, immutable: true },
  accion: { type: String, required: true, immutable: true },
  modulo: { type: String, required: true, immutable: true },
  detalle: { type: mongoose.Schema.Types.Mixed, immutable: true },
  ip_origen: { type: String, immutable: true }
}, {
  versionKey: false,
  collection: 'audit_logs_contraloria'
});

module.exports = mongoose.model('AuditLog', AuditLogSchema);
