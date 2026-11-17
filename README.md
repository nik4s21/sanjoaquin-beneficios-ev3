# Sistema Municipal de Gestión y Trazabilidad de Beneficios — Ilustre Municipalidad de San Joaquín
**Asignatura:** Proyecto Integrado (`TIHI43`) — Evaluación Sumativa N°3 (INACAP)

## 1. Arquitectura Cloud Híbrida
- **Frontend SPA:** React 18 + Vite + TailwindCSS + `html5-qrcode` (Despliegue en **Vercel**).
- **Backend API REST:** Node.js + Express + JWT + RBAC + `xlsx` (Despliegue en **Render**).
- **Base de Datos Relacional Cloud:** PostgreSQL 16 (**Supabase / Neon**) para campañas (13.500 juguetes), 7 territorios, JJVV, beneficiarios y entregas.
- **Base de Datos NoSQL Cloud:** MongoDB Atlas (`audit_logs_contraloria`) para bitácora inmutable exigida por Contraloría General de la República.

## 2. Puesta en Marcha Rápida
### Backend
1. `cd backend && npm install`
2. Copia `.env.example` a `.env` y completa `DATABASE_URL`, `MONGODB_URI` y `JWT_SECRET`.
3. Ejecuta `database/schema.sql` en tu instancia PostgreSQL y luego corre `npm run seed`.
4. Inicia con `npm run dev` (puerto `4000`).

### Frontend
1. `cd frontend && npm install`
2. Copia `.env.example` a `.env` apuntando `VITE_API_URL` a tu backend.
3. Inicia con `npm run dev` (puerto `5173`).

## 3. Credenciales Iniciales Cargadas por Seed
- **Super Admin:** `admin@sanjoaquin.cl` / `AdminSJ2026!`
- **Supervisor DIDECO:** `supervisor@sanjoaquin.cl` / `SuperSJ2026!`
- **Representante JJVV (1er Login con cambio obligatorio de clave):** `jjvv.legua@sanjoaquin.cl` / `Temp1234`
