const jwt = require('jsonwebtoken');

const verificarToken = (permitirCambioClave = false) => (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Token de autenticación no proporcionado.' });
  }

  try {
    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // Intercepción obligatoria en el primer inicio de sesión con contraseña temporal
    if (decoded.debe_cambiar_password && !permitirCambioClave) {
      return res.status(403).json({
        error: 'CAMBIO_CLAVE_REQUERIDO',
        mensaje: 'Por seguridad, debe actualizar su contraseña temporal antes de operar en el sistema.'
      });
    }

    req.user = decoded;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Sesión inválida o expirada.' });
  }
};

const autorizarRoles = (...rolesPermitidos) => (req, res, next) => {
  if (req.user.rol === 'SUPER_ADMIN' || rolesPermitidos.includes(req.user.rol)) {
    return next();
  }
  return res.status(403).json({ error: 'Acceso denegado: su perfil RBAC no tiene permisos para esta operación.' });
};

module.exports = { verificarToken, autorizarRoles };
