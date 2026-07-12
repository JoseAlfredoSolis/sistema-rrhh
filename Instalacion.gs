/**
 * Instalación y autorización de Google OAuth.
 * Ejecutar desde el editor evita el diálogo web roto (error jQuery de Google).
 */

function onOpen() {
  try {
    SpreadsheetApp.getUi()
      .createMenu('Sistema RRHH')
      .addItem('Autorizar aplicación', 'autorizarSistema')
      .addItem('Ver estado de autorización', 'mostrarEstadoAutorizacion')
      .addToUi();
  } catch (e) {
    // Sin UI (proyecto independiente del editor de hojas).
  }
}

/**
 * Solicita todos los permisos del script desde el editor de Apps Script.
 * Úsalo si la web app muestra error de jQuery en createOAuthDialog.
 */
function autorizarSistema() {
  var libro = getLibro();
  PropertiesService.getScriptProperties().getProperties();
  CacheService.getScriptCache().get('rrhh-auth-probe');
  DriveApp.getRootFolder().getName();
  MailApp.getRemainingDailyQuota();
  ScriptApp.getProjectTriggers();
  libro.getSheets()[0].getName();
  return {
    ok: true,
    mensaje: 'Permisos concedidos. Vuelve a abrir la URL de la web app.'
  };
}

function mostrarEstadoAutorizacion() {
  var estado = estadoAutorizacionGoogle();
  var ui = SpreadsheetApp.getUi();
  if (estado.autorizado) {
    ui.alert('Sistema RRHH', 'La aplicación ya tiene permisos de Google.', ui.ButtonSet.OK);
    return;
  }
  ui.alert(
    'Sistema RRHH',
    'Faltan permisos.\n\nEjecuta "Autorizar aplicación" en el menú Sistema RRHH ' +
    'o corre la función autorizarSistema() desde el editor.',
    ui.ButtonSet.OK
  );
}

/**
 * Estado OAuth para la web app (Configuración).
 */
function estadoAutorizacionGoogle() {
  var auth = ScriptApp.getAuthorizationInfo(ScriptApp.AuthMode.FULL);
  var requiere = auth.getAuthorizationStatus() === ScriptApp.AuthorizationStatus.REQUIRED;
  return {
    autorizado: !requiere,
    requiereAuth: requiere,
    urlAutorizacion: requiere ? (auth.getAuthorizationUrl() || '') : ''
  };
}

/**
 * Avisa por correo que hay una nueva implementación publicada. Se ejecuta a
 * mano (`clasp run notificarNuevaImplementacion`) justo después de cada
 * `clasp deploy`, nunca automáticamente desde la web app.
 * @param {string} urlExec  URL pública del web app (termina en /exec).
 * @param {string} [notas]  Resumen breve de qué cambió en este deploy.
 */
function notificarNuevaImplementacion(urlExec, notas) {
  var destinatarios = ['jose.solisa@gmail.com', 'k.gamboa.calero@gmail.com'];
  var asunto = 'Sistema RRHH — nueva implementación disponible';
  var cuerpo = 'Se publicó una nueva implementación del Sistema RRHH.\n\n' +
    'URL: ' + urlExec + '\n' +
    (notas ? '\nCambios: ' + notas + '\n' : '') +
    '\nFecha: ' + Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'dd/MM/yyyy HH:mm');
  destinatarios.forEach(function (to) {
    MailApp.sendEmail({ to: to, subject: asunto, body: cuerpo, name: 'Sistema RRHH' });
  });
}
