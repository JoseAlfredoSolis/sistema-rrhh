/**
 * Servidor propio de WhatsApp para el Sistema RRHH, usando Baileys.
 *
 * A diferencia de CallMeBot (que solo permite mandar mensajes al número que
 * activó la API Key), este servidor vincula el WhatsApp de la empresa una
 * sola vez (escaneando un código QR) y desde ahí puede enviar mensajes a
 * CUALQUIER número, con una sola credencial compartida.
 *
 * Google Apps Script (Code.gs) llama al endpoint POST /enviar de este
 * servidor en vez de llamar directamente a CallMeBot.
 *
 * IMPORTANTE: este proceso tiene que quedar corriendo 24/7 en un servidor
 * con IP/dominio público (una VPS, Railway, Render, etc.) — Apps Script no
 * puede alcanzar un servidor que esté solo en tu computadora apagada. Ver
 * README.md de esta carpeta para instrucciones de despliegue.
 */

const express = require('express');
const pino = require('pino');
const qrcodeTerminal = require('qrcode-terminal');
const qrcode = require('qrcode');
const {
  default: makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion
} = require('@whiskeysockets/baileys');

const PORT = process.env.PORT || 3000;
const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET || '';
const AUTH_DIR = process.env.AUTH_DIR || './auth_info_baileys';

if (!WEBHOOK_SECRET) {
  console.error('❌ Falta la variable de entorno WEBHOOK_SECRET. Definila antes de arrancar el servidor.');
  console.error('   Es el "secreto compartido" que Apps Script debe enviar para poder usar este servidor.');
  process.exit(1);
}

const logger = pino({ level: process.env.LOG_LEVEL || 'warn' });

let sock = null;
let ultimoEstadoConexion = 'iniciando'; // 'iniciando' | 'esperando_qr' | 'conectado' | 'desconectado'
let ultimoQR = null;

async function iniciarWhatsApp() {
  const { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR);
  const { version } = await fetchLatestBaileysVersion();

  sock = makeWASocket({
    version,
    auth: state,
    logger,
    printQRInTerminal: false // lo manejamos nosotros abajo para loguear con más contexto
  });

  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('connection.update', (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      ultimoEstadoConexion = 'esperando_qr';
      ultimoQR = qr;
      console.log('\n📱 Escaneá este código QR con WhatsApp (el número de la empresa) → Dispositivos vinculados → Vincular un dispositivo:\n');
      qrcodeTerminal.generate(qr, { small: true });
    }

    if (connection === 'open') {
      ultimoEstadoConexion = 'conectado';
      ultimoQR = null;
      console.log('✅ WhatsApp conectado correctamente.');
    }

    if (connection === 'close') {
      ultimoEstadoConexion = 'desconectado';
      const motivo = lastDisconnect && lastDisconnect.error && lastDisconnect.error.output
        ? lastDisconnect.error.output.statusCode
        : null;
      const cerroSesion = motivo === DisconnectReason.loggedOut;

      if (cerroSesion) {
        console.error('❌ La sesión de WhatsApp fue cerrada desde el teléfono (vinculación revocada).');
        console.error('   Borrá la carpeta ' + AUTH_DIR + ' y reiniciá el servidor para volver a vincular con un QR nuevo.');
      } else {
        console.warn('⚠️ Conexión perdida, reintentando en 5 segundos... (motivo: ' + motivo + ')');
        setTimeout(iniciarWhatsApp, 5000);
      }
    }
  });
}

iniciarWhatsApp().catch((err) => {
  console.error('Error iniciando la conexión de WhatsApp:', err);
  process.exit(1);
});

// ── Servidor HTTP ─────────────────────────────────────────────────

const app = express();
app.use(express.json());

function requiereSecreto(req, res, next) {
  const auth = req.get('Authorization') || '';
  const token = auth.replace(/^Bearer\s+/i, '').trim();
  if (token !== WEBHOOK_SECRET) {
    return res.status(401).json({ ok: false, mensaje: 'Secreto inválido o faltante.' });
  }
  next();
}

/** Normaliza un teléfono a JID de WhatsApp (<código país><número>@s.whatsapp.net). */
function telefonoAJid(telefono) {
  const soloDigitos = String(telefono || '').replace(/\D/g, '');
  return soloDigitos + '@s.whatsapp.net';
}

app.get('/estado', (req, res) => {
  res.json({ ok: true, estado: ultimoEstadoConexion, esperandoQR: !!ultimoQR });
});

/**
 * Página simple para escanear el QR desde el navegador — más confiable que
 * leer el QR en ASCII desde los logs de un proveedor de hosting (Railway,
 * Render, etc. a veces no lo renderizan bien). Se refresca sola cada 3s
 * hasta que la conexión quede lista.
 */
app.get('/qr', async (req, res) => {
  res.set('Content-Type', 'text/html; charset=utf-8');
  if (ultimoEstadoConexion === 'conectado') {
    return res.send('<h2>✅ WhatsApp ya está conectado.</h2><p>No hace falta escanear nada.</p>');
  }
  if (!ultimoQR) {
    return res.send('<h2>⏳ Generando código QR...</h2><meta http-equiv="refresh" content="3">');
  }
  const dataUrl = await qrcode.toDataURL(ultimoQR, { width: 320 });
  res.send(
    '<html><body style="font-family:sans-serif;text-align:center;padding:40px">' +
    '<h2>📱 Escaneá este código con WhatsApp</h2>' +
    '<p>En el teléfono de la empresa: WhatsApp → Dispositivos vinculados → Vincular un dispositivo.</p>' +
    '<img src="' + dataUrl + '" alt="Código QR" style="border:8px solid #eee;border-radius:8px">' +
    '<p style="color:#888;font-size:13px">Esta página se actualiza sola cada 5 segundos.</p>' +
    '<meta http-equiv="refresh" content="5">' +
    '</body></html>'
  );
});

app.post('/enviar', requiereSecreto, async (req, res) => {
  try {
    if (ultimoEstadoConexion !== 'conectado' || !sock) {
      return res.status(503).json({
        ok: false,
        mensaje: 'El servidor de WhatsApp no está conectado todavía (estado: ' + ultimoEstadoConexion + '). Escaneá el QR primero.'
      });
    }

    const { telefono, mensaje } = req.body || {};
    if (!telefono || !mensaje) {
      return res.status(400).json({ ok: false, mensaje: 'Faltan los campos "telefono" y/o "mensaje".' });
    }

    const jid = telefonoAJid(telefono);

    // Confirma que el número tiene WhatsApp antes de intentar mandarle nada
    // (evita errores confusos si el destinatario no existe en WhatsApp).
    const [resultado] = await sock.onWhatsApp(jid);
    if (!resultado || !resultado.exists) {
      return res.status(422).json({ ok: false, mensaje: 'El número ' + telefono + ' no tiene WhatsApp activo.' });
    }

    await sock.sendMessage(resultado.jid, { text: String(mensaje) });
    res.json({ ok: true, mensaje: 'Mensaje enviado a ' + telefono + '.' });
  } catch (err) {
    console.error('Error enviando mensaje:', err);
    res.status(500).json({ ok: false, mensaje: 'Error interno: ' + err.message });
  }
});

app.listen(PORT, () => {
  console.log('🚀 Servidor de WhatsApp escuchando en el puerto ' + PORT);
});
