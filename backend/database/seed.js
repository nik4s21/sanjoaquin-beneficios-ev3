require('dotenv').config();
const bcrypt = require('bcryptjs');
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL?.includes('localhost') ? false : { rejectUnauthorized: false }
});

async function seed() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // 1. Campaña 2026 (13.500 juguetes)
    await client.query(`
      INSERT INTO campanas (id, nombre, anio, total_juguetes_meta, fecha_inicio_inscripcion, fecha_fin_inscripcion, fecha_entrega_inicio, activa)
      VALUES (1, 'Campaña Navidad San Joaquín 2026', 2026, 13500, '2026-09-25', '2026-10-31', '2026-11-23', TRUE)
      ON CONFLICT (anio) DO NOTHING;
    `);

    // 2. Roles RBAC Extensibles
    const rolesData = [
      ['SUPER_ADMIN', 'Administrador Municipal TI', 'Control total del sistema, roles y parámetros', '["*"]'],
      ['SUPERVISOR_MUNI', 'Supervisor Municipal DIDECO', 'Gestión de campaña, auditoría de duplicados y reportes Contraloría', '["CREAR_USUARIO","VER_DASHBOARD","GESTIONAR_DUPLICADOS","EXPORTAR_REPORTES"]'],
      ['REPRESENTANTE_JJVV', 'Representante Junta de Vecinos', 'Inscripción territorial de beneficiarios y entrega de regalos en terreno', '["REGISTRAR_BENEFICIARIO","REGISTRAR_ENTREGA"]']
    ];
    for (const [codigo, nombre, descripcion, permisos] of rolesData) {
      await client.query(
        `INSERT INTO roles (codigo, nombre, descripcion, permisos) VALUES ($1, $2, $3, $4::jsonb) ON CONFLICT (codigo) DO NOTHING`,
        [codigo, nombre, descripcion, permisos]
      );
    }

    // 3. Los 7 Territorios de San Joaquín (Suma = 13.500 juguetes)
    const territoriosData = [
      [1, 'Territorio 1 - La Legua', 2300],
      [2, 'Territorio 2 - El Pinar', 1950],
      [3, 'Territorio 3 - Germán Riesco', 1850],
      [4, 'Territorio 4 - Carmen Mena', 1900],
      [5, 'Territorio 5 - Las Industrias', 1750],
      [6, 'Territorio 6 - Carlos Valdovinos', 1800],
      [7, 'Territorio 7 - Vicuña Mackenna', 1950]
    ];
    for (const [numero, nombre, stock] of territoriosData) {
      await client.query(
        `INSERT INTO territorios (numero, nombre, stock_asignado) VALUES ($1, $2, $3) ON CONFLICT (numero) DO NOTHING`,
        [numero, nombre, stock]
      );
    }

    // 4. Juntas de Vecinos (JJVV) asociadas a territorios
    const jjvvData = [
      ['JJVV-T1-01', 'JJVV La Legua Emergencia', 'Pasaje 4 #3120', 1],
      ['JJVV-T1-02', 'JJVV Nueva Legua', 'Av. Santa Rosa #4210', 1],
      ['JJVV-T2-01', 'JJVV Villa El Pinar', 'Calle El Pinar #510', 2],
      ['JJVV-T3-01', 'JJVV Germán Riesco', 'Av. Las Industrias #3890', 3],
      ['JJVV-T4-01', 'JJVV Carmen Mena', 'Carmen Mena #1120', 4],
      ['JJVV-T5-01', 'JJVV Población Las Industrias', 'Haydn #450', 5],
      ['JJVV-T6-01', 'JJVV Carlos Valdovinos', 'Carlos Valdovinos #1480', 6],
      ['JJVV-T7-01', 'JJVV Vicuña Mackenna Oriente', 'Av. Vicuña Mackenna #3650', 7]
    ];
    for (const [cod, nom, dir, tNum] of jjvvData) {
      await client.query(
        `INSERT INTO juntas_vecinos (codigo_unidad, nombre, direccion, territorio_id)
         SELECT $1, $2, $3, id FROM territorios WHERE numero = $4 ON CONFLICT (codigo_unidad) DO NOTHING`,
        [cod, nom, dir, tNum]
      );
    }

    // 5. Usuarios de Prueba (Admin, Supervisor y Representante JJVV con clave temporal)
    const passAdmin = await bcrypt.hash('AdminSJ2026!', 10);
    const passSuper = await bcrypt.hash('SuperSJ2026!', 10);
    const passTemp = await bcrypt.hash('Temp1234', 10);

    await client.query(`
      INSERT INTO usuarios (rut, nombre_completo, email, password_hash, rol_id, territorio_id, jjvv_id, debe_cambiar_password)
      VALUES
        ('11.111.111-1', 'Administrador TI San Joaquín', 'admin@sanjoaquin.cl', $1, (SELECT id FROM roles WHERE codigo='SUPER_ADMIN'), NULL, NULL, FALSE),
        ('12.222.222-2', 'Salomé Fuentes (DIDECO)', 'supervisor@sanjoaquin.cl', $2, (SELECT id FROM roles WHERE codigo='SUPERVISOR_MUNI'), NULL, NULL, FALSE),
        ('14.333.333-3', 'Dirigente JJVV La Legua', 'jjvv.legua@sanjoaquin.cl', $3, (SELECT id FROM roles WHERE codigo='REPRESENTANTE_JJVV'), (SELECT id FROM territorios WHERE numero=1), (SELECT id FROM juntas_vecinos WHERE codigo_unidad='JJVV-T1-01'), TRUE)
      ON CONFLICT (email) DO NOTHING;
    `, [passAdmin, passSuper, passTemp]);

    await client.query('COMMIT');
    console.log('Seed ejecutado correctamente: 13.500 juguetes distribuidos en 7 territorios y usuarios creados.');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Error en seed:', err);
  } finally {
    client.release();
    await pool.end();
  }
}

seed();
