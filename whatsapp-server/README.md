# Servidor propio de WhatsApp (Baileys) — Sistema RRHH

Este servidor reemplaza a CallMeBot: en vez de necesitar una API Key distinta
por cada persona a la que le querés escribir, este servidor vincula **un solo
WhatsApp** (el de la empresa) y desde ahí puede mandarle mensajes a
**cualquier número**, con un solo secreto compartido.

Tiene que quedar corriendo 24/7 en un servidor con dirección pública —
no puede alojarse en la misma computadora donde corriste `clasp` ni en
Google Apps Script (Apps Script no puede correr Node.js).

## Opción recomendada: Railway (gratis para empezar, sin manejar servidores)

1. Creá una cuenta en [railway.app](https://railway.app) (podés entrar con GitHub).
2. **New Project → Deploy from GitHub repo** → elegí el repo `sistema-rrhh`.
3. En la configuración del servicio, poné el **Root Directory** en `whatsapp-server`
   (para que Railway solo despliegue esta carpeta, no todo el repo).
4. En la pestaña **Variables**, agregá:
   - `WEBHOOK_SECRET` → un valor largo y random (por ejemplo, generalo en
     [random.org/strings](https://www.random.org/strings/) o pedime que te
     genere uno).
   - `PORT` → Railway ya define esto automáticamente, no hace falta tocarlo.
5. Esperá a que termine el deploy. Andá a la pestaña **Settings → Networking**
   y generá un dominio público (botón "Generate Domain"). Vas a obtener algo
   como `https://tu-servidor.up.railway.app`.
6. Abrí en el navegador `https://tu-servidor.up.railway.app/qr` — ahí vas a
   ver el código QR. Escaneálo con el WhatsApp de la empresa: **WhatsApp →
   Configuración → Dispositivos vinculados → Vincular un dispositivo**.
7. Una vez vinculado, la página `/qr` va a decir "✅ WhatsApp ya está
   conectado". Ese servidor y ese secreto son los que vas a poner en
   **Configuración → Notificaciones por WhatsApp** dentro del Sistema RRHH.

⚠️ Railway en su plan gratuito duerme el servicio si no recibe tráfico por un
tiempo, y eso puede desconectar la sesión de WhatsApp. Para un uso real de
empresa, conviene pasar a un plan pago de Railway (unos $5/mes) o a una VPS
propia (ver abajo) para que quede siempre despierto.

## Alternativa: VPS propia (DigitalOcean, Hetzner, etc.)

Si ya tenés o preferís una VPS con Linux:

```bash
# En la VPS, con Node.js 18+ ya instalado:
git clone https://github.com/JoseAlfredoSolis/sistema-rrhh.git
cd sistema-rrhh/whatsapp-server
npm install
cp .env.example .env
nano .env   # completar WEBHOOK_SECRET

# Instalar pm2 para que el proceso quede corriendo siempre, incluso si
# la VPS se reinicia:
npm install -g pm2
pm2 start server.js --name whatsapp-rrhh
pm2 save
pm2 startup   # seguir las instrucciones que muestre para arranque automático
```

Después abrí `http://IP-DE-TU-VPS:3000/qr` en el navegador (o configurá un
dominio + certificado HTTPS con Nginx/Caddy, recomendado si vas a usarlo en
producción) y escaneá el QR igual que en la Opción 1.

## Verificar que está andando

- `GET /estado` → devuelve `{"ok":true,"estado":"conectado"}` si todo está bien.
- `GET /qr` → muestra el código QR para vincular, o confirma que ya está conectado.

## Si la sesión se desconecta

Si en algún momento desvinculás el WhatsApp desde el teléfono (o WhatsApp
cierra la sesión), el servidor te lo va a avisar en los logs. Para volver a
vincular: borrá la carpeta `auth_info_baileys` (o la variable `AUTH_DIR` que
hayas configurado) y reiniciá el servidor — te va a pedir escanear el QR de
nuevo en `/qr`.

## Seguridad

- El archivo `.env` y la carpeta `auth_info_baileys/` **nunca** deben subirse
  a git (ya están en `.gitignore`) — la carpeta de sesión equivale a tener
  acceso completo al WhatsApp vinculado.
- `WEBHOOK_SECRET` es lo único que evita que cualquiera en internet pueda
  usar tu servidor para mandar WhatsApps arbitrarios — no lo compartas ni lo
  subas a ningún lado público.
