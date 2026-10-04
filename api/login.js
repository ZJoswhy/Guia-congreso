// POST { usuario, clave } -> { token, usuario, rol }
const { K, redis, redisVarios, normUsuario, verificarCredenciales, firmar, manejarError, ipDe } = require('./_lib');
const MAX_INTENTOS = 8, BLOQUEO_SEG = 900;

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') { res.setHeader('Allow', 'POST'); return res.status(405).json({ error: 'Método no permitido' }); }
  try {
    const cuerpo = req.body || {};
    const usuario = normUsuario(cuerpo.usuario), clave = String(cuerpo.clave || '');
    if (!usuario || !clave) return res.status(400).json({ error: 'Escribe tu usuario y tu contraseña.' });
    const llave = K.intentos + ipDe(req);
    if (Number(await redis(['GET', llave])) >= MAX_INTENTOS) {
      return res.status(429).json({ error: 'Demasiados intentos fallidos. Espera 15 minutos e intenta de nuevo.' });
    }
    const cuenta = await verificarCredenciales(usuario, clave);
    if (!cuenta) {
      await redisVarios([['INCR', llave], ['EXPIRE', llave, BLOQUEO_SEG]]);
      return res.status(401).json({ error: 'Usuario o contraseña incorrectos.' });
    }
    await redis(['DEL', llave]);
    res.status(200).json({ token: firmar(cuenta), usuario: cuenta.usuario, rol: cuenta.rol });
  } catch (e) { manejarError(res, e); }
};
