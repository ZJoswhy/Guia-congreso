// Funciones compartidas por la API. Los archivos que empiezan con "_" no se publican como rutas.
const crypto = require('crypto');
const { promisify } = require('util');
const pbkdf2 = promisify(crypto.pbkdf2);

const K = { datos: 'guia:datos', version: 'guia:version', usuarios: 'guia:usuarios', intentos: 'guia:intentos:' };
const ITERACIONES = 310000;
const DURACION_SESION = 12 * 60 * 60 * 1000; // 12 horas

class ErrorConfig extends Error {}

/* ---------- Base de datos (Upstash Redis por REST) ---------- */
function conexion() {
  const e = process.env;
  let url = e.UPSTASH_REDIS_REST_URL || e.KV_REST_API_URL;
  let token = e.UPSTASH_REDIS_REST_TOKEN || e.KV_REST_API_TOKEN;
  if (!url || !token) {
    for (const k of Object.keys(e)) {
      if (!url && /(_REST_API_URL|_REDIS_REST_URL)$/.test(k)) url = e[k];
      if (!token && /(_REST_API_TOKEN|_REDIS_REST_TOKEN)$/.test(k) && !/READ_ONLY/.test(k)) token = e[k];
    }
  }
  if (!url || !token) throw new ErrorConfig('Falta conectar la base de datos Upstash Redis al proyecto en Vercel (pestaña Storage).');
  return { url: url.replace(/\/+$/, ''), token };
}
async function llamar(ruta, cuerpo) {
  const { url, token } = conexion();
  const r = await fetch(url + ruta, {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
    body: JSON.stringify(cuerpo)
  });
  const j = await r.json().catch(() => null);
  if (!r.ok || !j) throw new Error('Base de datos: respuesta ' + r.status + (j && j.error ? ' ' + j.error : ''));
  return j;
}
async function redis(cmd) {
  const j = await llamar('', cmd);
  if (j.error) throw new Error('Base de datos: ' + j.error);
  return j.result;
}
async function redisVarios(cmds) {
  const j = await llamar('/pipeline', cmds);
  return j.map((x) => { if (x.error) throw new Error('Base de datos: ' + x.error); return x.result; });
}

/* ---------- Cuentas ---------- */
function normUsuario(s) { return String(s || '').trim().toLowerCase(); }
function usuarioValido(u) { return /^[a-z0-9._-]{3,30}$/.test(u); }
function validarClave(c) { return typeof c === 'string' && c.length >= 8 && c.length <= 200; }
function sha(s) { return crypto.createHash('sha256').update(String(s)).digest(); }
function iguales(a, b) { return crypto.timingSafeEqual(sha(a), sha(b)); }

function admin() {
  const u = normUsuario(process.env.ADMIN_USUARIO);
  const c = process.env.ADMIN_CLAVE || '';
  if (!u || c.length < 8) throw new ErrorConfig('Faltan las variables ADMIN_USUARIO y ADMIN_CLAVE (mínimo 8 caracteres) en Vercel.');
  return { usuario: u, clave: c, huella: sha('admin:' + c).toString('hex').slice(0, 12) };
}
async function leerUsuarios() {
  const t = await redis(['GET', K.usuarios]);
  try { const l = t ? JSON.parse(t) : []; return Array.isArray(l) ? l : []; } catch (e) { return []; }
}
async function guardarUsuarios(lista) { await redis(['SET', K.usuarios, JSON.stringify(lista)]); }
async function crearCuenta(usuario, clave) {
  const sal = crypto.randomBytes(16).toString('hex');
  const hash = (await pbkdf2(clave, Buffer.from(sal, 'hex'), ITERACIONES, 32, 'sha256')).toString('hex');
  return { usuario, sal, hash, iter: ITERACIONES };
}
async function comprobarCuenta(cuenta, clave) {
  const h = await pbkdf2(clave, Buffer.from(cuenta.sal, 'hex'), cuenta.iter || ITERACIONES, 32, 'sha256');
  const g = Buffer.from(cuenta.hash, 'hex');
  return g.length === h.length && crypto.timingSafeEqual(g, h);
}
async function verificarCredenciales(usuario, clave) {
  const a = admin();
  if (usuario === a.usuario) return iguales(clave, a.clave) ? { usuario, rol: 'admin', huella: a.huella } : null;
  const cuenta = (await leerUsuarios()).find((x) => x.usuario === usuario);
  if (!cuenta) { await crearCuenta('x', clave); return null; } // misma demora si el usuario no existe
  return (await comprobarCuenta(cuenta, clave)) ? { usuario, rol: 'org', huella: cuenta.hash.slice(0, 12) } : null;
}

/* ---------- Sesiones firmadas ---------- */
function secreto() {
  const s = process.env.SESION_SECRETO || '';
  if (s.length < 16) throw new ErrorConfig('Falta la variable SESION_SECRETO (mínimo 16 caracteres) en Vercel.');
  return s;
}
function firmar(cuenta) {
  const datos = Buffer.from(JSON.stringify({ u: cuenta.usuario, rol: cuenta.rol, h: cuenta.huella, exp: Date.now() + DURACION_SESION })).toString('base64url');
  return datos + '.' + crypto.createHmac('sha256', secreto()).update(datos).digest('base64url');
}
function leerToken(req) {
  const m = /^Bearer\s+(.+)$/.exec(req.headers.authorization || '');
  if (!m) return null;
  const [datos, firma] = m[1].split('.');
  if (!datos || !firma) return null;
  const esperada = crypto.createHmac('sha256', secreto()).update(datos).digest('base64url');
  if (!iguales(firma, esperada)) return null;
  try {
    const p = JSON.parse(Buffer.from(datos, 'base64url').toString('utf8'));
    return p && p.exp > Date.now() ? p : null;
  } catch (e) { return null; }
}
async function exigirSesion(req, res) {
  const p = leerToken(req);
  let valida = false;
  if (p && p.rol === 'admin') { const a = admin(); valida = p.u === a.usuario && p.h === a.huella; }
  else if (p) { const c = (await leerUsuarios()).find((x) => x.usuario === p.u); valida = !!c && c.hash.slice(0, 12) === p.h; }
  if (!valida) { res.status(401).json({ error: 'Tu sesión expiró o ya no es válida. Vuelve a entrar.' }); return null; }
  return p;
}

/* ---------- Validación del programa ---------- */
function texto(v, max) { return typeof v === 'string' ? v.slice(0, max) : ''; }
function sanearDatos(d) {
  if (!d || typeof d !== 'object' || Array.isArray(d)) return null;
  const out = {
    congreso: { nombre: texto(d.congreso && d.congreso.nombre, 120), subtitulo: texto(d.congreso && d.congreso.subtitulo, 200) },
    aviso: texto(d.aviso, 400),
    dias: [], tipos: {}, salones: {}, eventos: []
  };
  (Array.isArray(d.dias) ? d.dias : []).slice(0, 30).forEach((x) => {
    if (x && typeof x === 'object' && texto(x.id, 40)) out.dias.push({ id: texto(x.id, 40), etiqueta: texto(x.etiqueta, 60), fecha: /^\d{4}-\d{2}-\d{2}$/.test(x.fecha) ? x.fecha : '' });
  });
  Object.keys(d.tipos && typeof d.tipos === 'object' ? d.tipos : {}).slice(0, 20).forEach((k) => {
    const t = d.tipos[k] || {};
    out.tipos[texto(k, 40)] = { nombre: texto(t.nombre, 60), color: /^#[0-9a-f]{6}$/i.test(t.color) ? t.color : '#566275' };
  });
  Object.keys(d.salones && typeof d.salones === 'object' ? d.salones : {}).slice(0, 500).forEach((k) => {
    const s = d.salones[k] || {}, o = {};
    if (texto(s.nombre, 100)) o.nombre = texto(s.nombre, 100);
    if (texto(s.rotulo, 7)) o.rotulo = texto(s.rotulo, 7);
    if (Number(s.capacidad) > 0) o.capacidad = Math.min(100000, Math.round(Number(s.capacidad)));
    if (Object.keys(o).length) out.salones[texto(k, 20)] = o;
  });
  (Array.isArray(d.eventos) ? d.eventos : []).slice(0, 2000).forEach((e) => {
    if (!e || typeof e !== 'object' || !texto(e.salon, 20)) return;
    const ev = {
      id: texto(e.id, 40) || ('e' + Math.random().toString(36).slice(2)),
      salon: texto(e.salon, 20), dia: texto(e.dia, 40),
      inicio: /^\d{2}:\d{2}$/.test(e.inicio) ? e.inicio : '', fin: /^\d{2}:\d{2}$/.test(e.fin) ? e.fin : '',
      tipo: texto(e.tipo, 40), titulo: texto(e.titulo, 200), ponente: texto(e.ponente, 200), descripcion: texto(e.descripcion, 1500)
    };
    if (e.cancelada === true) ev.cancelada = true;
    out.eventos.push(ev);
  });
  return out;
}

function manejarError(res, e) {
  if (e instanceof ErrorConfig) return res.status(500).json({ error: e.message, config: true });
  console.error(e);
  res.status(500).json({ error: 'Error del servidor. Intenta de nuevo en un momento.' });
}
function ipDe(req) { return String(req.headers['x-forwarded-for'] || '').split(',')[0].trim() || 'desconocida'; }

module.exports = {
  K, redis, redisVarios, normUsuario, usuarioValido, validarClave, admin, leerUsuarios, guardarUsuarios,
  crearCuenta, verificarCredenciales, firmar, exigirSesion, sanearDatos, manejarError, ipDe
};
