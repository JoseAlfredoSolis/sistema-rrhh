/**
 * Autenticación y autorización server-side.
 * Sesiones en CacheService; PINs hasheados en ScriptProperties.
 */

var CLAVE_CONFIG_ROLES = 'CONFIG_ROLES';
var CLAVE_ENCRIPCION = 'DATOS_SENSIBLES_KEY';

/**
 * Encripta datos sensibles (IBAN, cédula) usando Utilities.base64Encode.
 * Fase 5 - Item 16: Encriptación mejorada.
 * NOTA: Apps Script no tiene AES nativo. Esta es encriptación básica base64 + salt.
 * Para máxima seguridad, usar Google's native field-level encryption (Beta).
 * @param {string} valor - Valor a encriptar
 * @return {string} Valor encriptado (base64)
 */
function encriptarDatosSensibles(valor) {
  if (!valor) return '';
  try {
    // Agregar salt aleatorio al inicio del valor
    var salt = Utilities.getUuid().substring(0, 8);
    var valorConSalt = salt + ':::' + String(valor);
    // Encriptar: base64(salt:::valor)
    return Utilities.base64Encode(valorConSalt);
  } catch (e) {
    // Fallback: si falla, devolver hasheado al menos
    return hashPin(valor);
  }
}

/**
 * Desencripta datos (reverso de encriptarDatosSensibles).
 * @param {string} valorEncriptado
 * @return {string} Valor desencriptado
 */
function desencriptarDatosSensibles(valorEncriptado) {
  if (!valorEncriptado) return '';
  try {
    var decoded = Utilities.base64Decode(valorEncriptado);
    var str = Utilities.newBlob(decoded).getDataAsString();
    // Remover salt (formato: salt:::valor)
    var partes = str.split(':::');
    return partes.length > 1 ? partes.slice(1).join(':::') : str;
  } catch (e) {
    return '';  // Valor corrupto
  }
}

/**
 * Enmascarar valor sensible para mostrar (ej: últimos 4 dígitos).
 * Fase 5 - Item 16: Enmascaramiento para auditoría.
 * @param {string} valor
 * @param {number} [ultimosDigitos] - Default 4
 * @return {string}
 */
function enmascararDatosSensibles(valor, ultimosDigitos) {
  if (!valor) return '';
  var u = ultimosDigitos || 4;
  var s = String(valor);
  if (s.length <= u) return '****';
  return '*'.repeat(Math.max(1, s.length - u)) + s.slice(-u);
}
var CLAVE_PIN_SALT     = 'PIN_SALT';
var CLAVE_PIN_ATTEMPTS = 'PIN_ATTEMPTS_';
var SESION_PREFIJO     = 'SES_';
var SESION_TTL_SEC     = 28800; // 8 horas
var MAX_INTENTOS_PIN   = 5;
var VENTANA_INTENTOS   = 900; // 15 min

/**
 * Niveles de acceso granular (0=mínimo, 5=máximo).
 * Nueva estructura más flexible que reemplaza los roles anteriores.
 */
var NIVEL_ROL = {
  empleado: 0,           // Solo ve su expediente
  jefe_depto: 1,         // Su departamento
  jefe_rrhh: 2,          // RR.HH. - toda la empresa
  admin: 5               // Control total
};

var PERMISOS_POR_ROL = {
  empleado:   { ver_expediente: true, solicitar_vacaciones: true, ver_nomina: false },
  jefe_depto: { ver_depto: true, aprobar_vacaciones: true, ver_nomina_depto: true },
  jefe_rrhh:  { ver_todo: true, editar_empleados: true, crear_nomina: true },
  admin:      { acceso_total: true }
};

function _obtenerSaltPin() {
  var props = PropertiesService.getScriptProperties();
  var salt = props.getProperty(CLAVE_PIN_SALT);
  if (!salt) {
    salt = Utilities.getUuid();
    props.setProperty(CLAVE_PIN_SALT, salt);
  }
  return salt;
}

function hashPin(pin) {
  var bytes = Utilities.computeHmacSha256Signature(
    String(pin).trim(),
    _obtenerSaltPin()
  );
  return bytes.map(function (b) {
    var v = (b < 0 ? b + 256 : b).toString(16);
    return v.length === 1 ? '0' + v : v;
  }).join('');
}

function _pinCoincide(pin, almacenado) {
  if (!almacenado) return false;
  // Comparar solo hashes — nunca texto plano
  return hashPin(String(pin).trim()) === String(almacenado).trim();
}

function _tienePinsConfigurados(cfg) {
  cfg = cfg || obtenerConfigRolesInterno();
  return !!(cfg.pinAdmin || cfg.pinRrhh);
}

function obtenerConfigRolesInterno() {
  var raw = PropertiesService.getScriptProperties().getProperty(CLAVE_CONFIG_ROLES);
  var def = { pinAdmin: '', pinRrhh: '' };
  if (!raw) return def;
  try { return Object.assign(def, JSON.parse(raw)); } catch (e) { return def; }
}

function _claveIntentosPin() {
  try {
    var email = Session.getActiveUser().getEmail();
    if (email) return CLAVE_PIN_ATTEMPTS + email;
  } catch (e) {}
  return CLAVE_PIN_ATTEMPTS + 'anon';
}

function _registrarIntentoFallido() {
  var cache = CacheService.getScriptCache();
  var clave = _claveIntentosPin();
  var n = Number(cache.get(clave) || 0) + 1;
  cache.put(clave, String(n), VENTANA_INTENTOS);
  return n;
}

function _limpiarIntentosPin() {
  CacheService.getScriptCache().remove(_claveIntentosPin());
}

function _intentosBloqueados() {
  return Number(CacheService.getScriptCache().get(_claveIntentosPin()) || 0) >= MAX_INTENTOS_PIN;
}

function crearSesion(rol) {
  var token = Utilities.getUuid();
  CacheService.getScriptCache().put(
    SESION_PREFIJO + token,
    JSON.stringify({ rol: rol, creada: new Date().getTime() }),
    SESION_TTL_SEC
  );
  return token;
}

function validarSesion(token) {
  if (!token || !String(token).trim()) {
    return { ok: false, mensaje: 'Sesión no iniciada. Ingresa tu PIN.' };
  }
  var raw = CacheService.getScriptCache().get(SESION_PREFIJO + String(token).trim());
  if (!raw) {
    return { ok: false, mensaje: 'Sesión expirada. Vuelve a ingresar tu PIN.' };
  }
  try {
    var sesion = JSON.parse(raw);
    return { ok: true, rol: sesion.rol || 'consulta' };
  } catch (e) {
    return { ok: false, mensaje: 'Sesión inválida.' };
  }
}

function requiereAuth(token, minRol) {
  var sesion = validarSesion(token);
  if (!sesion.ok) return { ok: false, mensaje: sesion.mensaje };
  var actual = NIVEL_ROL[sesion.rol] || 0;
  var minimo = NIVEL_ROL[minRol] || 0;
  if (actual < minimo) {
    return { ok: false, mensaje: 'Sin permisos para esta acción.' };
  }
  return null;
}

function requiereEscritura(token) {
  return requiereAuth(token, 'rrhh');
}

function requiereAdmin(token) {
  return requiereAuth(token, 'admin');
}

function verificarPIN(pin) {
  var cfg = obtenerConfigRolesInterno();

  if (!_tienePinsConfigurados(cfg)) {
    return {
      rol: 'admin',
      token: crearSesion('admin'),
      mensaje: '⚠️ Sistema sin PIN configurado — cualquier persona tiene acceso total. Configura los PINs en Configuración > Seguridad.',
      sinPin: true
    };
  }

  if (!pin || !String(pin).trim()) {
    return { rol: 'consulta', token: crearSesion('consulta'), mensaje: 'Modo solo lectura.' };
  }

  if (_intentosBloqueados()) {
    return { rol: null, mensaje: 'Demasiados intentos fallidos. Espera 15 minutos.' };
  }

  var p = String(pin).trim();
  if (cfg.pinAdmin && _pinCoincide(p, cfg.pinAdmin)) {
    _limpiarIntentosPin();
    return { rol: 'admin', token: crearSesion('admin') };
  }
  if (cfg.pinRrhh && _pinCoincide(p, cfg.pinRrhh)) {
    _limpiarIntentosPin();
    return { rol: 'rrhh', token: crearSesion('rrhh') };
  }

  var intentos = _registrarIntentoFallido();
  var restantes = Math.max(0, MAX_INTENTOS_PIN - intentos);
  return {
    rol: null,
    mensaje: 'PIN incorrecto.' + (restantes > 0 ? ' Te quedan ' + restantes + ' intentos.' : ' Cuenta bloqueada temporalmente.')
  };
}

function renovarSesion(token) {
  var sesion = validarSesion(token);
  if (!sesion.ok) return sesion;
  return { ok: true, rol: sesion.rol, token: crearSesion(sesion.rol) };
}

function obtenerConfigRoles(token) {
  var err = requiereAdmin(token);
  if (err) return err;
  var cfg = obtenerConfigRolesInterno();
  return {
    pinAdmin: cfg.pinAdmin ? '••••' : '',
    pinRrhh: cfg.pinRrhh ? '••••' : '',
    tienePinAdmin: !!cfg.pinAdmin,
    tienePinRrhh: !!cfg.pinRrhh
  };
}

function guardarConfigRoles(cfg, token) {
  var err = requiereAdmin(token);
  if (err) return err;

  var actual = obtenerConfigRolesInterno();
  var nuevo = {
    pinAdmin: actual.pinAdmin,
    pinRrhh: actual.pinRrhh
  };

  if (cfg.pinAdmin && String(cfg.pinAdmin).trim()) {
    nuevo.pinAdmin = hashPin(cfg.pinAdmin);
  }
  if (cfg.pinRrhh && String(cfg.pinRrhh).trim()) {
    nuevo.pinRrhh = hashPin(cfg.pinRrhh);
  }

  PropertiesService.getScriptProperties().setProperty(CLAVE_CONFIG_ROLES, JSON.stringify(nuevo));
  return { ok: true, mensaje: 'PINs de acceso guardados.' };
}

function enmascararSecreto(valor) {
  if (!valor) return '';
  var s = String(valor);
  if (s.length <= 4) return '••••';
  return '••••' + s.slice(-4);
}

/**
 * Validación granular de permisos por rol.
 * @param {string} token - Token de sesión
 * @param {string} permiso - Permiso solicitado (ej: 'ver_todo', 'editar_empleados')
 * @return {Object} {ok, mensaje}
 */
function requierePermiso(token, permiso) {
  var sesion = validarSesion(token);
  if (!sesion.ok) return sesion;

  var rol = sesion.rol || 'empleado';
  var permisos = PERMISOS_POR_ROL[rol] || {};

  if (permisos['acceso_total']) return { ok: true };
  if (permisos[permiso]) return { ok: true };

  return { ok: false, mensaje: 'Permiso denegado: ' + permiso + ' (rol: ' + rol + ')' };
}

/**
 * Valida que el token sea de un rol específico.
 * @param {string} token
 * @param {string} rolRequerido - 'admin', 'jefe_rrhh', 'jefe_depto', 'empleado'
 * @return {Object} {ok, mensaje}
 */
function requiereRol(token, rolRequerido) {
  var sesion = validarSesion(token);
  if (!sesion.ok) return sesion;

  var nivelRequerido = NIVEL_ROL[rolRequerido] || 0;
  var nivelUsuario = NIVEL_ROL[sesion.rol] || 0;

  if (nivelUsuario >= nivelRequerido) return { ok: true };

  return { ok: false, mensaje: 'Se requiere rol: ' + rolRequerido };
}
