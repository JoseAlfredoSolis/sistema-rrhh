/**
 * Utilidades compartidas: locks, enriquecimiento de datos, fechas.
 */

function conLock(fn) {
  var lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    return fn();
  } finally {
    lock.releaseLock();
  }
}

function estadoNormalizado(valor) {
  return String(valor || '').trim().toLowerCase();
}

function mesDeFecha(valor) {
  if (!valor) return '';
  if (valor instanceof Date) {
    return Utilities.formatDate(valor, Session.getScriptTimeZone(), 'yyyy-MM');
  }
  var s = String(valor);
  if (/^\d{4}-\d{2}/.test(s)) return s.slice(0, 7);
  var f = new Date(valor);
  if (!isNaN(f.getTime())) {
    return Utilities.formatDate(f, Session.getScriptTimeZone(), 'yyyy-MM');
  }
  return '';
}

function enriquecerConEmpleado(filas, campoId) {
  campoId = campoId || 'empleado_id';
  var nombres = mapaEmpleados();
  return (filas || []).map(function (r) {
    var copia = {};
    Object.keys(r).forEach(function (k) { copia[k] = r[k]; });
    copia.empleado_nombre = nombres[r[campoId]] || '(desconocido)';
    return copia;
  });
}

function escaparHtmlEmail(texto) {
  return String(texto == null ? '' : texto)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Neutraliza inyección de fórmulas en celdas de Sheets.
 * Prefija con apóstrofe valores que empiezan con = + - @.
 */
function sanitizarCeldaSheets(valor) {
  if (valor === null || valor === undefined) return '';
  if (typeof valor === 'number' || valor instanceof Date) return valor;
  var s = String(valor);
  if (/^[=+\-@]/.test(s)) return "'" + s;
  return s;
}

function sanitizarFilaSheets(valores) {
  return (valores || []).map(sanitizarCeldaSheets);
}
