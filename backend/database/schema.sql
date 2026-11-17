-- ============================================================================
-- SISTEMA MUNICIPAL DE GESTIÓN Y TRAZABILIDAD DE BENEFICIOS
-- Ilustre Municipalidad de San Joaquín - Proyecto Integrado TIHI43 (EV3)
-- Base de Datos Relacional Cloud (PostgreSQL 16 - Supabase / Neon)
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 1. Campañas Anuales (Meta comunal: 13.500 juguetes)
CREATE TABLE IF NOT EXISTS campanas (
    id SERIAL PRIMARY KEY,
    nombre VARCHAR(120) NOT NULL,
    anio INT UNIQUE NOT NULL,
    total_juguetes_meta INT NOT NULL DEFAULT 13500,
    fecha_inicio_inscripcion DATE NOT NULL,
    fecha_fin_inscripcion DATE NOT NULL,
    fecha_entrega_inicio DATE NOT NULL,
    activa BOOLEAN NOT NULL DEFAULT TRUE
);

-- 2. Roles Extensibles (RBAC dinámico en BD)
CREATE TABLE IF NOT EXISTS roles (
    id SERIAL PRIMARY KEY,
    codigo VARCHAR(50) UNIQUE NOT NULL,
    nombre VARCHAR(100) NOT NULL,
    descripcion TEXT,
    permisos JSONB NOT NULL DEFAULT '[]'
);

-- 3. Los 7 Territorios Oficiales de San Joaquín
CREATE TABLE IF NOT EXISTS territorios (
    id SERIAL PRIMARY KEY,
    numero INT UNIQUE NOT NULL CHECK (numero BETWEEN 1 AND 7),
    nombre VARCHAR(120) UNIQUE NOT NULL,
    stock_asignado INT NOT NULL DEFAULT 0
);

-- 4. Juntas de Vecinos (JJVV) por Territorio
CREATE TABLE IF NOT EXISTS juntas_vecinos (
    id SERIAL PRIMARY KEY,
    codigo_unidad VARCHAR(30) UNIQUE NOT NULL,
    nombre VARCHAR(150) NOT NULL,
    direccion VARCHAR(200),
    territorio_id INT NOT NULL REFERENCES territorios(id) ON DELETE RESTRICT
);

-- 5. Usuarios del Sistema (Sin autoregistro; asociados a Territorio y JJVV)
CREATE TABLE IF NOT EXISTS usuarios (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    rut VARCHAR(12) UNIQUE NOT NULL,
    nombre_completo VARCHAR(150) NOT NULL,
    email VARCHAR(150) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    rol_id INT NOT NULL REFERENCES roles(id),
    territorio_id INT REFERENCES territorios(id),
    jjvv_id INT REFERENCES juntas_vecinos(id),
    debe_cambiar_password BOOLEAN NOT NULL DEFAULT TRUE,
    activo BOOLEAN NOT NULL DEFAULT TRUE,
    creado_en TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 6. Beneficiarios (Digitalización de planillas JJVV + Identificación Dual RUT/IPE)
CREATE TABLE IF NOT EXISTS beneficiarios (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    campana_id INT NOT NULL REFERENCES campanas(id),
    tipo_identificador VARCHAR(10) NOT NULL CHECK (tipo_identificador IN ('RUT', 'IPE')),
    numero_identificador VARCHAR(20) NOT NULL,
    nombres VARCHAR(120) NOT NULL,
    apellidos VARCHAR(120) NOT NULL,
    sexo VARCHAR(10) NOT NULL CHECK (sexo IN ('NIÑO', 'NIÑA')),
    edad INT NOT NULL CHECK (edad BETWEEN 0 AND 10),
    tramo_edad VARCHAR(10) NOT NULL CHECK (tramo_edad IN ('0-3', '4-7', '8-10')),
    territorio_id INT NOT NULL REFERENCES territorios(id),
    jjvv_id INT NOT NULL REFERENCES juntas_vecinos(id),
    nombre_adulto_responsable VARCHAR(150) NOT NULL,
    rut_adulto_responsable VARCHAR(12) NOT NULL,
    origen_registro VARCHAR(30) NOT NULL DEFAULT 'JJVV' CHECK (origen_registro IN ('JJVV', 'JARDIN_INFANTIL')),
    estado VARCHAR(20) NOT NULL DEFAULT 'VALIDADO' CHECK (estado IN ('VALIDADO', 'OBSERVADO', 'RECHAZADO')),
    justificacion_duplicidad TEXT,
    resolucion_municipal TEXT,
    registrado_por UUID NOT NULL REFERENCES usuarios(id),
    creado_en TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_beneficiarios_identificador ON beneficiarios(numero_identificador);
CREATE INDEX IF NOT EXISTS idx_beneficiarios_territorio ON beneficiarios(territorio_id, jjvv_id);

-- 7. Entregas de Regalos en Terreno (Bloqueo estricto de entrega duplicada por campaña)
CREATE TABLE IF NOT EXISTS entregas (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    campana_id INT NOT NULL REFERENCES campanas(id),
    beneficiario_id UUID NOT NULL REFERENCES beneficiarios(id),
    territorio_id INT NOT NULL REFERENCES territorios(id),
    jjvv_id INT NOT NULL REFERENCES juntas_vecinos(id),
    tipo_retiro VARCHAR(25) NOT NULL CHECK (tipo_retiro IN ('TUTOR_CEDULA', 'SUBSIDIARIO_JJVV')),
    rut_tutor_retira VARCHAR(12),
    nombre_tutor_retira VARCHAR(150) NOT NULL,
    metodo_verificacion VARCHAR(25) NOT NULL CHECK (metodo_verificacion IN ('ESCANEO_QR', 'INGRESO_MANUAL', 'CUSTODIA_JJVV')),
    observacion_custodia TEXT,
    operador_jjvv_id UUID NOT NULL REFERENCES usuarios(id),
    fecha_entrega TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_entrega_unica_beneficiario_campana UNIQUE (campana_id, beneficiario_id)
);
