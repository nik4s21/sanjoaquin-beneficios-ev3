import { useEffect, useState } from 'react';
import api from './utils/api';
import LoginPage from './pages/LoginPage';
import ScannerQrCedula from './components/ScannerQrCedula';

export default function App() {
  const [usuario, setUsuario] = useState(null);
  const [tab, setTab] = useState('dashboard');
  const [catalogos, setCatalogos] = useState({ territorios: [], juntas_vecinos: [], roles: [], campana_activa: null });
  const [dashboard, setDashboard] = useState({ territorios: [], licitacion_edad_sexo: [] });
  const [beneficiarios, setBeneficiarios] = useState([]);
  const [logs, setLogs] = useState([]);
  const [busqueda, setBusqueda] = useState('');

  // Estado formulario inscripción (Módulo 2 y 3)
  const [formBen, setFormBen] = useState({
    tipo_identificador: 'RUT',
    numero_identificador: '',
    nombres: '',
    apellidos: '',
    sexo: 'NIÑO',
    edad: 5,
    territorio_id: '',
    jjvv_id: '',
    nombre_adulto_responsable: '',
    rut_adulto_responsable: '',
    origen_registro: 'JJVV',
    justificacion_duplicidad: ''
  });
  const [alertaDuplicado, setAlertaDuplicado] = useState(null);

  // Estado modal entrega (Módulo 6)
  const [benEntrega, setBenEntrega] = useState(null);
  const [tipoRetiro, setTipoRetiro] = useState('TUTOR_CEDULA');
  const [rutTutor, setRutTutor] = useState('');
  const [nombreTutor, setNombreTutor] = useState('');
  const [obsCustodia, setObsCustodia] = useState('');
  const [escaneandoQr, setEscaneandoQr] = useState(false);

  // Estado creación usuario (Módulo 1)
  const [formUser, setFormUser] = useState({
    rut: '', nombre_completo: '', email: '', password_temporal: 'Temp1234', rol_codigo: 'REPRESENTANTE_JJVV', territorio_id: '', jjvv_id: ''
  });

  const cargarTodo = async () => {
    try {
      const [catRes, dashRes, benRes] = await Promise.all([
        api.get('/catalogos'),
        api.get('/reportes/dashboard'),
        api.get('/beneficiarios')
      ]);
      setCatalogos(catRes.data);
      setDashboard(dashRes.data);
      setBeneficiarios(benRes.data);
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    if (usuario) {
      setTab(usuario.rol === 'REPRESENTANTE_JJVV' ? 'registro' : 'dashboard');
      cargarTodo();
    }
  }, [usuario]);

  const registrarBeneficiario = async (e) => {
    e.preventDefault();
    try {
      await api.post('/beneficiarios', formBen);
      alert('Beneficiario registrado correctamente en la base de datos municipal.');
      setAlertaDuplicado(null);
      setFormBen({ ...formBen, numero_identificador: '', nombres: '', apellidos: '', justificacion_duplicidad: '' });
      cargarTodo();
    } catch (err) {
      if (err.response?.status === 409 && err.response?.data?.requiere_justificacion) {
        setAlertaDuplicado(err.response.data.mensaje);
      } else {
        alert(err.response?.data?.error || 'Error al registrar beneficiario.');
      }
    }
  };

  const confirmarEntrega = async (e) => {
    e.preventDefault();
    try {
      await api.post('/entregas', {
        beneficiario_id: benEntrega.id,
        tipo_retiro: tipoRetiro,
        rut_tutor_retira: tipoRetiro === 'TUTOR_CEDULA' ? rutTutor : null,
        nombre_tutor_retira: nombreTutor,
        metodo_verificacion: tipoRetiro === 'TUTOR_CEDULA' ? 'ESCANEO_QR' : 'CUSTODIA_JJVV',
        observacion_custodia: tipoRetiro === 'SUBSIDIARIO_JJVV' ? obsCustodia : null
      });
      alert('Entrega de regalo confirmada y auditada para Contraloría.');
      setBenEntrega(null);
      setRutTutor('');
      setNombreTutor('');
      setObsCustodia('');
      cargarTodo();
    } catch (err) {
      alert(err.response?.data?.mensaje || err.response?.data?.error || 'Error al registrar entrega.');
    }
  };

  const descargarExcelContraloria = async () => {
    const response = await api.get('/reportes/excel-contraloria', { responseType: 'blob' });
    const url = window.URL.createObjectURL(new Blob([response.data]));
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', 'Rendicion_Beneficios_SanJoaquin_2026.xlsx');
    document.body.appendChild(link);
    link.click();
    link.remove();
  };

  const cargarLogsAuditoria = async () => {
    const { data } = await api.get('/auditoria/logs');
    setLogs(data);
  };

  const crearUsuario = async (e) => {
    e.preventDefault();
    try {
      await api.post('/usuarios', formUser);
      alert('Usuario creado exitosamente con obligación de cambio de clave en su primer ingreso.');
      setFormUser({ rut: '', nombre_completo: '', email: '', password_temporal: 'Temp1234', rol_codigo: 'REPRESENTANTE_JJVV', territorio_id: '', jjvv_id: '' });
    } catch (err) {
      alert(err.response?.data?.error || 'Error creando usuario.');
    }
  };

  if (!usuario) return <LoginPage onLoginExitoso={setUsuario} />;

  const totalAsignado = dashboard.territorios.reduce((acc, t) => acc + t.stock_asignado, 0);
  const totalInscritos = dashboard.territorios.reduce((acc, t) => acc + t.inscritos, 0);
  const totalEntregados = dashboard.territorios.reduce((acc, t) => acc + t.entregados, 0);
  const totalObservados = dashboard.territorios.reduce((acc, t) => acc + t.observados, 0);

  return (
    <div className="min-h-screen flex flex-col">
      {/* Barra Superior */}
      <header className="bg-blue-950 text-white px-6 py-4 flex flex-wrap justify-between items-center gap-4 shadow">
        <div>
          <h1 className="font-bold text-lg">Municipalidad de San Joaquín — Gestión de Beneficios</h1>
          <p className="text-xs text-blue-200">
            Usuario: {usuario.nombre_completo} ({usuario.rol}) {usuario.jjvv_nombre ? `• ${usuario.jjvv_nombre}` : ''}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {usuario.rol !== 'REPRESENTANTE_JJVV' && (
            <button onClick={() => setTab('dashboard')} className={`px-3 py-1.5 rounded text-sm font-medium ${tab === 'dashboard' ? 'bg-blue-600' : 'bg-blue-900'}`}>
              Dashboard & Licitación
            </button>
          )}
          <button onClick={() => setTab('registro')} className={`px-3 py-1.5 rounded text-sm font-medium ${tab === 'registro' ? 'bg-blue-600' : 'bg-blue-900'}`}>
            Inscripción JJVV
          </button>
          <button onClick={() => setTab('entregas')} className={`px-3 py-1.5 rounded text-sm font-medium ${tab === 'entregas' ? 'bg-blue-600' : 'bg-blue-900'}`}>
            Nómina & Entregas QR
          </button>
          {usuario.rol !== 'REPRESENTANTE_JJVV' && (
            <>
              <button onClick={() => { setTab('auditoria'); cargarLogsAuditoria(); }} className={`px-3 py-1.5 rounded text-sm font-medium ${tab === 'auditoria' ? 'bg-blue-600' : 'bg-blue-900'}`}>
                Auditoría Contraloría
              </button>
              <button onClick={() => setTab('usuarios')} className={`px-3 py-1.5 rounded text-sm font-medium ${tab === 'usuarios' ? 'bg-blue-600' : 'bg-blue-900'}`}>
                Usuarios RBAC
              </button>
            </>
          )}
          <button onClick={() => { localStorage.removeItem('sj_token'); setUsuario(null); }}
            className="px-3 py-1.5 rounded text-sm bg-red-600 hover:bg-red-700 font-medium">
            Salir
          </button>
        </div>
      </header>

      <main className="max-w-7xl w-full mx-auto p-6 space-y-6 flex-1">
        {/* TAB 1: DASHBOARD EJECUTIVO Y LICITACIÓN MERCADO PÚBLICO */}
        {tab === 'dashboard' && (
          <div className="space-y-6">
            <div className="flex flex-wrap justify-between items-center gap-4">
              <h2 className="text-xl font-bold text-slate-800">Monitor Ejecutivo Campaña Navidad (Meta: 13.500 Juguetes)</h2>
              <button onClick={descargarExcelContraloria} className="px-4 py-2 bg-emerald-700 hover:bg-emerald-800 text-white font-semibold rounded-lg shadow">
                Exportar Excel Rendición Contraloría (.xlsx)
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="bg-white p-5 rounded-xl shadow border-l-4 border-blue-600">
                <p className="text-xs uppercase text-slate-500 font-bold">Stock Comunal Asignado</p>
                <p className="text-3xl font-extrabold text-slate-900">{totalAsignado.toLocaleString('es-CL')}</p>
              </div>
              <div className="bg-white p-5 rounded-xl shadow border-l-4 border-indigo-600">
                <p className="text-xs uppercase text-slate-500 font-bold">Niños/as Inscritos</p>
                <p className="text-3xl font-extrabold text-indigo-700">{totalInscritos.toLocaleString('es-CL')}</p>
              </div>
              <div className="bg-white p-5 rounded-xl shadow border-l-4 border-emerald-600">
                <p className="text-xs uppercase text-slate-500 font-bold">Regalos Entregados</p>
                <p className="text-3xl font-extrabold text-emerald-700">{totalEntregados.toLocaleString('es-CL')}</p>
              </div>
              <div className="bg-white p-5 rounded-xl shadow border-l-4 border-amber-500">
                <p className="text-xs uppercase text-slate-500 font-bold">Duplicados Observados</p>
                <p className="text-3xl font-extrabold text-amber-600">{totalObservados}</p>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <div className="lg:col-span-2 bg-white p-5 rounded-xl shadow overflow-x-auto">
                <h3 className="font-bold text-slate-800 mb-3">Distribución por los 7 Territorios de San Joaquín</h3>
                <table className="w-full text-sm text-left">
                  <thead className="bg-slate-100 text-slate-600 uppercase text-xs">
                    <tr>
                      <th className="p-2.5">Territorio</th>
                      <th className="p-2.5">Asignados</th>
                      <th className="p-2.5">Inscritos</th>
                      <th className="p-2.5">Observados</th>
                      <th className="p-2.5">Entregados</th>
                      <th className="p-2.5">Pendientes</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {dashboard.territorios.map((t) => (
                      <tr key={t.id}>
                        <td className="p-2.5 font-medium">{t.nombre}</td>
                        <td className="p-2.5">{t.stock_asignado}</td>
                        <td className="p-2.5">{t.inscritos}</td>
                        <td className="p-2.5 text-amber-600 font-semibold">{t.observados}</td>
                        <td className="p-2.5 text-emerald-700 font-semibold">{t.entregados}</td>
                        <td className="p-2.5">{t.pendientes}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="bg-white p-5 rounded-xl shadow">
                <h3 className="font-bold text-slate-800 mb-3">Proyección Licitación Mercado Público (Edad y Sexo)</h3>
                <table className="w-full text-sm text-left">
                  <thead className="bg-slate-100 text-slate-600 uppercase text-xs">
                    <tr>
                      <th className="p-2">Tramo Edad</th>
                      <th className="p-2">Sexo</th>
                      <th className="p-2">Inscritos</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {dashboard.licitacion_edad_sexo.map((item, idx) => (
                      <tr key={idx}>
                        <td className="p-2 font-medium">{item.tramo_edad} años</td>
                        <td className="p-2">{item.sexo}</td>
                        <td className="p-2 font-bold text-indigo-700">{item.total_inscritos}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* TAB 2: REGISTRO DE BENEFICIARIOS (PLANILLA DIGITAL JJVV + DUPLICIDAD) */}
        {tab === 'registro' && (
          <div className="max-w-3xl mx-auto bg-white p-6 rounded-xl shadow space-y-5">
            <div>
              <h2 className="text-xl font-bold text-slate-900">Inscripción Territorial de Beneficiarios (Planilla Digital)</h2>
              <p className="text-sm text-slate-500">Validación automática de RUT/IPE y cruce contra nóminas de JJVV y Jardines Infantiles.</p>
            </div>

            {alertaDuplicado && (
              <div className="p-4 bg-amber-50 border-l-4 border-amber-500 rounded space-y-2">
                <p className="text-sm font-bold text-amber-900">¡Registro Previo Detectado!</p>
                <p className="text-sm text-amber-800">{alertaDuplicado}</p>
                <textarea required rows={3} placeholder="Ingrese la justificación social obligatoria para registrar en estado OBSERVADO..."
                  value={formBen.justificacion_duplicidad}
                  onChange={(e) => setFormBen({ ...formBen, justificacion_duplicidad: e.target.value })}
                  className="w-full border border-amber-400 rounded p-2 text-sm bg-white" />
              </div>
            )}

            <form onSubmit={registrarBeneficiario} className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold uppercase text-slate-600">Tipo Identificador</label>
                <select value={formBen.tipo_identificador} onChange={(e) => setFormBen({ ...formBen, tipo_identificador: e.target.value })}
                  className="mt-1 w-full border rounded-lg p-2">
                  <option value="RUT">RUT Chileno</option>
                  <option value="IPE">IPE (Identificador Provisorio Escolar)</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-bold uppercase text-slate-600">Número RUT / IPE Niño(a)</label>
                <input type="text" required placeholder="Ej: 24.510.220-4" value={formBen.numero_identificador}
                  onChange={(e) => setFormBen({ ...formBen, numero_identificador: e.target.value })}
                  className="mt-1 w-full border rounded-lg p-2" />
              </div>
              <div>
                <label className="block text-xs font-bold uppercase text-slate-600">Nombres del Niño(a)</label>
                <input type="text" required value={formBen.nombres} onChange={(e) => setFormBen({ ...formBen, nombres: e.target.value })}
                  className="mt-1 w-full border rounded-lg p-2" />
              </div>
              <div>
                <label className="block text-xs font-bold uppercase text-slate-600">Apellidos del Niño(a)</label>
                <input type="text" required value={formBen.apellidos} onChange={(e) => setFormBen({ ...formBen, apellidos: e.target.value })}
                  className="mt-1 w-full border rounded-lg p-2" />
              </div>
              <div>
                <label className="block text-xs font-bold uppercase text-slate-600">Sexo (Para Licitación)</label>
                <select value={formBen.sexo} onChange={(e) => setFormBen({ ...formBen, sexo: e.target.value })}
                  className="mt-1 w-full border rounded-lg p-2">
                  <option value="NIÑO">Niño</option>
                  <option value="NIÑA">Niña</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-bold uppercase text-slate-600">Edad (0 a 10 años)</label>
                <input type="number" min={0} max={10} required value={formBen.edad}
                  onChange={(e) => setFormBen({ ...formBen, edad: e.target.value })}
                  className="mt-1 w-full border rounded-lg p-2" />
              </div>
              <div>
                <label className="block text-xs font-bold uppercase text-slate-600">Territorio</label>
                <select required value={formBen.territorio_id} onChange={(e) => setFormBen({ ...formBen, territorio_id: e.target.value, jjvv_id: '' })}
                  className="mt-1 w-full border rounded-lg p-2">
                  <option value="">Seleccione Territorio...</option>
                  {catalogos.territorios.map((t) => <option key={t.id} value={t.id}>{t.nombre}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-bold uppercase text-slate-600">Junta de Vecinos (JJVV)</label>
                <select required value={formBen.jjvv_id} onChange={(e) => setFormBen({ ...formBen, jjvv_id: e.target.value })}
                  className="mt-1 w-full border rounded-lg p-2">
                  <option value="">Seleccione JJVV...</option>
                  {catalogos.juntas_vecinos
                    .filter((j) => !formBen.territorio_id || String(j.territorio_id) === String(formBen.territorio_id))
                    .map((j) => <option key={j.id} value={j.id}>{j.nombre}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-bold uppercase text-slate-600">Nombre Adulto Responsable</label>
                <input type="text" required value={formBen.nombre_adulto_responsable}
                  onChange={(e) => setFormBen({ ...formBen, nombre_adulto_responsable: e.target.value })}
                  className="mt-1 w-full border rounded-lg p-2" />
              </div>
              <div>
                <label className="block text-xs font-bold uppercase text-slate-600">RUT Adulto Responsable</label>
                <input type="text" required placeholder="Ej: 15.432.198-K" value={formBen.rut_adulto_responsable}
                  onChange={(e) => setFormBen({ ...formBen, rut_adulto_responsable: e.target.value })}
                  className="mt-1 w-full border rounded-lg p-2" />
              </div>
              <div className="md:col-span-2">
                <button type="submit" className="w-full py-3 bg-blue-700 hover:bg-blue-800 text-white font-bold rounded-lg">
                  {alertaDuplicado ? 'Confirmar Inscripción en Estado OBSERVADO' : 'Registrar Beneficiario en Nómina'}
                </button>
              </div>
            </form>
          </div>
        )}

        {/* TAB 3: NÓMINA Y ENTREGA DE REGALOS EN TERRENO (QR CÉDULA / SUBSIDIARIO) */}
        {tab === 'entregas' && (
          <div className="space-y-4">
            <div className="bg-white p-4 rounded-xl shadow flex flex-wrap gap-3 items-center justify-between">
              <input type="text" placeholder="Buscar por RUT, IPE o nombre del niño/a..." value={busqueda}
                onChange={(e) => setBusqueda(e.target.value)}
                className="border rounded-lg px-3 py-2 w-full sm:w-96" />
              <button onClick={async () => { const { data } = await api.get(`/beneficiarios?q=${busqueda}`); setBeneficiarios(data); }}
                className="px-4 py-2 bg-slate-800 text-white rounded-lg font-medium">
                Buscar en Padrón Comunal
              </button>
            </div>

            {benEntrega && (
              <div className="bg-white p-6 rounded-xl shadow-lg border-2 border-indigo-600 space-y-4">
                <div className="flex justify-between items-center">
                  <h3 className="font-bold text-lg text-indigo-950">
                    Registrar Entrega: {benEntrega.nombres} {benEntrega.apellidos} ({benEntrega.numero_identificador})
                  </h3>
                  <button onClick={() => setBenEntrega(null)} className="text-sm text-slate-500 hover:text-slate-800">Cancelar</button>
                </div>

                <div className="flex gap-2">
                  <button type="button" onClick={() => setTipoRetiro('TUTOR_CEDULA')}
                    className={`px-4 py-2 rounded-lg font-medium text-sm ${tipoRetiro === 'TUTOR_CEDULA' ? 'bg-indigo-700 text-white' : 'bg-slate-200'}`}>
                    Retiro por Tutor (Escaneo Cédula QR)
                  </button>
                  <button type="button" onClick={() => setTipoRetiro('SUBSIDIARIO_JJVV')}
                    className={`px-4 py-2 rounded-lg font-medium text-sm ${tipoRetiro === 'SUBSIDIARIO_JJVV' ? 'bg-amber-600 text-white' : 'bg-slate-200'}`}>
                    Retiro Subsidiario JJVV (Tutor sin RUN)
                  </button>
                </div>

                <form onSubmit={confirmarEntrega} className="space-y-4">
                  {tipoRetiro === 'TUTOR_CEDULA' ? (
                    <div className="space-y-3">
                      {!escaneandoQr ? (
                        <button type="button" onClick={() => setEscaneandoQr(true)}
                          className="px-4 py-2 bg-emerald-600 text-white rounded-lg text-sm font-semibold">
                          Activar Cámara para Escanear QR Cédula
                        </button>
                      ) : (
                        <ScannerQrCedula
                          onRutDetectado={(run) => { setRutTutor(run); setEscaneandoQr(false); }}
                          onCerrar={() => setEscaneandoQr(false)}
                        />
                      )}
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        <input type="text" required placeholder="RUN Tutor (ej: 15.432.198-K)" value={rutTutor}
                          onChange={(e) => setRutTutor(e.target.value)} className="border rounded-lg p-2" />
                        <input type="text" required placeholder="Nombre completo del Tutor que retira" value={nombreTutor}
                          onChange={(e) => setNombreTutor(e.target.value)} className="border rounded-lg p-2" />
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-3 bg-amber-50 p-4 rounded-lg border border-amber-300">
                      <p className="text-xs font-bold text-amber-900 uppercase">Custodia Subsidiaria por Representante JJVV</p>
                      <input type="text" required placeholder="Nombre del Representante JJVV Custodio" value={nombreTutor}
                        onChange={(e) => setNombreTutor(e.target.value)} className="w-full border rounded-lg p-2 bg-white" />
                      <textarea required rows={3} placeholder="Observación fundamentada obligatoria (motivo por el cual el tutor carece de RUN nacional)..."
                        value={obsCustodia} onChange={(e) => setObsCustodia(e.target.value)}
                        className="w-full border rounded-lg p-2 bg-white" />
                    </div>
                  )}

                  <button type="submit" className="w-full py-2.5 bg-emerald-700 hover:bg-emerald-800 text-white font-bold rounded-lg">
                    Confirmar Entrega y Bloquear Duplicados
                  </button>
                </form>
              </div>
            )}

            <div className="bg-white rounded-xl shadow overflow-x-auto">
              <table className="w-full text-sm text-left">
                <thead className="bg-slate-100 text-slate-600 uppercase text-xs">
                  <tr>
                    <th className="p-3">ID Niño/a</th>
                    <th className="p-3">Beneficiario</th>
                    <th className="p-3">Tramo / Sexo</th>
                    <th className="p-3">Territorio / JJVV</th>
                    <th className="p-3">Estado</th>
                    <th className="p-3">Acción</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {beneficiarios.map((b) => (
                    <tr key={b.id}>
                      <td className="p-3 font-mono font-semibold">{b.numero_identificador}</td>
                      <td className="p-3">{b.nombres} {b.apellidos}</td>
                      <td className="p-3">{b.tramo_edad} años • {b.sexo}</td>
                      <td className="p-3">{b.territorio_nombre} ({b.jjvv_nombre})</td>
                      <td className="p-3">
                        <span className={`px-2 py-0.5 rounded text-xs font-bold ${
                          b.estado === 'OBSERVADO' ? 'bg-amber-100 text-amber-800' : 'bg-blue-100 text-blue-800'
                        }`}>
                          {b.estado}
                        </span>
                      </td>
                      <td className="p-3">
                        {b.entrega_id ? (
                          <span className="px-2.5 py-1 bg-emerald-100 text-emerald-800 rounded text-xs font-bold">
                            ENTREGADO ({new Date(b.fecha_entrega).toLocaleDateString('es-CL')})
                          </span>
                        ) : (
                          <button onClick={() => { setBenEntrega(b); setNombreTutor(b.nombre_adulto_responsable); setRutTutor(b.rut_adulto_responsable); }}
                            className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded text-xs font-semibold">
                            Entregar Regalo
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* TAB 4: AUDITORÍA CONTRALORÍA (NOSQL INMUTABLE) */}
        {tab === 'auditoria' && (
          <div className="bg-white p-6 rounded-xl shadow space-y-4">
            <div className="flex justify-between items-center">
              <h2 className="text-xl font-bold">Bitácora Inmutable de Auditoría — Contraloría General de la República</h2>
              <button onClick={descargarExcelContraloria} className="px-4 py-2 bg-emerald-700 text-white rounded-lg text-sm font-semibold">
                Descargar Excel Oficial
              </button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left font-mono">
                <thead className="bg-slate-800 text-white uppercase">
                  <tr>
                    <th className="p-2.5">Timestamp (UTC)</th>
                    <th className="p-2.5">Rol</th>
                    <th className="p-2.5">Módulo</th>
                    <th className="p-2.5">Acción</th>
                    <th className="p-2.5">Detalle Trazable</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {logs.map((l) => (
                    <tr key={l._id}>
                      <td className="p-2.5">{new Date(l.timestamp).toLocaleString('es-CL')}</td>
                      <td className="p-2.5 font-bold">{l.usuario_rol}</td>
                      <td className="p-2.5">{l.modulo}</td>
                      <td className="p-2.5 text-indigo-700 font-bold">{l.accion}</td>
                      <td className="p-2.5 max-w-md truncate">{JSON.stringify(l.detalle)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* TAB 5: APROVISIONAMIENTO USUARIOS RBAC */}
        {tab === 'usuarios' && (
          <div className="max-w-2xl mx-auto bg-white p-6 rounded-xl shadow space-y-4">
            <h2 className="text-xl font-bold">Aprovisionamiento de Cuentas (Sin Autoregistro Público)</h2>
            <form onSubmit={crearUsuario} className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <input type="text" required placeholder="RUT Usuario (ej: 16.543.210-9)" value={formUser.rut}
                onChange={(e) => setFormUser({ ...formUser, rut: e.target.value })} className="border rounded-lg p-2" />
              <input type="text" required placeholder="Nombre Completo" value={formUser.nombre_completo}
                onChange={(e) => setFormUser({ ...formUser, nombre_completo: e.target.value })} className="border rounded-lg p-2" />
              <input type="email" required placeholder="Correo Electrónico" value={formUser.email}
                onChange={(e) => setFormUser({ ...formUser, email: e.target.value })} className="border rounded-lg p-2" />
              <input type="text" required placeholder="Clave Temporal (Temp1234)" value={formUser.password_temporal}
                onChange={(e) => setFormUser({ ...formUser, password_temporal: e.target.value })} className="border rounded-lg p-2" />
              <select value={formUser.rol_codigo} onChange={(e) => setFormUser({ ...formUser, rol_codigo: e.target.value })}
                className="border rounded-lg p-2">
                {catalogos.roles.map((r) => <option key={r.id} value={r.codigo}>{r.nombre} ({r.codigo})</option>)}
              </select>
              <select value={formUser.territorio_id} onChange={(e) => setFormUser({ ...formUser, territorio_id: e.target.value })}
                className="border rounded-lg p-2">
                <option value="">Territorio (Opcional Muni)...</option>
                {catalogos.territorios.map((t) => <option key={t.id} value={t.id}>{t.nombre}</option>)}
              </select>
              <select value={formUser.jjvv_id} onChange={(e) => setFormUser({ ...formUser, jjvv_id: e.target.value })}
                className="md:col-span-2 border rounded-lg p-2">
                <option value="">Junta de Vecinos Asociada...</option>
                {catalogos.juntas_vecinos.map((j) => <option key={j.id} value={j.id}>{j.nombre}</option>)}
              </select>
              <button type="submit" className="md:col-span-2 py-2.5 bg-blue-700 text-white font-bold rounded-lg">
                Crear Cuenta con Cambio Obligatorio de Clave
              </button>
            </form>
          </div>
        )}
      </main>
    </div>
  );
}
