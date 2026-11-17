import { useState } from 'react';
import api from '../utils/api';

export default function LoginPage({ onLoginExitoso }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [requiereCambio, setRequiereCambio] = useState(false);
  const [nuevaClave, setNuevaClave] = useState('');
  const [error, setError] = useState('');

  const handleLogin = async (e) => {
    e.preventDefault();
    setError('');
    try {
      const { data } = await api.post('/auth/login', { email, password });
      localStorage.setItem('sj_token', data.token);
      if (data.debe_cambiar_password) {
        setRequiereCambio(true);
      } else {
        onLoginExitoso(data.usuario);
      }
    } catch (err) {
      setError(err.response?.data?.error || 'Error al iniciar sesión.');
    }
  };

  const handleCambiarClave = async (e) => {
    e.preventDefault();
    setError('');
    try {
      await api.post('/auth/cambiar-clave-inicial', { nueva_password: nuevaClave });
      localStorage.removeItem('sj_token');
      setRequiereCambio(false);
      setPassword('');
      setNuevaClave('');
      alert('Contraseña actualizada con éxito. Inicie sesión con su nueva contraseña.');
    } catch (err) {
      setError(err.response?.data?.error || 'No se pudo actualizar la contraseña.');
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-950 via-indigo-900 to-slate-900 p-4">
      <div className="max-w-md w-full bg-white rounded-2xl shadow-2xl p-8 space-y-6">
        <div className="text-center space-y-1">
          <span className="inline-block px-3 py-1 text-xs font-bold tracking-wider uppercase bg-blue-100 text-blue-800 rounded-full">
            Ilustre Municipalidad de San Joaquín
          </span>
          <h1 className="text-2xl font-extrabold text-slate-900">Trazabilidad de Beneficios</h1>
          <p className="text-sm text-slate-500">Campaña Navidad — 13.500 Juguetes / 7 Territorios</p>
        </div>

        {error && <div className="p-3 text-sm bg-red-50 border border-red-200 text-red-700 rounded-lg">{error}</div>}

        {!requiereCambio ? (
          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-700">Correo Institucional / JJVV</label>
              <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)}
                placeholder="usuario@sanjoaquin.cl"
                className="mt-1 w-full border border-slate-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-600 outline-none" />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700">Contraseña</label>
              <input type="password" required value={password} onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="mt-1 w-full border border-slate-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-600 outline-none" />
            </div>
            <button type="submit" className="w-full py-2.5 bg-blue-700 hover:bg-blue-800 text-white font-semibold rounded-lg transition">
              Ingresar al Sistema
            </button>
            <p className="text-xs text-center text-slate-400">
              El autoregistro está deshabilitado. Cuentas aprovisionadas exclusivamente por DIDECO.
            </p>
          </form>
        ) : (
          <form onSubmit={handleCambiarClave} className="space-y-4 bg-amber-50 p-4 rounded-xl border border-amber-300">
            <h2 className="font-bold text-amber-900">Cambio Obligatorio de Contraseña</h2>
            <p className="text-xs text-amber-800">
              Detectamos su primer inicio de sesión con credencial temporal. Defina una nueva contraseña personal (mínimo 8 caracteres).
            </p>
            <input type="password" required minLength={8} value={nuevaClave}
              onChange={(e) => setNuevaClave(e.target.value)} placeholder="Nueva contraseña segura"
              className="w-full border border-amber-400 rounded-lg px-3 py-2 bg-white" />
            <button type="submit" className="w-full py-2.5 bg-amber-600 hover:bg-amber-700 text-white font-bold rounded-lg">
              Guardar Nueva Contraseña
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
