require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { Pool } = require('pg');
const mongoose = require('mongoose');
const XLSX = require('xlsx');

const AuditLog = require('./models/AuditLog');
const { verificarToken, autorizarRoles } = require('./middleware/auth');
const { validarRutChileno, formatearRut, calcularTramoEdad } = require('./utils/rutValidator');

const app = express();
app.use(helmet());
app.use(cors({ origin: process.env.FRONTEND_URL || '*' }));
app.use(express.json());

// Conexión PostgreSQL Cloud
const pgPool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL?.includes('localhost') ? false : { rejectUnauthorized: false }
});

// Conexión MongoDB Cloud (Auditoría Contraloría)
if (process.env.MONGODB_URI) {
  mongoose.connect(process.env.MONGODB_URI)
    .then(() => console.log('MongoDB Atlas conectado (Auditoría Contraloría)'))
    .catch((err) => console.error('Error conectando MongoDB:', err.message));
}

async function registrarAuditoria(req, modulo, accion, detalle) {
  try {
    if (mongoose.connection.readyState === 1) {
      await AuditLog.create({
        usuario_id: req.user?.id || 'ANONIMO',
        usuario_rol: req.user?.rol || 'PUBLICO',
        modulo,
        accion,
        detalle,
        ip_origen: req.headers['x-forwarded-for'] || req.socket.remoteAddress
      });
    }
  } catch (err) {
    console.error('Fallo no bloqueante en bitácora NoSQL:', err.message);
  }
}

// Healthcheck para monitoreo Cloud
app.get('/api/health', (req, res) => {
  res.json({ status: 'OK', servicio: 'API Beneficios San Joaquín', timestamp: new Date().toISOString() });
});

// ============================================================================
// MÓDULO 1: USUARIOS Y ACCESO (Sin autoregistro, cambio clave inicial, RBAC)
// ============================================================================
app.post('/api/auth/register', (req, res) => {
  return res.status(403).json({
    error: 'AUTOREGISTRO_DESHABILITADO',
    mensaje: 'El registro público está cerrado. Solicite sus credenciales a DIDECO San Joaquín.'
  });
});

app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    const { rows } = await pgPool.query(
      `SELECT u.*, r.codigo AS rol_codigo, r.nombre AS rol_nombre, t.nombre AS territorio_nombre, j.nombre AS jjvv_nombre
       FROM usuarios u
       JOIN roles r ON u.rol_id = r.id
       LEFT JOIN territorios t ON u.territorio_id = t.id
       LEFT JOIN juntas_vecinos j ON u.jjvv_id = j.id
       WHERE LOWER(u.email) = LOWER($1) AND u.activo = TRUE`,
      [email]
    );

    const user = rows[0];
    if (!user || !(await bcrypt.compare(password, user.password_hash))) {
      return res.status(401).json({ error: 'Correo o contraseña incorrectos.' });
    }

    const payload = {
      id: user.id,
      rol: user.rol_codigo,
      territorio_id: user.territorio_id,
      jjvv_id: user.jjvv_id,
      debe_cambiar_password: user.debe_cambiar_password
    };

    const token = jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: '8h' });
    req.user = { id: user.id, rol: user.rol_codigo };
    await registrarAuditoria(req, 'M1_ACCESO', 'INICIO_SESION', { email: user.email, primer_ingreso: user.debe_cambiar_password });

    res.json({
      token,
      debe_cambiar_password: user.debe_cambiar_password,
      usuario: {
        id: user.id,
        rut: user.rut,
        nombre_completo: user.nombre_completo,
        email: user.email,
        rol: user.rol_codigo,
        rol_nombre: user.rol_nombre,
        territorio_id: user.territorio_id,
        territorio_nombre: user.territorio_nombre,
        jjvv_id: user.jjvv_id,
        jjvv_nombre: user.jjvv_nombre
      }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/auth/cambiar-clave-inicial', verificarToken(true), async (req, res) => {
  try {
    const { nueva_password } = req.body;
    if (!nueva_password || nueva_password.length < 8) {
      return res.status(400).json({ error: 'La nueva contraseña debe tener al menos 8 caracteres.' });
    }
    const hash = await bcrypt.hash(nueva_password, 10);
    await pgPool.query(
      'UPDATE usuarios SET password_hash = $1, debe_cambiar_password = FALSE WHERE id = $2',
      [hash, req.user.id]
    );
    await registrarAuditoria(req, 'M1_ACCESO', 'CAMBIO_CLAVE_INICIAL', { usuario_id: req.user.id });
    res.json({ mensaje: 'Contraseña actualizada correctamente. Inicie sesión con su nueva clave.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Catálogos territoriales y RBAC extensible
app.get('/api/catalogos', verificarToken(), async (req, res) => {
  const [territorios, jjvv, roles, campana] = await Promise.all([
    pgPool.query('SELECT * FROM territorios ORDER BY numero'),
    pgPool.query('SELECT * FROM juntas_vecinos ORDER BY territorio_id, nombre'),
    pgPool.query('SELECT id, codigo, nombre, permisos FROM roles ORDER BY id'),
    pgPool.query('SELECT * FROM campanas WHERE activa = TRUE LIMIT 1')
  ]);
  res.json({
    territorios: territorios.rows,
    juntas_vecinos: jjvv.rows,
    roles: roles.rows,
    campana_activa: campana.rows[0] || null
  });
});

app.post('/api/roles', verificarToken(), autorizarRoles('SUPER_ADMIN'), async (req, res) => {
  try {
    const { codigo, nombre, descripcion, permisos } = req.body;
    const { rows } = await pgPool.query(
      'INSERT INTO roles (codigo, nombre, descripcion, permisos) VALUES ($1, $2, $3, $4::jsonb) RETURNING *',
      [codigo.toUpperCase(), nombre, descripcion || '', JSON.stringify(permisos || [])]
    );
    await registrarAuditoria(req, 'M1_RBAC', 'CREACION_ROL_EXTENSIBLE', rows[0]);
    res.status(201).json(rows[0]);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.post('/api/usuarios', verificarToken(), autorizarRoles('SUPER_ADMIN', 'SUPERVISOR_MUNI'), async (req, res) => {
  try {
    const { rut, nombre_completo, email, password_temporal, rol_codigo, territorio_id, jjvv_id } = req.body;
    if (!validarRutChileno(rut)) return res.status(400).json({ error: 'El RUT del usuario no es válido.' });

    const rolRes = await pgPool.query('SELECT id FROM roles WHERE codigo = $1', [rol_codigo]);
    if (!rolRes.rows[0]) return res.status(400).json({ error: 'Rol RBAC no encontrado.' });

    const hash = await bcrypt.hash(password_temporal || 'Temp1234', 10);
    const { rows } = await pgPool.query(
      `INSERT INTO usuarios (rut, nombre_completo, email, password_hash, rol_id, territorio_id, jjvv_id, debe_cambiar_password)
       VALUES ($1, $2, $3, $4, $5, $6, $7, TRUE)
       RETURNING id, rut, nombre_completo, email, debe_cambiar_password`,
      [formatearRut(rut), nombre_completo, email.toLowerCase(), hash, rolRes.rows[0].id, territorio_id || null, jjvv_id || null]
    );

    await registrarAuditoria(req, 'M1_ACCESO', 'APROVISIONAMIENTO_USUARIO', { email, rol_codigo, territorio_id, jjvv_id });
    res.status(201).json(rows[0]);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// ============================================================================
// MÓDULO 2 & 3: REGISTRO DE BENEFICIARIOS, VALIDACIÓN RUT/IPE Y DUPLICIDAD
// ============================================================================
app.post('/api/beneficiarios', verificarToken(), autorizarRoles('REPRESENTANTE_JJVV', 'SUPERVISOR_MUNI'), async (req, res) => {
  try {
    const {
      tipo_identificador,
      numero_identificador,
      nombres,
      apellidos,
      sexo,
      edad,
      territorio_id,
      jjvv_id,
      nombre_adulto_responsable,
      rut_adulto_responsable,
      origen_registro,
      justificacion_duplicidad
    } = req.body;

    // 1. Validar identificadores
    let idNormalizado = String(numero_identificador || '').trim().toUpperCase();
    if (tipo_identificador === 'RUT') {
      if (!validarRutChileno(idNormalizado)) {
        return res.status(400).json({ error: 'El RUT del niño/a ingresado no es válido (Módulo 11).' });
      }
      idNormalizado = formatearRut(idNormalizado);
    } else if (tipo_identificador === 'IPE') {
      if (idNormalizado.length < 5) {
        return res.status(400).json({ error: 'El Identificador Provisorio Escolar (IPE) debe tener al menos 5 caracteres.' });
      }
    } else {
      return res.status(400).json({ error: 'Tipo de identificador inválido (use RUT o IPE).' });
    }

    if (!validarRutChileno(rut_adulto_responsable)) {
      return res.status(400).json({ error: 'El RUT del adulto responsable no es válido.' });
    }

    const tramo_edad = calcularTramoEdad(edad);
    if (!tramo_edad) {
      return res.status(400).json({ error: 'La edad del beneficiario debe estar entre 0 y 10 años.' });
    }

    const campanaRes = await pgPool.query('SELECT id FROM campanas WHERE activa = TRUE LIMIT 1');
    const campana_id = campanaRes.rows[0].id;

    // 2. Detección de duplicidad social (otra JJVV, territorio o Jardín Infantil)
    const dupRes = await pgPool.query(
      `SELECT b.id, b.origen_registro, t.nombre AS territorio, j.nombre AS jjvv
       FROM beneficiarios b
       JOIN territorios t ON b.territorio_id = t.id
       JOIN juntas_vecinos j ON b.jjvv_id = j.id
       WHERE b.campana_id = $1 AND b.numero_identificador = $2`,
      [campana_id, idNormalizado]
    );

    let estado = 'VALIDADO';
    if (dupRes.rows.length > 0) {
      const previo = dupRes.rows[0];
      if (!justificacion_duplicidad || justificacion_duplicidad.trim().length < 15) {
        return res.status(409).json({
          requiere_justificacion: true,
          duplicado_previo: previo,
          mensaje: `Alerta de Duplicidad: El menor ya está registrado en ${previo.jjvv} (${previo.territorio}, origen: ${previo.origen_registro}). Ingrese justificación social obligatoria (mín. 15 caracteres) para inscribir como OBSERVADO.`
        });
      }
      estado = 'OBSERVADO';
    }

    const { rows } = await pgPool.query(
      `INSERT INTO beneficiarios (
        campana_id, tipo_identificador, numero_identificador, nombres, apellidos, sexo, edad, tramo_edad,
        territorio_id, jjvv_id, nombre_adulto_responsable, rut_adulto_responsable, origen_registro,
        estado, justificacion_duplicidad, registrado_por
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16) RETURNING *`,
      [
        campana_id,
        tipo_identificador,
        idNormalizado,
        nombres.trim(),
        apellidos.trim(),
        sexo.toUpperCase(),
        Number(edad),
        tramo_edad,
        territorio_id,
        jjvv_id,
        nombre_adulto_responsable.trim(),
        formatearRut(rut_adulto_responsable),
        origen_registro || 'JJVV',
        estado,
        justificacion_duplicidad ? justificacion_duplicidad.trim() : null,
        req.user.id
      ]
    );

    await registrarAuditoria(
      req,
      'M2_M3_BENEFICIARIOS',
      estado === 'OBSERVADO' ? 'INSCRIPCION_DUPLICADA_OBSERVADA' : 'INSCRIPCION_BENEFICIARIO',
      rows[0]
    );

    res.status(201).json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ============================================================================
// MÓDULO 5: GESTIÓN MUNICIPAL (Consulta, filtros y resolución de observados)
// ============================================================================
app.get('/api/beneficiarios', verificarToken(), async (req, res) => {
  try {
    const { q, territorio_id, jjvv_id, estado } = req.query;
    const params = [];
    const filtros = ['1=1'];

    // Si es representante JJVV, acotar a su territorio/JJVV salvo búsqueda directa
    if (req.user.rol === 'REPRESENTANTE_JJVV' && req.user.jjvv_id && !q) {
      params.push(req.user.jjvv_id);
      filtros.push(`b.jjvv_id = $${params.length}`);
    }
    if (q) {
      params.push(`%${q.trim()}%`);
      filtros.push(`(b.numero_identificador ILIKE $${params.length} OR b.nombres ILIKE $${params.length} OR b.apellidos ILIKE $${params.length})`);
    }
    if (territorio_id) {
      params.push(territorio_id);
      filtros.push(`b.territorio_id = $${params.length}`);
    }
    if (jjvv_id) {
      params.push(jjvv_id);
      filtros.push(`b.jjvv_id = $${params.length}`);
    }
    if (estado) {
      params.push(estado);
      filtros.push(`b.estado = $${params.length}`);
    }

    const { rows } = await pgPool.query(
      `SELECT b.*, t.nombre AS territorio_nombre, j.nombre AS jjvv_nombre,
              e.id AS entrega_id, e.fecha_entrega, e.tipo_retiro, e.nombre_tutor_retira
       FROM beneficiarios b
       JOIN territorios t ON b.territorio_id = t.id
       JOIN juntas_vecinos j ON b.jjvv_id = j.id
       LEFT JOIN entregas e ON e.beneficiario_id = b.id
       WHERE ${filtros.join(' AND ')}
       ORDER BY b.creado_en DESC LIMIT 200`,
      params
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.patch('/api/beneficiarios/:id/resolver-observado', verificarToken(), autorizarRoles('SUPERVISOR_MUNI', 'SUPER_ADMIN'), async (req, res) => {
  try {
    const { nuevo_estado, resolucion_municipal } = req.body;
    if (!['VALIDADO', 'RECHAZADO'].includes(nuevo_estado)) {
      return res.status(400).json({ error: 'Estado inválido. Use VALIDADO o RECHAZADO.' });
    }
    const { rows } = await pgPool.query(
      `UPDATE beneficiarios SET estado = $1, resolucion_municipal = $2 WHERE id = $3 RETURNING *`,
      [nuevo_estado, resolucion_municipal || 'Revisado por DIDECO', req.params.id]
    );
    await registrarAuditoria(req, 'M5_GESTION_MUNICIPAL', 'RESOLUCION_DUPLICADO', {
      beneficiario_id: req.params.id,
      nuevo_estado,
      resolucion_municipal
    });
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ============================================================================
// MÓDULO 6: ENTREGA DE REGALOS EN TERRENO (QR Cédula / Retiro Subsidiario)
// ============================================================================
app.post('/api/entregas', verificarToken(), autorizarRoles('REPRESENTANTE_JJVV', 'SUPERVISOR_MUNI'), async (req, res) => {
  try {
    const {
      beneficiario_id,
      tipo_retiro,
      rut_tutor_retira,
      nombre_tutor_retira,
      metodo_verificacion,
      observacion_custodia
    } = req.body;

    const benRes = await pgPool.query('SELECT * FROM beneficiarios WHERE id = $1', [beneficiario_id]);
    const ben = benRes.rows[0];
    if (!ben) return res.status(404).json({ error: 'Beneficiario no encontrado.' });
    if (ben.estado === 'RECHAZADO') {
      return res.status(400).json({ error: 'No se puede entregar regalo a un registro RECHAZADO por duplicidad.' });
    }

    // Bloqueo de entrega duplicada en la campaña
    const entregaPrevia = await pgPool.query(
      'SELECT id, fecha_entrega FROM entregas WHERE campana_id = $1 AND beneficiario_id = $2',
      [ben.campana_id, ben.id]
    );
    if (entregaPrevia.rows.length > 0) {
      return res.status(409).json({
        error: 'ENTREGA_DUPLICADA_BLOQUEADA',
        mensaje: `Este beneficiario ya recibió su regalo el ${new Date(entregaPrevia.rows[0].fecha_entrega).toLocaleString('es-CL')}.`
      });
    }

    let rutNormalizado = null;
    if (tipo_retiro === 'TUTOR_CEDULA') {
      if (!validarRutChileno(rut_tutor_retira)) {
        return res.status(400).json({ error: 'Debe escanear o ingresar un RUN válido de la cédula del tutor.' });
      }
      rutNormalizado = formatearRut(rut_tutor_retira);
    } else if (tipo_retiro === 'SUBSIDIARIO_JJVV') {
      if (!observacion_custodia || observacion_custodia.trim().length < 15) {
        return res.status(400).json({ error: 'El Retiro Subsidiario exige una observación fundamentada obligatoria (mín. 15 caracteres).' });
      }
    } else {
      return res.status(400).json({ error: 'Tipo de retiro inválido.' });
    }

    const { rows } = await pgPool.query(
      `INSERT INTO entregas (
        campana_id, beneficiario_id, territorio_id, jjvv_id, tipo_retiro,
        rut_tutor_retira, nombre_tutor_retira, metodo_verificacion, observacion_custodia, operador_jjvv_id
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
      [
        ben.campana_id,
        ben.id,
        ben.territorio_id,
        ben.jjvv_id,
        tipo_retiro,
        rutNormalizado,
        nombre_tutor_retira.trim(),
        tipo_retiro === 'SUBSIDIARIO_JJVV' ? 'CUSTODIA_JJVV' : (metodo_verificacion || 'ESCANEO_QR'),
        tipo_retiro === 'SUBSIDIARIO_JJVV' ? observacion_custodia.trim() : null,
        req.user.id
      ]
    );

    await registrarAuditoria(req, 'M6_ENTREGA_TERRENO', `ENTREGA_${tipo_retiro}`, rows[0]);
    res.status(201).json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ============================================================================
// MÓDULO 7: REPORTES, LICITACIÓN MERCADO PÚBLICO Y RENDICIÓN EXCEL CONTRALORÍA
// ============================================================================
app.get('/api/reportes/dashboard', verificarToken(), async (req, res) => {
  try {
    const [campana, porTerritorio, porEdadSexo] = await Promise.all([
      pgPool.query('SELECT * FROM campanas WHERE activa = TRUE LIMIT 1'),
      pgPool.query(`
        SELECT t.id, t.numero, t.nombre, t.stock_asignado,
               COUNT(DISTINCT b.id)::int AS inscritos,
               COUNT(DISTINCT b.id) FILTER (WHERE b.estado = 'OBSERVADO')::int AS observados,
               COUNT(DISTINCT e.id)::int AS entregados,
               (t.stock_asignado - COUNT(DISTINCT e.id))::int AS pendientes
        FROM territorios t
        LEFT JOIN beneficiarios b ON b.territorio_id = t.id AND b.estado != 'RECHAZADO'
        LEFT JOIN entregas e ON e.territorio_id = t.id
        GROUP BY t.id ORDER BY t.numero
      `),
      pgPool.query(`
        SELECT tramo_edad, sexo,
               COUNT(*)::int AS total_inscritos
        FROM beneficiarios
        WHERE estado != 'RECHAZADO'
        GROUP BY tramo_edad, sexo
        ORDER BY tramo_edad, sexo
      `)
    ]);

    res.json({
      campana: campana.rows[0],
      territorios: porTerritorio.rows,
      licitacion_edad_sexo: porEdadSexo.rows
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Exportación oficial a Excel (.xlsx) para gestión y rendición a Contraloría
app.get('/api/reportes/excel-contraloria', verificarToken(), autorizarRoles('SUPERVISOR_MUNI', 'SUPER_ADMIN'), async (req, res) => {
  try {
    const [territoriosRes, licitacionRes, nominaRes] = await Promise.all([
      pgPool.query(`
        SELECT t.numero AS "N° Territorio", t.nombre AS "Territorio", t.stock_asignado AS "Juguetes Asignados",
               COUNT(DISTINCT b.id)::int AS "Beneficiarios Inscritos",
               COUNT(DISTINCT b.id) FILTER (WHERE b.estado = 'OBSERVADO')::int AS "Registros Observados",
               COUNT(DISTINCT e.id)::int AS "Regalos Entregados",
               (t.stock_asignado - COUNT(DISTINCT e.id))::int AS "Saldo Pendiente"
        FROM territorios t
        LEFT JOIN beneficiarios b ON b.territorio_id = t.id AND b.estado != 'RECHAZADO'
        LEFT JOIN entregas e ON e.territorio_id = t.id
        GROUP BY t.id ORDER BY t.numero
      `),
      pgPool.query(`
        SELECT tramo_edad AS "Tramo Edad", sexo AS "Sexo", COUNT(*)::int AS "Cantidad Requerida Licitación"
        FROM beneficiarios WHERE estado != 'RECHAZADO'
        GROUP BY tramo_edad, sexo ORDER BY tramo_edad, sexo
      `),
      pgPool.query(`
        SELECT b.tipo_identificador AS "Tipo ID", b.numero_identificador AS "RUT / IPE Niño",
               b.nombres || ' ' || b.apellidos AS "Nombre Beneficiario", b.sexo AS "Sexo",
               b.edad AS "Edad", b.tramo_edad AS "Tramo", t.nombre AS "Territorio", j.nombre AS "Junta de Vecinos",
               b.estado AS "Estado Registro", COALESCE(b.justificacion_duplicidad, '') AS "Justificación Duplicidad",
               COALESCE(e.tipo_retiro, 'PENDIENTE') AS "Estado Entrega",
               COALESCE(e.rut_tutor_retira, 'CUSTODIA_JJVV') AS "RUN Quien Retira",
               COALESCE(e.nombre_tutor_retira, '') AS "Nombre Quien Retira",
               COALESCE(e.observacion_custodia, '') AS "Observación Custodia JJVV",
               e.fecha_entrega AS "Timestamp Entrega"
        FROM beneficiarios b
        JOIN territorios t ON b.territorio_id = t.id
        JOIN juntas_vecinos j ON b.jjvv_id = j.id
        LEFT JOIN entregas e ON e.beneficiario_id = b.id
        ORDER BY t.numero, j.nombre, b.apellidos
      `)
    ]);

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(territoriosRes.rows), 'Resumen_7_Territorios');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(licitacionRes.rows), 'Licitacion_Mercado_Publico');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(nominaRes.rows), 'Rendicion_Contraloria');

    const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
    await registrarAuditoria(req, 'M7_REPORTES', 'EXPORTACION_EXCEL_CONTRALORIA', { filas_nomina: nominaRes.rows.length });

    res.setHeader('Content-Disposition', 'attachment; filename="Rendicion_Beneficios_SanJoaquin_2026.xlsx"');
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.send(buffer);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/auditoria/logs', verificarToken(), autorizarRoles('SUPERVISOR_MUNI', 'SUPER_ADMIN'), async (req, res) => {
  if (mongoose.connection.readyState !== 1) {
    return res.json([]);
  }
  const logs = await AuditLog.find().sort({ timestamp: -1 }).limit(100);
  res.json(logs);
});

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => console.log(`Servidor API San Joaquín escuchando en puerto ${PORT}`));
