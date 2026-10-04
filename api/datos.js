// GET: programa público.  PUT: guardar el programa (requiere sesión de organizador).
const { K, redis, redisVarios, exigirSesion, sanearDatos, manejarError } = require('./_lib');

// Guarda solo si nadie más guardó antes (control de versión atómico).
const GUARDAR = "local v = redis.call('GET', KEYS[2]) or '0' " +
  "if v ~= ARGV[1] then return {0, v} end " +
  "local nv = tostring(tonumber(v) + 1) " +
  "redis.call('SET', KEYS[1], ARGV[2]) redis.call('SET', KEYS[2], nv) " +
  "return {1, nv}";

module.exports = async (req, res) => {
  try {
    if (req.method === 'GET') {
      const [txt, ver] = await redisVarios([['GET', K.datos], ['GET', K.version]]);
      res.setHeader('Cache-Control', req.query && req.query.fresco ? 'no-store' : 'public, max-age=0, s-maxage=10');
      let datos = null;
      try { datos = txt ? JSON.parse(txt) : null; } catch (e) { datos = null; }
      return res.status(200).json({ datos, version: Number(ver || 0) });
    }
    if (req.method === 'PUT') {
      res.setHeader('Cache-Control', 'no-store');
      const ses = await exigirSesion(req, res); if (!ses) return;
      const cuerpo = req.body || {};
      const limpio = sanearDatos(cuerpo.datos);
      if (!limpio) return res.status(400).json({ error: 'Los datos enviados no tienen el formato correcto.' });
      const json = JSON.stringify(limpio);
      if (json.length > 800000) return res.status(413).json({ error: 'El programa es demasiado grande para guardarlo.' });
      const r = await redis(['EVAL', GUARDAR, '2', K.datos, K.version, String(Number(cuerpo.version) || 0), json]);
      if (Number(r[0]) !== 1) return res.status(409).json({ error: 'Otro organizador guardó cambios antes que tú.', version: Number(r[1]) });
      return res.status(200).json({ ok: true, version: Number(r[1]) });
    }
    res.setHeader('Allow', 'GET, PUT');
    res.status(405).json({ error: 'Método no permitido' });
  } catch (e) { manejarError(res, e); }
};
