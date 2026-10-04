// GET: lista de organizadores.  POST: agregar (solo admin).  DELETE ?u=: quitar (solo admin).
// PATCH { clave }: cambiar la contraseña propia.
const { normUsuario, usuarioValido, validarClave, admin, leerUsuarios, guardarUsuarios, crearCuenta, firmar, exigirSesion, manejarError } = require('./_lib');
const MSJ_USUARIO = 'El usuario debe tener de 3 a 30 caracteres: letras, números, punto, guion o guion bajo.';
const MSJ_CLAVE = 'La contraseña debe tener al menos 8 caracteres.';

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  try {
    const ses = await exigirSesion(req, res); if (!ses) return;
    const a = admin();
    const lista = await leerUsuarios();
    const cuerpo = req.body || {};

    if (req.method === 'GET') {
      return res.status(200).json({ admin: a.usuario, usuarios: lista.map((x) => x.usuario), yo: ses.u, rol: ses.rol });
    }
    if (req.method === 'POST') {
      if (ses.rol !== 'admin') return res.status(403).json({ error: 'Solo la cuenta administradora puede agregar organizadores.' });
      const u = normUsuario(cuerpo.usuario), c = cuerpo.clave;
      if (!usuarioValido(u)) return res.status(400).json({ error: MSJ_USUARIO });
      if (!validarClave(c)) return res.status(400).json({ error: MSJ_CLAVE });
      if (u === a.usuario || lista.some((x) => x.usuario === u)) return res.status(409).json({ error: 'Ese usuario ya existe.' });
      if (lista.length >= 50) return res.status(400).json({ error: 'Se alcanzó el máximo de 50 organizadores.' });
      await guardarUsuarios(lista.concat([await crearCuenta(u, c)]));
      return res.status(201).json({ ok: true });
    }
    if (req.method === 'DELETE') {
      if (ses.rol !== 'admin') return res.status(403).json({ error: 'Solo la cuenta administradora puede quitar organizadores.' });
      const u = normUsuario(req.query && req.query.u);
      if (!lista.some((x) => x.usuario === u)) return res.status(404).json({ error: 'Ese organizador no existe.' });
      await guardarUsuarios(lista.filter((x) => x.usuario !== u));
      return res.status(200).json({ ok: true });
    }
    if (req.method === 'PATCH') {
      if (ses.rol === 'admin') return res.status(400).json({ error: 'La contraseña del administrador se cambia en la variable ADMIN_CLAVE de Vercel.' });
      if (!validarClave(cuerpo.clave)) return res.status(400).json({ error: MSJ_CLAVE });
      const nueva = await crearCuenta(ses.u, cuerpo.clave);
      await guardarUsuarios(lista.map((x) => (x.usuario === ses.u ? nueva : x)));
      return res.status(200).json({ ok: true, token: firmar({ usuario: ses.u, rol: 'org', huella: nueva.hash.slice(0, 12) }) });
    }
    res.setHeader('Allow', 'GET, POST, DELETE, PATCH');
    res.status(405).json({ error: 'Método no permitido' });
  } catch (e) { manejarError(res, e); }
};
