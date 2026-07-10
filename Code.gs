/**
 * ===================================================================
 * SISTEMA DE RECURSOS HUMANOS (RRHH) - Google Apps Script
 * ===================================================================
 * Backend principal. Sirve el frontend con HtmlService y expone las
 * funciones CRUD que el frontend invoca con google.script.run.
 *
 * Base de datos: una hoja de Google Sheets con una pestaña por entidad.
 * Módulos: empleados, departamentos, asistencia, vacaciones, nómina,
 * reportes, alertas, capacitaciones, evaluaciones, préstamos, etc.
 * ===================================================================
 */

// ---- CONFIGURACIÓN GLOBAL ----------------------------------------

/**
 * Nombres de las pestañas (hojas) de la base de datos.
 * Centralizado aquí para no repetir cadenas de texto por todo el código.
 */
var HOJAS = {
  EMPLEADOS:         'Empleados',
  DEPARTAMENTOS:     'Departamentos',
  ASISTENCIA:        'Asistencia',
  VACACIONES:        'Vacaciones',
  NOMINA:            'Nomina',
  HISTORIAL_SALARIOS:'HistorialSalarios',
  CAPACITACIONES:    'Capacitaciones',
  EVALUACIONES:      'Evaluaciones',
  BITACORA:          'Bitacora',
  PRESTAMOS:         'Prestamos',
  HORAS_EXTRA:       'HorasExtra',
  ACTIVOS:           'Activos',
  TURNOS:            'Turnos',
  INCAPACIDADES:     'Incapacidades',
  FERIADOS:          'Feriados',
  LIQUIDACIONES:     'Liquidaciones',
  PERMISOS:          'Permisos',
  ERRORES:           'Errores',
  PLANTILLAS:        'Plantillas',
  COMUNICACIONES:    'Comunicaciones'
};

/**
 * Encabezados esperados por pestaña (orden = orden de las columnas).
 * Sirven para crear la hoja automáticamente si no existe.
 */
var ENCABEZADOS = {
  // Campos Empleados:
  // - cargo_critico (boolean o 'si'/'no'): marca puestos con funciones críticas (no pueden ausentarse)
  // - actividad (string): clasificación del puesto para estadísticas laborales (administrativo, operario, etc.)
  // - padre_madre (string): nombre de beneficiario o contacto de emergencia para pensión/seguro
  Empleados:         ['id', 'nombre', 'cedula', 'departamento', 'puesto', 'fecha_ingreso', 'salario', 'estado', 'fecha_nacimiento', 'telefono',
                      'correo', 'direccion', 'genero', 'estado_civil', 'nacionalidad', 'sede', 'tipo_nomina', 'cuenta_iban', 'carne_ccss',
                      'vencimiento_cedula', 'licencia_conducir', 'vencimiento_licencia', 'jefe_inmediato', 'cargo_critico', 'actividad', 'padre_madre'],
  Departamentos:     ['id', 'nombre', 'responsable'],
  Asistencia:        ['id', 'empleado_id', 'fecha', 'hora_entrada', 'hora_salida', 'horas'],
  Vacaciones:        ['id', 'empleado_id', 'fecha_inicio', 'fecha_fin', 'dias', 'estado', 'notas'],
  Nomina:            ['id', 'empleado_id', 'mes', 'salario_base', 'deducciones', 'neto'],
  HistorialSalarios: ['id', 'empleado_id', 'salario_anterior', 'salario_nuevo', 'fecha', 'notas'],
  Capacitaciones:    ['id', 'empleado_id', 'curso', 'institucion', 'fecha_inicio', 'fecha_fin', 'estado', 'certificado_url'],
  Evaluaciones:      ['id', 'empleado_id', 'periodo', 'calificacion', 'comentarios', 'evaluador', 'fecha'],
  Bitacora:          ['id', 'fecha', 'usuario', 'accion', 'entidad', 'entidad_id', 'resumen'],
  Prestamos:         ['id', 'empleado_id', 'monto', 'cuotas', 'cuota_mensual', 'cuotas_pagadas', 'estado', 'fecha', 'notas'],
  HorasExtra:        ['id', 'empleado_id', 'fecha', 'horas', 'tipo', 'aprobado', 'monto', 'notas'],
  Activos:           ['id', 'empleado_id', 'nombre', 'categoria', 'serial', 'fecha_entrega', 'fecha_devolucion', 'estado', 'notas'],
  Turnos:            ['id', 'empleado_id', 'semana', 'lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado', 'domingo'],
  Incapacidades:     ['id', 'empleado_id', 'fecha_desde', 'fecha_hasta', 'dias', 'entidad', 'especialidad', 'notas'],
  Feriados:          ['id', 'fecha', 'nombre', 'tipo'],
  Liquidaciones:     ['id', 'empleado_id', 'fecha_salida', 'motivo', 'fecha_calculo', 'monto', 'estado', 'notas'],
  Permisos:          ['id', 'empleado_id', 'tipo', 'fecha_inicio', 'fecha_fin', 'estado', 'motivo', 'notas'],
  Errores:           ['id', 'fecha', 'origen', 'mensaje', 'usuario', 'contexto'],
  Plantillas:        ['id', 'nombre', 'tipo', 'asunto', 'cuerpo'],
  Comunicaciones:    ['id', 'fecha', 'tipo', 'empleado_id', 'destinatario', 'asunto', 'cuerpo', 'estado', 'detalle', 'usuario']
};

// Columnas por posición (1-based para Sheets, 0-based _IDX para arrays).
// Derivadas de ENCABEZADOS — no cambiar a mano; agregar campos allá.
var COLS = (function () {
  function col(hoja, campo) { return ENCABEZADOS[hoja].indexOf(campo) + 1; }
  function idx(hoja, campo) { return ENCABEZADOS[hoja].indexOf(campo); }
  return {
    EMP_ESTADO:      col('Empleados',     'estado'),
    EMP_SALARIO:     col('Empleados',     'salario'),
    EMP_CEDULA:      col('Empleados',     'cedula'),
    EMP_TELEFONO:    col('Empleados',     'telefono'),
    EMP_CUENTA_IBAN: col('Empleados',     'cuenta_iban'),
    EMP_CARNE_CCSS:  col('Empleados',     'carne_ccss'),
    EMP_LICENCIA:    col('Empleados',     'licencia_conducir'),
    EMP_ESTADO_IDX:  idx('Empleados',     'estado'),
    EMP_SALARIO_IDX: idx('Empleados',     'salario'),
    VAC_ESTADO:      col('Vacaciones',    'estado'),
    LIQ_ESTADO:      col('Liquidaciones', 'estado'),
    PRM_ESTADO:      col('Permisos',      'estado')
  };
})();


// ---- PUNTO DE ENTRADA DE LA WEB APP -------------------------------

/**
 * doGet: Apps Script lo llama cuando alguien abre la URL del web app.
 * Devuelve el HTML del frontend.
 */
function doGet(e) {
  if (e && e.parameter && e.parameter.setup === 'rrhh2024') {
    try {
      var url = ScriptApp.getService().getUrl();
      // Solo funciona en una instalación nueva (sin PINs configurados todavía).
      // Antes esto permitía resetear el PIN admin a "1234" en cualquier momento
      // con solo conocer este parámetro de URL (visible en el código fuente
      // público del repo) — una puerta trasera permanente. Una vez configurados
      // los PINs, esta ruta queda inerte; para recuperar acceso perdido hay que
      // entrar al editor de Apps Script (requiere la cuenta de Google dueña del
      // proyecto) y borrar la propiedad de script CONFIG_ROLES manualmente.
      if (_tienePinsConfigurados()) {
        return HtmlService.createHtmlOutput('<body style="font-family:sans-serif;padding:40px"><h2 style="color:red">❌ Ya hay PINs configurados</h2><p>Esta ruta de instalación solo funciona en una instalación nueva sin PINs. Si perdiste el acceso de administrador, entra al editor de Apps Script de este proyecto (Extensiones → Apps Script) y borra la propiedad de script <code>CONFIG_ROLES</code> desde Configuración del proyecto → Propiedades del script.</p></body>');
      }
      // Si viene con resetHoja, limpiar el ID guardado y usar la hoja ligada
      if (e.parameter.resetHoja === '1') {
        PropertiesService.getScriptProperties().deleteProperty('SPREADSHEET_ID');
        return HtmlService.createHtmlOutput('<body style="font-family:sans-serif;padding:40px"><h2 style="color:green">✅ Conexión reseteada a hoja ligada</h2><p><a href="' + url + '?setup=rrhh2024">Verificar estado →</a></p></body>');
      }
      var props = PropertiesService.getScriptProperties();
      props.deleteProperty('PIN_SALT');
      props.deleteProperty('CONFIG_ROLES');
      props.deleteProperty('BOOTSTRAP_PIN');
      var hash = hashPin('1234');
      props.setProperty('CONFIG_ROLES', JSON.stringify({ pinAdmin: hash, pinRrhh: '' }));
      props.setProperty('BOOTSTRAP_PIN', '1234');
      var prueba = verificarPIN('1234');
      var ok = prueba && prueba.rol === 'admin';
      // Probar conexión a la hoja
      var hojaOk = false; var hojaMsg = '';
      try { getLibro(); hojaOk = true; } catch(he) { hojaMsg = he.message; }
      return HtmlService.createHtmlOutput(
        '<body style="font-family:sans-serif;padding:40px">' +
        (ok ? '<h2 style="color:green">✅ PIN Admin = 1234 configurado</h2>' : '<h2 style="color:red">❌ Error PIN</h2><pre>' + JSON.stringify(prueba) + '</pre>') +
        (hojaOk ? '<p style="color:green">✅ Conexión a la hoja OK</p>' : '<p style="color:orange">⚠️ Hoja inaccesible: ' + hojaMsg + '</p><p><a href="' + url + '?setup=rrhh2024&resetHoja=1" style="color:blue">👉 Resetear conexión a hoja ligada al proyecto</a></p>') +
        '<p><a href="' + url + '">Ir a la app →</a></p>' +
        '</body>'
      );
    } catch(err) {
      return HtmlService.createHtmlOutput('<body style="font-family:sans-serif;padding:40px"><h2 style="color:red">❌ ' + err.message + '</h2></body>');
    }
  }
  return HtmlService.createTemplateFromFile('Index')
    .evaluate()
    .setTitle('Sistema RRHH')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

/**
 * include: permite insertar el contenido de otro archivo .html
 * dentro de Index.html usando <?!= include('NombreArchivo') ?>.
 * Así separamos CSS y JS en archivos propios pero servimos un solo HTML.
 */
function include(nombreArchivo) {
  return HtmlService.createHtmlOutputFromFile(nombreArchivo).getContent();
}

/**
 * Devuelve el contenido de una librería JS embebida (Lib_*.html).
 * Se carga bajo demanda desde el cliente para no bloquear el primer render.
 */
function obtenerScriptLibreria(nombre) {
  var mapa = { chart: 'Lib_Chart', xlsx: 'Lib_Xlsx', jquery: 'Lib_Jquery', select2: 'Lib_Select2' };
  var archivo = mapa[nombre];
  if (!archivo) throw new Error('Librería no permitida: ' + nombre);
  return HtmlService.createHtmlOutputFromFile(archivo).getContent();
}


// ---- UTILIDADES REUTILIZABLES DE BASE DE DATOS --------------------

/**
 * Clave bajo la que guardamos el ID de la hoja en las propiedades del script.
 */
var CLAVE_ID_HOJA = 'SPREADSHEET_ID';

/**
 * Devuelve el libro (Spreadsheet) que usa el sistema como base de datos.
 *
 * Prioridad:
 *   1. Si en Configuración se guardó un ID de hoja, se abre por ese ID
 *      (SpreadsheetApp.openById). Útil si el proyecto NO está ligado a la hoja.
 *   2. Si no, usa la hoja a la que está ligado el proyecto (getActiveSpreadsheet).
 *
 * Lanza un error claro si no hay ninguna hoja disponible.
 */
function getLibro() {
  var id = PropertiesService.getScriptProperties().getProperty(CLAVE_ID_HOJA);
  if (id) {
    try {
      return SpreadsheetApp.openById(id);
    } catch (e) {
      throw new Error('No se pudo abrir la hoja configurada (ID: ' + id +
        '). Revisa el ID en el módulo Configuración. Detalle: ' + e.message);
    }
  }
  var activa = SpreadsheetApp.getActiveSpreadsheet();
  if (activa) return activa;
  throw new Error('No hay una hoja conectada. Ve al módulo Configuración e ' +
    'indica el ID de tu Google Sheet.');
}

/**
 * Obtiene una pestaña por nombre. Si no existe, la crea y le pone
 * la fila de encabezados correspondiente. Garantiza que siempre
 * tengamos una hoja válida con la estructura esperada.
 *
 * @param {string} nombreHoja  Nombre de la pestaña (usar la constante HOJAS).
 * @return {Sheet} la pestaña lista para usar.
 */
function getHoja(nombreHoja) {
  var libro = getLibro();
  var hoja = libro.getSheetByName(nombreHoja);

  if (!hoja) {
    hoja = libro.insertSheet(nombreHoja);
    var encabezados = ENCABEZADOS[nombreHoja];
    if (encabezados) {
      hoja.getRange(1, 1, 1, encabezados.length).setValues([encabezados]);
      hoja.setFrozenRows(1); // congela la fila de encabezados
    }
  }
  return hoja;
}

/**
 * Lee tabla con paginación (Fase 5 - Item 15).
 * Para grandes volúmenes (50k+ filas), divide en páginas.
 * Backward compatible: llamar sin offset/limit devuelve TODO (como antes).
 *
 * @param {string} nombreHoja
 * @param {number} [offset] - Fila a partir de la cual leer (0-based después de encabezados)
 * @param {number} [limit] - Máximo de filas a retornar
 * @return {Object[]} filas como objetos.
 */
function leerTabla(nombreHoja, offset, limit) {
  var hoja = getHoja(nombreHoja);
  var datos = hoja.getDataRange().getValues();

  // Si solo hay encabezados (o nada), no hay registros.
  if (datos.length < 2) {
    return [];
  }

  var encabezados = datos[0];
  var filas = [];

  // Paginación: offset y limit (Fase 5)
  var desde = (offset || 0) + 1;  // +1 porque fila 0 es encabezados
  var hasta = limit ? desde + limit : datos.length;

  for (var i = desde; i < hasta && i < datos.length; i++) {
    var obj = {};
    for (var c = 0; c < encabezados.length; c++) {
      obj[encabezados[c]] = datos[i][c];
    }
    filas.push(obj);
  }
  return filas;
}

/**
 * Cuenta total de filas en una tabla (sin encabezados).
 * Útil para paginación - saber cuántas páginas hay.
 * @param {string} nombreHoja
 * @return {number}
 */
function contarFilasTabla(nombreHoja) {
  var hoja = getHoja(nombreHoja);
  return Math.max(0, hoja.getLastRow() - 1);
}

/**
 * Genera un ID único basado en la marca de tiempo + un componente
 * aleatorio. Suficiente para un sistema interno pequeño.
 *
 * @return {string} algo como "EMP-1714501234567-482".
 */
function generarId(prefijo) {
  var marca = new Date().getTime();
  var azar = Math.floor(Math.random() * 1000);
  return (prefijo || 'ID') + '-' + marca + '-' + azar;
}

/**
 * Busca el número de fila (1-based, como en la hoja) de un registro por su id.
 * Optimizado con MATCH() de Sheets para velocidad O(log n) en lugar de O(n).
 * Devuelve -1 si no lo encuentra.
 *
 * @param {Sheet} hoja
 * @param {string} id
 * @return {number} índice de fila en la hoja, o -1.
 */
function buscarFilaPorId(hoja, id) {
  try {
    var ultimaFila = hoja.getLastRow();
    if (ultimaFila <= 1) return -1;

    // Sanitizar id para evitar inyección de fórmula
    var idSeguro = String(id).replace(/"/g, '""');
    var formula = '=IFERROR(MATCH("' + idSeguro + '",A2:A' + ultimaFila + ',0),-1)';
    var celdaTmp = hoja.getRange(ultimaFila + 2, 1);
    var resultado = celdaTmp.setFormula(formula).getValue();
    celdaTmp.clearContent();

    if (resultado === -1) return -1;
    return resultado + 1;
  } catch (e) {
    var datos = hoja.getDataRange().getValues();
    for (var i = 1; i < datos.length; i++) {
      if (String(datos[i][0]) === String(id)) return i + 1;
    }
    return -1;
  }
}


// ===================================================================
// MÓDULO: EMPLEADOS
// ===================================================================
//
// Estructura de un empleado:
//   id | nombre | cedula | departamento | puesto | fecha_ingreso | salario | estado
//
// "estado" es 'activo' o 'inactivo' (baja lógica, nunca se borra la fila).
// ===================================================================

/**
 * Validación de los datos de un empleado en el BACKEND.
 * Nunca confíes solo en la validación del frontend: el backend
 * también debe validar para proteger la integridad de los datos.
 *
 * @param {Object} emp  datos del empleado.
 * @return {string|null} mensaje de error, o null si todo está bien.
 */
function validarEmpleado(emp) {
  if (!emp) {
    return 'No se recibieron datos del empleado.';
  }
  if (!emp.nombre || String(emp.nombre).trim() === '') {
    return 'El nombre es obligatorio.';
  }
  if (!emp.cedula || String(emp.cedula).trim() === '') {
    return 'La cédula es obligatoria.';
  }
  // Cédula: solo dígitos y guiones, longitud razonable.
  if (!/^[0-9\-]{5,20}$/.test(String(emp.cedula).trim())) {
    return 'La cédula solo puede contener números y guiones (5 a 20 caracteres).';
  }
  // Salario: debe ser un número > 0 y >= salario mínimo CR (~500,000 en 2025).
  var salario = Number(emp.salario);
  var SALARIO_MINIMO_CR = 500000; // Aproximado 2025; verificar anualmente
  if (emp.salario === '' || emp.salario === null || isNaN(salario) || salario <= 0) {
    return 'El salario debe ser un número mayor a 0.';
  }
  if (salario < SALARIO_MINIMO_CR) {
    return 'El salario ₡' + salario + ' es inferior al mínimo legal CR (~₡' + SALARIO_MINIMO_CR + '). Verificar con RR.HH.';
  }
  // Fecha de ingreso: obligatoria y con formato válido (yyyy-mm-dd).
  if (!emp.fecha_ingreso || isNaN(new Date(emp.fecha_ingreso).getTime())) {
    return 'La fecha de ingreso no es válida.';
  }
  // Correo: opcional, pero si viene debe tener formato de email.
  if (emp.correo && String(emp.correo).trim() !== '' &&
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(emp.correo).trim())) {
    return 'El correo electrónico no tiene un formato válido.';
  }
  return null; // sin errores
}

/**
 * Verifica si una cédula ya está registrada en otro empleado.
 *
 * @param {string} cedula
 * @param {string} idExcluir  id a ignorar (al editar el mismo registro).
 * @return {boolean} true si la cédula ya existe en otro empleado.
 */
function cedulaDuplicada(cedula, idExcluir) {
  var empleados = leerTabla(HOJAS.EMPLEADOS);
  var cedulaNorm = String(cedula).trim();
  for (var i = 0; i < empleados.length; i++) {
    if (String(empleados[i].cedula).trim() === cedulaNorm &&
        String(empleados[i].id) !== String(idExcluir || '')) {
      return true;
    }
  }
  return false;
}

/**
 * LISTAR empleados.
 * @param {boolean} soloActivos  si es true, devuelve solo los activos.
 * @return {Object[]} arreglo de empleados.
 */
function listarEmpleados(soloActivos, token) {
  var _authErr = requiereSesion(token);
  if (_authErr) return _authErr;

  var puedeVerSalario = !requiereEscritura(token);
  var empleados = leerTabla(HOJAS.EMPLEADOS);

  // Normalizamos la fecha a texto yyyy-mm-dd para mostrarla bien
  // en el frontend (Sheets a veces devuelve objetos Date).
  empleados.forEach(function (emp) {
    emp.fecha_ingreso        = formatearFecha(emp.fecha_ingreso);
    emp.fecha_nacimiento     = emp.fecha_nacimiento ? formatearFecha(emp.fecha_nacimiento) : '';
    emp.vencimiento_cedula   = emp.vencimiento_cedula ? formatearFecha(emp.vencimiento_cedula) : '';
    emp.vencimiento_licencia = emp.vencimiento_licencia ? formatearFecha(emp.vencimiento_licencia) : '';
    emp.telefono             = emp.telefono ? String(emp.telefono) : '';
    emp.carne_ccss           = emp.carne_ccss ? String(emp.carne_ccss) : '';
    if (puedeVerSalario) {
      emp.salario = Number(emp.salario) || 0;
    } else {
      delete emp.salario;
    }
  });

  if (soloActivos) {
    empleados = empleados.filter(function (e) {
      return String(e.estado).toLowerCase() === 'activo';
    });
  }
  return empleados;
}

/**
 * Convierte un valor de fecha (Date o texto) a "yyyy-mm-dd".
 * Si no se puede, devuelve el valor original como texto.
 */
function formatearFecha(valor) {
  if (!valor) return '';
  // Las cadenas 'yyyy-mm-dd' se devuelven tal cual: convertirlas a Date
  // las interpretaría como medianoche UTC y restaría un día en zona CR.
  if (typeof valor === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(valor.trim())) {
    return valor.trim();
  }
  var fecha = (valor instanceof Date) ? valor : new Date(valor);
  if (isNaN(fecha.getTime())) return String(valor);
  return Utilities.formatDate(fecha, Session.getScriptTimeZone(), 'yyyy-MM-dd');
}

/**
 * Fuerza formato de texto en los campos tipo "identificador" del empleado
 * (cédula, teléfono, cuenta IBAN, carné CCSS, licencia de conducir) ANTES
 * de escribir la fila. Si alguno de estos valores es puramente numérico
 * (sin guiones ni espacios), Sheets lo interpretaría como número y le
 * borraría los ceros a la izquierda, rompiendo comparaciones exactas
 * (ej. detección de cédulas duplicadas) y la visualización.
 */
function _forzarTextoCamposIdEmpleado(hoja, filaIndex) {
  [COLS.EMP_CEDULA, COLS.EMP_TELEFONO, COLS.EMP_CUENTA_IBAN, COLS.EMP_CARNE_CCSS, COLS.EMP_LICENCIA]
    .forEach(function (col) { hoja.getRange(filaIndex, col).setNumberFormat('@'); });
}

/**
 * CREAR un empleado nuevo.
 * @param {Object} emp  datos del formulario.
 * @return {Object} {ok:boolean, mensaje:string, id?:string}
 */
function crearEmpleado(emp, token) {
  var _authErr = requiereEscritura(token);
  if (_authErr) return _authErr;

  var error = validarEmpleado(emp);
  if (error) {
    return { ok: false, mensaje: error };
  }

  return conLock(function () {
    if (cedulaDuplicada(emp.cedula, null)) {
      return { ok: false, mensaje: 'Ya existe un empleado con esa cédula.' };
    }

    var hoja = getHoja(HOJAS.EMPLEADOS);
    var id = generarId('EMP');

    // El orden DEBE coincidir con ENCABEZADOS.Empleados.
    var fila = [
      id,
      String(emp.nombre).trim(),
      String(emp.cedula).trim(),
      emp.departamento || '',
      emp.puesto || '',
      formatearFecha(emp.fecha_ingreso),
      Number(emp.salario),
      'activo',
      emp.fecha_nacimiento ? formatearFecha(emp.fecha_nacimiento) : '',
      emp.telefono ? String(emp.telefono).trim() : ''
    ].concat(_camposExtraEmpleado(emp, null));

    var filaIndex = hoja.getLastRow() + 1;
    _forzarTextoCamposIdEmpleado(hoja, filaIndex);
    hoja.getRange(filaIndex, 1, 1, fila.length).setValues([sanitizarFilaSheets(fila)]);
    invalidarCache(HOJAS.EMPLEADOS);
    registrarBitacora('crear', 'Empleados', id, String(emp.nombre).trim());
    return { ok: true, mensaje: 'Empleado creado correctamente.', id: id };
  });
}

/**
 * Campos adicionales del expediente (columnas 11-26 de la hoja Empleados).
 * Devuelve los 16 valores en el orden de ENCABEZADOS.Empleados.
 * Si un campo no viene en el payload y hay fila actual, conserva el valor existente.
 *
 * @param {Object} emp        datos recibidos del frontend/importación.
 * @param {Array|null} filaActual  valores actuales de la fila (o null al crear).
 * @return {Array} 16 valores.
 */
/**
 * Extrae campos opcionales de empleado (después de los 10 básicos: id, nombre, cédula, ..., teléfono).
 * Si el campo viene en `emp`, usa ese valor; sino, toma de la fila actual (al actualizar).
 * Formatea fechas (vencimiento_cedula, vencimiento_licencia).
 */
function _camposExtraEmpleado(emp, filaActual) {
  var campos = ['correo', 'direccion', 'genero', 'estado_civil', 'nacionalidad', 'sede',
    'tipo_nomina', 'cuenta_iban', 'carne_ccss', 'vencimiento_cedula', 'licencia_conducir',
    'vencimiento_licencia', 'jefe_inmediato', 'cargo_critico', 'actividad', 'padre_madre'];
  var fechas = { vencimiento_cedula: true, vencimiento_licencia: true };
  return campos.map(function (campo, i) {
    var valor = emp[campo];
    if (valor === undefined && filaActual) valor = filaActual[10 + i];  // Columnas A-J son básicos, K+ son extras
    if (valor === undefined || valor === null) valor = '';
    valor = String(valor).trim();
    return (fechas[campo] && valor) ? formatearFecha(valor) : valor;
  });
}

/**
 * ACTUALIZAR un empleado existente por su id.
 * @param {Object} emp  datos del formulario (incluye emp.id).
 * @return {Object} {ok, mensaje}
 */
function actualizarEmpleado(emp, token) {
  var _authErr = requiereEscritura(token);
  if (_authErr) return _authErr;

  if (!emp || !emp.id) {
    return { ok: false, mensaje: 'Falta el identificador del empleado.' };
  }
  var error = validarEmpleado(emp);
  if (error) {
    return { ok: false, mensaje: error };
  }
  if (cedulaDuplicada(emp.cedula, emp.id)) {
    return { ok: false, mensaje: 'Ya existe otro empleado con esa cédula.' };
  }

  var hoja = getHoja(HOJAS.EMPLEADOS);
  var fila = buscarFilaPorId(hoja, emp.id);
  if (fila === -1) {
    return { ok: false, mensaje: 'No se encontró el empleado a actualizar.' };
  }

  var numCols = ENCABEZADOS.Empleados.length;
  var filaActual = hoja.getRange(fila, 1, 1, numCols).getValues()[0];

  var estadoActual    = filaActual[COLS.EMP_ESTADO_IDX]  || 'activo';
  var salarioAnterior = Number(filaActual[COLS.EMP_SALARIO_IDX]) || 0;
  var salarioNuevo    = Number(emp.salario);

  var valores = [
    emp.id,
    String(emp.nombre).trim(),
    String(emp.cedula).trim(),
    emp.departamento || '',
    emp.puesto || '',
    formatearFecha(emp.fecha_ingreso),
    salarioNuevo,
    estadoActual,
    emp.fecha_nacimiento ? formatearFecha(emp.fecha_nacimiento) : (String(filaActual[8] || '')),
    emp.telefono ? String(emp.telefono).trim() : (String(filaActual[9] || ''))
  ].concat(_camposExtraEmpleado(emp, filaActual));

  _forzarTextoCamposIdEmpleado(hoja, fila);
  hoja.getRange(fila, 1, 1, valores.length).setValues([sanitizarFilaSheets(valores)]);
  invalidarCache(HOJAS.EMPLEADOS);

  if (salarioAnterior !== salarioNuevo) {
    var hojaHist = getHoja(HOJAS.HISTORIAL_SALARIOS);
    hojaHist.appendRow([generarId('HSA'), emp.id, salarioAnterior, salarioNuevo,
      formatearFecha(new Date()), emp.notasSalario || '']);
    invalidarCache(HOJAS.HISTORIAL_SALARIOS);
    registrarBitacora('actualizar', 'Empleados', emp.id,
      'Salario: ' + salarioAnterior + ' → ' + salarioNuevo + ' | Usuario: ' + Session.getActiveUser().getEmail());
  } else {
    registrarBitacora('actualizar', 'Empleados', emp.id, String(emp.nombre).trim());
  }
  return { ok: true, mensaje: 'Empleado actualizado correctamente.' };
}

/**
 * CAMBIAR ESTADO (baja/alta lógica). No borra la fila.
 * @param {string} id
 * @param {string} nuevoEstado  'activo' o 'inactivo'.
 * @return {Object} {ok, mensaje}
 */
function cambiarEstadoEmpleado(id, nuevoEstado, token) {
  var _authErr = requiereEscritura(token);
  if (_authErr) return _authErr;

  if (nuevoEstado !== 'activo' && nuevoEstado !== 'inactivo') {
    return { ok: false, mensaje: 'Estado no válido.' };
  }
  var hoja = getHoja(HOJAS.EMPLEADOS);
  var fila = buscarFilaPorId(hoja, id);
  if (fila === -1) {
    return { ok: false, mensaje: 'No se encontró el empleado.' };
  }
  var estadoAnterior = String(hoja.getRange(fila, COLS.EMP_ESTADO).getValue() || 'activo');
  hoja.getRange(fila, COLS.EMP_ESTADO).setValue(nuevoEstado);
  invalidarCache(HOJAS.EMPLEADOS);
  registrarBitacora('actualizar', 'Empleados', id,
    'Estado: ' + estadoAnterior + ' → ' + nuevoEstado + ' | Usuario: ' + Session.getActiveUser().getEmail());
  var accion = (nuevoEstado === 'activo') ? 'reactivado' : 'dado de baja';
  return { ok: true, mensaje: 'Empleado ' + accion + ' correctamente.' };
}

/**
 * Devuelve la lista de departamentos para llenar el <select> del
 * formulario. Si el módulo de Departamentos aún no existe, devolvemos
 * una lista vacía sin romper nada.
 * @return {string[]} nombres de departamentos.
 */
function listarNombresDepartamentos(token) {
  var _authErr = requiereSesion(token);
  if (_authErr) return _authErr;

  var deptos = leerTabla(HOJAS.DEPARTAMENTOS);
  return deptos.map(function (d) { return d.nombre; })
               .filter(function (n) { return n && String(n).trim() !== ''; });
}


// ===================================================================
// MÓDULO: DEPARTAMENTOS
// ===================================================================
//   id | nombre | responsable
// ===================================================================

/** Lista todos los departamentos. */
function listarDepartamentos(token) {
  var _authErr = requiereSesion(token);
  if (_authErr) return _authErr;

  return leerTabla(HOJAS.DEPARTAMENTOS);
}

/** Valida los datos de un departamento. */
function validarDepartamento(d) {
  if (!d || !d.nombre || String(d.nombre).trim() === '') {
    return 'El nombre del departamento es obligatorio.';
  }
  return null;
}

/** Comprueba si ya existe un departamento con ese nombre. */
function departamentoDuplicado(nombre, idExcluir) {
  var lista = leerTabla(HOJAS.DEPARTAMENTOS);
  var n = String(nombre).trim().toLowerCase();
  return lista.some(function (d) {
    return String(d.nombre).trim().toLowerCase() === n &&
           String(d.id) !== String(idExcluir || '');
  });
}

/** Crea un departamento. */
function crearDepartamento(d, token) {
  var _authErr = requiereEscritura(token);
  if (_authErr) return _authErr;

  var error = validarDepartamento(d);
  if (error) return { ok: false, mensaje: error };
  if (departamentoDuplicado(d.nombre, null)) {
    return { ok: false, mensaje: 'Ya existe un departamento con ese nombre.' };
  }
  var hoja = getHoja(HOJAS.DEPARTAMENTOS);
  var id = generarId('DEP');
  hoja.appendRow([id, String(d.nombre).trim(), d.responsable || '']);
  invalidarCache(HOJAS.DEPARTAMENTOS);
  return { ok: true, mensaje: 'Departamento creado correctamente.', id: id };
}

/** Actualiza un departamento. */
function actualizarDepartamento(d, token) {
  var _authErr = requiereEscritura(token);
  if (_authErr) return _authErr;

  if (!d || !d.id) return { ok: false, mensaje: 'Falta el identificador.' };
  var error = validarDepartamento(d);
  if (error) return { ok: false, mensaje: error };
  if (departamentoDuplicado(d.nombre, d.id)) {
    return { ok: false, mensaje: 'Ya existe otro departamento con ese nombre.' };
  }
  var hoja = getHoja(HOJAS.DEPARTAMENTOS);
  var fila = buscarFilaPorId(hoja, d.id);
  if (fila === -1) return { ok: false, mensaje: 'No se encontró el departamento.' };
  hoja.getRange(fila, 1, 1, 3).setValues([[d.id, String(d.nombre).trim(), d.responsable || '']]);
  invalidarCache(HOJAS.DEPARTAMENTOS);
  return { ok: true, mensaje: 'Departamento actualizado correctamente.' };
}

/**
 * Elimina un departamento. No permite borrarlo si hay empleados que lo usan
 * (para no dejar registros huérfanos).
 */
function eliminarDepartamento(id, token) {
  var _authErr = requiereEscritura(token);
  if (_authErr) return _authErr;

  var hoja = getHoja(HOJAS.DEPARTAMENTOS);
  var fila = buscarFilaPorId(hoja, id);
  if (fila === -1) return { ok: false, mensaje: 'No se encontró el departamento.' };

  var nombre = hoja.getRange(fila, 2).getValue();
  var empleados = leerTabla(HOJAS.EMPLEADOS);
  var enUso = empleados.some(function (e) {
    return String(e.departamento).trim() === String(nombre).trim();
  });
  if (enUso) {
    return { ok: false, mensaje: 'No se puede eliminar: hay empleados en este departamento.' };
  }
  hoja.deleteRow(fila);
  invalidarCache(HOJAS.DEPARTAMENTOS);
  return { ok: true, mensaje: 'Departamento eliminado.' };
}


// ===================================================================
// MÓDULO: ASISTENCIA
// ===================================================================
//   id | empleado_id | fecha | hora_entrada | hora_salida | horas
// ===================================================================

/**
 * Calcula las horas trabajadas entre dos horas en formato "HH:mm".
 * Devuelve un número con 2 decimales (ej: 8.5). Si salida < entrada
 * (turno nocturno que cruza medianoche) suma 24 h.
 */
function calcularHoras(horaEntrada, horaSalida) {
  if (!horaEntrada || !horaSalida) return 0;
  var e = horaEntrada.split(':');
  var s = horaSalida.split(':');
  var minEntrada = Number(e[0]) * 60 + Number(e[1]);
  var minSalida = Number(s[0]) * 60 + Number(s[1]);
  var diff = minSalida - minEntrada;
  if (diff < 0) diff += 24 * 60; // cruza medianoche
  return Math.round((diff / 60) * 100) / 100;
}

/** Verifica si una fecha es feriado. */
function esFeriado(fecha) {
  var feriados = leerTabla(HOJAS.FERIADOS);
  var fechaStr = typeof fecha === 'string' ? fecha : formatearFecha(fecha);
  return feriados.some(function (f) {
    return formatearFecha(f.fecha) === fechaStr;
  });
}

/** Verifica si una fecha es sábado o domingo. */
function esFinDeSemana(fecha) {
  var d = typeof fecha === 'string' ? new Date(fecha + 'T00:00:00') : fecha;
  var dia = d.getDay();
  return dia === 0 || dia === 6; // 0=domingo, 6=sábado
}

/** Lista la asistencia, agregando el nombre del empleado, feriados y tipos de marcas. */
/**
 * Lista registros de asistencia, filtrados por empleado y fecha.
 * Enriquece con nombres de empleados y marca días especiales (feriados, incapacidades, vacaciones).
 * @param {string} empleadoId - ID del empleado (null = todos)
 * @param {string} fechaDesde - Fecha inicio filtro yyyy-MM-dd (null = todas)
 * @return {Object[]} registros con {id, empleado_id, empleado_nombre, fecha, horas, marca_especial, ...}
 */
function listarAsistencia(empleadoId, fechaDesde, token) {
  var _authErr = requiereSesion(token);
  if (_authErr) return _authErr;

  var registros = leerTabla(HOJAS.ASISTENCIA);
  if (empleadoId) {
    registros = registros.filter(function (r) {
      return String(r.empleado_id) === String(empleadoId);
    });
  }
  if (fechaDesde) {
    var desde = formatearFecha(fechaDesde);
    registros = registros.filter(function (r) {
      return formatearFecha(r.fecha) >= desde;
    });
  }
  var nombres = mapaEmpleados();

  // Set de fechas feriadas (una sola lectura de la hoja, no una por registro).
  var feriadosSet = {};
  leerTabla(HOJAS.FERIADOS).forEach(function (f) {
    feriadosSet[formatearFecha(f.fecha)] = true;
  });

  registros.forEach(function (r) {
    r.fecha = formatearFecha(r.fecha);
    r.hora_entrada = formatearHora(r.hora_entrada);
    r.hora_salida = formatearHora(r.hora_salida);
    r.empleado_nombre = nombres[r.empleado_id] || '(desconocido)';
    r.horas = Number(r.horas) || 0;

    // Enriquecer con información de feriados y tipo de marca
    r.es_feriado = !!feriadosSet[r.fecha];
    r.es_fin_de_semana = esFinDeSemana(r.fecha);

    // Detectar tipo de marca (VAC, CCSS, INS, presente normal)
    var marca = String(r.hora_entrada).toLowerCase();
    if (marca === 'vac') {
      r.tipo_marca = 'Vacación';
      r.clasificacion = 'vacacion';
    } else if (marca === 'ccss' || marca === 'ins') {
      r.tipo_marca = marca.toUpperCase() + ' (Incapacidad)';
      r.clasificacion = 'incapacidad';
    } else if (r.es_feriado) {
      r.tipo_marca = 'Feriado';
      r.clasificacion = 'feriado';
    } else if (r.es_fin_de_semana) {
      r.tipo_marca = 'Fin de semana';
      r.clasificacion = 'fin_de_semana';
    } else if (r.hora_entrada && r.hora_salida) {
      r.tipo_marca = 'Presente (' + r.horas + 'h)';
      r.clasificacion = 'presente';
    } else {
      r.tipo_marca = 'Ausente';
      r.clasificacion = 'ausente';
    }
  });

  return registros;
}

/** Convierte un valor de hora (Date o texto) a "HH:mm". */
function formatearHora(valor) {
  if (!valor) return '';
  if (valor instanceof Date) {
    return Utilities.formatDate(valor, Session.getScriptTimeZone(), 'HH:mm');
  }
  return String(valor);
}

/** Registra un día de asistencia (entrada + salida) y calcula las horas. */
function crearAsistencia(a, token) {
  var _authErr = requiereEscritura(token);
  if (_authErr) return _authErr;

  if (!a || !a.empleado_id) return { ok: false, mensaje: 'Selecciona un empleado.' };
  if (!a.fecha || isNaN(new Date(a.fecha).getTime())) {
    return { ok: false, mensaje: 'La fecha no es válida.' };
  }
  var fechaAsist = new Date(a.fecha);
  var hoy = new Date();
  hoy.setHours(0, 0, 0, 0);
  if (fechaAsist > hoy) {
    return { ok: false, mensaje: 'No se puede registrar asistencia con fechas futuras.' };
  }
  if (!/^\d{2}:\d{2}$/.test(a.hora_entrada || '') || !/^\d{2}:\d{2}$/.test(a.hora_salida || '')) {
    return { ok: false, mensaje: 'Las horas deben tener formato HH:mm.' };
  }
  var hEnt = parseInt(a.hora_entrada.split(':')[0], 10);
  var mEnt = parseInt(a.hora_entrada.split(':')[1], 10);
  var hSal = parseInt(a.hora_salida.split(':')[0], 10);
  var mSal = parseInt(a.hora_salida.split(':')[1], 10);
  if (hEnt < 0 || hEnt > 23 || mEnt < 0 || mEnt > 59 || hSal < 0 || hSal > 23 || mSal < 0 || mSal > 59) {
    return { ok: false, mensaje: 'Horas deben estar entre 00:00 y 23:59.' };
  }
  var fechaNorm = formatearFecha(a.fecha);
  var horas = calcularHoras(a.hora_entrada, a.hora_salida);
  return conLock(function () {
    var duplicado = leerTabla(HOJAS.ASISTENCIA).some(function (r) {
      return String(r.empleado_id) === String(a.empleado_id) &&
             formatearFecha(r.fecha) === fechaNorm;
    });
    if (duplicado) {
      return { ok: false, mensaje: 'Ya existe un registro de asistencia para ese empleado en esa fecha.' };
    }
    var hoja = getHoja(HOJAS.ASISTENCIA);
    var id = generarId('ASI');
    hoja.appendRow([id, a.empleado_id, fechaNorm, a.hora_entrada, a.hora_salida, horas]);
    return { ok: true, mensaje: 'Asistencia registrada (' + horas + ' h).', id: id };
  });
}

/** Elimina un registro de asistencia. */
function eliminarAsistencia(id, token) {
  var _authErr = requiereEscritura(token);
  if (_authErr) return _authErr;

  var hoja = getHoja(HOJAS.ASISTENCIA);
  var fila = buscarFilaPorId(hoja, id);
  if (fila === -1) return { ok: false, mensaje: 'No se encontró el registro.' };
  hoja.deleteRow(fila);
  return { ok: true, mensaje: 'Registro eliminado.' };
}


// ===================================================================
// MÓDULO: VACACIONES / PERMISOS
// ===================================================================
//   id | empleado_id | fecha_inicio | fecha_fin | dias | estado
//   estado: 'pendiente' | 'aprobada' | 'rechazada'
// ===================================================================

/** Calcula los días entre dos fechas (inclusivas). */
function calcularDias(inicio, fin) {
  var d1 = new Date(inicio);
  var d2 = new Date(fin);
  var msPorDia = 24 * 60 * 60 * 1000;
  var diff = Math.round((d2 - d1) / msPorDia) + 1; // +1 para incluir el último día
  return diff;
}

/** Lista las solicitudes de vacaciones con el nombre del empleado y saldo disponible. */
function listarVacaciones(empleadoId, estado, token) {
  var _authErr = requiereSesion(token);
  if (_authErr) return _authErr;

  var todasVac = leerTabla(HOJAS.VACACIONES);
  var lista = todasVac.slice();
  if (empleadoId) lista = lista.filter(function (v) { return String(v.empleado_id) === String(empleadoId); });
  if (estado) lista = lista.filter(function (v) { return String(v.estado).toLowerCase() === String(estado).toLowerCase(); });
  var nombres = mapaEmpleados();

  // Pre-calcular saldos usando la tabla ya leída (evita N+1 reads)
  var saldosPorEmp = _calcularSaldosVacaciones(todasVac);

  lista.forEach(function (v) {
    v.fecha_inicio = formatearFecha(v.fecha_inicio);
    v.fecha_fin = formatearFecha(v.fecha_fin);
    v.dias = Number(v.dias) || 0;
    v.empleado_nombre = nombres[v.empleado_id] || '(desconocido)';
    v.saldo_disponible = saldosPorEmp[v.empleado_id] !== undefined ? saldosPorEmp[v.empleado_id] : 0;
  });
  return lista;
}

/** Calcula saldo de días de vacaciones para cada empleado a partir de una tabla ya leída. */
function _calcularSaldosVacaciones(todasVac) {
  var empleados = leerTabla(HOJAS.EMPLEADOS);
  var saldos = {};
  empleados.forEach(function(emp) {
    if (String(emp.estado || '').toLowerCase() !== 'activo') return;
    var fechaIngreso = new Date(emp.fecha_ingreso);
    if (isNaN(fechaIngreso.getTime())) return;
    var mesesTrabajados = (new Date() - fechaIngreso) / (30.4375 * 24 * 60 * 60 * 1000);
    var acumulados = Math.floor(Math.max(0, mesesTrabajados) * 1.25); // 1.25 días/mes = 15/año
    var usados = todasVac
      .filter(function(v) { return String(v.empleado_id) === String(emp.id) && String(v.estado).toLowerCase() === 'aprobada'; })
      .reduce(function(s, v) { return s + (Number(v.dias) || 0); }, 0);
    saldos[emp.id] = Math.max(0, acumulados - usados);
  });
  return saldos;
}

/**
 * Lista los subalternos de un jefe por nombre o ID.
 * Busca empleados cuyo campo jefe_inmediato coincida con el nombre del jefe.
 */
function listarSubalternos(jefeId, token) {
  var _authErr = requiereSesion(token);
  if (_authErr) return _authErr;

  var empleados = leerTabla(HOJAS.EMPLEADOS);
  var jefe = empleados.find(function(e) { return String(e.id) === String(jefeId); });
  if (!jefe) return [];
  var nombreJefe = String(jefe.nombre || '').trim().toLowerCase();
  var idJefe = String(jefe.id);
  // Preferir match por ID; aceptar nombre solo como fallback legacy
  var subalternos = empleados.filter(function(e) {
    if (String(e.estado || '').toLowerCase() !== 'activo') return false;
    var jefeCampo = String(e.jefe_inmediato || '').trim();
    if (!jefeCampo) return false;
    if (jefeCampo === idJefe) return true;
    return jefeCampo.toLowerCase() === nombreJefe;
  });

  var todasVac = leerTabla(HOJAS.VACACIONES);
  return subalternos.map(function(e) {
    var fechaIngreso = new Date(e.fecha_ingreso);
    var meses = (new Date() - fechaIngreso) / (30.4375 * 24 * 60 * 60 * 1000);
    var acum = Math.floor(Math.max(0, meses) * 1.25);
    var usados = todasVac
      .filter(function(v) { return String(v.empleado_id) === String(e.id) && String(v.estado).toLowerCase() === 'aprobada'; })
      .reduce(function(sum, v) { return sum + (Number(v.dias) || 0); }, 0);
    return {
      id: e.id,
      nombre: e.nombre,
      puesto: e.puesto || '',
      departamento: e.departamento || '',
      diasDisponibles: Math.max(0, acum - usados),
      diasAcumulados: acum,
      diasUsados: usados
    };
  });
}

/** Crea una solicitud de vacaciones (nace 'pendiente'). Valida días disponibles. */
function crearVacaciones(v, token) {
  var _authErr = requiereEscritura(token);
  if (_authErr) return _authErr;

  if (!v || !v.empleado_id) return { ok: false, mensaje: 'Selecciona un empleado.' };
  if (!v.fecha_inicio || isNaN(new Date(v.fecha_inicio).getTime())) {
    return { ok: false, mensaje: 'La fecha de inicio no es válida.' };
  }
  if (!v.fecha_fin || isNaN(new Date(v.fecha_fin).getTime())) {
    return { ok: false, mensaje: 'La fecha de fin no es válida.' };
  }
  if (new Date(v.fecha_fin) < new Date(v.fecha_inicio)) {
    return { ok: false, mensaje: 'La fecha de fin no puede ser anterior a la de inicio.' };
  }

  // Validar que no sean demasiado futuras (máximo 1 año adelante)
  var hoy = new Date();
  var fechaInicio = new Date(v.fecha_inicio);
  var unAnoDelante = new Date();
  unAnoDelante.setFullYear(unAnoDelante.getFullYear() + 1);
  if (fechaInicio > unAnoDelante) {
    return { ok: false, mensaje: 'Las vacaciones deben estar dentro del próximo año.' };
  }

  var dias = calcularDias(v.fecha_inicio, v.fecha_fin);

  return conLock(function () {
    // Validaciones de saldo y solapamiento dentro del lock para evitar race conditions
    var balance = _obtenerBalanceVacacionesInterno(v.empleado_id);
    if (!balance.ok) return balance;

    if (dias > balance.diasDisponibles) {
      return {
        ok: false,
        mensaje: 'No hay suficientes días disponibles. ' +
                 'Tienes ' + balance.diasDisponibles + ' días disponibles, ' +
                 'pero solicitaste ' + dias + ' días. ' +
                 '(Acumulados: ' + balance.diasAcumulados + ', Usados: ' + balance.diasUsados + ')'
      };
    }

    var fechaInicio = new Date(v.fecha_inicio);
    var fechaFin = new Date(v.fecha_fin);
    var solapada = leerTabla(HOJAS.VACACIONES).some(function (vac) {
      if (String(vac.empleado_id) !== String(v.empleado_id)) return false;
      if (String(vac.estado).toLowerCase() !== 'aprobada') return false;
      var vacInicio = new Date(vac.fecha_inicio);
      var vacFin = new Date(vac.fecha_fin);
      return !(fechaFin < vacInicio || fechaInicio > vacFin);
    });
    if (solapada) {
      return { ok: false, mensaje: 'Conflicto: Ya hay vacaciones aprobadas en esas fechas.' };
    }

    var hoja = getHoja(HOJAS.VACACIONES);
    var id = generarId('VAC');
    var notaFinal = v.notas || '';
    if (v.solicitado_por) notaFinal = '[Solicitado por jefe: ' + v.solicitado_por + '] ' + notaFinal;
    hoja.appendRow([id, v.empleado_id, formatearFecha(v.fecha_inicio),
                    formatearFecha(v.fecha_fin), dias, 'pendiente', notaFinal]);
    invalidarCache(HOJAS.VACACIONES);

    var quien = v.solicitado_por ? v.solicitado_por + ' (jefe) para ' + v.empleado_id : v.empleado_id;
    registrarBitacora('crear', 'Vacaciones', id,
      quien + ' solicitó ' + dias + ' días de vacaciones');

    try { _notificarWhatsAppNuevaVacacion(v, dias); } catch (e) {}

    return {
      ok: true,
      mensaje: 'Solicitud creada (' + dias + ' días de ' + balance.diasDisponibles + ' disponibles).',
      id: id,
      balance: balance
    };
  });
}

/** Cambia el estado de una solicitud (aprobar / rechazar). Valida si es posible aprobar. */
function cambiarEstadoVacaciones(id, nuevoEstado, token) {
  var _authErr = requiereEscritura(token);
  if (_authErr) return _authErr;

  if (['pendiente', 'aprobada', 'rechazada'].indexOf(nuevoEstado) === -1) {
    return { ok: false, mensaje: 'Estado no válido.' };
  }

  return conLock(function () {
    var hoja = getHoja(HOJAS.VACACIONES);
    var fila = buscarFilaPorId(hoja, id);
    if (fila === -1) return { ok: false, mensaje: 'No se encontró la solicitud.' };

    // Leer la solicitud actual
    var datos = leerTabla(HOJAS.VACACIONES);
    var solicitud = datos.filter(function (s) { return String(s.id) === String(id); })[0];
    if (!solicitud) return { ok: false, mensaje: 'No se encontró la solicitud.' };

    // Si es para aprobar, validar que hay días disponibles.
    // Este chequeo y la escritura de abajo deben quedar dentro del mismo
    // lock: sin esto, dos aprobaciones simultáneas podrían leer el mismo
    // saldo disponible y aprobar ambas, superando los días acumulados.
    if (nuevoEstado === 'aprobada') {
      var balance = _obtenerBalanceVacacionesInterno(solicitud.empleado_id);
      if (!balance.ok) return balance;

      var diasSolicitud = Number(solicitud.dias) || 0;
      if (diasSolicitud > balance.diasDisponibles) {
        return {
          ok: false,
          mensaje: 'No se puede aprobar. El empleado tiene ' + balance.diasDisponibles +
                   ' días disponibles, pero solicita ' + diasSolicitud + ' días.'
        };
      }
    }

    hoja.getRange(fila, COLS.VAC_ESTADO).setValue(nuevoEstado);
    invalidarCache(HOJAS.VACACIONES);

    registrarBitacora('modificar', 'Vacaciones', id,
      'Estado cambió a: ' + nuevoEstado);

    if (nuevoEstado === 'aprobada' || nuevoEstado === 'rechazada') {
      var filaDatos = hoja.getRange(fila, 1, 1, 5).getValues()[0];
      try {
        _notificarWhatsAppVacacionDecidida({
          empleado_id: filaDatos[1],
          fecha_inicio: filaDatos[2],
          fecha_fin: filaDatos[3],
          dias: filaDatos[4]
        }, nuevoEstado);
      } catch (e) {}
    }
    return { ok: true, mensaje: 'Solicitud ' + nuevoEstado + '.' };
  });
}


// ===================================================================
// MÓDULO: NÓMINA BÁSICA
// ===================================================================
//   id | empleado_id | mes | salario_base | deducciones | neto
//   mes en formato "yyyy-MM" (ej: 2026-06)
// ===================================================================

/**
 * Lista registros de nómina con detalles de empleados y deducciones calculadas.
 * @param {string} mesFiltro - Mes en formato "YYYY-MM" (null = todos)
 * @return {Object[]} registros con {id, empleado_id, empleado_nombre, salario_base, deducciones, neto, ...}
 */
function listarNomina(mesFiltro, token) {
  var _authErr = requiereEscritura(token);
  if (_authErr) return _authErr;

  var lista = leerTabla(HOJAS.NOMINA);
  var nombres = mapaEmpleados();
  lista.forEach(function (n) {
    n.salario_base = Number(n.salario_base) || 0;
    n.deducciones = Number(n.deducciones) || 0;
    n.neto = Number(n.neto) || 0;
    n.mes = String(n.mes);
    n.empleado_nombre = nombres[n.empleado_id] || '(desconocido)';
  });
  if (mesFiltro) {
    lista = lista.filter(function (n) { return n.mes === mesFiltro; });
  }
  return lista;
}

/**
 * Genera la nómina de un empleado para un mes. Toma el salario base del
 * empleado, le resta las deducciones y guarda el neto. No permite duplicar
 * la nómina del mismo empleado/mes.
 */
function generarNomina(n, token) {
  var _authErr = requiereEscritura(token);
  if (_authErr) return _authErr;

  if (!n || !n.empleado_id) return { ok: false, mensaje: 'Selecciona un empleado.' };
  if (!/^\d{4}-\d{2}$/.test(n.mes || '')) {
    return { ok: false, mensaje: 'El mes debe tener formato AAAA-MM.' };
  }
  var deducciones = Number(n.deducciones);
  if (n.autoDeducciones || isNaN(deducciones) || deducciones < 0) {
    deducciones = null;
  }

  // Salario base = salario del empleado.
  var empleado = leerTabla(HOJAS.EMPLEADOS).filter(function (e) {
    return String(e.id) === String(n.empleado_id);
  })[0];
  if (!empleado) return { ok: false, mensaje: 'Empleado no encontrado.' };

  var salarioBase = Number(empleado.salario) || 0;
  if (deducciones === null) {
    deducciones = calcularDeduccionesCR(salarioBase).total;
  }
  if (isNaN(deducciones) || deducciones < 0) {
    return { ok: false, mensaje: 'Las deducciones deben ser un número ≥ 0.' };
  }
  if (deducciones > salarioBase) {
    return { ok: false, mensaje: 'Las deducciones no pueden superar el salario base.' };
  }
  var neto = Math.round((salarioBase - deducciones) * 100) / 100;

  return conLock(function () {
    // Evitar duplicados empleado+mes. El chequeo y el appendRow deben
    // quedar dentro del mismo lock: si no, dos solicitudes simultáneas
    // podrían pasar ambas la validación y crear dos nóminas duplicadas.
    var existentes = leerTabla(HOJAS.NOMINA);
    var dup = existentes.some(function (x) {
      return String(x.empleado_id) === String(n.empleado_id) && String(x.mes) === String(n.mes);
    });
    if (dup) return { ok: false, mensaje: 'Ya existe nómina para ese empleado en ese mes.' };

    var hoja = getHoja(HOJAS.NOMINA);
    var id = generarId('NOM');
    hoja.appendRow([id, n.empleado_id, n.mes, salarioBase, deducciones, neto]);
    invalidarCache(HOJAS.NOMINA);
    try {
      _notificarWhatsAppNominaGenerada(empleado, n.mes, salarioBase, deducciones, neto);
    } catch (e) {}
    return { ok: true, mensaje: 'Nómina generada (neto: ' + neto + ').', id: id };
  });
}

/** Elimina un registro de nómina. */
function eliminarNomina(id, token) {
  var _authErr = requiereEscritura(token);
  if (_authErr) return _authErr;

  var hoja = getHoja(HOJAS.NOMINA);
  var fila = buscarFilaPorId(hoja, id);
  if (fila === -1) return { ok: false, mensaje: 'No se encontró el registro.' };
  hoja.deleteRow(fila);
  return { ok: true, mensaje: 'Registro de nómina eliminado.' };
}


// ===================================================================
// MÓDULO: DASHBOARD (totales)
// ===================================================================

/** Genera alertas automáticas basadas en las fórmulas del Excel. */
function obtenerAlertas(token) {
  var _authErr = requiereSesion(token);
  if (_authErr) return _authErr;
  return _obtenerAlertasInterno();
}

/** Cuerpo de alertas sin auth (uso interno / reportes ya autenticados). */
function _obtenerAlertasInterno() {
  var hoy = new Date();
  var hace31dias = new Date(hoy.getTime() - 31 * 24 * 60 * 60 * 1000);
  var hace30dias = new Date(hoy.getTime() - 30 * 24 * 60 * 60 * 1000);
  var hace90dias = new Date(hoy.getTime() - 90 * 24 * 60 * 60 * 1000);

  var alertas = [];
  var empleados = leerTabla(HOJAS.EMPLEADOS);

  empleados.forEach(function (emp) {
    // Alerta: Cédula próxima a vencer (< 31 días)
    if (emp.vencimiento_cedula) {
      var fechaCed = new Date(formatearFecha(emp.vencimiento_cedula) + 'T00:00:00');
      if (fechaCed >= hace31dias && fechaCed <= hoy) {
        alertas.push({
          tipo: 'cedula_vencida',
          empleado: emp.nombre,
          empleado_id: emp.id,
          mensaje: 'Cédula VENCIDA',
          fecha: formatearFecha(emp.vencimiento_cedula),
          urgencia: 'crítica'
        });
      } else if (fechaCed > hoy && fechaCed <= new Date(hoy.getTime() + 31 * 24 * 60 * 60 * 1000)) {
        alertas.push({
          tipo: 'cedula_proxima',
          empleado: emp.nombre,
          empleado_id: emp.id,
          mensaje: 'Cédula próxima a vencer',
          fecha: formatearFecha(emp.vencimiento_cedula),
          urgencia: 'alta'
        });
      }
    }

    // Alerta: Licencia próxima a vencer
    if (emp.vencimiento_licencia) {
      var fechaLic = new Date(formatearFecha(emp.vencimiento_licencia) + 'T00:00:00');
      if (fechaLic >= hace31dias && fechaLic <= hoy) {
        alertas.push({
          tipo: 'licencia_vencida',
          empleado: emp.nombre,
          empleado_id: emp.id,
          mensaje: 'Licencia de conducir VENCIDA',
          fecha: formatearFecha(emp.vencimiento_licencia),
          urgencia: 'media'
        });
      } else if (fechaLic > hoy && fechaLic <= new Date(hoy.getTime() + 31 * 24 * 60 * 60 * 1000)) {
        alertas.push({
          tipo: 'licencia_proxima',
          empleado: emp.nombre,
          empleado_id: emp.id,
          mensaje: 'Licencia próxima a vencer',
          fecha: formatearFecha(emp.vencimiento_licencia),
          urgencia: 'media'
        });
      }
    }

    // Alerta: Evaluación anual próxima (cada 12 meses desde contratación)
    if (emp.fecha_ingreso) {
      var fechaIng = new Date(formatearFecha(emp.fecha_ingreso) + 'T00:00:00');
      var proxEval = new Date(fechaIng.getTime() + 365 * 24 * 60 * 60 * 1000);
      while (proxEval < hoy) {
        proxEval = new Date(proxEval.getTime() + 365 * 24 * 60 * 60 * 1000);
      }
      if (proxEval >= hoy && proxEval <= new Date(hoy.getTime() + 29 * 24 * 60 * 60 * 1000)) {
        alertas.push({
          tipo: 'evaluacion_proxima',
          empleado: emp.nombre,
          empleado_id: emp.id,
          mensaje: 'Evaluación anual próxima',
          fecha: Utilities.formatDate(proxEval, Session.getScriptTimeZone(), 'yyyy-MM-dd'),
          urgencia: 'baja'
        });
      }
    }

    // Alerta: Período de prueba próximo a vencer (90 días)
    if (emp.fecha_ingreso) {
      var fechaIng2 = new Date(formatearFecha(emp.fecha_ingreso) + 'T00:00:00');
      var finPrueba = new Date(fechaIng2.getTime() + 90 * 24 * 60 * 60 * 1000);
      if (finPrueba >= hace30dias && finPrueba <= new Date(hoy.getTime() + 31 * 24 * 60 * 60 * 1000) && finPrueba > hoy) {
        alertas.push({
          tipo: 'prueba_proxima',
          empleado: emp.nombre,
          empleado_id: emp.id,
          mensaje: 'Período de prueba próximo a vencer',
          fecha: Utilities.formatDate(finPrueba, Session.getScriptTimeZone(), 'yyyy-MM-dd'),
          urgencia: 'media'
        });
      }
    }
  });

  // Ordenar por urgencia
  var orden = { crítica: 0, alta: 1, media: 2, baja: 3 };
  alertas.sort(function (a, b) { return orden[a.urgencia] - orden[b.urgencia]; });

  return alertas;
}

/** Devuelve cifras resumen para el panel principal. */
function obtenerDashboard(token) {
  var _authErr = requiereSesion(token);
  if (_authErr) return _authErr;
  return _obtenerDashboardInterno();
}

/** Cuerpo del dashboard sin auth (uso interno, p.ej. WhatsApp). */
function _obtenerDashboardInterno() {
  var empleados   = leerTablaConCache(HOJAS.EMPLEADOS);
  var activos = empleados.filter(function (e) {
    return String(e.estado).toLowerCase() === 'activo';
  });
  var vacaciones  = leerTablaConCache(HOJAS.VACACIONES);
  var departamentos = leerTablaConCache(HOJAS.DEPARTAMENTOS);
  var pendientes = vacaciones.filter(function (v) {
    return String(v.estado).toLowerCase() === 'pendiente';
  });

  // Mes actual en formato yyyy-MM.
  var mesActual = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM');

  // Una sola lectura de NOMINA para el total del mes actual y el histórico.
  var nomina = leerTablaConCache(HOJAS.NOMINA);
  var nominaMes = nomina.filter(function (n) {
    return String(n.mes) === mesActual;
  });
  var totalNeto = nominaMes.reduce(function (suma, n) {
    return suma + (Number(n.neto) || 0);
  }, 0);

  var nominaMesMap = {};
  nomina.forEach(function (n) {
    var mes = String(n.mes);
    if (!mes) return;
    nominaMesMap[mes] = (nominaMesMap[mes] || 0) + (Number(n.neto) || 0);
  });
  var nominaHistorica = Object.keys(nominaMesMap).sort().slice(-6).map(function (mes) {
    return { mes: mes, neto: Math.round(nominaMesMap[mes] * 100) / 100 };
  });

  // Masa salarial de los empleados activos.
  var masaSalarial = activos.reduce(function (suma, e) {
    return suma + (Number(e.salario) || 0);
  }, 0);

  // Obtener alertas
  var alertas = _obtenerAlertasInterno();

  var porDepto = {};
  activos.forEach(function (e) {
    var dep = String(e.departamento || '').trim() || 'Sin asignar';
    porDepto[dep] = (porDepto[dep] || 0) + 1;
  });
  var empleadosPorDepto = Object.keys(porDepto).map(function (d) {
    return { nombre: d, total: porDepto[d] };
  });

  // KPIs adicionales (Fase 3)
  var costoPorEmpleado = activos.length > 0 ? Math.round((masaSalarial / activos.length) * 100) / 100 : 0;
  var rotacionMensual = empleados.length > 0 ? Math.round(((empleados.length - activos.length) / empleados.length) * 100 * 100) / 100 : 0;

  // Costo total de nómina mensual con carga patronal CCSS ~26.67% (patronal real CR)
  var CCSS_PATRONAL = 0.2667;
  var costTotalMes = totalNeto * (1 + CCSS_PATRONAL);

  // Análisis por departamento - costo
  var costoPorDepto = {};
  activos.forEach(function (e) {
    var dep = String(e.departamento || '').trim() || 'Sin asignar';
    costoPorDepto[dep] = (costoPorDepto[dep] || 0) + (Number(e.salario) || 0);
  });
  var depotosConCosto = Object.keys(costoPorDepto).map(function (d) {
    return { nombre: d, costo: Math.round(costoPorDepto[d] * 100) / 100, empleados: porDepto[d] };
  }).sort(function (a, b) { return b.costo - a.costo; });

  // Incapacidades este mes
  var incapacidades = leerTablaConCache(HOJAS.INCAPACIDADES) || [];
  var incapacidadesMes = incapacidades.filter(function (i) {
    var fechaDesde = new Date(i.fecha_desde);
    return fechaDesde.getFullYear() === new Date().getFullYear() &&
           fechaDesde.getMonth() === new Date().getMonth();
  });

  return {
    totalEmpleados: empleados.length,
    empleadosActivos: activos.length,
    empleadosInactivos: empleados.length - activos.length,
    totalDepartamentos: departamentos.length,
    vacacionesPendientes: pendientes.length,
    mesActual: mesActual,
    nominasMesActual: nominaMes.length,
    totalNetoMes: Math.round(totalNeto * 100) / 100,
    masaSalarial: Math.round(masaSalarial * 100) / 100,

    // KPIs - Fase 3
    costoPorEmpleado: costoPorEmpleado,
    rotacionPorcentaje: rotacionMensual,
    costTotalMesConCCSS: Math.round(costTotalMes * 100) / 100,
    incapacidadesEsMes: incapacidadesMes.length,
    diasIncapacidadEsMes: incapacidadesMes.reduce(function (sum, i) {
      return sum + (Number(i.dias) || 0);
    }, 0),

    alertas: alertas,
    alertasCriticas: alertas.filter(function (a) { return a.urgencia === 'crítica'; }).length,
    alertasAltas: alertas.filter(function (a) { return a.urgencia === 'alta'; }).length,
    empleadosPorDepto: empleadosPorDepto,
    depotosConCosto: depotosConCosto,
    nominaHistorica: nominaHistorica
  };
}


// ---- UTILIDAD COMPARTIDA -----------------------------------------

/**
 * Devuelve un mapa { empleado_id: nombre } para mostrar nombres en
 * lugar de ids en Asistencia, Vacaciones y Nómina.
 */
function mapaEmpleados() {
  var mapa = {};
  leerTablaConCache(HOJAS.EMPLEADOS).forEach(function (e) {
    mapa[e.id] = e.nombre;
  });
  return mapa;
}

function _empleadoExiste(empleadoId) {
  if (!empleadoId) return false;
  return leerTablaConCache(HOJAS.EMPLEADOS).some(function (e) {
    return String(e.id) === String(empleadoId);
  });
}

/**
 * Lista de empleados ACTIVOS reducida para llenar los <select>
 * de los demás módulos: [{id, nombre}, ...]. Requiere sesión;
 * el salario solo se incluye si el token es RRHH/Admin.
 */
function listarEmpleadosSelect(token) {
  var _authErr = requiereSesion(token);
  if (_authErr) return [];
  var puedeVerSalario = !requiereEscritura(token);
  return leerTablaConCache(HOJAS.EMPLEADOS)
    .filter(function (e) { return estadoNormalizado(e.estado) === 'activo'; })
    .map(function (e) {
      var out = { id: e.id, nombre: e.nombre };
      if (puedeVerSalario) out.salario = Number(e.salario) || 0;
      return out;
    });
}


// ===================================================================
// MÓDULO: REPORTES (datos para gráficos)
// ===================================================================
// Agrega los datos de las distintas pestañas y los devuelve listos
// para dibujarlos con Google Charts en el frontend. Cada conjunto se
// entrega como arreglo de pares [etiqueta, valor].
// ===================================================================

/**
 * Devuelve todos los conjuntos de datos para la pantalla de Reportes
 * en una sola llamada (menos viajes al backend).
 *
 * @return {Object} datasets agregados.
 */
/**
 * Reportes del dashboard de análisis.
 * @param {string} [empleadoId]  Si viene, limita nómina/horas/vacaciones a ese empleado.
 * @param {string} [fechaDesde]  yyyy-MM-dd. Límite inferior (inclusive) por fecha.
 * @param {string} [fechaHasta] yyyy-MM-dd. Límite superior (inclusive) por fecha.
 */
function obtenerReportes(empleadoId, fechaDesde, fechaHasta, token) {
  var _authErr = requiereSesion(token);
  if (_authErr) return _authErr;

  empleadoId = empleadoId ? String(empleadoId) : '';
  var mesDesde = fechaDesde ? String(fechaDesde).slice(0, 7) : '';
  var mesHasta = fechaHasta ? String(fechaHasta).slice(0, 7) : '';

  var empleados = leerTabla(HOJAS.EMPLEADOS);
  var nombres = {};
  empleados.forEach(function (e) { nombres[e.id] = e.nombre; });

  // 1) Empleados ACTIVOS por departamento (snapshot organizacional, sin filtrar).
  var porDepto = {};
  empleados.forEach(function (e) {
    if (String(e.estado).toLowerCase() !== 'activo') return;
    var dep = String(e.departamento || '').trim() || 'Sin asignar';
    porDepto[dep] = (porDepto[dep] || 0) + 1;
  });

  // 2) Empleados por estado (activos / inactivos), sin filtrar.
  var activos = 0, inactivos = 0;
  empleados.forEach(function (e) {
    if (String(e.estado).toLowerCase() === 'activo') activos++;
    else inactivos++;
  });

  // 3) Nómina: total neto por mes (ordenado por mes), filtrable por empleado y rango de fechas.
  var nominaMes = {};
  leerTabla(HOJAS.NOMINA).forEach(function (n) {
    var mes = String(n.mes);
    if (!mes) return;
    if (empleadoId && String(n.empleado_id) !== empleadoId) return;
    if (mesDesde && mes < mesDesde) return;
    if (mesHasta && mes > mesHasta) return;
    nominaMes[mes] = (nominaMes[mes] || 0) + (Number(n.neto) || 0);
  });
  var nominaPorMes = Object.keys(nominaMes).sort().map(function (mes) {
    return [mes, Math.round(nominaMes[mes] * 100) / 100];
  });

  // 4) Asistencia: total de horas por empleado, filtrable por empleado y rango de fechas.
  var horasEmp = {};
  leerTabla(HOJAS.ASISTENCIA).forEach(function (a) {
    if (empleadoId && String(a.empleado_id) !== empleadoId) return;
    var fecha = formatearFecha(a.fecha);
    if (fechaDesde && fecha < fechaDesde) return;
    if (fechaHasta && fecha > fechaHasta) return;
    var nombre = nombres[a.empleado_id] || '(desconocido)';
    horasEmp[nombre] = (horasEmp[nombre] || 0) + (Number(a.horas) || 0);
  });
  var horasPorEmpleado = Object.keys(horasEmp).map(function (nom) {
    return [nom, Math.round(horasEmp[nom] * 100) / 100];
  }).sort(function (a, b) { return b[1] - a[1]; }); // de mayor a menor

  // 5) Vacaciones por estado, filtrable por empleado y rango de fechas (fecha_inicio).
  var vacEstado = {};
  leerTabla(HOJAS.VACACIONES).forEach(function (v) {
    if (empleadoId && String(v.empleado_id) !== empleadoId) return;
    var inicio = formatearFecha(v.fecha_inicio);
    if (fechaDesde && inicio < fechaDesde) return;
    if (fechaHasta && inicio > fechaHasta) return;
    var est = String(v.estado || 'pendiente').toLowerCase();
    vacEstado[est] = (vacEstado[est] || 0) + 1;
  });
  var vacacionesPorEstado = Object.keys(vacEstado).map(function (est) {
    return [est, vacEstado[est]];
  });

  return {
    empleadosPorDepartamento: Object.keys(porDepto).map(function (d) { return [d, porDepto[d]]; }),
    empleadosPorEstado: [['Activos', activos], ['Inactivos', inactivos]],
    nominaPorMes: nominaPorMes,
    horasPorEmpleado: horasPorEmpleado,
    vacacionesPorEstado: vacacionesPorEstado
  };
}


// ===================================================================
// MÓDULO: VISIBILIDAD DE MÓDULOS EN EL MENÚ
// ===================================================================
// Permite ocultar del menú lateral los módulos que una empresa no usa.
// Guarda solo la LISTA de vistas desactivadas (todo lo demás queda
// visible por defecto). Dashboard y Configuración nunca se desactivan.
// ===================================================================

var CLAVE_MODULOS_DESACTIVADOS = 'MODULOS_DESACTIVADOS';
var MODULOS_SIEMPRE_VISIBLES = ['dashboard', 'configuracion'];

function obtenerModulosDesactivados(token) {
  var _authErr = requiereSesion(token);
  if (_authErr) return _authErr;

  var raw = PropertiesService.getScriptProperties().getProperty(CLAVE_MODULOS_DESACTIVADOS);
  if (!raw) return [];
  try {
    var lista = JSON.parse(raw);
    return Array.isArray(lista) ? lista : [];
  } catch (e) {
    return [];
  }
}

function guardarModulosDesactivados(lista, token) {
  var _authErr = requiereAdmin(token);
  if (_authErr) return _authErr;

  lista = (Array.isArray(lista) ? lista : []).filter(function (v) {
    return MODULOS_SIEMPRE_VISIBLES.indexOf(v) === -1;
  });
  PropertiesService.getScriptProperties().setProperty(CLAVE_MODULOS_DESACTIVADOS, JSON.stringify(lista));
  return { ok: true, mensaje: 'Módulos actualizados.' };
}


// ===================================================================
// MÓDULO: ALERTAS POR CORREO ELECTRÓNICO
// ===================================================================
// Permite configurar alertas automáticas enviadas con MailApp.
// Un trigger diario (Google Apps Script) ejecuta verificarAlertas()
// cada mañana. El usuario puede activarlo/desactivarlo desde la UI.
// ===================================================================

var CLAVE_CONFIG_ALERTAS = 'CONFIG_ALERTAS';
var CLAVE_TRIGGER_ID     = 'ALERTA_TRIGGER_ID';
var CLAVE_CONFIG_CORREO  = 'CONFIG_CORREO';


// ===================================================================
// MÓDULO: CONFIGURACIÓN DE CORREO (proveedor de envío)
// ===================================================================

/**
 * Devuelve la configuración del proveedor de correo.
 * Proveedores soportados: 'google' | 'sendgrid' | 'brevo'
 */
function obtenerConfigCorreoInterno() {
  var raw = PropertiesService.getScriptProperties().getProperty(CLAVE_CONFIG_CORREO);
  var def = {
    proveedor:  'google',
    fromNombre: 'Sistema RRHH',
    fromEmail:  '',
    apiKey:     '',
    dominio:    ''
  };
  if (!raw) return def;
  try { return Object.assign(def, JSON.parse(raw)); } catch (e) { return def; }
}

function obtenerConfigCorreo(token) {
  var _authErr = requiereAdmin(token);
  if (_authErr) return _authErr;

  var cfg = obtenerConfigCorreoInterno();
  cfg.apiKey = enmascararSecreto(cfg.apiKey);
  return cfg;
}

/**
 * Guarda la configuración del proveedor de correo.
 * Si apiKey llega vacía no sobreescribe la guardada (evita borrarla al editar).
 */
function guardarConfigCorreo(cfg, token) {
  var _authErr = requiereAdmin(token);
  if (_authErr) return _authErr;

  var actual = obtenerConfigCorreoInterno();
  if (!cfg.apiKey) cfg.apiKey = actual.apiKey; // preservar key existente si no se cambia
  PropertiesService.getScriptProperties().setProperty(CLAVE_CONFIG_CORREO, JSON.stringify(cfg));
  return { ok: true, mensaje: 'Configuración de correo guardada.' };
}

/**
 * Envía un correo de prueba al usuario actual para verificar la config.
 */
function probarConfigCorreo(token) {
  var _authErr = requiereAdmin(token);
  if (_authErr) return _authErr;

  var destino = Session.getActiveUser().getEmail();
  if (!destino) destino = obtenerConfigAlertasInterno().destinatarios.split(',')[0].trim();
  if (!destino) return { ok: false, mensaje: 'No se pudo determinar el correo del destinatario. Configura los destinatarios en la sección Alertas.' };

  try {
    var cfg = obtenerConfigCorreoInterno();
    _enviarCorreo([destino], '🧪 [PRUEBA] Configuración de correo — Sistema RRHH',
      '<p>✅ El proveedor <strong>' + cfg.proveedor + '</strong> funciona correctamente.</p>' +
      '<p>Este mensaje fue enviado desde el módulo de Configuración del Sistema RRHH.</p>');
    return { ok: true, mensaje: 'Correo de prueba enviado a <strong>' + destino + '</strong>.' };
  } catch (e) {
    return { ok: false, mensaje: 'Error al enviar: ' + e.message };
  }
}

/**
 * Uso interno (sin token) — llamado desde triggers programados y otros
 * flujos del servidor (verificarAlertas, probarAlerta, probarConfigCorreo)
 * que corren sin sesión de usuario. El wrapper público
 * `obtenerConfigAlertas(token)` de abajo es el único punto de entrada
 * autorizado desde el frontend.
 */
function obtenerConfigAlertasInterno() {
  var raw = PropertiesService.getScriptProperties().getProperty(CLAVE_CONFIG_ALERTAS);
  var def = {
    destinatarios:              '',
    vacacionesPendientesActiva: true,
    nominaMensualActiva:        true,
    nominaMensualDia:           25,
    resumenSemanalActivo:       false,
    cumpleaniosActiva:          false
  };
  if (!raw) return def;
  try { return Object.assign(def, JSON.parse(raw)); } catch (e) { return def; }
}

/** Versión pública: exige sesión de Admin porque expone los correos internos de RRHH. */
function obtenerConfigAlertas(token) {
  var _authErr = requiereAdmin(token);
  if (_authErr) return _authErr;
  return obtenerConfigAlertasInterno();
}

/** Guarda la configuración de alertas. */
function guardarConfigAlertas(cfg, token) {
  var _authErr = requiereAdmin(token);
  if (_authErr) return _authErr;

  PropertiesService.getScriptProperties().setProperty(CLAVE_CONFIG_ALERTAS, JSON.stringify(cfg));
  return { ok: true };
}

/**
 * Función principal de alertas — llamada por el trigger diario (8 a.m.).
 * También se puede invocar manualmente desde appsscript.google.com.
 */
function verificarAlertas() {
  // Cada bloque va en su propio try/catch: si uno falla (ej. una fecha
  // malformada en un empleado), los demás avisos igual deben salir en
  // vez de que todo el chequeo diario se aborte en silencio.
  function _intentar(nombre, fn) {
    try {
      fn();
    } catch (e) {
      try { registrarBitacora('error', 'Sistema', '', 'Alerta "' + nombre + '" falló: ' + e.message); } catch (e2) {}
    }
  }

  var cfg    = obtenerConfigAlertasInterno();
  var emails = cfg.destinatarios.split(',').map(function (e) { return e.trim(); }).filter(Boolean);
  var waCfg  = obtenerConfigWhatsAppInterno();
  var waListo = waCfg.activo && waCfg.telefono && waCfg.apikey;

  if (!emails.length && !waListo) return;

  if (emails.length) {
    if (cfg.vacacionesPendientesActiva) {
      _intentar('vacaciones pendientes', function () {
        var msgVac = _cuerpoVacacionesPendientes();
        if (msgVac) _enviarCorreo(emails, '🏖 Vacaciones pendientes de aprobación', msgVac);
      });
    }

    if (cfg.nominaMensualActiva) {
      _intentar('nómina mensual', function () {
        var hoy = new Date();
        if (hoy.getDate() >= Number(cfg.nominaMensualDia)) {
          var msgNom = _cuerpoNominaMensual();
          if (msgNom) _enviarCorreo(emails, '💰 Nómina mensual no generada', msgNom);
        }
      });
    }

    if (cfg.resumenSemanalActivo && new Date().getDay() === 1) {
      _intentar('resumen semanal', function () {
        _enviarCorreo(emails, '📊 Resumen semanal de RRHH', _cuerpoResumenSemanal());
      });
    }

    if (cfg.cumpleaniosActiva && new Date().getDate() === 1) {
      _intentar('cumpleaños', function () {
        var msgCump = _cuerpoProximosCumpleanios();
        if (msgCump) _enviarCorreo(emails, '🎂 Cumpleaños de empleados este mes', msgCump);
      });
    }
  }

  if (waListo) {
    _intentar('whatsapp', function () { _enviarAlertasWhatsApp(cfg, waCfg); });
  }
}

/** Genera el cuerpo HTML para vacaciones pendientes. */
function _cuerpoVacacionesPendientes() {
  var vacs      = leerTabla(HOJAS.VACACIONES);
  var pendientes = vacs.filter(function (v) { return estadoNormalizado(v.estado) === 'pendiente'; });
  if (!pendientes.length) return null;

  var mapa = mapaEmpleados();
  var filas = pendientes.map(function (v) {
    var nombre = escaparHtmlEmail(mapa[v.empleado_id] || v.empleado_id || '—');
    return '<tr>' +
      '<td style="padding:6px 10px">' + nombre + '</td>' +
      '<td style="padding:6px 10px">' + (v.fecha_inicio || '—') + '</td>' +
      '<td style="padding:6px 10px">' + (v.fecha_fin    || '—') + '</td>' +
      '<td style="padding:6px 10px">' + (v.dias         || '—') + ' días</td>' +
      '</tr>';
  }).join('');

  return '<p>Hay <strong>' + pendientes.length + ' solicitud(es) de vacaciones</strong> ' +
    'pendientes de aprobación:</p>' +
    '<table border="1" cellspacing="0" cellpadding="0" ' +
      'style="border-collapse:collapse;font-size:13px;border-color:#e5e7eb">' +
    '<thead><tr style="background:#f3f4f6">' +
      '<th style="padding:6px 10px">Empleado</th>' +
      '<th style="padding:6px 10px">Desde</th>' +
      '<th style="padding:6px 10px">Hasta</th>' +
      '<th style="padding:6px 10px">Duración</th>' +
    '</tr></thead>' +
    '<tbody>' + filas + '</tbody>' +
    '</table>' +
    '<p style="margin-top:14px">Ingresa al sistema para aprobar o rechazar estas solicitudes.</p>';
}

/** Genera el cuerpo HTML para nómina mensual no generada. */
function _cuerpoNominaMensual() {
  var mesActual = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM');
  var noms      = leerTabla(HOJAS.NOMINA).filter(function (n) { return String(n.mes) === mesActual; });
  var activos   = leerTabla(HOJAS.EMPLEADOS).filter(function (e) {
    return estadoNormalizado(e.estado) === 'activo';
  });
  if (!activos.length) return null;
  var conNomina = {};
  noms.forEach(function (n) { conNomina[String(n.empleado_id)] = true; });
  var faltantes = activos.filter(function (e) { return !conNomina[String(e.id)]; });
  if (!faltantes.length) return null;

  var lista = faltantes.map(function (e) {
    return '<li>' + escaparHtmlEmail(e.nombre) + '</li>';
  }).join('');

  return '<p>Faltan <strong>' + faltantes.length + ' empleado(s) activo(s)</strong> sin nómina en ' +
    '<strong>' + mesActual + '</strong>:</p><ul>' + lista + '</ul>' +
    '<p>Ingresa al módulo de <strong>Nómina</strong> y genera los recibos pendientes.</p>';
}

/** Genera el cuerpo HTML del resumen semanal. */
function _cuerpoResumenSemanal() {
  var emps    = leerTabla(HOJAS.EMPLEADOS);
  var activos = emps.filter(function (e) { return estadoNormalizado(e.estado) === 'activo'; }).length;
  var inactivos = emps.length - activos;

  var vacs    = leerTabla(HOJAS.VACACIONES);
  var vacPend = vacs.filter(function (v) { return estadoNormalizado(v.estado) === 'pendiente'; }).length;
  var vacApro = vacs.filter(function (v) { return estadoNormalizado(v.estado) === 'aprobada'; }).length;

  var mesActual = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM');
  var nominaMes = leerTabla(HOJAS.NOMINA).filter(function (n) { return String(n.mes) === mesActual; });
  var totalNeto = nominaMes.reduce(function (s, n) { return s + (Number(n.neto) || 0); }, 0);

  return '<p>Resumen del sistema de RRHH al <strong>' +
    Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'dd/MM/yyyy') + '</strong>:</p>' +
    '<table border="1" cellspacing="0" cellpadding="0" ' +
      'style="border-collapse:collapse;font-size:13px;border-color:#e5e7eb">' +
    '<tbody>' +
      '<tr><td style="padding:6px 14px;background:#f3f4f6"><strong>Empleados activos</strong></td>' +
        '<td style="padding:6px 14px">' + activos + '</td></tr>' +
      '<tr><td style="padding:6px 14px;background:#f3f4f6"><strong>Empleados inactivos</strong></td>' +
        '<td style="padding:6px 14px">' + inactivos + '</td></tr>' +
      '<tr><td style="padding:6px 14px;background:#f3f4f6"><strong>Vacaciones pendientes</strong></td>' +
        '<td style="padding:6px 14px">' + vacPend + '</td></tr>' +
      '<tr><td style="padding:6px 14px;background:#f3f4f6"><strong>Vacaciones aprobadas</strong></td>' +
        '<td style="padding:6px 14px">' + vacApro + '</td></tr>' +
      '<tr><td style="padding:6px 14px;background:#f3f4f6"><strong>Nómina ' + mesActual + '</strong></td>' +
        '<td style="padding:6px 14px">₡' + totalNeto.toLocaleString() + ' neto total</td></tr>' +
    '</tbody></table>';
}

/** Genera el HTML completo del correo a partir del cuerpo interior. */
function _plantillaCorreo(cuerpoHtml) {
  var cfg = obtenerConfigCorreoInterno();
  return '<div style="font-family:-apple-system,Arial,sans-serif;max-width:620px;margin:0 auto">' +
    '<div style="background:#2563eb;color:#fff;padding:16px 20px;border-radius:8px 8px 0 0">' +
      '<h2 style="margin:0;font-size:18px">' + (cfg.fromNombre || 'Sistema RRHH') + '</h2>' +
    '</div>' +
    '<div style="padding:20px;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 8px 8px">' +
      cuerpoHtml +
      '<hr style="margin:20px 0;border:none;border-top:1px solid #e5e7eb">' +
      '<p style="color:#6b7280;font-size:12px">Correo generado automáticamente por el Sistema RRHH. ' +
        'No responder a este mensaje.</p>' +
    '</div>' +
  '</div>';
}

/**
 * Despacha el correo al proveedor configurado.
 * Proveedor 'google' → MailApp | 'sendgrid' → SendGrid API | 'brevo' → Brevo API
 */
function _enviarCorreo(emails, asunto, cuerpoHtml) {
  var cfg  = obtenerConfigCorreoInterno();
  var html = _plantillaCorreo(cuerpoHtml);

  if (cfg.proveedor === 'sendgrid') {
    _enviarSendGrid(emails, asunto, html, cfg);
  } else if (cfg.proveedor === 'brevo') {
    _enviarBrevo(emails, asunto, html, cfg);
  } else {
    // Google MailApp (sin configuración extra requerida)
    emails.forEach(function (to) {
      MailApp.sendEmail({
        to:       to,
        subject:  asunto,
        htmlBody: html,
        name:     cfg.fromNombre || 'Sistema RRHH',
        replyTo:  cfg.fromEmail  || ''
      });
    });
  }
}

/** Envía vía SendGrid Transactional Email API v3. */
function _enviarSendGrid(emails, asunto, html, cfg) {
  if (!cfg.apiKey)    throw new Error('SendGrid: falta la API Key.');
  if (!cfg.fromEmail) throw new Error('SendGrid: falta el correo del remitente.');

  var payload = {
    personalizations: [{ to: emails.map(function (e) { return { email: e }; }) }],
    from:    { email: cfg.fromEmail, name: cfg.fromNombre || 'Sistema RRHH' },
    subject: asunto,
    content: [{ type: 'text/html', value: html }]
  };
  var res = UrlFetchApp.fetch('https://api.sendgrid.com/v3/mail/send', {
    method:           'post',
    contentType:      'application/json',
    headers:          { Authorization: 'Bearer ' + cfg.apiKey },
    payload:          JSON.stringify(payload),
    muteHttpExceptions: true
  });
  var code = res.getResponseCode();
  if (code >= 400) {
    throw new Error('SendGrid error ' + code + ': ' + res.getContentText().slice(0, 200));
  }
}

/** Envía vía Brevo (Sendinblue) Transactional Email API v3. */
function _enviarBrevo(emails, asunto, html, cfg) {
  if (!cfg.apiKey)    throw new Error('Brevo: falta la API Key.');
  if (!cfg.fromEmail) throw new Error('Brevo: falta el correo del remitente.');

  var payload = {
    sender:      { email: cfg.fromEmail, name: cfg.fromNombre || 'Sistema RRHH' },
    to:          emails.map(function (e) { return { email: e }; }),
    subject:     asunto,
    htmlContent: html
  };
  var res = UrlFetchApp.fetch('https://api.brevo.com/v3/smtp/email', {
    method:           'post',
    contentType:      'application/json',
    headers:          { 'api-key': cfg.apiKey },
    payload:          JSON.stringify(payload),
    muteHttpExceptions: true
  });
  var code = res.getResponseCode();
  if (code >= 400) {
    throw new Error('Brevo error ' + code + ': ' + res.getContentText().slice(0, 200));
  }
}

/**
 * Envía un correo de prueba inmediato para verificar que la configuración funciona.
 * @param {string} tipo  'vacaciones' | 'nomina' | 'resumen' | 'general'
 */
function probarAlerta(tipo, token) {
  var _authErr = requiereEscritura(token);
  if (_authErr) return _authErr;

  var cfg    = obtenerConfigAlertasInterno();
  var emails = cfg.destinatarios.split(',').map(function (e) { return e.trim(); }).filter(Boolean);
  if (!emails.length) return { ok: false, mensaje: 'Agrega al menos un destinatario antes de probar.' };

  var cuerpo, asunto;

  if (tipo === 'vacaciones') {
    cuerpo = _cuerpoVacacionesPendientes() ||
      '<p>✅ No hay vacaciones pendientes en este momento.</p>';
    asunto = '🧪 [PRUEBA] Vacaciones pendientes de aprobación';
  } else if (tipo === 'nomina') {
    cuerpo = _cuerpoNominaMensual() ||
      '<p>✅ La nómina del mes actual ya fue generada.</p>';
    asunto = '🧪 [PRUEBA] Nómina mensual';
  } else if (tipo === 'resumen') {
    cuerpo = _cuerpoResumenSemanal();
    asunto = '🧪 [PRUEBA] Resumen semanal de RRHH';
  } else {
    cuerpo = '<p>✅ El sistema de alertas de correo está configurado correctamente.</p>' +
      '<p>Los correos automáticos llegarán según la configuración establecida.</p>';
    asunto = '🧪 [PRUEBA] Alerta de prueba — Sistema RRHH';
  }

  _enviarCorreo(emails, asunto, cuerpo);
  return { ok: true, mensaje: 'Correo de prueba enviado a: ' + emails.join(', ') };
}

/** Crea (o reactiva) el trigger diario a las 8 a.m. */
function activarTriggerAlertas(token) {
  var _authErr = requiereAdmin(token);
  if (_authErr) return _authErr;

  desactivarTriggerAlertas(); // elimina duplicados
  var t = ScriptApp.newTrigger('verificarAlertas')
    .timeBased().everyDays(1).atHour(8).create();
  PropertiesService.getScriptProperties().setProperty(CLAVE_TRIGGER_ID, t.getUniqueId());
  return { ok: true, mensaje: 'Verificación diaria activada (todos los días a las 8 a.m.).' };
}

/** Elimina el trigger diario si existe. */
function desactivarTriggerAlertas(token) {
  var _authErr = requiereAdmin(token);
  if (_authErr) return _authErr;

  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'verificarAlertas') ScriptApp.deleteTrigger(t);
  });
  PropertiesService.getScriptProperties().deleteProperty(CLAVE_TRIGGER_ID);
  return { ok: true, mensaje: 'Verificación diaria desactivada.' };
}

/** Devuelve si el trigger está activo actualmente. */
function estadoTriggerAlertas() {
  var activo = ScriptApp.getProjectTriggers().some(function (t) {
    return t.getHandlerFunction() === 'verificarAlertas';
  });
  return { activo: activo };
}


// ===================================================================
// MÓDULO: IMPORTACIÓN MASIVA (Excel / CSV)
// ===================================================================
// Recibe filas ya mapeadas desde el frontend y las inserta en la
// pestaña correspondiente, validando y reportando duplicados/errores.
// ===================================================================

/**
 * Importa un arreglo de objetos en la entidad indicada.
 * Las claves de cada objeto ya corresponden a nuestros nombres de campo
 * (el frontend aplica el mapeo de columnas antes de enviar).
 *
 * @param {string}   entidad  Clave de HOJAS: 'EMPLEADOS' | 'DEPARTAMENTOS'.
 * @param {Object[]} filas    Arreglo de objetos con los datos.
 * @return {Object}  {ok, creados, omitidos, errores:[{fila,motivo}], mensaje}
 */
function importarDatos(entidad, filas, token) {
  var _authErr = requiereEscritura(token);
  if (_authErr) return _authErr;

  if (!HOJAS[entidad]) {
    return { ok: false, mensaje: 'Entidad no reconocida: ' + entidad };
  }
  if (!filas || filas.length === 0) {
    return { ok: false, mensaje: 'El archivo no contiene filas de datos.' };
  }

  var creados = 0, omitidos = 0, errores = [];
  var hoja = getHoja(HOJAS[entidad]);

  // Índices construidos UNA sola vez (en vez de releer la hoja completa
  // por cada fila importada, que es O(n²) con importaciones grandes).
  var cedulasExistentes = {};
  var deptosExistentes = {};
  if (entidad === 'EMPLEADOS') {
    leerTabla(HOJAS.EMPLEADOS).forEach(function (e) {
      var cedNorm = String(e.cedula).trim().toUpperCase();
      cedulasExistentes[cedNorm] = true;
    });
  } else if (entidad === 'DEPARTAMENTOS') {
    leerTabla(HOJAS.DEPARTAMENTOS).forEach(function (d) {
      deptosExistentes[String(d.nombre).trim().toLowerCase()] = true;
    });
  }

  filas.forEach(function (fila, idx) {
    var numFila = idx + 2; // fila real en el Excel (encabezados en 1)
    try {
      if (entidad === 'EMPLEADOS') {
        var emp = {
          nombre:        String(fila.nombre        || '').trim(),
          cedula:        String(fila.cedula         || '').trim().toUpperCase(),
          departamento:  String(fila.departamento  || '').trim(),
          puesto:        String(fila.puesto         || '').trim(),
          fecha_ingreso: String(fila.fecha_ingreso  || '').trim(),
          salario:       fila.salario,
          estado:        String(fila.estado || 'activo').trim().toLowerCase(),
          correo:        String(fila.correo || '').trim()
        };
        if (emp.estado !== 'activo' && emp.estado !== 'inactivo') emp.estado = 'activo';

        var error = validarEmpleado(emp);
        if (error) { errores.push({ fila: numFila, motivo: error }); return; }
        if (cedulasExistentes[emp.cedula]) { omitidos++; return; }

        hoja.appendRow([generarId('EMP'), emp.nombre, emp.cedula,
          emp.departamento, emp.puesto, formatearFecha(emp.fecha_ingreso),
          Number(emp.salario) || 0, emp.estado,
          fila.fecha_nacimiento ? formatearFecha(String(fila.fecha_nacimiento)) : '',
          String(fila.telefono || '').trim()
        ].concat(_camposExtraEmpleado(fila, null)));
        cedulasExistentes[emp.cedula] = true;
        creados++;

      } else if (entidad === 'DEPARTAMENTOS') {
        var dep = {
          nombre:      String(fila.nombre      || '').trim(),
          responsable: String(fila.responsable || '').trim()
        };
        if (!dep.nombre) { errores.push({ fila: numFila, motivo: 'Nombre vacío.' }); return; }
        var claveDepto = dep.nombre.toLowerCase();
        if (deptosExistentes[claveDepto]) { omitidos++; return; }
        hoja.appendRow([generarId('DEP'), dep.nombre, dep.responsable]);
        deptosExistentes[claveDepto] = true;
        creados++;
      }
    } catch (e) {
      errores.push({ fila: numFila, motivo: e.message });
    }
  });

  return {
    ok:      true,
    creados: creados,
    omitidos: omitidos,
    errores: errores,
    mensaje: creados + ' registros importados, ' + omitidos + ' omitidos por duplicado.'
  };
}


// ===================================================================
// MÓDULO: CARGA COMPLETA DESDE EXCEL
// ===================================================================
// Recibe todas las pestañas ya convertidas por el frontend
// (Js_CargaExcel parsea el Excel de la empresa con SheetJS) y las
// escribe en la hoja de Google de una sola vez.
// ===================================================================

/**
 * Prefijos de ID por pestaña, para generar ids si el archivo no los trae.
 */
var PREFIJOS_ID = {
  Empleados: 'EMP', Departamentos: 'DEP', Asistencia: 'ASI', Vacaciones: 'VAC',
  Nomina: 'NOM', HistorialSalarios: 'HSA', Capacitaciones: 'CAP', Evaluaciones: 'EVA',
  Prestamos: 'PRE', HorasExtra: 'HEX', Activos: 'ACT', Turnos: 'TUR',
  Incapacidades: 'INC', Feriados: 'FER', Liquidaciones: 'LIQ'
};

/**
 * Carga masiva de toda la base de datos.
 *
 * @param {Object} datos  { NombrePestana: [ {campo: valor, ...}, ... ], ... }
 *                        Las claves de cada objeto son los nombres de campo
 *                        de ENCABEZADOS (el frontend ya hizo la conversión).
 * @param {string} modo   'agregar'    → añade al final (omite duplicados básicos)
 *                        'reemplazar' → borra los datos actuales de cada pestaña
 *                                       incluida en el archivo y escribe los nuevos.
 * @return {Object} {ok, resumen:[{pestana, creados, omitidos}], mensaje}
 */
function cargarBaseCompleta(datos, modo, token) {
  if (!token) {
    return { ok: false, mensaje: 'Acceso denegado. Token requerido.' };
  }
  var _authErr = requiereAdmin(token);
  if (_authErr) return _authErr;

  if (!datos || typeof datos !== 'object') {
    return { ok: false, mensaje: 'No se recibieron datos.' };
  }
  var reemplazar = (modo === 'reemplazar');
  var resumen = [];

  Object.keys(ENCABEZADOS).forEach(function (tab) {
    var filas = datos[tab];
    if (!filas || !filas.length) return;

    var encabezados = ENCABEZADOS[tab];
    var hoja = getHoja(tab);

    if (reemplazar) {
      var ultimaFila = hoja.getLastRow();
      if (ultimaFila > 1) {
        hoja.getRange(2, 1, ultimaFila - 1, Math.max(hoja.getLastColumn(), encabezados.length)).clearContent();
      }
    }

    // Claves ya existentes para omitir duplicados en modo 'agregar'.
    var existentes = {};
    if (!reemplazar) {
      leerTabla(tab).forEach(function (r) {
        var clave = _claveDuplicado(tab, r);
        if (clave) existentes[clave] = true;
      });
    }

    var omitidos = 0;
    var nuevas = [];
    filas.forEach(function (f) {
      var clave = _claveDuplicado(tab, f);
      if (clave && existentes[clave]) { omitidos++; return; }
      if (clave) existentes[clave] = true;
      nuevas.push(encabezados.map(function (campo) {
        if (campo === 'id' && !f.id) return generarId(PREFIJOS_ID[tab] || 'ID');
        var v = f[campo];
        return (v === undefined || v === null) ? '' : v;
      }));
    });

    if (nuevas.length) {
      hoja.getRange(hoja.getLastRow() + 1, 1, nuevas.length, encabezados.length).setValues(nuevas);
    }
    resumen.push({ pestana: tab, creados: nuevas.length, omitidos: omitidos });
  });

  if (!resumen.length) {
    return { ok: false, mensaje: 'El archivo no contiene pestañas con datos reconocibles.' };
  }
  var totales = resumen.map(function (r) { return r.pestana + ': ' + r.creados; }).join(', ');
  registrarBitacora('importar', 'BaseCompleta', '',
    (reemplazar ? 'Reemplazo' : 'Carga') + ' desde Excel → ' + totales);
  return { ok: true, resumen: resumen, mensaje: 'Carga completada. ' + totales + '.' };
}

/**
 * Clave para detectar duplicados por pestaña en modo 'agregar'.
 * Devuelve '' si la pestaña no tiene criterio de duplicado (siempre agrega).
 */
function _claveDuplicado(tab, fila) {
  if (tab === 'Empleados')     return String(fila.cedula || '').trim();
  if (tab === 'Departamentos') return String(fila.nombre || '').trim().toLowerCase();
  if (tab === 'Feriados')      return formatearFecha(fila.fecha);
  if (tab === 'Asistencia')    return [fila.empleado_id, formatearFecha(fila.fecha)].join('|');
  if (tab === 'Vacaciones')    return [fila.empleado_id, formatearFecha(fila.fecha_inicio), formatearFecha(fila.fecha_fin)].join('|');
  if (tab === 'Incapacidades') return [fila.empleado_id, formatearFecha(fila.fecha_desde), formatearFecha(fila.fecha_hasta)].join('|');
  if (tab === 'Liquidaciones') return [fila.empleado_id, formatearFecha(fila.fecha_salida)].join('|');
  if (fila && fila.id)         return 'id:' + fila.id;
  return '';
}


// ===================================================================
// MÓDULO: CONFIGURACIÓN (archivos de Google)
// ===================================================================
// Permite conectar/verificar la hoja de Google que sirve de base de
// datos y crear automáticamente las pestañas con sus encabezados.
// ===================================================================

/**
 * Devuelve el estado actual de la conexión con Google Sheets:
 * - si hay un ID configurado o se usa la hoja ligada,
 * - el nombre y la URL del libro,
 * - y, por cada pestaña esperada, si existe y cuántos registros tiene.
 *
 * @return {Object} información para la pantalla de Configuración.
 */
function obtenerConfiguracion(token) {
  var _authErr = requiereAdmin(token);
  if (_authErr) return _authErr;

  var idGuardado = PropertiesService.getScriptProperties().getProperty(CLAVE_ID_HOJA);

  var info = {
    idConfigurado: idGuardado || '',
    usandoHojaLigada: !idGuardado,
    conectado: false,
    nombreLibro: '',
    urlLibro: '',
    idLibro: '',
    pestanas: [],
    error: ''
  };

  try {
    var libro = getLibro();
    info.conectado = true;
    info.nombreLibro = libro.getName();
    info.urlLibro = libro.getUrl();
    info.idLibro = libro.getId();

    // Estado de cada pestaña esperada.
    Object.keys(HOJAS).forEach(function (clave) {
      var nombre = HOJAS[clave];
      var hoja = libro.getSheetByName(nombre);
      var registros = 0;
      if (hoja) {
        // Filas de datos = total de filas con contenido - 1 (encabezados).
        registros = Math.max(0, hoja.getLastRow() - 1);
      }
      info.pestanas.push({
        nombre: nombre,
        existe: !!hoja,
        registros: registros,
        columnas: (ENCABEZADOS[nombre] || []).join(' · ')
      });
    });
  } catch (e) {
    info.error = e.message;
  }
  return info;
}

/**
 * Mapeo de nombres alternativos (variantes comunes de hojas importadas)
 * hacia el nombre canónico que espera el sistema.
 * Se usa al conectar una hoja existente para renombrar automáticamente.
 */
var ALIAS_PESTANAS = {
  // Empleados
  'BASE DATOS PERSONAL': 'Empleados',
  'EMPLEADOS':           'Empleados',
  'PERSONAL':            'Empleados',
  'TRABAJADORES':        'Empleados',
  // Vacaciones
  'VACACIONES':          'Vacaciones',
  // Incapacidades
  'INCAPACIDADES CCSS-INS': 'Incapacidades',
  'INCAPACIDADES':          'Incapacidades',
  // Asistencia
  'ASISTENCIA':          'Asistencia',
  'CONTROL ASISTENCIA':  'Asistencia',
  // Feriados
  'FERIADOS':            'Feriados',
  'DIAS FERIADOS':       'Feriados',
  // Liquidaciones
  'LIQUIDACION LABORAL':  'Liquidaciones',
  'LIQUIDACIÓN LABORAL':  'Liquidaciones',
  'LIQUIDACIONES':        'Liquidaciones',
  // Departamentos
  'DEPARTAMENTOS':        'Departamentos',
  'AREAS':                'Departamentos',
};

/**
 * Recorre las pestañas de un libro e intenta renombrar las que coincidan
 * con algún alias en ALIAS_PESTANAS pero cuyo nombre canónico no exista aún.
 * Devuelve lista de cambios realizados.
 * @param {Spreadsheet} libro
 * @return {string[]} descripción de cada cambio
 */
function _normalizarPestanas(libro) {
  var cambios = [];
  var nombresCanonicos = Object.keys(HOJAS).map(function(k) { return HOJAS[k]; });
  var hojas = libro.getSheets();

  hojas.forEach(function(hoja) {
    var nombre = hoja.getName();
    var nombreUpper = nombre.toUpperCase().trim();
    var canonico = ALIAS_PESTANAS[nombre.trim()] || ALIAS_PESTANAS[nombreUpper];
    if (!canonico) return; // sin alias conocido, no tocar
    if (nombre === canonico) return; // ya tiene el nombre correcto
    // Solo renombrar si la pestaña canónica no existe ya
    var yaExiste = hojas.some(function(h) { return h.getName() === canonico; });
    if (yaExiste) return;
    hoja.setName(canonico);
    cambios.push('"' + nombre + '" → "' + canonico + '"');
  });

  return cambios;
}

/**
 * Guarda el ID de la hoja de Google que se usará como base de datos.
 * Valida que el ID se pueda abrir antes de guardarlo y normaliza
 * automáticamente los nombres de las pestañas si usan variantes conocidas.
 *
 * @param {string} id  ID de la hoja (la parte larga de la URL).
 * @return {Object} {ok, mensaje, renombradas?}
 */
function guardarIdHoja(id, token) {
  var _authErr = requiereAdmin(token);
  if (_authErr) return _authErr;

  id = String(id || '').trim();
  if (!id) {
    return { ok: false, mensaje: 'Debes indicar el ID de la hoja.' };
  }
  // Si pegan la URL completa, extraemos el ID (entre /d/ y /edit).
  var m = id.match(/\/d\/([a-zA-Z0-9\-_]+)/);
  if (m) id = m[1];

  try {
    var libro = SpreadsheetApp.openById(id); // valida acceso
    PropertiesService.getScriptProperties().setProperty(CLAVE_ID_HOJA, id);

    // Normalizar nombres de pestañas automáticamente
    var cambios = _normalizarPestanas(libro);
    var msgExtra = cambios.length
      ? ' Pestañas renombradas automáticamente: ' + cambios.join(', ') + '.'
      : '';

    return { ok: true, mensaje: 'Hoja conectada: "' + libro.getName() + '".' + msgExtra, renombradas: cambios };
  } catch (e) {
    return { ok: false, mensaje: 'No se pudo abrir esa hoja. Verifica el ID y ' +
      'que tu cuenta tenga acceso. Detalle: ' + e.message };
  }
}

/**
 * Crea una hoja de Google NUEVA, la deja con todas las pestañas y
 * encabezados listos, y la conecta como base de datos del sistema.
 * Útil para usuarios que aún no tienen ninguna hoja.
 *
 * @param {string} nombre  nombre para la hoja nueva (opcional).
 * @return {Object} {ok, mensaje, url?, id?}
 */
function crearHojaNueva(nombre, token) {
  var _authErr = requiereAdmin(token);
  if (_authErr) return _authErr;

  nombre = String(nombre || '').trim() || 'Base RRHH';
  try {
    // 1) Crear el libro nuevo en el Drive del usuario.
    var libro = SpreadsheetApp.create(nombre);
    var id = libro.getId();
    var hojaInicial = libro.getSheets()[0]; // pestaña vacía por defecto

    // 2) Conectarlo como hoja activa (getLibro lo abrirá por este ID).
    PropertiesService.getScriptProperties().setProperty(CLAVE_ID_HOJA, id);

    // 3) Crear todas las pestañas con sus encabezados.
    Object.keys(HOJAS).forEach(function (clave) { getHoja(HOJAS[clave]); });

    // 4) Borrar la pestaña inicial vacía (si no es una de las nuestras).
    var nombresValidos = Object.keys(HOJAS).map(function (k) { return HOJAS[k]; });
    if (nombresValidos.indexOf(hojaInicial.getName()) === -1) {
      libro.deleteSheet(hojaInicial);
    }

    return {
      ok: true,
      mensaje: 'Hoja "' + nombre + '" creada y conectada con sus pestañas.',
      url: libro.getUrl(),
      id: id
    };
  } catch (e) {
    return { ok: false, mensaje: 'No se pudo crear la hoja: ' + e.message };
  }
}

/**
 * Vuelve a usar la hoja ligada al proyecto (borra el ID configurado).
 * @return {Object} {ok, mensaje}
 */
function usarHojaLigada(token) {
  var _authErr = requiereAdmin(token);
  if (_authErr) return _authErr;

  PropertiesService.getScriptProperties().deleteProperty(CLAVE_ID_HOJA);
  var activa = SpreadsheetApp.getActiveSpreadsheet();
  if (!activa) {
    return { ok: false, mensaje: 'Este proyecto no está ligado a ninguna hoja. ' +
      'Configura un ID en su lugar.' };
  }
  return { ok: true, mensaje: 'Ahora se usa la hoja ligada: "' + activa.getName() + '".' };
}

// ===================================================================
// MÓDULO: BITÁCORA DE CAMBIOS
// ===================================================================

/**
 * Registra un evento en bitácora de auditoría.
 * Fase 4 - Item 18: Auditoría completa con JSON antes/después.
 * @param {string} accion - crear, actualizar, eliminar, respaldo, error, etc.
 * @param {string} entidad - tipo de entidad (Empleados, Nómina, etc.)
 * @param {string} entidadId - ID de la entidad afectada
 * @param {string} resumen - descripción del cambio (puede incluir valores antes/después)
 * @param {Object} [cambios] - opcional: {antes: {...}, despues: {...}} para auditoría detallada
 */
function registrarBitacora(accion, entidad, entidadId, resumen, cambios) {
  try {
    var hoja = getHoja(HOJAS.BITACORA);
    var usuario = '';
    try { usuario = Session.getActiveUser().getEmail(); } catch (e) {}

    var detalles = resumen || '';
    var jsonCambios = '';

    if (cambios) {
      try {
        // Guardar JSON completo de cambios (limitado a 5000 chars para Sheets)
        jsonCambios = JSON.stringify(cambios).substring(0, 5000);
        detalles += ' | JSON: ' + jsonCambios;
      } catch (e) { /* no romper por fallo de serialización */ }
    }

    // Agregar: id, timestamp, usuario, acción, entidad, entidadId, resumen, jsonCambios
    hoja.appendRow([
      generarId('BIT'),
      new Date(),
      usuario,
      accion,
      entidad,
      entidadId || '',
      detalles,
      jsonCambios  // Nueva columna para auditoría estructurada
    ]);
  } catch (e) { /* no interrumpir operaciones por fallo de bitácora */ }
}

/**
 * Consulta auditoría con filtros.
 * @param {string} [entidad] - Filtrar por tipo de entidad (opcional)
 * @param {string} [entidadId] - Filtrar por ID (opcional)
 * @param {number} [limite] - Máximo de registros a devolver (default 100)
 * @return {Object[]} Registros de auditoría
 */
function consultarAuditoria(entidad, entidadId, limite, token) {
  var _authErr = requiereEscritura(token);
  if (_authErr) return _authErr;

  var registros = leerTabla(HOJAS.BITACORA) || [];

  if (entidad) {
    registros = registros.filter(function (r) { return String(r.entidad) === String(entidad); });
  }
  if (entidadId) {
    registros = registros.filter(function (r) { return String(r.entidad_id) === String(entidadId); });
  }

  // Ordenar por fecha descendente y limitar
  registros = registros.reverse().slice(0, limite || 100);

  // Parsear JSON si existe
  registros.forEach(function (r) {
    if (r.resumen && r.resumen.includes('JSON:')) {
      try {
        var jsonStr = r.resumen.substring(r.resumen.indexOf('JSON:') + 6);
        r.cambios = JSON.parse(jsonStr);
      } catch (e) { /* ignorar si no parsea */ }
    }
  });

  return registros;
}

function listarBitacora(limite, token) {
  var _authErr = requiereEscritura(token);
  if (_authErr) return _authErr;

  var registros = leerTabla(HOJAS.BITACORA);
  registros.forEach(function (r) {
    r.fecha = r.fecha instanceof Date
      ? Utilities.formatDate(r.fecha, Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm')
      : String(r.fecha);
  });
  registros.sort(function (a, b) { return b.fecha > a.fecha ? 1 : -1; });
  if (limite) registros = registros.slice(0, Number(limite));
  return registros;
}

// ===================================================================
// MÓDULO: REGISTRO DE ERRORES DEL SISTEMA
// ===================================================================
// El frontend reporta aquí automáticamente cualquier error que llegue
// al withFailureHandler de llamarBackend (ver Js_Comun.html). Además,
// algunos puntos críticos del propio backend llaman a esta función
// directamente desde un catch para guardar el detalle completo.
// ===================================================================

/**
 * Registra un error del sistema. Best-effort: nunca lanza excepción,
 * para que un fallo al loguear no rompa el flujo que lo está reportando.
 * @param {string} origen   función o módulo donde ocurrió el error.
 * @param {string} mensaje  mensaje de error.
 * @param {string} [contexto] datos adicionales (argumentos, stack, etc.)
 * @param {string} [token]  token de sesión (opcional).
 * @return {Object} {ok:boolean}
 */
function registrarErrorSistema(origen, mensaje, contexto, token) {
  try {
    var usuario = '';
    try {
      var sesion = validarSesion(token);
      if (sesion.ok) usuario = sesion.rol;
    } catch (e) {}
    if (!usuario) {
      try { usuario = Session.getActiveUser().getEmail(); } catch (e) {}
    }
    var hoja = getHoja(HOJAS.ERRORES);
    hoja.appendRow([
      generarId('ERR'),
      new Date(),
      String(origen || '').slice(0, 200),
      String(mensaje || '').slice(0, 1000),
      usuario || '',
      String(contexto || '').slice(0, 1000)
    ]);
    return { ok: true };
  } catch (e) {
    return { ok: false };
  }
}

/**
 * Lista los errores registrados (más recientes primero, máx. 500). Solo Admin.
 * @param {string} token
 * @return {Object[]|Object}
 */
function listarErrores(token) {
  var _authErr = requiereAdmin(token);
  if (_authErr) return _authErr;

  var registros = leerTabla(HOJAS.ERRORES);
  registros.forEach(function (r) {
    r.fecha = r.fecha instanceof Date
      ? Utilities.formatDate(r.fecha, Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm')
      : String(r.fecha);
  });
  registros.sort(function (a, b) { return b.fecha > a.fecha ? 1 : -1; });
  return registros.slice(0, 500);
}

/**
 * Borra todo el registro de errores. Solo Admin.
 * @param {string} token
 * @return {Object} {ok, mensaje}
 */
function limpiarErrores(token) {
  var _authErr = requiereAdmin(token);
  if (_authErr) return _authErr;

  var hoja = getHoja(HOJAS.ERRORES);
  var ultimaFila = hoja.getLastRow();
  if (ultimaFila > 1) {
    hoja.getRange(2, 1, ultimaFila - 1, hoja.getLastColumn()).clearContent();
  }
  return { ok: true, mensaje: 'Registro de errores limpiado.' };
}

// ===================================================================
// MÓDULO: COMUNICACIONES (plantillas de correo/WhatsApp + historial)
// ===================================================================
// Plantillas reutilizables con variables {{campo}} que se rellenan con
// los datos del empleado. El envío de WhatsApp usa la API de CallMeBot
// (callmebot.com) vía UrlFetchApp — requiere una API Key configurada
// en Configuración (cada número debe activar el bot de CallMeBot antes
// de poder recibir mensajes).
// ===================================================================

// Nota: la configuración de CallMeBot (API Key) ya existe en el módulo
// de Alertas (ver CONFIG_WHATSAPP / obtenerConfigWhatsAppInterno() más
// abajo, sección "NOTIFICACIONES WHATSAPP"). Este módulo la reutiliza en
// vez de mantener una segunda API Key duplicada — cada número de
// WhatsApp solo tiene UNA API Key de CallMeBot, así que un segundo
// campo de configuración sería redundante y confuso.

/** Formatea un monto como colones (₡) sin depender de helpers del frontend. */
function _formatoMonedaCRC(monto) {
  var n = Number(monto) || 0;
  var texto = n.toLocaleString('es-CR', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
  return '₡' + texto;
}

/**
 * Reemplaza variables {{campo}} en un texto usando los datos del empleado.
 * Variables soportadas: nombre, cedula, puesto, departamento, correo,
 * telefono, salario, fecha_ingreso, fecha (fecha actual).
 */
function _reemplazarVariablesPlantilla(texto, emp) {
  if (!texto) return '';
  emp = emp || {};
  var mapa = {
    nombre:        emp.nombre || '',
    cedula:        emp.cedula || '',
    puesto:        emp.puesto || '',
    departamento:  emp.departamento || '',
    correo:        emp.correo || '',
    telefono:      emp.telefono || '',
    salario:       emp.salario ? _formatoMonedaCRC(emp.salario) : '',
    fecha_ingreso: formatearFecha(emp.fecha_ingreso),
    fecha:         formatearFecha(new Date())
  };
  return String(texto).replace(/\{\{\s*(\w+)\s*\}\}/g, function (m, campo) {
    return (mapa[campo] !== undefined) ? mapa[campo] : m;
  });
}

/** Lista las plantillas guardadas, opcionalmente filtradas por tipo ('email'|'whatsapp'). */
function listarPlantillas(tipo, token) {
  var _authErr = requiereEscritura(token);
  if (_authErr) return _authErr;

  var plantillas = leerTabla(HOJAS.PLANTILLAS);
  if (tipo) plantillas = plantillas.filter(function (p) { return p.tipo === tipo; });
  return plantillas;
}

/** Crea o actualiza una plantilla. Requiere permiso de escritura. */
function guardarPlantilla(datos, token) {
  var _authErr = requiereEscritura(token);
  if (_authErr) return _authErr;

  if (!datos || !datos.nombre || !datos.tipo) {
    return { ok: false, mensaje: 'Nombre y tipo son obligatorios.' };
  }
  if (datos.tipo !== 'email' && datos.tipo !== 'whatsapp') {
    return { ok: false, mensaje: 'Tipo de plantilla inválido.' };
  }

  var hoja = getHoja(HOJAS.PLANTILLAS);
  if (datos.id) {
    var fila = buscarFilaPorId(hoja, datos.id);
    if (fila === -1) return { ok: false, mensaje: 'Plantilla no encontrada.' };
    hoja.getRange(fila, 1, 1, ENCABEZADOS.Plantillas.length).setValues([[
      datos.id, datos.nombre, datos.tipo, datos.asunto || '', datos.cuerpo || ''
    ]]);
    return { ok: true, mensaje: 'Plantilla actualizada.', id: datos.id };
  }

  var id = generarId('PLT');
  hoja.appendRow([id, datos.nombre, datos.tipo, datos.asunto || '', datos.cuerpo || '']);
  return { ok: true, mensaje: 'Plantilla creada.', id: id };
}

/** Elimina una plantilla. Requiere permiso de escritura. */
function eliminarPlantilla(id, token) {
  var _authErr = requiereEscritura(token);
  if (_authErr) return _authErr;

  var hoja = getHoja(HOJAS.PLANTILLAS);
  var fila = buscarFilaPorId(hoja, id);
  if (fila === -1) return { ok: false, mensaje: 'Plantilla no encontrada.' };
  hoja.deleteRow(fila);
  return { ok: true, mensaje: 'Plantilla eliminada.' };
}

/** Busca el registro completo (todas las columnas) de un empleado por id. */
function _buscarEmpleadoRaw(empleadoId) {
  return leerTabla(HOJAS.EMPLEADOS).filter(function (e) {
    return String(e.id) === String(empleadoId);
  })[0] || null;
}

/** Registra una comunicación enviada (correo o WhatsApp) en el historial. */
function _registrarComunicacion(tipo, empleadoId, destinatario, asunto, cuerpo, estado, detalle, token) {
  try {
    var usuario = '';
    try {
      var sesion = validarSesion(token);
      if (sesion.ok) usuario = sesion.rol;
    } catch (e) {}
    var hoja = getHoja(HOJAS.COMUNICACIONES);
    hoja.appendRow([
      generarId('COM'), new Date(), tipo, empleadoId || '', destinatario || '',
      asunto || '', String(cuerpo || '').slice(0, 3000), estado, String(detalle || '').slice(0, 500), usuario
    ]);
  } catch (e) { /* no bloquear el envío si falla el registro */ }
}

/**
 * Envía un correo usando una plantilla (o asunto/cuerpo directos) a un
 * empleado, sustituyendo variables, y registra el envío en el historial.
 * @param {Object} datos {empleado_id, plantilla_id?, asunto?, cuerpo?, destinatarioOverride?}
 * @param {string} token
 */
function enviarCorreoPlantilla(datos, token) {
  var _authErr = requiereEscritura(token);
  if (_authErr) return _authErr;

  if (!datos || !datos.empleado_id) return { ok: false, mensaje: 'Selecciona un empleado.' };
  var emp = _buscarEmpleadoRaw(datos.empleado_id);
  if (!emp) return { ok: false, mensaje: 'Empleado no encontrado.' };

  var destinatario = String(datos.destinatarioOverride || emp.correo || '').trim();
  if (!destinatario) return { ok: false, mensaje: 'El empleado no tiene correo registrado.' };

  var asuntoBase = datos.asunto || '';
  var cuerpoBase = datos.cuerpo || '';
  // Si viene plantilla_id pero el frontend ya mandó asunto/cuerpo (el usuario
  // pudo haber editado el texto precargado), respetamos lo que mandó el
  // frontend en vez de sobreescribirlo con el original guardado.
  if (datos.plantilla_id && !cuerpoBase) {
    var plantilla = leerTabla(HOJAS.PLANTILLAS).filter(function (p) { return String(p.id) === String(datos.plantilla_id); })[0];
    if (!plantilla) return { ok: false, mensaje: 'Plantilla no encontrada.' };
    asuntoBase = plantilla.asunto;
    cuerpoBase = plantilla.cuerpo;
  }

  var asunto = _reemplazarVariablesPlantilla(asuntoBase, emp);
  var cuerpo = _reemplazarVariablesPlantilla(cuerpoBase, emp);

  try {
    _enviarCorreo([destinatario], asunto, cuerpo.replace(/\n/g, '<br>'));
    _registrarComunicacion('email', emp.id, destinatario, asunto, cuerpo, 'enviado', '', token);
    return { ok: true, mensaje: 'Correo enviado a ' + destinatario + '.' };
  } catch (e) {
    _registrarComunicacion('email', emp.id, destinatario, asunto, cuerpo, 'error', e.message, token);
    registrarErrorSistema('enviarCorreoPlantilla', e.message, JSON.stringify(datos), token);
    return { ok: false, mensaje: 'Error al enviar: ' + e.message };
  }
}

/**
 * Envía un WhatsApp usando una plantilla (o mensaje directo) a un
 * empleado vía CallMeBot, y registra el envío en el historial.
 * @param {Object} datos {empleado_id, plantilla_id?, cuerpo?, telefonoOverride?}
 * @param {string} token
 */
function enviarWhatsappPlantilla(datos, token) {
  var _authErr = requiereEscritura(token);
  if (_authErr) return _authErr;

  var cfgWhatsApp = obtenerConfigWhatsAppInterno();
  if (!cfgWhatsApp.apikey) {
    return { ok: false, mensaje: 'Configura primero la API Key de CallMeBot en Configuración > Notificaciones por WhatsApp.' };
  }

  if (!datos || !datos.empleado_id) return { ok: false, mensaje: 'Selecciona un empleado.' };
  var emp = _buscarEmpleadoRaw(datos.empleado_id);
  if (!emp) return { ok: false, mensaje: 'Empleado no encontrado.' };

  var telefono = String(datos.telefonoOverride || emp.telefono || '').trim();
  if (!telefono) return { ok: false, mensaje: 'El empleado no tiene teléfono registrado.' };

  var cuerpoBase = datos.cuerpo || '';
  // Igual que en el correo: si el frontend ya mandó un cuerpo (posiblemente
  // editado por el usuario), lo respetamos en vez de sobreescribirlo.
  if (datos.plantilla_id && !cuerpoBase) {
    var plantilla = leerTabla(HOJAS.PLANTILLAS).filter(function (p) { return String(p.id) === String(datos.plantilla_id); })[0];
    if (!plantilla) return { ok: false, mensaje: 'Plantilla no encontrada.' };
    cuerpoBase = plantilla.cuerpo;
  }
  var mensaje = _reemplazarVariablesPlantilla(cuerpoBase, emp);
  if (!mensaje.trim()) return { ok: false, mensaje: 'El mensaje está vacío.' };

  // Reutiliza el envío/normalización de teléfono/truncado ya probados del
  // módulo de Alertas — solo cambia el teléfono destino por el del empleado.
  var res = _enviarWhatsApp(mensaje, { telefono: telefono, apikey: cfgWhatsApp.apikey }, { forzar: true });

  _registrarComunicacion('whatsapp', emp.id, telefono, '', mensaje, res.ok ? 'enviado' : 'error', res.mensaje, token);
  if (!res.ok) registrarErrorSistema('enviarWhatsappPlantilla', res.mensaje, JSON.stringify(datos), token);
  return res;
}

/**
 * Envía una comunicación por correo y/o WhatsApp en una sola acción.
 * Reutiliza enviarCorreoPlantilla/enviarWhatsappPlantilla (cada una ya
 * valida sus propios datos y registra su propia entrada en el historial),
 * así que aquí solo se decide a cuáles llamar y se combina el resultado.
 * @param {Object} datos {empleado_id, email:boolean, whatsapp:boolean,
 *   plantilla_id_email?, asunto?, cuerpo_email?, plantilla_id_whatsapp?, cuerpo_whatsapp?}
 * @param {string} token
 */
function enviarComunicacionAmbos(datos, token) {
  var _authErr = requiereEscritura(token);
  if (_authErr) return _authErr;

  if (!datos || !datos.empleado_id) return { ok: false, mensaje: 'Selecciona un empleado.' };
  if (!datos.email && !datos.whatsapp) {
    return { ok: false, mensaje: 'Elige al menos un medio (correo o WhatsApp).' };
  }

  var resultados = {};
  if (datos.email) {
    resultados.email = enviarCorreoPlantilla({
      empleado_id: datos.empleado_id,
      plantilla_id: datos.plantilla_id_email,
      asunto: datos.asunto,
      cuerpo: datos.cuerpo_email
    }, token);
  }
  if (datos.whatsapp) {
    resultados.whatsapp = enviarWhatsappPlantilla({
      empleado_id: datos.empleado_id,
      plantilla_id: datos.plantilla_id_whatsapp,
      cuerpo: datos.cuerpo_whatsapp
    }, token);
  }

  var claves = Object.keys(resultados);
  var todosOk = claves.every(function (k) { return resultados[k].ok; });
  var etiquetas = { email: 'Correo', whatsapp: 'WhatsApp' };
  var partes = claves.map(function (k) { return etiquetas[k] + ': ' + resultados[k].mensaje; });
  return { ok: todosOk, mensaje: partes.join(' — '), detalle: resultados };
}

/**
 * Crea un paquete de plantillas profesionales predefinidas (correo +
 * WhatsApp) para los avisos más comunes de RRHH. Es idempotente: compara
 * por nombre+tipo exactos, así que se puede pulsar el botón varias veces
 * sin duplicar las plantillas ya creadas.
 * @param {string} token
 * @return {Object} {ok, mensaje, creadas}
 */
function crearPlantillasProfesionales(token) {
  var _authErr = requiereEscritura(token);
  if (_authErr) return _authErr;

  var existentes = leerTabla(HOJAS.PLANTILLAS);
  var yaExiste = {};
  existentes.forEach(function (p) { yaExiste[p.nombre + '|' + p.tipo] = true; });

  var paquete = _paquetePlantillasProfesionales();
  var hoja = getHoja(HOJAS.PLANTILLAS);
  var creadas = 0;
  paquete.forEach(function (p) {
    if (yaExiste[p.nombre + '|' + p.tipo]) return;
    hoja.appendRow([generarId('PLT'), p.nombre, p.tipo, p.asunto || '', p.cuerpo]);
    creadas++;
  });

  return {
    ok: true,
    mensaje: creadas > 0
      ? 'Se agregaron ' + creadas + ' plantillas profesionales nuevas.'
      : 'Las plantillas profesionales ya estaban creadas — no se agregó nada.',
    creadas: creadas
  };
}

/** Paquete de plantillas profesionales (correo + WhatsApp) para escenarios comunes de RRHH. */
function _paquetePlantillasProfesionales() {
  return [
    { nombre: 'Bienvenida a la empresa', tipo: 'email',
      asunto: '¡Bienvenido(a) al equipo, {{nombre}}!',
      cuerpo: 'Estimado(a) {{nombre}},\n\n' +
        'Bienvenido(a) a nuestro equipo. Es un gusto contar con vos a partir de hoy en el puesto de {{puesto}}, dentro del departamento de {{departamento}}.\n\n' +
        'En los próximos días recibirás la información necesaria para tu inducción y el acceso a las herramientas de trabajo. Si tenés alguna duda, no dudes en escribirnos.\n\n' +
        'Éxitos en esta nueva etapa.\n\n' +
        'Saludos cordiales,\nRecursos Humanos' },
    { nombre: 'Bienvenida a la empresa', tipo: 'whatsapp',
      cuerpo: '👋 ¡Hola {{nombre}}! Te damos la bienvenida al equipo como {{puesto}}. Cualquier duda que tengas, contanos por acá. ¡Éxitos en tu nueva etapa! 🎉' },

    { nombre: 'Vacaciones aprobadas', tipo: 'email',
      asunto: 'Tu solicitud de vacaciones fue aprobada',
      cuerpo: 'Estimado(a) {{nombre}},\n\n' +
        'Te confirmamos que tu solicitud de vacaciones ha sido aprobada. Podés revisar el detalle de fechas y días disponibles directamente en el sistema.\n\n' +
        'Que disfrutes tu descanso.\n\n' +
        'Saludos,\nRecursos Humanos' },
    { nombre: 'Vacaciones aprobadas', tipo: 'whatsapp',
      cuerpo: '✅ ¡Hola {{nombre}}! Tus vacaciones fueron *aprobadas*. Revisá las fechas en el sistema. ¡Que las disfrutés! 🌴' },

    { nombre: 'Vacaciones no aprobadas', tipo: 'email',
      asunto: 'Sobre tu solicitud de vacaciones',
      cuerpo: 'Estimado(a) {{nombre}},\n\n' +
        'Te informamos que tu solicitud de vacaciones no pudo ser aprobada en las fechas indicadas. Te invitamos a conversar con tu jefatura o con Recursos Humanos para revisar otras fechas posibles.\n\n' +
        'Saludos,\nRecursos Humanos' },
    { nombre: 'Vacaciones no aprobadas', tipo: 'whatsapp',
      cuerpo: 'Hola {{nombre}}, tu solicitud de vacaciones no pudo aprobarse en esas fechas. Conversemos para buscar otra fecha. 🗓️' },

    { nombre: 'Documento próximo a vencer', tipo: 'email',
      asunto: 'Recordatorio: documento próximo a vencer',
      cuerpo: 'Estimado(a) {{nombre}},\n\n' +
        'Te recordamos que uno de tus documentos personales está próximo a vencer. Por favor, actualizá la información con Recursos Humanos lo antes posible para mantener tu expediente al día.\n\n' +
        'Gracias por tu atención.\n\n' +
        'Saludos,\nRecursos Humanos' },
    { nombre: 'Documento próximo a vencer', tipo: 'whatsapp',
      cuerpo: '⚠️ Hola {{nombre}}, tenés un documento próximo a vencer. Por favor acercate a RRHH para actualizarlo. ¡Gracias!' },

    { nombre: 'Pago de planilla realizado', tipo: 'email',
      asunto: 'Tu pago de planilla ha sido procesado',
      cuerpo: 'Estimado(a) {{nombre}},\n\n' +
        'Te confirmamos que tu pago correspondiente a la planilla ha sido procesado con éxito. Podés consultar el detalle de tu comprobante con Recursos Humanos.\n\n' +
        'Saludos,\nRecursos Humanos' },
    { nombre: 'Pago de planilla realizado', tipo: 'whatsapp',
      cuerpo: '💰 Hola {{nombre}}, tu pago de planilla ya fue procesado. Cualquier consulta, escribinos. ¡Buen día!' },

    { nombre: 'Recordatorio de evaluación de desempeño', tipo: 'email',
      asunto: 'Tu evaluación de desempeño se acerca',
      cuerpo: 'Estimado(a) {{nombre}},\n\n' +
        'Te recordamos que tu evaluación de desempeño está próxima a realizarse. Es un buen momento para repasar tus logros y metas del período.\n\n' +
        'Cualquier duda, con gusto te ayudamos.\n\n' +
        'Saludos,\nRecursos Humanos' },
    { nombre: 'Recordatorio de evaluación de desempeño', tipo: 'whatsapp',
      cuerpo: '📋 Hola {{nombre}}, tu evaluación de desempeño está por realizarse. ¡Te esperamos con toda la actitud! 💪' },

    { nombre: 'Notificación de ajuste salarial', tipo: 'email',
      asunto: 'Notificación de ajuste salarial',
      cuerpo: 'Estimado(a) {{nombre}},\n\n' +
        'Te informamos que se ha aplicado un ajuste a tu salario, efectivo a partir de esta fecha. El detalle estará reflejado en tu próximo comprobante de pago.\n\n' +
        'Felicitaciones y gracias por tu trabajo.\n\n' +
        'Saludos,\nRecursos Humanos' },
    { nombre: 'Notificación de ajuste salarial', tipo: 'whatsapp',
      cuerpo: '🎉 ¡Hola {{nombre}}! Se aplicó un ajuste a tu salario. Vas a verlo reflejado en tu próximo pago. ¡Felicidades!' },

    { nombre: 'Feliz cumpleaños', tipo: 'email',
      asunto: '¡Feliz cumpleaños, {{nombre}}!',
      cuerpo: 'Estimado(a) {{nombre}},\n\n' +
        'Todo el equipo te desea un muy feliz cumpleaños. Esperamos que sea un día especial rodeado de las personas que querés.\n\n' +
        '¡Felicidades!\n\n' +
        'Saludos,\nRecursos Humanos' },
    { nombre: 'Feliz cumpleaños', tipo: 'whatsapp',
      cuerpo: '🎉🎂 ¡Feliz cumpleaños, {{nombre}}! Que tengas un día increíble. ¡Un abrazo del equipo!' },

    { nombre: 'Aniversario laboral', tipo: 'email',
      asunto: '¡Gracias por otro año con nosotros, {{nombre}}!',
      cuerpo: 'Estimado(a) {{nombre}},\n\n' +
        'Hoy celebramos un año más desde que te uniste a la empresa como {{puesto}}. Gracias por tu dedicación y compromiso durante este tiempo.\n\n' +
        'Esperamos seguir contando con vos por muchos años más.\n\n' +
        'Saludos,\nRecursos Humanos' },
    { nombre: 'Aniversario laboral', tipo: 'whatsapp',
      cuerpo: '🏆 ¡Hola {{nombre}}! Hoy celebramos tu aniversario laboral. ¡Gracias por tu compromiso durante este tiempo! 🎉' },

    { nombre: 'Comunicado general', tipo: 'email',
      asunto: 'Comunicado importante',
      cuerpo: 'Estimado(a) {{nombre}},\n\n' +
        'Queremos compartirte la siguiente información: [escribí aquí el detalle del comunicado].\n\n' +
        'Quedamos atentos a cualquier consulta.\n\n' +
        'Saludos,\nRecursos Humanos' },
    { nombre: 'Comunicado general', tipo: 'whatsapp',
      cuerpo: '📢 Hola {{nombre}}, te compartimos un comunicado importante: [escribí aquí el detalle]. Cualquier duda, contanos.' }
  ];
}

/**
 * Lista el historial de comunicaciones enviadas (más recientes primero),
 * opcionalmente filtrado por empleado y/o tipo. Incluye teléfonos y
 * contenido de mensajes, así que requiere permiso de escritura (no es
 * de solo-consulta como la mayoría de los "listar*" del sistema).
 * @param {string} [empleadoId]
 * @param {string} [tipo] 'email' | 'whatsapp'
 * @param {string} token
 */
function listarComunicaciones(empleadoId, tipo, token) {
  var _authErr = requiereEscritura(token);
  if (_authErr) return _authErr;

  var registros = leerTabla(HOJAS.COMUNICACIONES);
  var empleados = leerTabla(HOJAS.EMPLEADOS);
  if (empleadoId) registros = registros.filter(function (r) { return String(r.empleado_id) === String(empleadoId); });
  if (tipo) registros = registros.filter(function (r) { return r.tipo === tipo; });

  registros.forEach(function (r) {
    var emp = empleados.filter(function (e) { return String(e.id) === String(r.empleado_id); })[0];
    r.empleado_nombre = emp ? emp.nombre : '—';
    r.fecha = r.fecha instanceof Date
      ? Utilities.formatDate(r.fecha, Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm')
      : String(r.fecha);
  });
  registros.sort(function (a, b) { return b.fecha > a.fecha ? 1 : -1; });
  return registros.slice(0, 500);
}


// ===================================================================
// MÓDULO: HISTORIAL DE SALARIOS
// ===================================================================

function listarHistorialSalario(empleadoId, token) {
  var _authErr = requiereEscritura(token);
  if (_authErr) return _authErr;

  var historial = leerTabla(HOJAS.HISTORIAL_SALARIOS);
  var nombres = mapaEmpleados();
  if (empleadoId) {
    historial = historial.filter(function (h) {
      return String(h.empleado_id) === String(empleadoId);
    });
  }
  historial.forEach(function (h) {
    h.empleado_nombre  = nombres[h.empleado_id] || h.empleado_id;
    h.fecha            = formatearFecha(h.fecha);
    h.salario_anterior = Number(h.salario_anterior) || 0;
    h.salario_nuevo    = Number(h.salario_nuevo) || 0;
  });
  historial.sort(function (a, b) { return b.fecha > a.fecha ? -1 : 1; }).reverse();
  return historial;
}


// ===================================================================
// UTILIDADES DE CÁLCULO DE NÓMINA (Semanal vs Quincenal)
// ===================================================================

/**
 * Calcula el salario diario según la periodicidad de pago.
 * @param {number} salarioBase - Salario mensual
 * @param {string} tipoNomina - 'semanal' o 'quincenal'
 * @return {number} Salario diario
 */
function calcularSalarioDiario(salarioBase, tipoNomina) {
  // El campo `salario` del empleado se trata como salario MENSUAL equivalente.
  // Para valor de vacaciones / liquidación (CT CR):
  //   quincenal → ÷26 (días hábiles promedio del mes)
  //   semanal / mensual / otro → ÷30 (mes comercial)
  // Antes: semanal÷7 y quincenal÷15 inflaban el valor diario hasta ~4×.
  var salario = Number(salarioBase) || 0;
  var tipo = String(tipoNomina || '').toLowerCase().trim();
  var divisor = (tipo === 'quincenal') ? 26 : 30;
  return Math.round((salario / divisor) * 100) / 100;
}

/**
 * Obtiene información del empleado con cálculos según periodicidad.
 * Uso interno — expone salario exacto, por eso no se llama directo desde
 * el cliente. El wrapper público `obtenerEmpleadoCompleto(id, token)` de
 * abajo es el único punto de entrada autorizado desde el frontend.
 */
function _obtenerEmpleadoCompletoInterno(empleadoId) {
  var emp = leerTabla(HOJAS.EMPLEADOS).filter(function (e) {
    return String(e.id) === String(empleadoId);
  })[0];
  if (!emp) return null;

  var tipo = String(emp.tipo_nomina).toLowerCase().trim() || 'mensual';
  var diasPeriodo = tipo === 'semanal' ? 7 : (tipo === 'quincenal' ? 15 : 30);

  return {
    id: emp.id,
    nombre: emp.nombre,
    salario: Number(emp.salario) || 0,
    tipo_nomina: tipo,
    dias_periodo: diasPeriodo,
    salario_diario: calcularSalarioDiario(emp.salario, tipo),
    fecha_ingreso: emp.fecha_ingreso,
    estado: emp.estado
  };
}

/** Versión pública: exige sesión de RRHH/Admin porque expone el salario exacto. */
function obtenerEmpleadoCompleto(empleadoId, token) {
  var _authErr = requiereEscritura(token);
  if (_authErr) return null;
  return _obtenerEmpleadoCompletoInterno(empleadoId);
}

// ===================================================================
// MÓDULO: BALANCE DE VACACIONES
// ===================================================================

/**
 * Uso interno (sin token) — llamado desde otros flujos del servidor que ya
 * verificaron permisos (crearVacaciones, cambiarEstadoVacaciones, etc.).
 * El wrapper público `obtenerBalanceVacaciones(id, token)` de abajo es el
 * único punto de entrada autorizado desde el frontend.
 */
function _obtenerBalanceVacacionesInterno(empleadoId) {
  var emp = _obtenerEmpleadoCompletoInterno(empleadoId);
  if (!emp) return { ok: false, mensaje: 'Empleado no encontrado.' };

  var fechaIngreso  = new Date(emp.fecha_ingreso);
  var ahora         = new Date();
  // Acumulación proporcional: 1.25 días/mes (15 días/año, art. 153 CT)
  var mesesTrabajados = (ahora - fechaIngreso) / (30.4375 * 24 * 60 * 60 * 1000);
  var diasAcumulados  = Math.floor(Math.max(0, mesesTrabajados) * 1.25);

  var diasUsados = leerTabla(HOJAS.VACACIONES)
    .filter(function (v) {
      return String(v.empleado_id) === String(empleadoId) &&
             String(v.estado).toLowerCase() === 'aprobada';
    })
    .reduce(function (sum, v) { return sum + (Number(v.dias) || 0); }, 0);

  var diasDisponibles = Math.max(0, diasAcumulados - diasUsados);

  return {
    ok: true,
    nombre:             emp.nombre,
    tipo_nomina:        emp.tipo_nomina,
    dias_periodo:       emp.dias_periodo,
    salario:            emp.salario,
    salario_diario:     emp.salario_diario,
    diasAcumulados:     diasAcumulados,
    diasUsados:         diasUsados,
    diasDisponibles:    diasDisponibles,
    valor_vacaciones:   Math.round(diasDisponibles * emp.salario_diario * 100) / 100
  };
}

/** Versión pública: exige sesión de RRHH/Admin porque expone salario y valor monetario de vacaciones. */
function obtenerBalanceVacaciones(empleadoId, token) {
  var _authErr = requiereEscritura(token);
  if (_authErr) return _authErr;
  return _obtenerBalanceVacacionesInterno(empleadoId);
}


// ===================================================================
// MÓDULO: CAPACITACIONES
// ===================================================================

function listarCapacitaciones(empleadoId, token) {
  var _authErr = requiereSesion(token);
  if (_authErr) return _authErr;

  var lista  = leerTabla(HOJAS.CAPACITACIONES);
  var nombres = mapaEmpleados();
  if (empleadoId) {
    lista = lista.filter(function (c) {
      return String(c.empleado_id) === String(empleadoId);
    });
  }
  lista.forEach(function (c) {
    c.empleado_nombre = nombres[c.empleado_id] || c.empleado_id;
    c.fecha_inicio    = formatearFecha(c.fecha_inicio);
    c.fecha_fin       = formatearFecha(c.fecha_fin);
  });
  return lista;
}

function crearCapacitacion(cap, token) {
  var _authErr = requiereEscritura(token);
  if (_authErr) return _authErr;

  if (!cap || !cap.empleado_id) return { ok: false, mensaje: 'Selecciona un empleado.' };
  if (!_empleadoExiste(cap.empleado_id)) return { ok: false, mensaje: 'El empleado no existe.' };
  if (!cap.curso || !String(cap.curso).trim()) {
    return { ok: false, mensaje: 'El nombre del curso es obligatorio.' };
  }
  if (cap.fecha_inicio && cap.fecha_fin && new Date(cap.fecha_fin) < new Date(cap.fecha_inicio)) {
    return { ok: false, mensaje: 'La fecha de fin no puede ser anterior a la de inicio.' };
  }
  var hoja = getHoja(HOJAS.CAPACITACIONES);
  var id   = generarId('CAP');
  hoja.appendRow(sanitizarFilaSheets([id, cap.empleado_id, String(cap.curso).trim(),
    cap.institucion || '',
    formatearFecha(cap.fecha_inicio),
    formatearFecha(cap.fecha_fin),
    cap.estado || 'en progreso',
    cap.certificado_url || '']));
  invalidarCache(HOJAS.CAPACITACIONES);
  registrarBitacora('crear', 'Capacitaciones', id, String(cap.curso).trim());
  return { ok: true, mensaje: 'Capacitación registrada.', id: id };
}

function actualizarCapacitacion(cap, token) {
  var _authErr = requiereEscritura(token);
  if (_authErr) return _authErr;

  if (!cap || !cap.id) return { ok: false, mensaje: 'Falta el identificador.' };
  if (cap.fecha_inicio && cap.fecha_fin && new Date(cap.fecha_fin) < new Date(cap.fecha_inicio)) {
    return { ok: false, mensaje: 'La fecha de fin no puede ser anterior a la de inicio.' };
  }
  var hoja = getHoja(HOJAS.CAPACITACIONES);
  var fila = buscarFilaPorId(hoja, cap.id);
  if (fila === -1) return { ok: false, mensaje: 'No se encontró la capacitación.' };
  hoja.getRange(fila, 1, 1, 8).setValues([[cap.id, cap.empleado_id,
    String(cap.curso).trim(), cap.institucion || '',
    formatearFecha(cap.fecha_inicio), formatearFecha(cap.fecha_fin),
    cap.estado || 'en progreso', cap.certificado_url || '']]);
  invalidarCache(HOJAS.CAPACITACIONES);
  registrarBitacora('actualizar', 'Capacitaciones', cap.id, String(cap.curso).trim());
  return { ok: true, mensaje: 'Capacitación actualizada.' };
}

function eliminarCapacitacion(id, token) {
  var _authErr = requiereEscritura(token);
  if (_authErr) return _authErr;

  var hoja = getHoja(HOJAS.CAPACITACIONES);
  var fila = buscarFilaPorId(hoja, id);
  if (fila === -1) return { ok: false, mensaje: 'No se encontró la capacitación.' };
  hoja.deleteRow(fila);
  invalidarCache(HOJAS.CAPACITACIONES);
  registrarBitacora('eliminar', 'Capacitaciones', id, '');
  return { ok: true, mensaje: 'Capacitación eliminada.' };
}


// ===================================================================
// MÓDULO: EVALUACIONES DE DESEMPEÑO
// ===================================================================

function listarEvaluaciones(empleadoId, token) {
  var _authErr = requiereEscritura(token);
  if (_authErr) return _authErr;

  var lista  = leerTabla(HOJAS.EVALUACIONES);
  var nombres = mapaEmpleados();
  if (empleadoId) {
    lista = lista.filter(function (e) {
      return String(e.empleado_id) === String(empleadoId);
    });
  }
  lista.forEach(function (e) {
    e.empleado_nombre = nombres[e.empleado_id] || e.empleado_id;
    e.fecha           = formatearFecha(e.fecha);
    e.calificacion    = Number(e.calificacion) || 0;
  });
  return lista;
}

function crearEvaluacion(ev, token) {
  var _authErr = requiereEscritura(token);
  if (_authErr) return _authErr;

  if (!ev || !ev.empleado_id) return { ok: false, mensaje: 'Selecciona un empleado.' };
  if (!_empleadoExiste(ev.empleado_id)) return { ok: false, mensaje: 'El empleado no existe.' };
  if (!ev.periodo || !String(ev.periodo).trim()) {
    return { ok: false, mensaje: 'El período es obligatorio.' };
  }
  var cal = Number(ev.calificacion);
  if (isNaN(cal) || cal < 1 || cal > 10) {
    return { ok: false, mensaje: 'La calificación debe ser un número entre 1 y 10.' };
  }
  var hoja = getHoja(HOJAS.EVALUACIONES);
  var id   = generarId('EVA');
  hoja.appendRow(sanitizarFilaSheets([id, ev.empleado_id, String(ev.periodo).trim(), cal,
    ev.comentarios || '', ev.evaluador || '',
    formatearFecha(ev.fecha || new Date())]));
  invalidarCache(HOJAS.EVALUACIONES);
  registrarBitacora('crear', 'Evaluaciones', id, 'Período: ' + ev.periodo);
  return { ok: true, mensaje: 'Evaluación registrada.', id: id };
}

function actualizarEvaluacion(ev, token) {
  var _authErr = requiereEscritura(token);
  if (_authErr) return _authErr;

  if (!ev || !ev.id) return { ok: false, mensaje: 'Falta el identificador.' };
  var cal = Number(ev.calificacion);
  if (isNaN(cal) || cal < 1 || cal > 10) {
    return { ok: false, mensaje: 'La calificación debe ser un número entre 1 y 10.' };
  }
  var hoja = getHoja(HOJAS.EVALUACIONES);
  var fila = buscarFilaPorId(hoja, ev.id);
  if (fila === -1) return { ok: false, mensaje: 'No se encontró la evaluación.' };
  hoja.getRange(fila, 1, 1, 7).setValues([[ev.id, ev.empleado_id,
    String(ev.periodo).trim(), Number(ev.calificacion) || 0,
    ev.comentarios || '', ev.evaluador || '', formatearFecha(ev.fecha)]]);
  invalidarCache(HOJAS.EVALUACIONES);
  registrarBitacora('actualizar', 'Evaluaciones', ev.id, 'Período: ' + ev.periodo);
  return { ok: true, mensaje: 'Evaluación actualizada.' };
}

function eliminarEvaluacion(id, token) {
  var _authErr = requiereEscritura(token);
  if (_authErr) return _authErr;

  var hoja = getHoja(HOJAS.EVALUACIONES);
  var fila = buscarFilaPorId(hoja, id);
  if (fila === -1) return { ok: false, mensaje: 'No se encontró la evaluación.' };
  hoja.deleteRow(fila);
  invalidarCache(HOJAS.EVALUACIONES);
  registrarBitacora('eliminar', 'Evaluaciones', id, '');
  return { ok: true, mensaje: 'Evaluación eliminada.' };
}


// ===================================================================
// MÓDULO: DOCUMENTOS POR EMPLEADO (Google Drive)
// ===================================================================

var CLAVE_CARPETA_DOCS = 'CARPETA_DOCS_ID';

function _getCarpetaRaizDocs() {
  var id = PropertiesService.getScriptProperties().getProperty(CLAVE_CARPETA_DOCS);
  if (id) {
    try { return DriveApp.getFolderById(id); } catch (e) {}
  }
  var carpeta = DriveApp.createFolder('RRHH - Documentos de Empleados');
  PropertiesService.getScriptProperties().setProperty(CLAVE_CARPETA_DOCS, carpeta.getId());
  return carpeta;
}

/**
 * Busca la carpeta de un empleado por el PREFIJO estable "EMP_<id>_",
 * ignorando el sufijo con su nombre (que puede cambiar si se corrige
 * o actualiza el nombre del empleado). Si se buscara por nombre
 * completo, un cambio de nombre "perdería" la carpeta ya creada.
 */
function _buscarCarpetaEmpleado(raiz, empleadoId) {
  var prefijo = 'EMP_' + empleadoId + '_';
  var iter = raiz.getFolders();
  while (iter.hasNext()) {
    var f = iter.next();
    if (f.getName().indexOf(prefijo) === 0) return f;
  }
  return null;
}

function crearCarpetaEmpleado(empleadoId, token) {
  var _authErr = requiereEscritura(token);
  if (_authErr) return _authErr;

  return conLock(function () {
    try {
      var emp = leerTabla(HOJAS.EMPLEADOS).filter(function (e) {
        return String(e.id) === String(empleadoId);
      })[0];
      if (!emp) return { ok: false, mensaje: 'Empleado no encontrado.' };
      var raiz     = _getCarpetaRaizDocs();
      var carpeta  = _buscarCarpetaEmpleado(raiz, empleadoId);
      if (!carpeta) {
        var nombre = 'EMP_' + empleadoId + '_' + String(emp.nombre).replace(/\s+/g, '_');
        carpeta = raiz.createFolder(nombre);
      }
      return { ok: true, carpetaUrl: carpeta.getUrl(),
        mensaje: 'Carpeta de documentos lista para ' + emp.nombre };
    } catch (e) {
      return { ok: false, mensaje: e.message };
    }
  });
}

/**
 * Lista los documentos (cédulas, contratos, certificados) de un empleado.
 * Requiere permiso de escritura: son documentos personales sensibles, no
 * de solo-consulta como la mayoría de los "listar*" del sistema.
 */
function listarDocumentos(empleadoId, token) {
  var _authErr = requiereEscritura(token);
  if (_authErr) return _authErr;

  try {
    var raiz = _getCarpetaRaizDocs();
    var emp  = leerTabla(HOJAS.EMPLEADOS).filter(function (e) {
      return String(e.id) === String(empleadoId);
    })[0];
    if (!emp) return { ok: false, mensaje: 'Empleado no encontrado.', documentos: [] };
    var carpetaEmp = _buscarCarpetaEmpleado(raiz, empleadoId);
    if (!carpetaEmp) {
      return { ok: true, documentos: [], carpetaUrl: null };
    }
    var archivos   = carpetaEmp.getFiles();
    var docs       = [];
    while (archivos.hasNext()) {
      var f = archivos.next();
      docs.push({
        id:     f.getId(),
        nombre: f.getName(),
        url:    f.getUrl(),
        fecha:  Utilities.formatDate(f.getLastUpdated(), Session.getScriptTimeZone(), 'yyyy-MM-dd')
      });
    }
    return { ok: true, documentos: docs, carpetaUrl: carpetaEmp.getUrl() };
  } catch (e) {
    return { ok: false, mensaje: e.message, documentos: [] };
  }
}


// ===================================================================
// MÓDULO: RESPALDO AUTOMÁTICO
// ===================================================================

var CLAVE_RESPALDO_TRIGGER = 'RESPALDO_TRIGGER_ID';

function crearRespaldo(token) {
  var _authErr = requiereAdmin(token);
  if (_authErr) return _authErr;

  return _crearRespaldoInterno();
}

/**
 * Handler del trigger automático diario.
 * Fase 4 - Item 13: Backups mejorados (diarios + mantenimiento de historial).
 */
function crearRespaldoTrigger() {
  var res = _crearRespaldoInterno();
  if (!res.ok) {
    try { registrarBitacora('error', 'Sistema', '', 'Respaldo automático falló: ' + res.mensaje); } catch (e) {}
  } else {
    // Limpiar backups antiguos (>30 días)
    _limpiarBackupAntiguos(30);
  }
}

function _crearRespaldoInterno() {
  try {
    var libro  = getLibro();
    var fecha  = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm');
    var copia  = libro.copy('[BACKUP ' + fecha + '] ' + libro.getName());

    // Guardar metadata en bitácora
    registrarBitacora('respaldo', 'Sistema', '', 'Backup: ' + copia.getName(), {
      antes: { sheets: libro.getSheets().length },
      despues: { fileId: copia.getId(), url: copia.getUrl() }
    });

    return { ok: true, mensaje: 'Respaldo creado correctamente.', url: copia.getUrl(), id: copia.getId() };
  } catch (e) {
    return { ok: false, mensaje: 'Error al crear respaldo: ' + e.message };
  }
}

/**
 * Elimina backups más antiguos que X días (Fase 4 - Item 13).
 * Mantiene el historial limpio sin acumular archivos.
 * @param {number} diasRetener - Default 30
 */
function _limpiarBackupAntiguos(diasRetener) {
  try {
    diasRetener = diasRetener || 30;
    var fechaLimite = new Date();
    fechaLimite.setDate(fechaLimite.getDate() - diasRetener);

    // Buscar en la carpeta padre de la hoja (no en toda la raíz de Drive)
    var libro = getLibro();
    var padres = DriveApp.getFileById(libro.getId()).getParents();
    var carpeta = padres.hasNext() ? padres.next() : DriveApp.getRootFolder();
    var archivos = carpeta.getFiles();
    var eliminados = 0;
    var prefijo = '[BACKUP';

    while (archivos.hasNext()) {
      var file = archivos.next();
      if (file.getName().indexOf(prefijo) === 0 && file.getLastUpdated() < fechaLimite) {
        file.setTrashed(true);
        eliminados++;
      }
    }

    if (eliminados > 0) {
      registrarBitacora('mantenimiento', 'Backups', '', 'Limpieza automática: ' + eliminados + ' archivos eliminados');
    }
  } catch (e) {
    // Log silencioso de limpieza para no romper el proceso
  }
}

function activarRespaldoSemanal(token) {
  var _authErr = requiereAdmin(token);
  if (_authErr) return _authErr;

  desactivarRespaldoSemanal(token);
  var t = ScriptApp.newTrigger('crearRespaldoTrigger')
    .timeBased().everyWeeks(1).onWeekDay(ScriptApp.WeekDay.SUNDAY).atHour(2).create();
  PropertiesService.getScriptProperties().setProperty(CLAVE_RESPALDO_TRIGGER, t.getUniqueId());
  return { ok: true, mensaje: 'Respaldo automático semanal activado (domingos a las 2 a.m.).' };
}

function desactivarRespaldoSemanal(token) {
  var _authErr = requiereAdmin(token);
  if (_authErr) return _authErr;

  ScriptApp.getProjectTriggers().forEach(function (t) {
    var fn = t.getHandlerFunction();
    if (fn === 'crearRespaldoTrigger' || fn === 'crearRespaldo') ScriptApp.deleteTrigger(t);
  });
  PropertiesService.getScriptProperties().deleteProperty(CLAVE_RESPALDO_TRIGGER);
  return { ok: true, mensaje: 'Respaldo automático desactivado.' };
}

function estadoRespaldo() {
  var activo = ScriptApp.getProjectTriggers().some(function (t) {
    var fn = t.getHandlerFunction();
    return fn === 'crearRespaldoTrigger' || fn === 'crearRespaldo';
  });
  return { activo: activo };
}


// ===================================================================
// MÓDULO: NOTIFICACIONES WHATSAPP (CallMeBot)
// ===================================================================

var CLAVE_CONFIG_WHATSAPP = 'CONFIG_WHATSAPP';
var MAX_CHARS_WHATSAPP = 1500;

function _defConfigWhatsApp() {
  return {
    telefono: '',
    apikey: '',
    activo: false,
    alertaVacaciones: true,
    alertaNomina: true,
    alertaResumen: false,
    alertaCumpleanios: true,
    notificarNuevaVacacion: true,
    notificarVacacionDecidida: false,
    notificarNominaGenerada: false
  };
}

function obtenerConfigWhatsAppInterno() {
  var raw = PropertiesService.getScriptProperties().getProperty(CLAVE_CONFIG_WHATSAPP);
  var def = _defConfigWhatsApp();
  if (!raw) return def;
  try { return Object.assign(def, JSON.parse(raw)); } catch (e) { return def; }
}

function obtenerConfigWhatsApp(token) {
  var _authErr = requiereSesion(token);
  if (_authErr) return _authErr;

  var cfg = obtenerConfigWhatsAppInterno();
  cfg.apikey = enmascararSecreto(cfg.apikey);
  return cfg;
}

function guardarConfigWhatsApp(cfg, token) {
  var _authErr = requiereAdmin(token);
  if (_authErr) return _authErr;

  var actual = obtenerConfigWhatsAppInterno();
  if (!cfg.apikey) cfg.apikey = actual.apikey;
  var merged = Object.assign(_defConfigWhatsApp(), actual, cfg);
  PropertiesService.getScriptProperties().setProperty(CLAVE_CONFIG_WHATSAPP, JSON.stringify(merged));
  return { ok: true, mensaje: 'Configuración de WhatsApp guardada.' };
}

function _normalizarTelefonoWhatsApp(telefono) {
  var t = String(telefono || '').trim().replace(/[\s\-()]/g, '');
  if (!t) return '';
  if (t.charAt(0) !== '+') t = '+' + t.replace(/^\+/, '');
  return t;
}

function _truncarWhatsApp(texto) {
  var s = String(texto || '');
  if (s.length <= MAX_CHARS_WHATSAPP) return s;
  return s.slice(0, MAX_CHARS_WHATSAPP - 3) + '...';
}

/**
 * Envía un mensaje vía CallMeBot.
 * @param {string} mensaje
 * @param {Object} cfg  Configuración con telefono y apikey.
 * @param {Object} [opciones]  { forzar: true } omite la validación de activo.
 */
function _enviarWhatsApp(mensaje, cfg, opciones) {
  opciones = opciones || {};
  if (!cfg) cfg = obtenerConfigWhatsAppInterno();
  if (!cfg || !cfg.telefono || !cfg.apikey) {
    return { ok: false, mensaje: 'WhatsApp no configurado (teléfono o API Key faltante).' };
  }
  if (cfg.apikey.length < 10) {
    return { ok: false, mensaje: 'API Key de CallMeBot inválida o incompleta.' };
  }
  if (!opciones.forzar && !cfg.activo) {
    return { ok: false, mensaje: 'Las notificaciones WhatsApp están desactivadas.' };
  }

  var telefono = _normalizarTelefonoWhatsApp(cfg.telefono);
  if (!/^\+\d{8,15}$/.test(telefono)) {
    return { ok: false, mensaje: 'Número inválido. Usa formato internacional, ej: +50688887777' };
  }

  try {
    var texto = _truncarWhatsApp(mensaje);
    var url = 'https://api.callmebot.com/whatsapp.php' +
      '?phone='  + encodeURIComponent(telefono) +
      '&text='   + encodeURIComponent(texto) +
      '&apikey=' + encodeURIComponent(cfg.apikey);
    var res = UrlFetchApp.fetch(url, { muteHttpExceptions: true, validateHttpsCertificates: true });
    var code = res.getResponseCode();
    var body = res.getContentText();
    if (code >= 400) {
      return { ok: false, mensaje: 'CallMeBot error ' + code + ': ' + body.slice(0, 120) };
    }
    if (/error|invalid|failed/i.test(body) && !/message sent|success/i.test(body)) {
      return { ok: false, mensaje: 'CallMeBot: ' + body.slice(0, 120) };
    }
    return { ok: true, mensaje: 'Mensaje WhatsApp enviado a ' + telefono + '.' };
  } catch (e) {
    return { ok: false, mensaje: 'Error WhatsApp: ' + e.message };
  }
}

function _textoVacacionesPendientes() {
  var vacs = leerTabla(HOJAS.VACACIONES).filter(function (v) {
    return estadoNormalizado(v.estado) === 'pendiente';
  });
  if (!vacs.length) return null;

  var mapa = mapaEmpleados();
  var lineas = vacs.map(function (v, i) {
    var nombre = mapa[v.empleado_id] || v.empleado_id || '—';
    return (i + 1) + '. ' + nombre + ' (' + formatearFecha(v.fecha_inicio) +
      ' → ' + formatearFecha(v.fecha_fin) + ', ' + (v.dias || '—') + ' días)';
  });

  return '🏖 *Vacaciones pendientes* (' + vacs.length + ')\n\n' +
    lineas.join('\n') + '\n\nIngresa al sistema para aprobar o rechazar.';
}

function _textoNominaMensual() {
  var mesActual = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM');
  var noms = leerTabla(HOJAS.NOMINA).filter(function (n) { return String(n.mes) === mesActual; });
  var activos = leerTabla(HOJAS.EMPLEADOS).filter(function (e) {
    return estadoNormalizado(e.estado) === 'activo';
  });
  if (!activos.length) return null;
  var conNomina = {};
  noms.forEach(function (n) { conNomina[String(n.empleado_id)] = true; });
  var faltantes = activos.filter(function (e) { return !conNomina[String(e.id)]; });
  if (!faltantes.length) return null;

  var lista = faltantes.map(function (e, i) { return (i + 1) + '. ' + e.nombre; }).join('\n');
  return '💰 *Nómina pendiente* — ' + mesActual + '\n\n' +
    'Faltan ' + faltantes.length + ' empleado(s) activo(s):\n' + lista +
    '\n\nGenera la nómina en el módulo correspondiente.';
}

function _textoResumenSemanal() {
  var dash = _obtenerDashboardInterno();
  return '📊 *Resumen semanal RRHH*\n' +
    '• Empleados activos: ' + dash.empleadosActivos + '\n' +
    '• Inactivos: ' + dash.empleadosInactivos + '\n' +
    '• Vacaciones pendientes: ' + dash.vacacionesPendientes + '\n' +
    '• Nómina ' + dash.mesActual + ': ' + dash.nominasMesActual + ' registros\n' +
    '• Total neto mes: ₡' + (dash.totalNetoMes || 0).toLocaleString();
}

function _textoCumpleanios() {
  var hoy = new Date();
  var mesHoy = hoy.getMonth() + 1;
  var empls = leerTabla(HOJAS.EMPLEADOS).filter(function (e) {
    if (estadoNormalizado(e.estado) !== 'activo') return false;
    if (!e.fecha_nacimiento) return false;
    var fn = new Date(e.fecha_nacimiento);
    return !isNaN(fn.getTime()) && (fn.getMonth() + 1) === mesHoy;
  });
  if (!empls.length) return null;

  var lineas = empls.map(function (e, i) {
    var fn = new Date(e.fecha_nacimiento);
    return (i + 1) + '. ' + e.nombre + ' — ' + fn.getDate() + '/' + mesHoy;
  });
  return '🎂 *Cumpleaños del mes*\n\n' + lineas.join('\n');
}

function _enviarAlertasWhatsApp(cfgAlertas, waCfg) {
  var enviados = 0;

  if (waCfg.alertaVacaciones !== false && cfgAlertas.vacacionesPendientesActiva) {
    var tVac = _textoVacacionesPendientes();
    if (tVac && _enviarWhatsApp(tVac, waCfg).ok) enviados++;
  }

  if (waCfg.alertaNomina !== false && cfgAlertas.nominaMensualActiva) {
    var hoy = new Date();
    if (hoy.getDate() >= Number(cfgAlertas.nominaMensualDia)) {
      var tNom = _textoNominaMensual();
      if (tNom && _enviarWhatsApp(tNom, waCfg).ok) enviados++;
    }
  }

  if (waCfg.alertaResumen && cfgAlertas.resumenSemanalActivo && new Date().getDay() === 1) {
    if (_enviarWhatsApp(_textoResumenSemanal(), waCfg).ok) enviados++;
  }

  if (waCfg.alertaCumpleanios !== false && cfgAlertas.cumpleaniosActiva && new Date().getDate() === 1) {
    var tCump = _textoCumpleanios();
    if (tCump && _enviarWhatsApp(tCump, waCfg).ok) enviados++;
  }

  if (!enviados) {
    _enviarWhatsApp(_textoResumenSemanal(), waCfg);
  }
}

function _whatsappEventoActivo(cfg, flag) {
  if (!cfg || !cfg.activo || !cfg.telefono || !cfg.apikey) return false;
  return cfg[flag] !== false;
}

function _notificarWhatsAppNuevaVacacion(v, dias) {
  var waCfg = obtenerConfigWhatsAppInterno();
  if (!_whatsappEventoActivo(waCfg, 'notificarNuevaVacacion')) return;
  var mapa = mapaEmpleados();
  var nombre = mapa[v.empleado_id] || v.empleado_id;
  var msg = '🏖 *Nueva solicitud de vacaciones*\n' +
    'Empleado: ' + nombre + '\n' +
    'Desde: ' + formatearFecha(v.fecha_inicio) + '\n' +
    'Hasta: ' + formatearFecha(v.fecha_fin) + '\n' +
    'Días: ' + dias + '\n\nRevisa el sistema para aprobar.';
  _enviarWhatsApp(msg, waCfg);
}

function _notificarWhatsAppVacacionDecidida(v, nuevoEstado) {
  var waCfg = obtenerConfigWhatsAppInterno();
  if (!_whatsappEventoActivo(waCfg, 'notificarVacacionDecidida')) return;
  var mapa = mapaEmpleados();
  var nombre = mapa[v.empleado_id] || v.empleado_id;
  var icono = nuevoEstado === 'aprobada' ? '✅' : '❌';
  var etiqueta = nuevoEstado === 'aprobada' ? 'APROBADA' : 'RECHAZADA';
  var msg = icono + ' *Vacaciones ' + etiqueta + '*\n' +
    'Empleado: ' + nombre + '\n' +
    'Desde: ' + formatearFecha(v.fecha_inicio) + '\n' +
    'Hasta: ' + formatearFecha(v.fecha_fin) + '\n' +
    'Días: ' + (v.dias || '—');
  _enviarWhatsApp(msg, waCfg);
}

function _notificarWhatsAppNominaGenerada(empleado, mes, salarioBase, deducciones, neto) {
  var waCfg = obtenerConfigWhatsAppInterno();
  if (!_whatsappEventoActivo(waCfg, 'notificarNominaGenerada')) return;
  var msg = '💰 *Nómina generada*\n' +
    'Empleado: ' + (empleado.nombre || empleado.id) + '\n' +
    'Mes: ' + mes + '\n' +
    'Salario base: ₡' + (Number(salarioBase) || 0).toLocaleString() + '\n' +
    'Deducciones: ₡' + (Number(deducciones) || 0).toLocaleString() + '\n' +
    'Neto: ₡' + (Number(neto) || 0).toLocaleString();
  _enviarWhatsApp(msg, waCfg);
}

/**
 * Prueba el envío de WhatsApp. tipo: general | vacaciones | nomina | resumen | cumpleanios
 */
function probarWhatsApp(tipo, token) {
  var _authErr = requiereAdmin(token);
  if (_authErr) return _authErr;

  var cfg = obtenerConfigWhatsAppInterno();
  if (!cfg.telefono || !cfg.apikey) {
    return { ok: false, mensaje: 'Configura el teléfono y la API Key de CallMeBot primero.' };
  }

  var mensaje;
  if (tipo === 'vacaciones') {
    mensaje = _textoVacacionesPendientes() || '✅ No hay vacaciones pendientes en este momento.';
  } else if (tipo === 'nomina') {
    mensaje = _textoNominaMensual() || '✅ Todos los empleados activos tienen nómina del mes.';
  } else if (tipo === 'resumen') {
    mensaje = _textoResumenSemanal();
  } else if (tipo === 'cumpleanios') {
    mensaje = _textoCumpleanios() || '✅ No hay cumpleaños registrados este mes.';
  } else if (tipo === 'vacacion_decidida') {
    mensaje = '✅ *Vacaciones APROBADA*\nEmpleado: (ejemplo)\nDesde: 2026-07-01\nHasta: 2026-07-05\nDías: 5';
  } else if (tipo === 'nomina_generada') {
    mensaje = '💰 *Nómina generada*\nEmpleado: (ejemplo)\nMes: 2026-06\nSalario base: ₡500,000\nDeducciones: ₡80,000\nNeto: ₡420,000';
  } else {
    mensaje = '🧪 Prueba del Sistema RRHH\nWhatsApp configurado correctamente via CallMeBot.';
  }

  return _enviarWhatsApp('🧪 [PRUEBA]\n' + mensaje, cfg, { forzar: true });
}

/** Envía un mensaje personalizado por WhatsApp (solo admin). */
function enviarWhatsAppPersonalizado(mensaje, token) {
  var _authErr = requiereAdmin(token);
  if (_authErr) return _authErr;

  if (!mensaje || !String(mensaje).trim()) {
    return { ok: false, mensaje: 'Escribe un mensaje para enviar.' };
  }
  var cfg = obtenerConfigWhatsAppInterno();
  return _enviarWhatsApp(String(mensaje).trim(), cfg, { forzar: true });
}


// ===================================================================
// CUERPO DE ALERTA: CUMPLEAÑOS
// ===================================================================

function _cuerpoProximosCumpleanios() {
  var hoy    = new Date();
  var mesHoy = hoy.getMonth() + 1;
  var empls  = leerTabla(HOJAS.EMPLEADOS).filter(function (e) {
    if (String(e.estado).toLowerCase() !== 'activo') return false;
    if (!e.fecha_nacimiento) return false;
    var fn = new Date(e.fecha_nacimiento);
    return !isNaN(fn.getTime()) && (fn.getMonth() + 1) === mesHoy;
  });
  if (!empls.length) return null;

  var filas = empls.map(function (e) {
    var fn   = new Date(e.fecha_nacimiento);
    var edad = hoy.getFullYear() - fn.getFullYear();
    if (hoy.getMonth() < fn.getMonth() ||
        (hoy.getMonth() === fn.getMonth() && hoy.getDate() < fn.getDate())) {
      edad--;
    }
    return '<tr>' +
      '<td style="padding:6px 10px">' + e.nombre + '</td>' +
      '<td style="padding:6px 10px">' + fn.getDate() + '/' + mesHoy + '</td>' +
      '<td style="padding:6px 10px">' + edad + ' años</td></tr>';
  }).join('');

  return '<p>Cumpleaños de empleados este mes:</p>' +
    '<table border="1" cellspacing="0" cellpadding="0" ' +
    'style="border-collapse:collapse;font-size:13px;border-color:#e5e7eb">' +
    '<thead><tr style="background:#f3f4f6">' +
    '<th style="padding:6px 10px">Empleado</th>' +
    '<th style="padding:6px 10px">Fecha</th>' +
    '<th style="padding:6px 10px">Edad</th>' +
    '</tr></thead><tbody>' + filas + '</tbody></table>';
}


// ===================================================================
// CONTADOR DE ALERTAS (para badge en sidebar)
// ===================================================================

function obtenerContadorAlertas(token) {
  var _authErr = requiereSesion(token);
  if (_authErr) return _authErr;

  var vacPend = leerTabla(HOJAS.VACACIONES).filter(function (v) {
    return String(v.estado).toLowerCase() === 'pendiente';
  }).length;
  return { total: vacPend, vacaciones: vacPend };
}


/**
 * Crea TODAS las pestañas que falten, con sus encabezados.
 * Reutiliza getHoja(), que ya crea la pestaña si no existe.
 *
 * @return {Object} {ok, mensaje, creadas:[...]}
 */
function inicializarHojas(token) {
  var _authErr = requiereAdmin(token);
  if (_authErr) return _authErr;

  try {
    var libro = getLibro();
    var creadas = [];
    Object.keys(HOJAS).forEach(function (clave) {
      var nombre = HOJAS[clave];
      var existiaAntes = !!libro.getSheetByName(nombre);
      var hoja = getHoja(nombre);
      if (!existiaAntes) {
        creadas.push(nombre);
      } else {
        migrarColumnas(hoja, ENCABEZADOS[nombre] || []);
      }
    });
    var msg = creadas.length
      ? 'Pestañas creadas: ' + creadas.join(', ') + '. Columnas existentes verificadas.'
      : 'Todas las pestañas ya existían. Columnas verificadas.';
    return { ok: true, mensaje: msg, creadas: creadas };
  } catch (e) {
    return { ok: false, mensaje: e.message, creadas: [] };
  }
}

function migrarColumnas(hoja, columnasEsperadas) {
  if (!columnasEsperadas || !columnasEsperadas.length) return;
  var datos = hoja.getDataRange().getValues();
  if (!datos.length) return;
  var actuales = datos[0].map(function (c) { return String(c); });
  var faltan = columnasEsperadas.filter(function (c) { return actuales.indexOf(c) === -1; });
  if (faltan.length) {
    var inicioCol = actuales.length + 1;
    faltan.forEach(function (col, i) {
      hoja.getRange(1, inicioCol + i).setValue(col);
    });
  }
}


// ===================================================================
// MÓDULO: CÁLCULO DE DEDUCCIONES COSTA RICA
// ===================================================================

/**
 * Calcula deducciones en CR: CCSS 10.67% + Renta progresiva.
 *
 * TABLA RENTA (Tramos 2025 - VERIFICAR ACTUALIZACIÓN 2026 CON AUTORIDADES):
 * Hasta ₡929,000:      0%
 * ₡929,001-1,364,000:  10%
 * ₡1,364,001-2,388,000: 15% (+ ₡43,500)
 * ₡2,388,001-4,775,000: 20% (+ ₡197,100)
 * Arriba ₡4,775,000:   25% (+ ₡674,500)
 *
 * IMPORTANTE: Esta fórmula está DUPLICADA en Js_Nomina.html para previsualizar sin round-trip.
 * Al actualizar: MODIFICAR AMBAS UBICACIONES.
 * TODO: Centralizar en una sola fuente de verdad.
 */
function calcularDeduccionesCR(salario) {
  var sal = Number(salario) || 0;
  var ccss = Math.round(sal * 0.1067);
  var renta = 0;
  if      (sal <= 929000)  renta = 0;
  else if (sal <= 1364000) renta = Math.round((sal - 929000) * 0.10);
  else if (sal <= 2388000) renta = Math.round(43500 + (sal - 1364000) * 0.15);
  else if (sal <= 4775000) renta = Math.round(197100 + (sal - 2388000) * 0.20);
  else                     renta = Math.round(674500 + (sal - 4775000) * 0.25);
  var total = ccss + renta;
  var neto  = sal - total;
  return { salario: sal, ccss: ccss, renta: renta, total: total, neto: neto };
}

function obtenerDeduccionesCR(empleadoId, token) {
  var _authErr = requiereEscritura(token);
  if (_authErr) return _authErr;

  var filas = leerTabla(HOJAS.EMPLEADOS);
  var emp   = filas.filter(function (e) { return String(e.id) === String(empleadoId); })[0];
  if (!emp) return { ok: false, mensaje: 'Empleado no encontrado.' };
  var d = calcularDeduccionesCR(emp.salario);
  return Object.assign({ ok: true }, d);
}


// ===================================================================
// MÓDULO: BÚSQUEDA GLOBAL
// ===================================================================

/**
 * Búsqueda global optimizada: busca primero en tablas críticas (empleados, depto)
 * para obtener resultados relevantes más rápido. Requiere token de seguridad.
 * Limita a 50 resultados máximo.
 */
function buscarGlobal(query, token) {
  if (!query || !query.trim()) return [];
  var _authErr = requiereSesion(token);
  if (_authErr) return [];
  var q = String(query).toLowerCase().trim();
  var resultados = [];
  var LIMITE = 50;
  var tablasPrioritarias = [HOJAS.EMPLEADOS, HOJAS.DEPARTAMENTOS, HOJAS.ACTIVOS];
  var tablasSecundarias = [HOJAS.CAPACITACIONES, HOJAS.PRESTAMOS, HOJAS.INCAPACIDADES,
                            HOJAS.LIQUIDACIONES, HOJAS.VACACIONES];

  function agregar(entidad, id, titulo, subtitulo, vista) {
    if (resultados.length < LIMITE) {
      resultados.push({ entidad: entidad, id: id, titulo: titulo, subtitulo: subtitulo, vista: vista });
      return true;
    }
    return false;
  }

  leerTabla(HOJAS.EMPLEADOS).forEach(function (e) {
    if (resultados.length < LIMITE) {
      if (String(e.estado || '').toLowerCase() !== 'activo') return;
      if (String(e.nombre||'').toLowerCase().indexOf(q) !== -1 ||
          String(e.cedula||'').toLowerCase().indexOf(q) !== -1) {
        agregar('Empleado', e.id, e.nombre, e.departamento||'', 'empleados');
      }
    }
  });
  leerTabla(HOJAS.CAPACITACIONES).forEach(function (c) {
    if (resultados.length < LIMITE) {
      if (String(c.curso||'').toLowerCase().indexOf(q) !== -1) {
        agregar('Capacitacion', c.id, c.curso, c.institucion||'', 'capacitaciones');
      }
    }
  });
  leerTabla(HOJAS.DEPARTAMENTOS).forEach(function (d) {
    if (resultados.length < LIMITE) {
      if (String(d.nombre||'').toLowerCase().indexOf(q) !== -1) {
        agregar('Departamento', d.id, d.nombre, d.responsable||'', 'departamentos');
      }
    }
  });
  leerTabla(HOJAS.ACTIVOS).forEach(function (a) {
    if (resultados.length < LIMITE) {
      if (String(a.nombre||'').toLowerCase().indexOf(q) !== -1 ||
          String(a.serial||'').toLowerCase().indexOf(q) !== -1) {
        agregar('Activo', a.id, a.nombre, 'Serial: ' + (a.serial||'-'), 'activos');
      }
    }
  });

  var nombresBusqueda = mapaEmpleados();
  leerTabla(HOJAS.PRESTAMOS).forEach(function (p) {
    if (resultados.length < LIMITE) {
      var nombreEmp = nombresBusqueda[p.empleado_id] || '';
      if (nombreEmp.toLowerCase().indexOf(q) !== -1) {
        agregar('Préstamo', p.id, nombreEmp, 'Monto: ' + (p.monto || 0), 'prestamos');
      }
    }
  });
  leerTabla(HOJAS.INCAPACIDADES).forEach(function (inc) {
    if (resultados.length < LIMITE) {
      var nombreEmp = nombresBusqueda[inc.empleado_id] || '';
      if (nombreEmp.toLowerCase().indexOf(q) !== -1 ||
          String(inc.entidad||'').toLowerCase().indexOf(q) !== -1 ||
          String(inc.especialidad||'').toLowerCase().indexOf(q) !== -1) {
        agregar('Incapacidad', inc.id, nombreEmp, inc.especialidad || inc.entidad || '', 'incapacidades');
      }
    }
  });
  leerTabla(HOJAS.LIQUIDACIONES).forEach(function (liq) {
    if (resultados.length < LIMITE) {
      var nombreEmp = nombresBusqueda[liq.empleado_id] || '';
      if (nombreEmp.toLowerCase().indexOf(q) !== -1 ||
          String(liq.motivo||'').toLowerCase().indexOf(q) !== -1) {
        agregar('Liquidación', liq.id, nombreEmp, liq.motivo || '', 'liquidaciones');
      }
    }
  });
  leerTabla(HOJAS.VACACIONES).forEach(function (v) {
    if (resultados.length < LIMITE) {
      var nombreEmp = nombresBusqueda[v.empleado_id] || '';
      if (nombreEmp.toLowerCase().indexOf(q) !== -1) {
        agregar('Vacaciones', v.id, nombreEmp, (v.dias || 0) + ' días', 'vacaciones');
      }
    }
  });

  return resultados;
}


// ===================================================================
// MÓDULO: CALENDARIO DE EVENTOS
// ===================================================================

function listarEventosCalendario(mes, anio, token) {
  var _authErr = requiereSesion(token);
  if (_authErr) return _authErr;

  var m = parseInt(mes, 10);
  var y = parseInt(anio, 10);
  var eventos = [];

  leerTabla(HOJAS.EMPLEADOS).forEach(function (e) {
    if (!e.fecha_nacimiento || String(e.estado||'').toLowerCase() !== 'activo') return;
    var fn = new Date(e.fecha_nacimiento);
    if (isNaN(fn.getTime())) return;
    if ((fn.getMonth() + 1) === m) {
      eventos.push({ tipo: 'cumpleanos', dia: fn.getDate(), titulo: e.nombre, color: '#ec4899' });
    }
  });

  leerTabla(HOJAS.VACACIONES).forEach(function (v) {
    if (String(v.estado||'').toLowerCase() !== 'aprobada') return;
    var ini = new Date(v.fecha_inicio);
    if (isNaN(ini.getTime())) return;
    if ((ini.getMonth() + 1) === m && ini.getFullYear() === y) {
      eventos.push({ tipo: 'vacaciones', dia: ini.getDate(), titulo: 'Vacaciones', color: '#059669' });
    }
  });

  leerTabla(HOJAS.HORAS_EXTRA).forEach(function (h) {
    var fd = new Date(h.fecha);
    if (isNaN(fd.getTime())) return;
    if ((fd.getMonth() + 1) === m && fd.getFullYear() === y) {
      eventos.push({ tipo: 'horasextra', dia: fd.getDate(), titulo: 'Horas extra', color: '#d97706' });
    }
  });

  leerTabla(HOJAS.FERIADOS).forEach(function (f) {
    var fd = new Date(f.fecha);
    if (isNaN(fd.getTime())) return;
    if ((fd.getMonth() + 1) === m && fd.getFullYear() === y) {
      eventos.push({ tipo: 'feriado', dia: fd.getDate(), titulo: f.nombre || 'Feriado', color: '#4f46e5' });
    }
  });

  leerTabla(HOJAS.INCAPACIDADES).forEach(function (inc) {
    var fd = new Date(inc.fecha_desde);
    if (isNaN(fd.getTime())) return;
    if ((fd.getMonth() + 1) === m && fd.getFullYear() === y) {
      eventos.push({ tipo: 'incapacidad', dia: fd.getDate(), titulo: 'Incapacidad', color: '#dc2626' });
    }
  });

  return eventos;
}


// ===================================================================
// MÓDULO: ORGANIGRAMA
// ===================================================================

function listarOrganigrama(token) {
  var _authErr = requiereSesion(token);
  if (_authErr) return _authErr;

  var deptos = leerTabla(HOJAS.DEPARTAMENTOS);
  var empls  = leerTabla(HOJAS.EMPLEADOS).filter(function (e) {
    return String(e.estado||'').toLowerCase() === 'activo';
  });
  return deptos.map(function (d) {
    return {
      id: d.id, nombre: d.nombre, responsable: d.responsable || '',
      empleados: empls.filter(function (e) { return e.departamento === d.nombre; })
                      .map(function (e) { return { id: e.id, nombre: e.nombre, puesto: e.puesto || '' }; })
    };
  });
}


// ===================================================================
// MÓDULO: RESUMEN DE ASISTENCIA
// ===================================================================

function listarResumenAsistencia(mes, token) {
  var _authErr = requiereSesion(token);
  if (_authErr) return _authErr;

  var registros = leerTabla(HOJAS.ASISTENCIA);
  if (mes) {
    registros = registros.filter(function (r) { return mesDeFecha(r.fecha) === mes; });
  }
  var empls = leerTabla(HOJAS.EMPLEADOS);
  var mapa = {};
  registros.forEach(function (r) {
    var eid = String(r.empleado_id);
    if (!mapa[eid]) mapa[eid] = { dias: 0, horas: 0 };
    mapa[eid].dias++;
    mapa[eid].horas += Number(r.horas) || 0;
  });
  return empls.filter(function (e) { return mapa[e.id]; }).map(function (e) {
    return { empleado_id: e.id, nombre: e.nombre, departamento: e.departamento || '-',
             dias: mapa[e.id].dias, horas: Math.round(mapa[e.id].horas * 10) / 10 };
  }).sort(function (a, b) { return b.horas - a.horas; });
}


// ===================================================================
// MÓDULO: PRÉSTAMOS A EMPLEADOS
// ===================================================================

function listarPrestamos(empleadoId, estado, token) {
  var _authErr = requiereEscritura(token);
  if (_authErr) return _authErr;

  var rows = leerTabla(HOJAS.PRESTAMOS);
  if (empleadoId) rows = rows.filter(function (r) { return String(r.empleado_id) === String(empleadoId); });
  if (estado) rows = rows.filter(function (r) { return String(r.estado).toLowerCase() === String(estado).toLowerCase(); });
  return enriquecerConEmpleado(rows);
}

function crearPrestamo(datos, token) {
  var _authErr = requiereEscritura(token);
  if (_authErr) return _authErr;

  if (!datos || !datos.empleado_id) return { ok: false, mensaje: 'Selecciona un empleado.' };
  var monto = Number(datos.monto);
  var cuotas = Number(datos.cuotas);
  if (isNaN(monto) || monto <= 0) return { ok: false, mensaje: 'El monto debe ser mayor a 0.' };
  if (isNaN(cuotas) || cuotas <= 0) return { ok: false, mensaje: 'Las cuotas deben ser mayor a 0.' };
  var cuota = Math.round(monto / cuotas);
  return conLock(function () {
    var hoja = getHoja(HOJAS.PRESTAMOS);
    var id = generarId('PRE');
    hoja.appendRow([id, datos.empleado_id, monto, cuotas, cuota, 0, 'activo', datos.fecha || hoy(), datos.notas || '']);
    invalidarCache(HOJAS.PRESTAMOS);
    registrarBitacora('crear', 'Prestamo', id, 'Prestamo de ' + monto);
    return { ok: true, mensaje: 'Préstamo registrado.' };
  });
}

function actualizarPrestamo(datos, token) {
  var _authErr = requiereEscritura(token);
  if (_authErr) return _authErr;

  var monto = Number(datos.monto);
  var cuotas = Number(datos.cuotas);
  if (isNaN(monto) || monto <= 0) return { ok: false, mensaje: 'El monto debe ser mayor a 0.' };
  if (isNaN(cuotas) || cuotas <= 0) return { ok: false, mensaje: 'Las cuotas deben ser mayor a 0.' };

  var hoja = getHoja(HOJAS.PRESTAMOS);
  var rows = hoja.getDataRange().getValues();
  for (var i = 1; i < rows.length; i++) {
    if (String(rows[i][0]) === String(datos.id)) {
      // Conservar historial de pagos: el formulario cliente no envía
      // cuotas_pagadas/estado — antes se reseteaban a 0/'activo'.
      var cuotasPagadas = (datos.cuotas_pagadas !== undefined && datos.cuotas_pagadas !== null && datos.cuotas_pagadas !== '')
        ? Number(datos.cuotas_pagadas) : (Number(rows[i][5]) || 0);
      var estadoActual = (datos.estado && String(datos.estado).trim())
        ? String(datos.estado).trim() : String(rows[i][6] || 'activo');
      if (cuotasPagadas >= cuotas) estadoActual = 'saldado';
      var cuota = Math.round(monto / cuotas);
      hoja.getRange(i+1, 1, 1, 9).setValues([[
        datos.id, datos.empleado_id, monto, cuotas, cuota,
        cuotasPagadas, estadoActual,
        datos.fecha || rows[i][7] || hoy(),
        (datos.notas !== undefined ? datos.notas : rows[i][8]) || ''
      ]]);
      invalidarCache(HOJAS.PRESTAMOS);
      registrarBitacora('actualizar', 'Prestamo', datos.id, 'Monto ' + monto + ' | Pagadas ' + cuotasPagadas);
      return { ok: true, mensaje: 'Préstamo actualizado.' };
    }
  }
  return { ok: false, mensaje: 'No encontrado.' };
}

function pagarCuotaPrestamo(id, token) {
  var _authErr = requiereEscritura(token);
  if (_authErr) return _authErr;

  return conLock(function () {
    var hoja = getHoja(HOJAS.PRESTAMOS);
    var rows = hoja.getDataRange().getValues();
    for (var i = 1; i < rows.length; i++) {
      if (String(rows[i][0]) === String(id)) {
        if (String(rows[i][6]) === 'saldado') {
          return { ok: false, mensaje: 'Este préstamo ya está saldado.' };
        }
        var pagadas = (Number(rows[i][5]) || 0) + 1;
        var total   = Number(rows[i][3]) || 1;
        var estado  = pagadas >= total ? 'saldado' : 'activo';
        hoja.getRange(i+1, 6).setValue(pagadas);
        hoja.getRange(i+1, 7).setValue(estado);
        registrarBitacora('actualizar', 'Prestamo', id, 'Cuota pagada ' + pagadas + '/' + total);
        return { ok: true, mensaje: 'Cuota registrada (' + pagadas + '/' + total + ').' };
      }
    }
    return { ok: false, mensaje: 'No encontrado.' };
  });
}

function eliminarPrestamo(id, token) {
  var _authErr = requiereEscritura(token);
  if (_authErr) return _authErr;

  return eliminarFila(HOJAS.PRESTAMOS, id, 'Prestamo');
}


// ===================================================================
// MÓDULO: HORAS EXTRA
// ===================================================================

function listarHorasExtra(empleadoId, token) {
  var _authErr = requiereEscritura(token);
  if (_authErr) return _authErr;

  var rows = leerTabla(HOJAS.HORAS_EXTRA);
  var empls = leerTabla(HOJAS.EMPLEADOS);
  if (empleadoId) rows = rows.filter(function (r) { return String(r.empleado_id) === String(empleadoId); });
  return rows.map(function (r) {
    var emp = empls.filter(function (e) { return String(e.id) === String(r.empleado_id); })[0] || {};
    if (!r.monto && emp.salario) {
      var sal = Number(emp.salario);
      if (sal > 0) {
        var valorHora = calcularValorHora(sal);
        r.monto = Math.round(valorHora * 1.5 * Number(r.horas));
      }
    }
    return Object.assign({ empleado_nombre: emp.nombre || '-' }, r);
  });
}

function crearHoraExtra(datos, token) {
  var _authErr = requiereEscritura(token);
  if (_authErr) return _authErr;

  if (!datos || !datos.empleado_id) return { ok: false, mensaje: 'Selecciona un empleado.' };
  if (isNaN(Number(datos.horas)) || Number(datos.horas) <= 0) {
    return { ok: false, mensaje: 'Las horas deben ser un número mayor a 0.' };
  }
  var tiposValidos = ['normal', 'diurno', 'nocturno', 'domingo'];
  var tipo = String(datos.tipo || 'normal').toLowerCase();
  if (tiposValidos.indexOf(tipo) === -1) {
    return { ok: false, mensaje: 'Tipo de hora extra no válido. Use: ' + tiposValidos.join(', ') };
  }

  var hoja  = getHoja(HOJAS.HORAS_EXTRA);
  var horasExtra = leerTabla(HOJAS.HORAS_EXTRA);
  var empls = leerTabla(HOJAS.EMPLEADOS);
  var emp   = empls.filter(function (e) { return String(e.id) === String(datos.empleado_id); })[0] || {};

  // Validar máximo 240h/mes (límite legal CR)
  var fecha = datos.fecha ? new Date(datos.fecha) : new Date();
  var mesAno = fecha.getFullYear() + '-' + String(fecha.getMonth() + 1).padStart(2, '0');
  var horasDelMes = horasExtra.filter(function (h) {
    var hFecha = new Date(h.fecha);
    var hMesAno = hFecha.getFullYear() + '-' + String(hFecha.getMonth() + 1).padStart(2, '0');
    return String(h.empleado_id) === String(datos.empleado_id) && hMesAno === mesAno;
  }).reduce(function (sum, h) { return sum + Number(h.horas||0); }, 0);

  if (horasDelMes + Number(datos.horas) > 240) {
    return { ok: false, mensaje: 'Límite mensual alcanzado. Ya tiene ' + horasDelMes + 'h este mes (máximo 240h).' };
  }

  var monto = datos.monto || 0;
  if (!monto && emp.salario) {
    var sal = Number(emp.salario);
    if (sal > 0) {
      var vh = sal / 240;
      // Multiplicadores según Código de Trabajo CR art. 139-140:
      // diurno/normal: 1.5×  |  nocturno: 2.25×  |  domingo/feriado: 2.5×
      var multiplicador = 1.5;
      var tipoNorm = String(tipo || 'normal').toLowerCase();
      if (tipoNorm === 'nocturno') multiplicador = 2.25;
      else if (tipoNorm === 'domingo' || tipoNorm === 'feriado') multiplicador = 2.5;
      monto = Math.round(vh * multiplicador * Number(datos.horas));
    }
  }
  var id = generarId('HEX');
  hoja.appendRow([id, datos.empleado_id, datos.fecha||hoy(), datos.horas, tipo, datos.aprobado||'pendiente', monto, datos.notas||'']);
  invalidarCache(HOJAS.HORAS_EXTRA);
  registrarBitacora('crear', 'HoraExtra', id, datos.horas + ' hrs ' + tipo);
  return { ok: true, mensaje: 'Horas extra registradas.' };
}

function actualizarHoraExtra(datos, token) {
  var _authErr = requiereEscritura(token);
  if (_authErr) return _authErr;

  if (!datos || !datos.id) return { ok: false, mensaje: 'Falta el identificador.' };
  var horasNum = Number(datos.horas);
  if (isNaN(horasNum) || horasNum <= 0) {
    return { ok: false, mensaje: 'Las horas deben ser un número mayor a 0.' };
  }
  var tiposValidos = ['normal', 'diurno', 'nocturno', 'domingo', 'feriado'];
  var tipo = String(datos.tipo || 'normal').toLowerCase();
  if (tiposValidos.indexOf(tipo) === -1) {
    return { ok: false, mensaje: 'Tipo de hora extra no válido. Use: ' + tiposValidos.join(', ') };
  }

  var hoja = getHoja(HOJAS.HORAS_EXTRA);
  var rows = hoja.getDataRange().getValues();
  var horasExtra = leerTabla(HOJAS.HORAS_EXTRA);
  for (var i = 1; i < rows.length; i++) {
    if (String(rows[i][0]) === String(datos.id)) {
      var empleadoId = datos.empleado_id || rows[i][1];
      var fecha = datos.fecha ? new Date(datos.fecha) : new Date(rows[i][2] || Date.now());
      var mesAno = fecha.getFullYear() + '-' + String(fecha.getMonth() + 1).padStart(2, '0');
      var horasDelMes = horasExtra.filter(function (h) {
        if (String(h.id) === String(datos.id)) return false; // excluir el registro que se edita
        var hFecha = new Date(h.fecha);
        var hMesAno = hFecha.getFullYear() + '-' + String(hFecha.getMonth() + 1).padStart(2, '0');
        return String(h.empleado_id) === String(empleadoId) && hMesAno === mesAno;
      }).reduce(function (sum, h) { return sum + (Number(h.horas) || 0); }, 0);
      if (horasDelMes + horasNum > 240) {
        return { ok: false, mensaje: 'Límite mensual alcanzado. Ya tiene ' + horasDelMes + 'h este mes (máximo 240h).' };
      }
      hoja.getRange(i+1, 1, 1, 8).setValues([[
        datos.id, empleadoId, datos.fecha || hoy(), horasNum, tipo,
        datos.aprobado || rows[i][5] || 'pendiente',
        Number(datos.monto) || Number(rows[i][6]) || 0,
        (datos.notas !== undefined ? datos.notas : rows[i][7]) || ''
      ]]);
      invalidarCache(HOJAS.HORAS_EXTRA);
      registrarBitacora('actualizar', 'HoraExtra', datos.id, horasNum + ' hrs ' + tipo);
      return { ok: true, mensaje: 'Actualizado.' };
    }
  }
  return { ok: false, mensaje: 'No encontrado.' };
}

function eliminarHoraExtra(id, token) {
  var _authErr = requiereEscritura(token);
  if (_authErr) return _authErr;

  return eliminarFila(HOJAS.HORAS_EXTRA, id, 'HoraExtra');
}


// ===================================================================
// MÓDULO: ACTIVOS ASIGNADOS
// ===================================================================

function listarActivos(empleadoId, estado, token) {
  var _authErr = requiereSesion(token);
  if (_authErr) return _authErr;

  var rows = leerTabla(HOJAS.ACTIVOS);
  if (empleadoId) rows = rows.filter(function (r) { return String(r.empleado_id) === String(empleadoId); });
  if (estado) rows = rows.filter(function (r) { return String(r.estado).toLowerCase() === String(estado).toLowerCase(); });
  return enriquecerConEmpleado(rows);
}

function crearActivo(datos, token) {
  var _authErr = requiereEscritura(token);
  if (_authErr) return _authErr;

  if (!datos || !datos.empleado_id) return { ok: false, mensaje: 'Selecciona un empleado.' };
  if (!_empleadoExiste(datos.empleado_id)) return { ok: false, mensaje: 'El empleado no existe.' };
  if (!datos.nombre || !String(datos.nombre).trim()) {
    return { ok: false, mensaje: 'El nombre del activo es obligatorio.' };
  }
  var serial = String(datos.serial || '').trim();
  if (serial) {
    var yaAsignado = leerTabla(HOJAS.ACTIVOS).some(function (a) {
      return String(a.serial || '').trim().toLowerCase() === serial.toLowerCase() &&
             String(a.estado || '').toLowerCase() === 'asignado';
    });
    if (yaAsignado) {
      return { ok: false, mensaje: 'Ese serial ya está asignado a otro empleado.' };
    }
  }

  var hoja = getHoja(HOJAS.ACTIVOS);
  var id   = generarId('ACT');
  hoja.appendRow(sanitizarFilaSheets([id, datos.empleado_id, datos.nombre, datos.categoria||'', serial, datos.fecha_entrega||hoy(), datos.fecha_devolucion||'', datos.estado||'asignado', datos.notas||'']));
  invalidarCache(HOJAS.ACTIVOS);
  registrarBitacora('crear', 'Activo', id, datos.nombre + ' asignado');
  return { ok: true, mensaje: 'Activo registrado.' };
}

function actualizarActivo(datos, token) {
  var _authErr = requiereEscritura(token);
  if (_authErr) return _authErr;

  var hoja = getHoja(HOJAS.ACTIVOS);
  var rows = hoja.getDataRange().getValues();
  for (var i = 1; i < rows.length; i++) {
    if (String(rows[i][0]) === String(datos.id)) {
      hoja.getRange(i+1, 1, 1, 9).setValues([[datos.id, datos.empleado_id, datos.nombre, datos.categoria||'', datos.serial||'', datos.fecha_entrega||hoy(), datos.fecha_devolucion||'', datos.estado||'asignado', datos.notas||'']]);
      invalidarCache(HOJAS.ACTIVOS);
      return { ok: true, mensaje: 'Activo actualizado.' };
    }
  }
  return { ok: false, mensaje: 'No encontrado.' };
}

function eliminarActivo(id, token) {
  var _authErr = requiereEscritura(token);
  if (_authErr) return _authErr;

  return eliminarFila(HOJAS.ACTIVOS, id, 'Activo');
}


// ===================================================================
// MÓDULO: TURNOS
// ===================================================================

function listarTurnos(semana, token) {
  var _authErr = requiereSesion(token);
  if (_authErr) return _authErr;

  var rows  = leerTabla(HOJAS.TURNOS);
  var empls = leerTabla(HOJAS.EMPLEADOS);
  if (semana) rows = rows.filter(function (r) { return String(r.semana) === String(semana); });
  return rows.map(function (r) {
    var emp = empls.filter(function (e) { return String(e.id) === String(r.empleado_id); })[0] || {};
    return Object.assign({ empleado_nombre: emp.nombre || '-' }, r);
  });
}

function guardarTurno(datos, token) {
  var _authErr = requiereEscritura(token);
  if (_authErr) return _authErr;

  var hoja = getHoja(HOJAS.TURNOS);
  var rows = hoja.getDataRange().getValues();
  for (var i = 1; i < rows.length; i++) {
    if (String(rows[i][1]) === String(datos.empleado_id) && String(rows[i][2]) === String(datos.semana)) {
      hoja.getRange(i+1, 1, 1, 10).setValues([[rows[i][0], datos.empleado_id, datos.semana,
        datos.lunes||'', datos.martes||'', datos.miercoles||'', datos.jueves||'',
        datos.viernes||'', datos.sabado||'', datos.domingo||'']]);
      return { ok: true, mensaje: 'Turno actualizado.' };
    }
  }
  var id = generarId('TUR');
  hoja.appendRow([id, datos.empleado_id, datos.semana,
    datos.lunes||'', datos.martes||'', datos.miercoles||'', datos.jueves||'',
    datos.viernes||'', datos.sabado||'', datos.domingo||'']);
  return { ok: true, mensaje: 'Turno guardado.' };
}

function eliminarTurno(id, token) {
  var _authErr = requiereEscritura(token);
  if (_authErr) return _authErr;

  return eliminarFila(HOJAS.TURNOS, id, 'Turno');
}


// ===================================================================
// MÓDULO: EXPEDIENTE COMPLETO
// ===================================================================

function obtenerExpediente(empleadoId, token) {
  var _authErr = requiereEscritura(token);
  if (_authErr) return _authErr;

  var emp = leerTabla(HOJAS.EMPLEADOS).filter(function (e) { return String(e.id) === String(empleadoId); })[0];
  if (!emp) return { ok: false, mensaje: 'Empleado no encontrado.' };
  var balance = _obtenerBalanceVacacionesInterno(empleadoId);
  return {
    ok: true, empleado: emp, balance: balance,
    historialSalarios: leerTabla(HOJAS.HISTORIAL_SALARIOS).filter(function (h) { return String(h.empleado_id) === String(empleadoId); }),
    capacitaciones:    leerTabla(HOJAS.CAPACITACIONES).filter(function (c) { return String(c.empleado_id) === String(empleadoId); }),
    evaluaciones:      leerTabla(HOJAS.EVALUACIONES).filter(function (e) { return String(e.empleado_id) === String(empleadoId); }),
    vacaciones:        leerTabla(HOJAS.VACACIONES).filter(function (v) { return String(v.empleado_id) === String(empleadoId); }),
    prestamos:         leerTabla(HOJAS.PRESTAMOS).filter(function (p) { return String(p.empleado_id) === String(empleadoId); }),
    activos:           leerTabla(HOJAS.ACTIVOS).filter(function (a) { return String(a.empleado_id) === String(empleadoId); }),
    horasExtra:        leerTabla(HOJAS.HORAS_EXTRA).filter(function (h) { return String(h.empleado_id) === String(empleadoId); })
  };
}


// ===================================================================
// MÓDULO: INCAPACIDADES (CCSS / INS)
// ===================================================================
//
// Estructura: id | empleado_id | fecha_desde | fecha_hasta | dias |
//             entidad ('CCSS' | 'INS') | especialidad | notas
// ===================================================================

/**
 * Lista incapacidades, con filtros opcionales.
 * @param {string} [empleadoId]
 * @param {string} [entidad]    'CCSS' | 'INS'
 * @param {string} [fechaDesde] yyyy-MM-dd. Filtra por fecha_desde >= este valor.
 * @param {string} [fechaHasta] yyyy-MM-dd. Filtra por fecha_desde <= este valor.
 */
function listarIncapacidades(empleadoId, entidad, fechaDesde, fechaHasta, token) {
  var _authErr = requiereSesion(token);
  if (_authErr) return _authErr;

  var rows  = leerTabla(HOJAS.INCAPACIDADES);
  var empls = leerTabla(HOJAS.EMPLEADOS);
  if (empleadoId) rows = rows.filter(function (r) { return String(r.empleado_id) === String(empleadoId); });
  if (entidad) rows = rows.filter(function (r) { return String(r.entidad).toUpperCase() === String(entidad).toUpperCase(); });
  if (fechaDesde) rows = rows.filter(function (r) { return formatearFecha(r.fecha_desde) >= fechaDesde; });
  if (fechaHasta) rows = rows.filter(function (r) { return formatearFecha(r.fecha_desde) <= fechaHasta; });
  return rows.map(function (r) {
    var emp = empls.filter(function (e) { return String(e.id) === String(r.empleado_id); })[0] || {};
    r.fecha_desde = formatearFecha(r.fecha_desde);
    r.fecha_hasta = formatearFecha(r.fecha_hasta);
    return Object.assign({ empleado_nombre: emp.nombre || '-' }, r);
  });
}

function crearIncapacidad(datos, token) {
  var _authErr = requiereEscritura(token);
  if (_authErr) return _authErr;

  if (!datos || !datos.empleado_id) return { ok: false, mensaje: 'Selecciona un empleado.' };
  if (!datos.fecha_desde || isNaN(new Date(datos.fecha_desde).getTime())) {
    return { ok: false, mensaje: 'La fecha de inicio no es válida.' };
  }
  if (!datos.fecha_hasta || isNaN(new Date(datos.fecha_hasta).getTime())) {
    return { ok: false, mensaje: 'La fecha de fin no es válida.' };
  }
  if (new Date(datos.fecha_hasta) < new Date(datos.fecha_desde)) {
    return { ok: false, mensaje: 'La fecha de fin no puede ser anterior a la de inicio.' };
  }
  var entidad = String(datos.entidad || 'CCSS').toUpperCase();
  if (entidad !== 'CCSS' && entidad !== 'INS') {
    return { ok: false, mensaje: 'Entidad debe ser CCSS o INS.' };
  }
  var dias = calcularDias(datos.fecha_desde, datos.fecha_hasta);
  var hoja = getHoja(HOJAS.INCAPACIDADES);
  var id   = generarId('INC');
  hoja.appendRow([id, datos.empleado_id, formatearFecha(datos.fecha_desde),
    formatearFecha(datos.fecha_hasta), dias, entidad,
    datos.especialidad || '', datos.notas || '']);
  invalidarCache(HOJAS.INCAPACIDADES);
  registrarBitacora('crear', 'Incapacidad', id, dias + ' días (' + entidad + ')');
  return { ok: true, mensaje: 'Incapacidad registrada (' + dias + ' días).' };
}

function actualizarIncapacidad(datos, token) {
  var _authErr = requiereEscritura(token);
  if (_authErr) return _authErr;

  var hoja = getHoja(HOJAS.INCAPACIDADES);
  var rows = hoja.getDataRange().getValues();
  for (var i = 1; i < rows.length; i++) {
    if (String(rows[i][0]) === String(datos.id)) {
      var dias = calcularDias(datos.fecha_desde, datos.fecha_hasta);
      hoja.getRange(i+1, 1, 1, 8).setValues([[datos.id, datos.empleado_id,
        formatearFecha(datos.fecha_desde), formatearFecha(datos.fecha_hasta), dias,
        datos.entidad || 'CCSS', datos.especialidad || '', datos.notas || '']]);
      registrarBitacora('actualizar', 'Incapacidad', datos.id, dias + ' días');
      return { ok: true, mensaje: 'Incapacidad actualizada.' };
    }
  }
  return { ok: false, mensaje: 'No encontrada.' };
}

function eliminarIncapacidad(id, token) {
  var _authErr = requiereEscritura(token);
  if (_authErr) return _authErr;

  return eliminarFila(HOJAS.INCAPACIDADES, id, 'Incapacidad');
}


// ===================================================================
// MÓDULO: FERIADOS
// ===================================================================
//
// Estructura: id | fecha | nombre | tipo ('obligatorio' | 'no obligatorio')
// ===================================================================

function listarFeriados(anio, token) {
  var _authErr = requiereSesion(token);
  if (_authErr) return _authErr;

  var rows = leerTabla(HOJAS.FERIADOS);
  rows.forEach(function (r) { r.fecha = formatearFecha(r.fecha); });
  if (anio) rows = rows.filter(function (r) { return String(r.fecha).slice(0, 4) === String(anio); });
  rows.sort(function (a, b) { return String(a.fecha).localeCompare(String(b.fecha)); });
  return rows;
}

function crearFeriado(datos, token) {
  var _authErr = requiereEscritura(token);
  if (_authErr) return _authErr;

  if (!datos || !datos.fecha || isNaN(new Date(datos.fecha).getTime())) {
    return { ok: false, mensaje: 'La fecha no es válida.' };
  }
  var fecha = formatearFecha(datos.fecha);
  var existe = leerTabla(HOJAS.FERIADOS).some(function (f) {
    return formatearFecha(f.fecha) === fecha;
  });
  if (existe) return { ok: false, mensaje: 'Ya hay un feriado registrado en esa fecha.' };
  var hoja = getHoja(HOJAS.FERIADOS);
  var id   = generarId('FER');
  hoja.appendRow([id, fecha, datos.nombre || '', datos.tipo || 'obligatorio']);
  registrarBitacora('crear', 'Feriado', id, fecha + ' ' + (datos.nombre || ''));
  return { ok: true, mensaje: 'Feriado registrado.' };
}

function eliminarFeriado(id, token) {
  var _authErr = requiereEscritura(token);
  if (_authErr) return _authErr;

  return eliminarFila(HOJAS.FERIADOS, id, 'Feriado');
}


// ===================================================================
// MÓDULO: LIQUIDACIONES LABORALES
// ===================================================================
//
// Estructura: id | empleado_id | fecha_salida | motivo | fecha_calculo |
//             monto | estado ('pendiente' | 'pagada') | notas
// ===================================================================

function listarLiquidaciones(empleadoId, estado, token) {
  var _authErr = requiereEscritura(token);
  if (_authErr) return _authErr;

  var rows  = leerTabla(HOJAS.LIQUIDACIONES);
  var empls = leerTabla(HOJAS.EMPLEADOS);
  if (empleadoId) rows = rows.filter(function (r) { return String(r.empleado_id) === String(empleadoId); });
  if (estado) rows = rows.filter(function (r) { return String(r.estado).toLowerCase() === String(estado).toLowerCase(); });
  return rows.map(function (r) {
    var emp = empls.filter(function (e) { return String(e.id) === String(r.empleado_id); })[0] || {};
    r.fecha_salida  = formatearFecha(r.fecha_salida);
    r.fecha_calculo = formatearFecha(r.fecha_calculo);
    r.fecha_ingreso = formatearFecha(emp.fecha_ingreso || '');

    // Calcular años trabajados
    if (emp.fecha_ingreso && r.fecha_salida) {
      var fechaIng = new Date(formatearFecha(emp.fecha_ingreso) + 'T00:00:00');
      var fechaSal = new Date(r.fecha_salida.replace(/(\d{2})\/(\d{2})\/(\d{4})/, '$3-$2-$1') + 'T00:00:00');
      r.anios_trabajados = ((fechaSal - fechaIng) / (365.25 * 24 * 60 * 60 * 1000)).toFixed(2);
    } else {
      r.anios_trabajados = 0;
    }

    return Object.assign({ empleado_nombre: emp.nombre || '-' }, r);
  });
}

/** Genera reporte HTML de liquidación laboral profesional (imprimible). */
function generarReporteLiquidacion(empleadoId, fechaSalida, motivoSalida, token) {
  var _authErr = requiereEscritura(token);
  if (_authErr) return _authErr;

  var liq = calcularLiquidacion(empleadoId, fechaSalida, motivoSalida, null, null, null, null, token);
  if (!liq.ok) return liq;

  var html = '<!DOCTYPE html><html><head><meta charset="utf-8"><title>Liquidación Laboral</title>';
  html += '<style>';
  html += 'body { font-family: Arial, sans-serif; margin: 20px; background: #fff; color: #333; }';
  html += '.encabezado { text-align: center; margin-bottom: 20px; border-bottom: 3px solid #333; padding-bottom: 10px; }';
  html += '.encabezado h1 { margin: 0; font-size: 18px; }';
  html += '.encabezado p { margin: 5px 0; font-size: 14px; }';
  html += '.datos-trabajador { margin: 15px 0; }';
  html += '.datos-trabajador table { width: 100%; border-collapse: collapse; font-size: 12px; }';
  html += '.datos-trabajador td { padding: 5px; border-bottom: 1px solid #ddd; }';
  html += '.datos-trabajador strong { display: inline-block; min-width: 150px; }';
  html += '.seccion { margin: 20px 0; padding: 12px; border-left: 4px solid #2563eb; background: #f9f9f9; }';
  html += '.seccion h3 { margin-top: 0; font-size: 14px; color: #2563eb; }';
  html += '.seccion table { width: 100%; border-collapse: collapse; font-size: 12px; margin: 8px 0; }';
  html += '.seccion td { padding: 6px; border-bottom: 1px solid #ddd; }';
  html += '.seccion .label { font-weight: 600; width: 60%; }';
  html += '.seccion .valor { text-align: right; width: 40%; }';
  html += '.total-seccion { font-weight: 700; background: #e8f4f8; border-top: 2px solid #2563eb; }';
  html += '.total-final { margin: 20px 0; padding: 16px; background: #dcfce7; border: 3px solid #22c55e; border-radius: 6px; text-align: center; }';
  html += '.total-final .label { font-size: 12px; color: #666; }';
  html += '.total-final .monto { font-size: 28px; font-weight: 700; color: #22c55e; }';
  html += '.no-paga { color: #dc2626; }';
  html += '.si-paga { color: #22c55e; font-weight: 600; }';
  html += '@media print { body { margin: 0; } .no-print { display: none; } }';
  html += '</style></head><body>';

  // Encabezado
  html += '<div class="encabezado">';
  html += '<h1>TROPICALES DEL VALLE S.A.</h1>';
  html += '<p><strong>Liquidación Laboral</strong></p>';
  html += '</div>';

  // Datos del trabajador
  html += '<div class="datos-trabajador">';
  html += '<table>';
  html += '<tr><td><strong>Nombre del Trabajador:</strong></td><td>' + escaparHtmlEmail(liq.empleado) + '</td><td style="text-align:right"><strong>Identificación nº</strong></td><td style="text-align:right">' + escaparHtmlEmail(liq.identificacion) + '</td></tr>';
  html += '<tr><td><strong>Digite la fecha inicio:</strong></td><td>' + escaparHtmlEmail(liq.fechaIngreso) + '</td><td style="text-align:right"><strong>Digite la fecha salida:</strong></td><td style="text-align:right">' + escaparHtmlEmail(liq.fechaSalida) + '</td></tr>';
  html += '<tr><td><strong>Meses Laborados:</strong></td><td>' + liq.mesesLaborados + ',' + String(liq.diasAdicionales).padStart(2,'0') + '</td><td style="text-align:right"><strong>Tipo de nómina:</strong></td><td style="text-align:right">' + (liq.tipoNomina === 'Semanal' ? 'X' : ' ') + ' Semanal | ' + (liq.tipoNomina === 'Quincenal' ? 'X' : ' ') + ' Quincenal</td></tr>';
  html += '</table>';
  html += '</div>';

  // Motivo de salida
  html += '<div class="datos-trabajador">';
  html += '<strong>Motivo de Salida:</strong><br>';
  html += 'Despido Con Responsabilidad Patronal ' + (liq.motivoSalida === 'despido_con_resp' ? '☒' : '☐') + '<br>';
  html += 'Despido Sin Responsablidad Patronal ' + (liq.motivoSalida === 'despido_sin_resp' ? '☒' : '☐') + '<br>';
  html += 'Renuncia del Trabajador ' + (liq.motivoSalida === 'renuncia' ? '☒' : '☐');
  html += '</div>';

  // 1. Aguinaldo
  html += '<div class="seccion">';
  html += '<h3>1- Calculo del Aguinaldo:</h3>';
  html += '<table>';
  html += '<tr><td class="label">Total Por Aguinaldo:</td><td class="valor total-seccion">₡' + formatearNumero(liq.aguinaldo) + '</td></tr>';
  html += '</table>';
  html += '</div>';

  // 2. Vacaciones
  html += '<div class="seccion">';
  html += '<h3>2- Cálculo de las Vacaciones:</h3>';
  html += '<table>';
  html += '<tr><td class="label">Salario Promedio Mensual:</td><td class="valor">₡' + formatearNumero(liq.salarioMensual) + '</td></tr>';
  html += '<tr><td class="label">Salario por Día:</td><td class="valor">₡' + formatearNumero(liq.salarioDiario) + '</td></tr>';
  html += '<tr><td class="label">Días a Recibir Vacaciones:</td><td class="valor">' + Number(liq.diasVacaciones || 0).toFixed(2).replace('.', ',') + '</td></tr>';
  html += '<tr><td class="label">Total Por Vacaciones:</td><td class="valor total-seccion">₡' + formatearNumero(liq.vacaciones) + '</td></tr>';
  html += '</table>';
  html += '</div>';

  // 3. Cesantía
  html += '<div class="seccion">';
  html += '<h3>3- Calculo de la Cesantia:</h3>';
  html += '<table>';
  html += '<tr><td class="label">¿Corresponde el pago?:</td><td class="valor">' + (liq.cesantia > 0 ? '<span class="si-paga">SÍ</span>' : '<span class="no-paga">NO</span>') + '</td></tr>';
  html += '<tr><td class="label">Salario promedio mensual:</td><td class="valor">₡' + (liq.cesantia > 0 ? formatearNumero(liq.salarioMensual) : '0,00') + '</td></tr>';
  html += '<tr><td class="label">Días que corresponden</td><td class="valor">' + (liq.cesantia > 0 ? (liq.cesantia / (liq.salarioMensual / 30)).toFixed(2) : '00,0') + ' dias</td></tr>';
  html += '<tr><td class="label">Total Por Auxilio de Cesantia:</td><td class="valor total-seccion">₡' + formatearNumero(liq.cesantia) + '</td></tr>';
  html += '</table>';
  html += '</div>';

  // 4. Preaviso
  html += '<div class="seccion">';
  html += '<h3>4- Calculo del Preaviso:</h3>';
  html += '<table>';
  html += '<tr><td class="label">¿Desea conocer el tiempo?</td><td class="valor">' + (liq.preaviso > 0 ? 'SÍ' : 'NO') + '</td></tr>';
  html += '<tr><td class="label">¿Corresponde el pago?</td><td class="valor">' + (liq.preaviso > 0 ? '<span class="si-paga">SÍ</span>' : '<span class="no-paga">NO</span>') + '</td></tr>';
  html += '<tr><td class="label">Salario por Día</td><td class="valor">₡' + (liq.preaviso > 0 ? formatearNumero(liq.salarioDiario) : '0,00') + '</td></tr>';
  html += '<tr><td class="label">30 dias</td><td class="valor"></td></tr>';
  html += '<tr><td class="label">Total Por Preaviso:</td><td class="valor total-seccion">₡' + formatearNumero(liq.preaviso) + '</td></tr>';
  html += '</table>';
  html += '</div>';

  // Total Prestaciones
  html += '<div class="total-final">';
  html += '<div class="label">Total Prestaciones Laborales:</div>';
  html += '<div class="monto">₡' + formatearNumero(liq.totalPrestaciones) + '</div>';
  html += '</div>';

  html += '<div class="no-print" style="text-align:center;margin-top:20px">';
  html += '<button onclick="window.print()" style="padding:10px 20px;background:#2563eb;color:white;border:none;border-radius:4px;cursor:pointer;font-size:14px">🖨️ Imprimir</button>';
  html += '</div>';

  html += '</body></html>';

  return {
    ok: true,
    html: html
  };
}

/** Formatea número con puntos de miles y 2 decimales. */
function formatearNumero(num) {
  return (Number(num) || 0).toLocaleString('es-CR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/** Calcula liquidación laboral completa según estructura Costa Rica (modelo Tropicales del Valle). */
function calcularLiquidacion(empleadoId, fechaSalida, motivoSalida, totalSalarios, promedioSalarios, tipoNomina, diasVacInput, token) {
  var _authErr = requiereEscritura(token);
  if (_authErr) return _authErr;

  var emp = _obtenerEmpleadoCompletoInterno(empleadoId);
  if (!emp) return { ok: false, mensaje: 'Empleado no encontrado.' };

  var fechaSal = typeof fechaSalida === 'string' ? new Date(fechaSalida + 'T00:00:00') : fechaSalida;
  var fechaIng = new Date(formatearFecha(emp.fecha_ingreso) + 'T00:00:00');

  if (fechaSal < fechaIng) {
    return { ok: false, mensaje: 'Fecha de salida anterior a ingreso (' + formatearFecha(emp.fecha_ingreso) + ').' };
  }

  var tipoNominaNorm = tipoNomina || emp.tipo_nomina || 'Semanal';
  var motivo = motivoSalida || 'renuncia';

  // Meses laborados — fórmula exacta Excel F13:
  // Semanal (G15="x"): diasDiff/30   Quincenal (F15="x"): (diasDiff/365)*12
  var diasDiff = Math.round((fechaSal - fechaIng) / (24 * 60 * 60 * 1000));
  var mesesTotales = (tipoNominaNorm === 'Semanal') ? (diasDiff / 30) : ((diasDiff / 365) * 12);
  var mesesLaborados = Math.floor(mesesTotales);
  var diasAdicionales = Math.round((mesesTotales - mesesLaborados) * 30);

  // Días en año 360 (usado para tabla de cesantía, igual que Excel BN12)
  var diasTrabajados360 = mesesTotales * 30;

  // Salario mensual (promedio 6 meses si se ingresó, si no el base)
  var salarioMensual = Number(promedioSalarios) || Number(emp.salario) || 0;

  // Salario diario — fórmula exacta Excel G28:
  // Quincenal (F15="X"): promedio/26   Semanal (G15="X"): promedio/30
  var salarioDiario = (tipoNominaNorm === 'Quincenal') ? (salarioMensual / 26) : (salarioMensual / 30);

  // ====== 1. AGUINALDO ======
  // Art. 166 CT: proporcional — suma de salarios del período / 12
  // Si el empleado trabajó menos de 12 meses, se paga (meses/12) × salario mensual
  var montoAguinaldo;
  if (totalSalarios && Number(totalSalarios) > 0) {
    // Con salarios ingresados: proporcional a meses trabajados en el período
    var mesesPeriodo = Math.min(mesesTotales, 12);
    montoAguinaldo = (Number(totalSalarios) / 12) * (mesesPeriodo / 12) * 12;
    // Simplificado: totalSalarios / 12 ya es correcto si la suma representa exactamente
    // los meses trabajados — no se multiplica por meses de nuevo
    montoAguinaldo = Number(totalSalarios) / 12;
  } else {
    // Sin salarios ingresados: proporcional según meses transcurridos desde el
    // 1° de diciembre del período de aguinaldo vigente (Ley de Aguinaldo,
    // período dic-nov) — o desde la fecha de ingreso si es más reciente.
    // ANTES: usaba mesesTotales (antigüedad COMPLETA del empleado, tope 12),
    // así que alguien con años de antigüedad que salía a mitad de año recibía
    // un aguinaldo completo (1 mes de salario) en vez del proporcional real
    // de los meses trabajados en el período vigente.
    var inicioPeriodoAguinaldo = new Date(fechaSal.getFullYear(), 11, 1); // 1 dic del año de salida
    if (fechaSal < inicioPeriodoAguinaldo) {
      inicioPeriodoAguinaldo.setFullYear(inicioPeriodoAguinaldo.getFullYear() - 1);
    }
    var inicioEfectivoAguinaldo = (fechaIng > inicioPeriodoAguinaldo) ? fechaIng : inicioPeriodoAguinaldo;
    var mesesAguinaldo = Math.min(12, Math.max(0,
      (fechaSal - inicioEfectivoAguinaldo) / (30.4375 * 24 * 60 * 60 * 1000)));
    montoAguinaldo = salarioMensual * (mesesAguinaldo / 12);
  }

  // ====== 2. VACACIONES ======
  // Excel: días ingresados × salario diario (Días a Recibir Vacaciones = 5 en el ejemplo)
  var diasVacaciones = (diasVacInput !== undefined && diasVacInput !== null && diasVacInput !== '')
    ? Number(diasVacInput)
    : (function() {
        var bal = _obtenerBalanceVacacionesInterno(empleadoId);
        // Balance 0 es legítimo (ya usó todos los días) — NO sustituir por 5.
        // Solo usar fallback 5 si no hay datos de balance (empleado sin fecha ingreso, etc.).
        if (bal && bal.ok) return Math.max(0, Number(bal.diasDisponibles) || 0);
        return 5;
      })();
  var montoVacaciones = diasVacaciones * salarioDiario;

  // ====== 3. CESANTÍA ======
  // Solo aplica en Despido Con Responsabilidad Patronal
  // Monto = diasCesantia * salarioDiario (fórmula Excel D38)
  var correspondeCesantia = (motivo === 'despido_con_resp');
  var montoCesantia = 0;
  if (correspondeCesantia) {
    montoCesantia = calcularCesantiaCompleta(salarioDiario, diasTrabajados360);
  }

  // ====== 4. PREAVISO ======
  // Solo aplica en Despido Con Responsabilidad Patronal
  // Usa tabla nueva ley basada en días 360 (Excel JU38-JU46)
  var correspondePreaviso = (motivo === 'despido_con_resp');
  var diasPreaviso = 0;
  var montoPreaviso = 0;
  if (correspondePreaviso) {
    diasPreaviso = calcularDiasPreaviso(mesesTotales);
    montoPreaviso = diasPreaviso * salarioDiario;
  }

  // ====== TOTAL PRESTACIONES ======
  // Excel: G46+G38+G30+G23 — sin descuento CCSS
  var totalPrestaciones = montoAguinaldo + montoVacaciones + montoCesantia + montoPreaviso;

  return {
    ok: true,
    empleado: emp.nombre,
    cedula: emp.cedula,
    identificacion: emp.cedula,
    area: emp.area || emp.departamento || '',
    fechaIngreso: formatearFecha(emp.fecha_ingreso),
    fechaSalida: formatearFecha(fechaSalida),
    mesesLaborados: mesesLaborados,
    diasAdicionales: diasAdicionales,
    tipoNomina: tipoNominaNorm,
    motivoSalida: motivo,
    salarioMensual: Math.round(salarioMensual * 100) / 100,
    salarioDiario: Math.round(salarioDiario * 100) / 100,
    diasVacaciones: diasVacaciones,
    diasPreaviso: diasPreaviso,
    correspondeCesantia: correspondeCesantia,
    correspondePreaviso: correspondePreaviso,
    aguinaldo: Math.round(montoAguinaldo * 100) / 100,
    vacaciones: Math.round(montoVacaciones * 100) / 100,
    cesantia: Math.round(montoCesantia * 100) / 100,
    preaviso: Math.round(montoPreaviso * 100) / 100,
    totalPrestaciones: Math.round(totalPrestaciones * 100) / 100,
    totalNeto: Math.round(totalPrestaciones * 100) / 100,
    totalCalculado: Math.round(totalPrestaciones * 100) / 100
  };
}

/**
 * Calcula el auxilio de cesantía (Art. 29 Código de Trabajo CR).
 * diasTrabajados360 = mesesTotales * 30 (año laboral de 360 días).
 *
 * Metodología (verificada con fuentes legales, jul-2026): la cesantía NO es
 * un único valor buscado por antigüedad total — se SUMAN los días que
 * corresponden a cada año completo trabajado, con tope de 8 años:
 *   Año 1: 19.5   Año 2: 20   Año 3: 20.5   Año 4: 21
 *   Año 5: 21.24  Año 6: 21.5 Año 7: 22     Año 8: 22
 * (tope ≈167.74 días). Con menos de 1 año aplican los tramos especiales de
 * la Ley de Protección al Trabajador: 3-6 meses → 7 días, 6-12 meses → 14
 * días (montos fijos, no per-año). Una fracción de año incompleto mayor a
 * 6 meses cuenta como año completo adicional (al rate de ese año).
 *
 * ANTES: la función hacía un único lookup en una tabla de 28 rangos y
 * devolvía solo ese valor — p.ej. a 10 años de antigüedad pagaba ~21.5 días
 * en vez de los ~167.74 días (tope de 8 años) que corresponden legalmente.
 */
function calcularCesantiaCompleta(salarioDiario, diasTrabajados360) {
  if (diasTrabajados360 < 90) return 0; // menos de 3 meses: sin derecho a cesantía

  if (diasTrabajados360 < 360) {
    var diasParcial = (diasTrabajados360 <= 180) ? 7 : 14;
    return diasParcial * salarioDiario;
  }

  var TABLA_ANUAL_CESANTIA = [19.5, 20, 20.5, 21, 21.24, 21.5, 22, 22]; // años 1..8
  var TOPE_ANIOS = TABLA_ANUAL_CESANTIA.length;

  var aniosCompletos  = Math.floor(diasTrabajados360 / 360);
  var diasResiduales  = diasTrabajados360 - (aniosCompletos * 360);
  var aniosAContar    = (diasResiduales > 180) ? (aniosCompletos + 1) : aniosCompletos;
  aniosAContar = Math.min(aniosAContar, TOPE_ANIOS);

  var totalDiasCesantia = 0;
  for (var i = 0; i < aniosAContar; i++) {
    totalDiasCesantia += TABLA_ANUAL_CESANTIA[i];
  }

  return totalDiasCesantia * salarioDiario;
}

/**
 * Calcula días de preaviso según tabla Excel BX14:CB16 (Código de Trabajo CR art. 28).
 * Usa mesesTotales como entrada (igual que BX12 = F13 en el Excel).
 * Bandas por meses: 3-5.99→7d, 6-11.99→15d, 12+→30d.
 */
function calcularDiasPreaviso(mesesTotales) {
  if (mesesTotales >= 3 && mesesTotales < 6)   return 7;
  if (mesesTotales >= 6 && mesesTotales < 12)  return 15;
  if (mesesTotales >= 12)                       return 30;
  return 0;
}

function crearLiquidacion(datos, token) {
  var _authErr = requiereEscritura(token);
  if (_authErr) return _authErr;

  if (!datos || !datos.empleado_id) return { ok: false, mensaje: 'Selecciona un empleado.' };
  if (!datos.fecha_salida || isNaN(new Date(datos.fecha_salida).getTime())) {
    return { ok: false, mensaje: 'La fecha de salida no es válida.' };
  }

  // Si no proporciona monto, calcular automáticamente
  var monto = Number(datos.monto);
  var calculoAuto = null;
  if (isNaN(monto) || monto === 0 || datos.calcular_automatico) {
    // El motivo debe pasarse explícitamente: sin él, calcularLiquidacion asume
    // 'renuncia' y omite cesantía/preaviso aunque sea un despido con responsabilidad patronal.
    calculoAuto = calcularLiquidacion(datos.empleado_id, datos.fecha_salida, datos.motivo, null, null, null, null, token);
    if (!calculoAuto.ok) return calculoAuto;
    monto = calculoAuto.totalCalculado;
  }

  if (isNaN(monto) || monto < 0) return { ok: false, mensaje: 'El monto debe ser un número mayor o igual a 0.' };

  var hoja = getHoja(HOJAS.LIQUIDACIONES);
  var id   = generarId('LIQ');
  var notasCompletas = (datos.notas || '') +
    (calculoAuto ? '\n[Cálculo automático: vacaciones no tomadas + cesantía]' : '');

  hoja.appendRow([id, datos.empleado_id, formatearFecha(datos.fecha_salida),
    datos.motivo || '', formatearFecha(datos.fecha_calculo || hoy()), monto,
    datos.estado || 'pendiente', notasCompletas]);
  invalidarCache(HOJAS.LIQUIDACIONES);

  registrarBitacora('crear', 'Liquidacion', id, 'Liquidación de ' + monto + ' para ' + datos.empleado_id);

  // Opcional: dar de baja al empleado en el mismo paso.
  if (datos.inactivar) cambiarEstadoEmpleado(datos.empleado_id, 'inactivo', token);

  return {
    ok: true,
    mensaje: 'Liquidación registrada por ' + monto + '.',
    id: id
  };
}

function actualizarLiquidacion(datos, token) {
  var _authErr = requiereEscritura(token);
  if (_authErr) return _authErr;

  var hoja = getHoja(HOJAS.LIQUIDACIONES);
  var rows = hoja.getDataRange().getValues();
  for (var i = 1; i < rows.length; i++) {
    if (String(rows[i][0]) === String(datos.id)) {
      hoja.getRange(i+1, 1, 1, 8).setValues([[datos.id, datos.empleado_id,
        formatearFecha(datos.fecha_salida), datos.motivo || '',
        formatearFecha(datos.fecha_calculo || hoy()), Number(datos.monto) || 0,
        datos.estado || 'pendiente', datos.notas || '']]);
      registrarBitacora('actualizar', 'Liquidacion', datos.id, 'Estado: ' + (datos.estado || 'pendiente'));
      return { ok: true, mensaje: 'Liquidación actualizada.' };
    }
  }
  return { ok: false, mensaje: 'No encontrada.' };
}

function marcarLiquidacionPagada(id, token) {
  var _authErr = requiereEscritura(token);
  if (_authErr) return _authErr;

  var hoja = getHoja(HOJAS.LIQUIDACIONES);
  var fila = buscarFilaPorId(hoja, id);
  if (fila === -1) return { ok: false, mensaje: 'No se encontró la liquidación.' };
  hoja.getRange(fila, COLS.LIQ_ESTADO).setValue('pagada');
  registrarBitacora('actualizar', 'Liquidacion', id, 'Marcada como pagada');
  return { ok: true, mensaje: 'Liquidación marcada como pagada.' };
}

function eliminarLiquidacion(id, token) {
  var _authErr = requiereEscritura(token);
  if (_authErr) return _authErr;

  return eliminarFila(HOJAS.LIQUIDACIONES, id, 'Liquidacion');
}


// ===================================================================
// ===================================================================
// UTILIDADES GENÉRICAS DE CRUD (Refactorización - evita duplicación)
// ===================================================================

/**
 * Calcula el valor unitario de una hora de trabajo (centralizado, NO duplicado).
 * En CR: 240 horas/mes es el estándar laboral.
 * @param {number} salarioMensual
 * @param {number} [periodoHoras] - Horas en el período (default 240)
 * @return {number} valor por hora (sin redondear)
 */
function calcularValorHora(salarioMensual, periodoHoras) {
  var sal = Number(salarioMensual) || 0;
  var periodo = Number(periodoHoras) || 240;
  if (sal <= 0 || periodo <= 0) return 0;
  return sal / periodo;
}

/**
 * Patrón genérico para crear un registro en cualquier tabla.
 * Valida token, genera ID, agrega bitácora.
 * @param {string} nombreHoja - Nombre de la pestaña (usar HOJAS.*)
 * @param {string} tipoEntidad - Nombre legible (ej: "Empleado", "Préstamo")
 * @param {Object} datos - Datos a guardar
 * @param {string} token - Token de autorización
 * @param {Function} validar - Función de validación personalizada (opcional)
 * @param {Function} mapear - Función para mapear datos a fila de Sheets (opcional)
 * @return {Object} {ok, mensaje, id}
 */
function crearRegistro(nombreHoja, tipoEntidad, datos, token, validar, mapear) {
  var _authErr = requiereEscritura(token);
  if (_authErr) return _authErr;

  if (!datos) return { ok: false, mensaje: tipoEntidad + ' sin datos.' };

  // Validación personalizada si existe
  if (validar) {
    var err = validar(datos);
    if (err) return { ok: false, mensaje: err };
  }

  var hoja = getHoja(nombreHoja);
  var id = generarId(tipoEntidad.toUpperCase().substring(0, 3));

  // Mapeo personalizado o genérico
  var fila = mapear ? mapear(id, datos) : [id, datos.empleado_id || '', JSON.stringify(datos)];

  hoja.appendRow(fila);
  registrarBitacora('crear', tipoEntidad, id, tipoEntidad + ' creado');
  return { ok: true, mensaje: tipoEntidad + ' registrado.', id: id };
}

/**
 * Patrón genérico para actualizar un registro.
 * @param {string} nombreHoja
 * @param {string} tipoEntidad
 * @param {Object} datos (debe incluir .id)
 * @param {string} token
 * @param {Function} validar (opcional)
 * @param {Function} actualizar (función que actualiza la fila)
 * @return {Object} {ok, mensaje}
 */
function actualizarRegistro(nombreHoja, tipoEntidad, datos, token, validar, actualizar) {
  var _authErr = requiereEscritura(token);
  if (_authErr) return _authErr;

  if (!datos || !datos.id) return { ok: false, mensaje: 'ID requerido.' };

  if (validar) {
    var err = validar(datos);
    if (err) return { ok: false, mensaje: err };
  }

  var hoja = getHoja(nombreHoja);
  var fila = buscarFilaPorId(hoja, datos.id);
  if (fila === -1) return { ok: false, mensaje: tipoEntidad + ' no encontrado.' };

  if (actualizar) {
    actualizar(hoja, fila, datos);
  }

  registrarBitacora('actualizar', tipoEntidad, datos.id, tipoEntidad + ' actualizado');
  return { ok: true, mensaje: tipoEntidad + ' actualizado.' };
}

// UTILIDAD: eliminar fila genérica
// ===================================================================

function eliminarFila(nombreHoja, id, entidad) {
  var hoja = getHoja(nombreHoja);
  var rows = hoja.getDataRange().getValues();
  for (var i = 1; i < rows.length; i++) {
    if (String(rows[i][0]) === String(id)) {
      hoja.deleteRow(i + 1);
      registrarBitacora('eliminar', entidad, id, entidad + ' eliminado');
      return { ok: true, mensaje: entidad + ' eliminado.' };
    }
  }
  return { ok: false, mensaje: 'Registro no encontrado.' };
}

function hoy() {
  return Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd');
}


// ===================================================================
// MÓDULO: INTEGRACIÓN CONTABILIDAD (Fase 5 - Item 7)
// ===================================================================
// Webhook para exportar nómina a ERP/Contabilidad

/**
 * Genera payload contable para nómina del mes.
 * Formato: cuentas por pagar, deducciones, impuestos.
 * Fase 5 - Item 7: Integración Contabilidad.
 * @param {string} mes - Formato yyyy-MM
 * @return {Object} {ok, payload} o {ok: false, mensaje}
 */
function generarPayloadContabilidad(mes, token) {
  var _authErr = requiereAdmin(token);
  if (_authErr) return _authErr;

  try {
    var nominas = leerTabla(HOJAS.NOMINA).filter(function (n) {
      return String(n.mes) === mes;
    });

    if (!nominas.length) {
      return { ok: false, mensaje: 'Sin nóminas para ' + mes };
    }

    var totalBruto = 0, totalCCSS = 0, totalRenta = 0, totalNeto = 0;
    var empleados = [];

    nominas.forEach(function (n) {
      var bruto = Number(n.salario_base) || 0;
      var ded = Number(n.deducciones) || 0;
      var neto = Number(n.neto) || 0;

      totalBruto += bruto;
      totalNeto += neto;

      // Estimado: 10.67% CCSS, resto renta (simplificado)
      var ccss = Math.round(bruto * 0.1067);
      totalCCSS += ccss;

      var renta = ded - ccss;
      totalRenta += renta;

      empleados.push({
        empleado_id: n.empleado_id,
        salario_bruto: bruto,
        deduccion_ccss: ccss,
        deduccion_renta: renta,
        total_deducciones: ded,
        salario_neto: neto
      });
    });

    // Totales para asientos contables
    var payload = {
      periodo: mes,
      fecha_generacion: new Date().toISOString(),
      resumen: {
        total_empleados: nominas.length,
        total_bruto: totalBruto,
        total_ccss_empleado: totalCCSS,
        total_renta_empleado: totalRenta,
        total_deducciones: totalCCSS + totalRenta,
        total_neto_pagable: totalNeto,
        ccss_patronal_estimado: Math.round(totalBruto * 0.1067)  // Patronal aparte
      },
      detalle: empleados,
      asientos_contables: [
        {
          descripcion: 'Nómina mes ' + mes + ' - Gasto de personal',
          cuenta_gasto: '5100-001',  // Gastos de personal (ajustar a contabilidad real)
          debito: totalBruto,
          credito: 0
        },
        {
          descripcion: 'Nómina mes ' + mes + ' - Cuentas por pagar',
          cuenta_pasivo: '2100-001',  // CxP sueldos (ajustar)
          debito: 0,
          credito: totalNeto
        },
        {
          descripcion: 'Nómina mes ' + mes + ' - CCSS descuento empleado',
          cuenta_pasivo: '2150-001',  // CxP CCSS
          debito: 0,
          credito: totalCCSS
        }
      ]
    };

    return { ok: true, payload: payload };
  } catch (e) {
    return { ok: false, mensaje: 'Error: ' + e.message };
  }
}

/**
 * Envía payload contable a webhook externo (ERP, Contabilidad).
 * Fase 5 - Item 7: Integración externa.
 * @param {string} urlWebhook - URL del servidor destino
 * @param {Object} payload - Datos a enviar
 * @param {string} [autorizacion] - Bearer token si aplica
 * @return {Object} {ok, respuesta} o {ok: false, error}
 */
function enviarPayloadContabilidad(urlWebhook, payload, autorizacion, token) {
  var _authErr = requiereAdmin(token);
  if (_authErr) return _authErr;

  try {
    var opciones = {
      method: 'post',
      contentType: 'application/json',
      payload: JSON.stringify(payload),
      muteHttpExceptions: true
    };

    if (autorizacion) {
      opciones.headers = { 'Authorization': 'Bearer ' + autorizacion };
    }

    var respuesta = UrlFetchApp.fetch(urlWebhook, opciones);
    var codigo = respuesta.getResponseCode();

    if (codigo >= 200 && codigo < 300) {
      registrarBitacora('integracion', 'Contabilidad', payload.periodo, 'Payload enviado a ' + urlWebhook);
      return { ok: true, respuesta: respuesta.getContentText() };
    } else {
      return { ok: false, error: 'HTTP ' + codigo + ': ' + respuesta.getContentText() };
    }
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

// ===================================================================
// MÓDULO: CACHÉ DE LECTURAS (Fase 4 - Item 10)
// ===================================================================
// Memoización por sesión para evitar releer tablas múltiples veces

var CACHE_TABLAS = {};
var CACHE_TIMESTAMP = {};
var CACHE_TTL_MS = 300000; // 5 minutos

/**
 * Lee tabla con caché automático (5 min TTL).
 * Evita releer la misma tabla N veces en un request.
 * @param {string} nombreHoja
 * @return {Object[]}
 */
function leerTablaConCache(nombreHoja) {
  var ahora = new Date().getTime();
  var cached = CACHE_TABLAS[nombreHoja];
  var timestamp = CACHE_TIMESTAMP[nombreHoja] || 0;

  // Si está en caché y no expiró, devolver
  if (cached && (ahora - timestamp < CACHE_TTL_MS)) {
    return cached;
  }

  // Leer y cachear
  var datos = leerTabla(nombreHoja);
  CACHE_TABLAS[nombreHoja] = datos;
  CACHE_TIMESTAMP[nombreHoja] = ahora;
  return datos;
}

/**
 * Invalida caché de una tabla específica.
 * Llamar después de crear/actualizar/eliminar.
 * @param {string} nombreHoja
 */
function invalidarCache(nombreHoja) {
  delete CACHE_TABLAS[nombreHoja];
  delete CACHE_TIMESTAMP[nombreHoja];
}

/**
 * Invalida todo el caché.
 */
function invalidarTodoCache() {
  CACHE_TABLAS = {};
  CACHE_TIMESTAMP = {};
}

// ===================================================================
// MÓDULO: VALIDADORES CENTRALIZADOS (Fase 4 - Item 4)
// ===================================================================
// Una fuente única de verdad para reglas de validación en toda la app

var VALIDADORES = {
  /**
   * Valida rango de horas en formato HH:mm
   * @param {string} hora - Formato HH:mm
   * @return {string|null} Error message o null si válido
   */
  validarHora: function(hora) {
    if (!hora || !/^\d{2}:\d{2}$/.test(hora)) return 'Formato debe ser HH:mm';
    var h = parseInt(hora.split(':')[0], 10);
    var m = parseInt(hora.split(':')[1], 10);
    if (h < 0 || h > 23 || m < 0 || m > 59) return 'Hora debe estar entre 00:00 y 23:59';
    return null;
  },

  /**
   * Valida salario mínimo CR (~500k 2025)
   * @param {number} salario
   * @return {string|null}
   */
  validarSalario: function(salario) {
    var sal = Number(salario);
    if (sal <= 0) return 'Salario debe ser mayor a 0';
    if (sal < 500000) return 'Salario ₡' + sal + ' es inferior al mínimo legal (~₡500,000)';
    return null;
  },

  /**
   * Valida fecha: debe ser válida y no futura
   * @param {string} fecha - Formato yyyy-MM-dd
   * @param {boolean} permiteFutura - Default false
   * @return {string|null}
   */
  validarFecha: function(fecha, permiteFutura) {
    if (!fecha || isNaN(new Date(fecha).getTime())) return 'Fecha inválida';
    var fd = new Date(fecha);
    var hoy = new Date();
    if (!permiteFutura && fd > hoy) return 'No se permite fecha futura';
    return null;
  },

  /**
   * Valida rango de fechas
   * @param {string} inicio
   * @param {string} fin
   * @return {string|null}
   */
  validarRangoFechas: function(inicio, fin) {
    if (new Date(fin) < new Date(inicio)) return 'Fecha fin no puede ser anterior a inicio';
    return null;
  },

  /**
   * Valida enum (lista de valores válidos)
   * @param {string} valor
   * @param {string[]} valoresValidos
   * @param {string} nombreCampo
   * @return {string|null}
   */
  validarEnum: function(valor, valoresValidos, nombreCampo) {
    var v = String(valor || '').toLowerCase();
    if (valoresValidos.map(function(x) { return String(x).toLowerCase(); }).indexOf(v) === -1) {
      return nombreCampo + ' inválido. Use: ' + valoresValidos.join(', ');
    }
    return null;
  },

  /**
   * Valida horas extra cumplan límite 240/mes
   * @param {number} horasNuevas
   * @param {string} empleadoId
   * @param {string} mes - yyyy-MM
   * @return {string|null}
   */
  validarHorasExtraLimite: function(horasNuevas, empleadoId, mes) {
    var horasExtra = leerTabla(HOJAS.HORAS_EXTRA) || [];
    var horasDelMes = horasExtra.filter(function (h) {
      var hFecha = new Date(h.fecha);
      var hMesAno = hFecha.getFullYear() + '-' + String(hFecha.getMonth() + 1).padStart(2, '0');
      return String(h.empleado_id) === String(empleadoId) && hMesAno === mes;
    }).reduce(function (sum, h) { return sum + Number(h.horas||0); }, 0);

    if (horasDelMes + Number(horasNuevas) > 240) {
      return 'Límite mensual (240h) alcanzado. Ya tiene ' + horasDelMes + 'h este mes';
    }
    return null;
  },

  /**
   * Valida email básico
   * @param {string} email
   * @return {string|null}
   */
  validarEmail: function(email) {
    if (!email || !String(email).includes('@')) return 'Email inválido';
    return null;
  }
};

// ===================================================================
// MÓDULO: PERMISOS (Fase 3 - Item 9)
// ===================================================================
// Permisos diferentes a vacaciones según ley CR
// Tipos: personal, médico, administrativo, asuntos_propios

/**
 * Lista permisos con detalles de empleados.
 * @param {string} [empleadoId] - Filtrar por empleado (opcional)
 * @param {string} [estado] - Filtrar por estado (opcional)
 * @return {Object[]}
 */
function listarPermisos(empleadoId, estado, token) {
  var _authErr = requiereSesion(token);
  if (_authErr) return _authErr;

  var permisos = leerTablaConCache(HOJAS.PERMISOS) || [];
  if (empleadoId) permisos = permisos.filter(function (p) { return String(p.empleado_id) === String(empleadoId); });
  if (estado) permisos = permisos.filter(function (p) { return String(p.estado).toLowerCase() === String(estado).toLowerCase(); });

  var nombres = mapaEmpleados();
  permisos.forEach(function (p) {
    p.empleado_nombre = nombres[p.empleado_id] || '(desconocido)';
  });
  return permisos;
}

/**
 * Crea un nuevo permiso (personal, médico, etc.).
 * @param {Object} datos - {empleado_id, tipo, fecha_inicio, fecha_fin, motivo, notas}
 * @param {string} token
 * @return {Object} {ok, mensaje, id}
 */
function crearPermiso(datos, token) {
  var _authErr = requiereEscritura(token);
  if (_authErr) return _authErr;

  if (!datos || !datos.empleado_id) return { ok: false, mensaje: 'Empleado requerido.' };

  var tiposValidos = ['personal', 'medico', 'administrativo', 'asuntos_propios'];
  var tipo = String(datos.tipo || 'personal').toLowerCase();
  if (tiposValidos.indexOf(tipo) === -1) {
    return { ok: false, mensaje: 'Tipo inválido. Use: ' + tiposValidos.join(', ') };
  }

  try {
    var hoja = getHoja(HOJAS.PERMISOS);
    var id = generarId('PRM');
    hoja.appendRow([id, datos.empleado_id, tipo, datos.fecha_inicio || '',
                    datos.fecha_fin || '', 'pendiente', datos.motivo || '', datos.notas || '']);
    invalidarCache(HOJAS.PERMISOS);
    registrarBitacora('crear', 'Permiso', id, tipo + ' - ' + datos.motivo);
    return { ok: true, mensaje: 'Permiso creado.', id: id };
  } catch (e) {
    return { ok: false, mensaje: 'Error: ' + e.message };
  }
}

// ===================================================================
// MÓDULO: WORKFLOW DE APROBACIONES (Fase 5 - Item 20)
// ===================================================================
// Flujo: pendiente → aprobado_jefe → aprobado_rrhh

/**
 * Estados válidos en el workflow de aprobaciones.
 */
var ESTADOS_APROBACION = {
  PENDIENTE: 'pendiente',
  APROBADO_JEFE: 'aprobado_jefe',
  APROBADO_RRHH: 'aprobado_rrhh',
  RECHAZADO_JEFE: 'rechazado_jefe',
  RECHAZADO_RRHH: 'rechazado_rrhh'
};

/**
 * Aprueba una solicitud (vacación, permiso, etc.) en el workflow.
 * Fase 5 - Item 20: Workflow multi-nivel.
 * @param {string} tipoSolicitud - 'vacacion', 'permiso', etc.
 * @param {string} solicitudId
 * @param {string} nuevoEstado - Estado siguiente en workflow
 * @param {string} token
 * @param {string} [notas] - Notas de aprobación
 * @return {Object} {ok, mensaje}
 */
function aprobarSolicitud(tipoSolicitud, solicitudId, nuevoEstado, token, notas) {
  var sesion = validarSesion(token);
  if (!sesion.ok) return sesion;

  var rol = sesion.rol || 'consulta';
  // Mapear roles PIN al vocabulario del workflow
  var esRrhh = (rol === 'rrhh' || rol === 'jefe_rrhh');
  var esAdmin = (rol === 'admin');
  var esJefe = (rol === 'jefe_depto' || esRrhh || esAdmin);

  if (nuevoEstado === ESTADOS_APROBACION.APROBADO_JEFE && !esJefe) {
    return { ok: false, mensaje: 'Solo jefe de departamento o superior puede aprobar en primer nivel' };
  }
  if (nuevoEstado === ESTADOS_APROBACION.APROBADO_RRHH && !esRrhh && !esAdmin) {
    return { ok: false, mensaje: 'Solo RRHH o admin puede aprobar en segundo nivel' };
  }

  // Estados finales compatibles con obtenerBalanceVacaciones / cambiarEstadoVacaciones
  var estadoAGuardar = nuevoEstado;
  if (nuevoEstado === ESTADOS_APROBACION.APROBADO_RRHH ||
      (nuevoEstado === ESTADOS_APROBACION.APROBADO_JEFE && tipoSolicitud === 'vacacion' && (esRrhh || esAdmin))) {
    // Aprobación final de vacaciones → 'aprobada' (reconocida por el balance)
    if (tipoSolicitud === 'vacacion' && (nuevoEstado === ESTADOS_APROBACION.APROBADO_RRHH || esRrhh || esAdmin)) {
      estadoAGuardar = 'aprobada';
    }
  }
  if (nuevoEstado === ESTADOS_APROBACION.RECHAZADO_JEFE ||
      nuevoEstado === ESTADOS_APROBACION.RECHAZADO_RRHH) {
    if (tipoSolicitud === 'vacacion') estadoAGuardar = 'rechazada';
  }

  try {
    var hojaMap = {
      'vacacion': HOJAS.VACACIONES,
      'permiso': HOJAS.PERMISOS
    };

    var nombreHoja = hojaMap[tipoSolicitud];
    if (!nombreHoja) return { ok: false, mensaje: 'Tipo de solicitud no válido' };

    return conLock(function () {
      var hoja = getHoja(nombreHoja);
      var fila = buscarFilaPorId(hoja, solicitudId);
      if (fila === -1) return { ok: false, mensaje: 'Solicitud no encontrada' };

      if (tipoSolicitud === 'vacacion' && estadoAGuardar === 'aprobada') {
        var datosVac = leerTabla(HOJAS.VACACIONES);
        var solicitud = datosVac.filter(function (s) { return String(s.id) === String(solicitudId); })[0];
        if (solicitud) {
          var balance = _obtenerBalanceVacacionesInterno(solicitud.empleado_id);
          if (!balance.ok) return balance;
          var diasSolicitud = Number(solicitud.dias) || 0;
          if (diasSolicitud > balance.diasDisponibles) {
            return {
              ok: false,
              mensaje: 'No se puede aprobar. Disponibles: ' + balance.diasDisponibles +
                       ', solicita: ' + diasSolicitud
            };
          }
        }
      }

      var colEstado = tipoSolicitud === 'permiso' ? COLS.PRM_ESTADO : COLS.VAC_ESTADO;
      hoja.getRange(fila, colEstado).setValue(estadoAGuardar);
      invalidarCache(nombreHoja);

      registrarBitacora('aprobar', tipoSolicitud.toUpperCase(), solicitudId,
        'Estado: ' + estadoAGuardar + ' | Por: ' + rol + ' | Notas: ' + (notas || '—'));

      return { ok: true, mensaje: 'Solicitud actualizada: ' + estadoAGuardar };
    });
  } catch (e) {
    return { ok: false, mensaje: 'Error: ' + e.message };
  }
}

/**
 * Rechaza una solicitud en el workflow.
 * @param {string} tipoSolicitud
 * @param {string} solicitudId
 * @param {string} razonRechazo
 * @param {string} token
 * @return {Object} {ok, mensaje}
 */
function rechazarSolicitud(tipoSolicitud, solicitudId, razonRechazo, token) {
  var sesion = validarSesion(token);
  if (!sesion.ok) return sesion;

  var rol = sesion.rol || 'consulta';
  var estadoRechazo = (rol === 'jefe_rrhh' || rol === 'rrhh' || rol === 'admin') ?
    ESTADOS_APROBACION.RECHAZADO_RRHH : ESTADOS_APROBACION.RECHAZADO_JEFE;

  return aprobarSolicitud(tipoSolicitud, solicitudId, estadoRechazo, token, 'Rechazado: ' + razonRechazo);
}

// ===================================================================
// MÓDULO: REPORTES AUTOMATIZADOS (Fase 3 - Item 6)
// ===================================================================

/**
 * Genera un reporte HTML de nómina del mes especificado.
 * Formato HTML optimizado para imprimir/convertir a PDF.
 * @param {string} mes - Formato yyyy-MM
 * @return {Object} {ok, html, fileName}
 */
function generarReporteNomina(mes, token) {
  var _authErr = requiereEscritura(token);
  if (_authErr) return _authErr;

  var nominas = leerTabla(HOJAS.NOMINA).filter(function (n) {
    return String(n.mes) === mes;
  });

  if (!nominas.length) return { ok: false, mensaje: 'Sin nóminas para ' + mes };

  var empleados = leerTabla(HOJAS.EMPLEADOS);
  var empleadosMap = {};
  empleados.forEach(function (e) { empleadosMap[e.id] = e; });

  var totalBruto = 0, totalDeducciones = 0, totalNeto = 0;

  var tablaNominas = '<table style="width:100%;border-collapse:collapse;font-size:11px"><tr>' +
    '<th style="border:1px solid #ccc;padding:4px">Empleado</th>' +
    '<th style="border:1px solid #ccc;padding:4px">Salario Base</th>' +
    '<th style="border:1px solid #ccc;padding:4px">Deducciones</th>' +
    '<th style="border:1px solid #ccc;padding:4px">Neto</th></tr>';

  nominas.forEach(function (n) {
    var emp = empleadosMap[n.empleado_id] || {};
    var bruto = Number(n.salario_base) || 0;
    var ded = Number(n.deducciones) || 0;
    var neto = Number(n.neto) || 0;
    totalBruto += bruto;
    totalDeducciones += ded;
    totalNeto += neto;

    tablaNominas += '<tr>' +
      '<td style="border:1px solid #ccc;padding:4px">' + escaparHtmlEmail(emp.nombre || '?') + '</td>' +
      '<td style="border:1px solid #ccc;padding:4px;text-align:right">₡' + Math.round(bruto).toLocaleString() + '</td>' +
      '<td style="border:1px solid #ccc;padding:4px;text-align:right">₡' + Math.round(ded).toLocaleString() + '</td>' +
      '<td style="border:1px solid #ccc;padding:4px;text-align:right">₡' + Math.round(neto).toLocaleString() + '</td></tr>';
  });

  tablaNominas += '<tr style="font-weight:bold;background:#f0f0f0">' +
    '<td style="border:1px solid #ccc;padding:4px">TOTAL</td>' +
    '<td style="border:1px solid #ccc;padding:4px;text-align:right">₡' + Math.round(totalBruto).toLocaleString() + '</td>' +
    '<td style="border:1px solid #ccc;padding:4px;text-align:right">₡' + Math.round(totalDeducciones).toLocaleString() + '</td>' +
    '<td style="border:1px solid #ccc;padding:4px;text-align:right">₡' + Math.round(totalNeto).toLocaleString() + '</td></tr></table>';

  var html = '<html><body style="font-family:Arial"><h2>Reporte de Nómina - ' + mes + '</h2>' +
    '<p>Fecha: ' + Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'dd/MM/yyyy HH:mm') + '</p>' +
    tablaNominas +
    '<p style="margin-top:20px;font-size:10px;color:#666">Este es un reporte generado automáticamente por Sistema RRHH.</p>' +
    '</body></html>';

  return {
    ok: true,
    html: html,
    fileName: 'Nomina_' + mes + '.html',
    totalEmpleados: nominas.length,
    totalNeto: Math.round(totalNeto * 100) / 100
  };
}

/**
 * Envía un reporte por email.
 * @param {string} destinatario - Email del destinatario
 * @param {string} asunto - Asunto del email
 * @param {string} htmlContent - Contenido HTML del reporte
 * @param {string} [nombreArchivo] - Opcional, para adjuntar
 * @return {Object} {ok, mensaje}
 */
function enviarReportePorEmail(destinatario, asunto, htmlContent, nombreArchivo, token) {
  var _authErr = requiereEscritura(token);
  if (_authErr) return _authErr;

  var email = String(destinatario || '').trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { ok: false, mensaje: 'Email inválido.' };
  }
  // Restringir a destinatarios de alertas configurados (evita phishing/spam arbitrario)
  var cfg = obtenerConfigAlertasInterno();
  var permitidos = String(cfg.destinatarios || '')
    .split(/[,;\s]+/)
    .map(function (e) { return e.trim().toLowerCase(); })
    .filter(Boolean);
  if (permitidos.length && permitidos.indexOf(email) === -1) {
    return {
      ok: false,
      mensaje: 'Destinatario no autorizado. Agrégalo en Configuración → Alertas (destinatarios).'
    };
  }

  try {
    GmailApp.sendEmail(email, String(asunto || 'Reporte RRHH').slice(0, 200), 'Ver versión HTML.', {
      htmlBody: String(htmlContent || ''),
      name: 'Sistema RRHH'
    });

    registrarBitacora('enviar', 'Reporte', email, 'Reporte enviado: ' + String(asunto || '').slice(0, 80));
    return { ok: true, mensaje: 'Reporte enviado a ' + email };
  } catch (e) {
    return { ok: false, mensaje: 'Error al enviar: ' + e.message };
  }
}

/**
 * Resumen de alertas para reportar.
 * @return {string} HTML formateado
 */
function generarReporteAlertas(token) {
  var _authErr = requiereEscritura(token);
  if (_authErr) return _authErr;

  var alertas = _obtenerAlertasInterno();
  if (!alertas.length) return '<p>Sin alertas activas.</p>';

  var html = '<h3>Alertas Activas</h3><table style="width:100%;border-collapse:collapse;font-size:10px">' +
    '<tr><th style="border:1px solid #ccc;padding:4px">Urgencia</th>' +
    '<th style="border:1px solid #ccc;padding:4px">Tipo</th>' +
    '<th style="border:1px solid #ccc;padding:4px">Descripción</th></tr>';

  alertas.slice(0, 20).forEach(function (a) {
    var urgenciaColor = a.urgencia === 'crítica' ? '#ff6b6b' : a.urgencia === 'alta' ? '#ffa500' : '#ffeb3b';
    html += '<tr><td style="border:1px solid #ccc;padding:4px;background:' + urgenciaColor + '">' + a.urgencia + '</td>' +
      '<td style="border:1px solid #ccc;padding:4px">' + a.tipo + '</td>' +
      '<td style="border:1px solid #ccc;padding:4px">' + a.descripcion + '</td></tr>';
  });

  html += '</table>';
  return html;
}

