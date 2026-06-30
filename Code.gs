/**
 * ===================================================================
 * SISTEMA DE RECURSOS HUMANOS (RRHH) - Google Apps Script
 * ===================================================================
 * Backend principal. Sirve el frontend con HtmlService y expone las
 * funciones CRUD que el frontend invoca con google.script.run.
 *
 * Base de datos: una hoja de Google Sheets con una pestaña por entidad.
 * Módulo implementado en esta entrega: EMPLEADOS.
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
  BITACORA:          'Bitacora'
};

/**
 * Encabezados esperados por pestaña (orden = orden de las columnas).
 * Sirven para crear la hoja automáticamente si no existe.
 */
var ENCABEZADOS = {
  Empleados:         ['id', 'nombre', 'cedula', 'departamento', 'puesto', 'fecha_ingreso', 'salario', 'estado', 'fecha_nacimiento', 'telefono'],
  Departamentos:     ['id', 'nombre', 'responsable'],
  Asistencia:        ['id', 'empleado_id', 'fecha', 'hora_entrada', 'hora_salida', 'horas'],
  Vacaciones:        ['id', 'empleado_id', 'fecha_inicio', 'fecha_fin', 'dias', 'estado'],
  Nomina:            ['id', 'empleado_id', 'mes', 'salario_base', 'deducciones', 'neto'],
  HistorialSalarios: ['id', 'empleado_id', 'salario_anterior', 'salario_nuevo', 'fecha', 'notas'],
  Capacitaciones:    ['id', 'empleado_id', 'curso', 'institucion', 'fecha_inicio', 'fecha_fin', 'estado', 'certificado_url'],
  Evaluaciones:      ['id', 'empleado_id', 'periodo', 'calificacion', 'comentarios', 'evaluador', 'fecha'],
  Bitacora:          ['id', 'fecha', 'usuario', 'accion', 'entidad', 'entidad_id', 'resumen']
};


// ---- PUNTO DE ENTRADA DE LA WEB APP -------------------------------

/**
 * doGet: Apps Script lo llama cuando alguien abre la URL del web app.
 * Devuelve el HTML del frontend.
 */
function doGet() {
  return HtmlService.createTemplateFromFile('Index')
    .evaluate()
    .setTitle('Sistema RRHH')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

/**
 * include: permite insertar el contenido de otro archivo .html
 * dentro de Index.html usando <?!= include('NombreArchivo') ?>.
 * Así separamos CSS y JS en archivos propios pero servimos un solo HTML.
 */
function include(nombreArchivo) {
  return HtmlService.createHtmlOutputFromFile(nombreArchivo).getContent();
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
 * Lee TODA una pestaña y la devuelve como un arreglo de objetos,
 * usando la primera fila como nombres de propiedad.
 * Ej: [{id:'...', nombre:'...', ...}, ...]
 *
 * @param {string} nombreHoja
 * @return {Object[]} filas como objetos.
 */
function leerTabla(nombreHoja) {
  var hoja = getHoja(nombreHoja);
  var datos = hoja.getDataRange().getValues();

  // Si solo hay encabezados (o nada), no hay registros.
  if (datos.length < 2) {
    return [];
  }

  var encabezados = datos[0];
  var filas = [];

  for (var i = 1; i < datos.length; i++) {
    var obj = {};
    for (var c = 0; c < encabezados.length; c++) {
      obj[encabezados[c]] = datos[i][c];
    }
    filas.push(obj);
  }
  return filas;
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
 * Busca el número de fila (1-based, como en la hoja) de un registro
 * por su id. Devuelve -1 si no lo encuentra.
 * Recuerda: la fila 1 son encabezados, los datos empiezan en la 2.
 *
 * @param {Sheet} hoja
 * @param {string} id
 * @return {number} índice de fila en la hoja, o -1.
 */
function buscarFilaPorId(hoja, id) {
  var datos = hoja.getDataRange().getValues();
  // Columna 0 = id (primera columna en todas nuestras tablas).
  for (var i = 1; i < datos.length; i++) {
    if (String(datos[i][0]) === String(id)) {
      return i + 1; // +1 porque las filas de la hoja son 1-based.
    }
  }
  return -1;
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
  // Salario: debe ser un número >= 0.
  var salario = Number(emp.salario);
  if (emp.salario === '' || emp.salario === null || isNaN(salario) || salario < 0) {
    return 'El salario debe ser un número mayor o igual a 0.';
  }
  // Fecha de ingreso: obligatoria y con formato válido (yyyy-mm-dd).
  if (!emp.fecha_ingreso || isNaN(new Date(emp.fecha_ingreso).getTime())) {
    return 'La fecha de ingreso no es válida.';
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
function listarEmpleados(soloActivos) {
  var empleados = leerTabla(HOJAS.EMPLEADOS);

  // Normalizamos la fecha a texto yyyy-mm-dd para mostrarla bien
  // en el frontend (Sheets a veces devuelve objetos Date).
  empleados.forEach(function (emp) {
    emp.fecha_ingreso     = formatearFecha(emp.fecha_ingreso);
    emp.fecha_nacimiento  = emp.fecha_nacimiento ? formatearFecha(emp.fecha_nacimiento) : '';
    emp.telefono          = emp.telefono ? String(emp.telefono) : '';
    emp.salario           = Number(emp.salario) || 0;
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
  var fecha = (valor instanceof Date) ? valor : new Date(valor);
  if (isNaN(fecha.getTime())) return String(valor);
  return Utilities.formatDate(fecha, Session.getScriptTimeZone(), 'yyyy-MM-dd');
}

/**
 * CREAR un empleado nuevo.
 * @param {Object} emp  datos del formulario.
 * @return {Object} {ok:boolean, mensaje:string, id?:string}
 */
function crearEmpleado(emp) {
  var error = validarEmpleado(emp);
  if (error) {
    return { ok: false, mensaje: error };
  }
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
  ];

  hoja.appendRow(fila);
  registrarBitacora('crear', 'Empleados', id, String(emp.nombre).trim());
  return { ok: true, mensaje: 'Empleado creado correctamente.', id: id };
}

/**
 * ACTUALIZAR un empleado existente por su id.
 * @param {Object} emp  datos del formulario (incluye emp.id).
 * @return {Object} {ok, mensaje}
 */
function actualizarEmpleado(emp) {
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

  var estadoActual   = hoja.getRange(fila, 8).getValue() || 'activo';
  var salarioAnterior = Number(hoja.getRange(fila, 7).getValue()) || 0;
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
    emp.fecha_nacimiento ? formatearFecha(emp.fecha_nacimiento) : (String(hoja.getRange(fila, 9).getValue() || '')),
    emp.telefono ? String(emp.telefono).trim() : (String(hoja.getRange(fila, 10).getValue() || ''))
  ];

  hoja.getRange(fila, 1, 1, valores.length).setValues([valores]);

  if (salarioAnterior > 0 && salarioAnterior !== salarioNuevo) {
    var hojaHist = getHoja(HOJAS.HISTORIAL_SALARIOS);
    hojaHist.appendRow([generarId('HSA'), emp.id, salarioAnterior, salarioNuevo,
      formatearFecha(new Date()), emp.notasSalario || '']);
  }

  registrarBitacora('actualizar', 'Empleados', emp.id, String(emp.nombre).trim());
  return { ok: true, mensaje: 'Empleado actualizado correctamente.' };
}

/**
 * CAMBIAR ESTADO (baja/alta lógica). No borra la fila.
 * @param {string} id
 * @param {string} nuevoEstado  'activo' o 'inactivo'.
 * @return {Object} {ok, mensaje}
 */
function cambiarEstadoEmpleado(id, nuevoEstado) {
  if (nuevoEstado !== 'activo' && nuevoEstado !== 'inactivo') {
    return { ok: false, mensaje: 'Estado no válido.' };
  }
  var hoja = getHoja(HOJAS.EMPLEADOS);
  var fila = buscarFilaPorId(hoja, id);
  if (fila === -1) {
    return { ok: false, mensaje: 'No se encontró el empleado.' };
  }
  // Columna 8 = estado.
  hoja.getRange(fila, 8).setValue(nuevoEstado);
  var accion = (nuevoEstado === 'activo') ? 'reactivado' : 'dado de baja';
  return { ok: true, mensaje: 'Empleado ' + accion + ' correctamente.' };
}

/**
 * Devuelve la lista de departamentos para llenar el <select> del
 * formulario. Si el módulo de Departamentos aún no existe, devolvemos
 * una lista vacía sin romper nada.
 * @return {string[]} nombres de departamentos.
 */
function listarNombresDepartamentos() {
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
function listarDepartamentos() {
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
function crearDepartamento(d) {
  var error = validarDepartamento(d);
  if (error) return { ok: false, mensaje: error };
  if (departamentoDuplicado(d.nombre, null)) {
    return { ok: false, mensaje: 'Ya existe un departamento con ese nombre.' };
  }
  var hoja = getHoja(HOJAS.DEPARTAMENTOS);
  var id = generarId('DEP');
  hoja.appendRow([id, String(d.nombre).trim(), d.responsable || '']);
  return { ok: true, mensaje: 'Departamento creado correctamente.', id: id };
}

/** Actualiza un departamento. */
function actualizarDepartamento(d) {
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
  return { ok: true, mensaje: 'Departamento actualizado correctamente.' };
}

/**
 * Elimina un departamento. No permite borrarlo si hay empleados que lo usan
 * (para no dejar registros huérfanos).
 */
function eliminarDepartamento(id) {
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

/** Lista la asistencia, agregando el nombre del empleado. */
function listarAsistencia() {
  var registros = leerTabla(HOJAS.ASISTENCIA);
  var nombres = mapaEmpleados();
  registros.forEach(function (r) {
    r.fecha = formatearFecha(r.fecha);
    r.hora_entrada = formatearHora(r.hora_entrada);
    r.hora_salida = formatearHora(r.hora_salida);
    r.empleado_nombre = nombres[r.empleado_id] || '(desconocido)';
    r.horas = Number(r.horas) || 0;
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
function crearAsistencia(a) {
  if (!a || !a.empleado_id) return { ok: false, mensaje: 'Selecciona un empleado.' };
  if (!a.fecha || isNaN(new Date(a.fecha).getTime())) {
    return { ok: false, mensaje: 'La fecha no es válida.' };
  }
  if (!/^\d{2}:\d{2}$/.test(a.hora_entrada || '') || !/^\d{2}:\d{2}$/.test(a.hora_salida || '')) {
    return { ok: false, mensaje: 'Las horas deben tener formato HH:mm.' };
  }
  var horas = calcularHoras(a.hora_entrada, a.hora_salida);
  var hoja = getHoja(HOJAS.ASISTENCIA);
  var id = generarId('ASI');
  hoja.appendRow([id, a.empleado_id, formatearFecha(a.fecha),
                  a.hora_entrada, a.hora_salida, horas]);
  return { ok: true, mensaje: 'Asistencia registrada (' + horas + ' h).', id: id };
}

/** Elimina un registro de asistencia. */
function eliminarAsistencia(id) {
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

/** Lista las solicitudes de vacaciones con el nombre del empleado. */
function listarVacaciones() {
  var lista = leerTabla(HOJAS.VACACIONES);
  var nombres = mapaEmpleados();
  lista.forEach(function (v) {
    v.fecha_inicio = formatearFecha(v.fecha_inicio);
    v.fecha_fin = formatearFecha(v.fecha_fin);
    v.dias = Number(v.dias) || 0;
    v.empleado_nombre = nombres[v.empleado_id] || '(desconocido)';
  });
  return lista;
}

/** Crea una solicitud de vacaciones (nace 'pendiente'). */
function crearVacaciones(v) {
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
  var dias = calcularDias(v.fecha_inicio, v.fecha_fin);
  var hoja = getHoja(HOJAS.VACACIONES);
  var id = generarId('VAC');
  hoja.appendRow([id, v.empleado_id, formatearFecha(v.fecha_inicio),
                  formatearFecha(v.fecha_fin), dias, 'pendiente']);
  return { ok: true, mensaje: 'Solicitud creada (' + dias + ' días).', id: id };
}

/** Cambia el estado de una solicitud (aprobar / rechazar). */
function cambiarEstadoVacaciones(id, nuevoEstado) {
  if (['pendiente', 'aprobada', 'rechazada'].indexOf(nuevoEstado) === -1) {
    return { ok: false, mensaje: 'Estado no válido.' };
  }
  var hoja = getHoja(HOJAS.VACACIONES);
  var fila = buscarFilaPorId(hoja, id);
  if (fila === -1) return { ok: false, mensaje: 'No se encontró la solicitud.' };
  hoja.getRange(fila, 6).setValue(nuevoEstado); // columna 6 = estado
  return { ok: true, mensaje: 'Solicitud ' + nuevoEstado + '.' };
}


// ===================================================================
// MÓDULO: NÓMINA BÁSICA
// ===================================================================
//   id | empleado_id | mes | salario_base | deducciones | neto
//   mes en formato "yyyy-MM" (ej: 2026-06)
// ===================================================================

/** Lista la nómina con nombre del empleado. */
function listarNomina(mesFiltro) {
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
function generarNomina(n) {
  if (!n || !n.empleado_id) return { ok: false, mensaje: 'Selecciona un empleado.' };
  if (!/^\d{4}-\d{2}$/.test(n.mes || '')) {
    return { ok: false, mensaje: 'El mes debe tener formato AAAA-MM.' };
  }
  var deducciones = Number(n.deducciones);
  if (isNaN(deducciones) || deducciones < 0) {
    return { ok: false, mensaje: 'Las deducciones deben ser un número ≥ 0.' };
  }

  // Evitar duplicados empleado+mes.
  var existentes = leerTabla(HOJAS.NOMINA);
  var dup = existentes.some(function (x) {
    return String(x.empleado_id) === String(n.empleado_id) && String(x.mes) === String(n.mes);
  });
  if (dup) return { ok: false, mensaje: 'Ya existe nómina para ese empleado en ese mes.' };

  // Salario base = salario del empleado.
  var empleado = leerTabla(HOJAS.EMPLEADOS).filter(function (e) {
    return String(e.id) === String(n.empleado_id);
  })[0];
  if (!empleado) return { ok: false, mensaje: 'Empleado no encontrado.' };

  var salarioBase = Number(empleado.salario) || 0;
  if (deducciones > salarioBase) {
    return { ok: false, mensaje: 'Las deducciones no pueden superar el salario base.' };
  }
  var neto = Math.round((salarioBase - deducciones) * 100) / 100;

  var hoja = getHoja(HOJAS.NOMINA);
  var id = generarId('NOM');
  hoja.appendRow([id, n.empleado_id, n.mes, salarioBase, deducciones, neto]);
  return { ok: true, mensaje: 'Nómina generada (neto: ' + neto + ').', id: id };
}

/** Elimina un registro de nómina. */
function eliminarNomina(id) {
  var hoja = getHoja(HOJAS.NOMINA);
  var fila = buscarFilaPorId(hoja, id);
  if (fila === -1) return { ok: false, mensaje: 'No se encontró el registro.' };
  hoja.deleteRow(fila);
  return { ok: true, mensaje: 'Registro de nómina eliminado.' };
}


// ===================================================================
// MÓDULO: DASHBOARD (totales)
// ===================================================================

/** Devuelve cifras resumen para el panel principal. */
function obtenerDashboard() {
  var empleados = leerTabla(HOJAS.EMPLEADOS);
  var activos = empleados.filter(function (e) {
    return String(e.estado).toLowerCase() === 'activo';
  });
  var vacaciones = leerTabla(HOJAS.VACACIONES);
  var pendientes = vacaciones.filter(function (v) {
    return String(v.estado).toLowerCase() === 'pendiente';
  });

  // Mes actual en formato yyyy-MM.
  var mesActual = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM');
  var nominaMes = leerTabla(HOJAS.NOMINA).filter(function (n) {
    return String(n.mes) === mesActual;
  });
  var totalNeto = nominaMes.reduce(function (suma, n) {
    return suma + (Number(n.neto) || 0);
  }, 0);

  // Masa salarial de los empleados activos.
  var masaSalarial = activos.reduce(function (suma, e) {
    return suma + (Number(e.salario) || 0);
  }, 0);

  return {
    totalEmpleados: empleados.length,
    empleadosActivos: activos.length,
    empleadosInactivos: empleados.length - activos.length,
    totalDepartamentos: leerTabla(HOJAS.DEPARTAMENTOS).length,
    vacacionesPendientes: pendientes.length,
    mesActual: mesActual,
    nominasMesActual: nominaMes.length,
    totalNetoMes: Math.round(totalNeto * 100) / 100,
    masaSalarial: Math.round(masaSalarial * 100) / 100
  };
}


// ---- UTILIDAD COMPARTIDA -----------------------------------------

/**
 * Devuelve un mapa { empleado_id: nombre } para mostrar nombres en
 * lugar de ids en Asistencia, Vacaciones y Nómina.
 */
function mapaEmpleados() {
  var mapa = {};
  leerTabla(HOJAS.EMPLEADOS).forEach(function (e) {
    mapa[e.id] = e.nombre;
  });
  return mapa;
}

/**
 * Lista de empleados ACTIVOS reducida para llenar los <select>
 * de los demás módulos: [{id, nombre}, ...].
 */
function listarEmpleadosSelect() {
  return leerTabla(HOJAS.EMPLEADOS)
    .filter(function (e) { return String(e.estado).toLowerCase() === 'activo'; })
    .map(function (e) { return { id: e.id, nombre: e.nombre }; });
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
function obtenerReportes() {
  var empleados = leerTabla(HOJAS.EMPLEADOS);
  var nombres = mapaEmpleados();

  // 1) Empleados ACTIVOS por departamento.
  var porDepto = {};
  empleados.forEach(function (e) {
    if (String(e.estado).toLowerCase() !== 'activo') return;
    var dep = String(e.departamento || '').trim() || 'Sin asignar';
    porDepto[dep] = (porDepto[dep] || 0) + 1;
  });

  // 2) Empleados por estado (activos / inactivos).
  var activos = 0, inactivos = 0;
  empleados.forEach(function (e) {
    if (String(e.estado).toLowerCase() === 'activo') activos++;
    else inactivos++;
  });

  // 3) Nómina: total neto por mes (ordenado por mes).
  var nominaMes = {};
  leerTabla(HOJAS.NOMINA).forEach(function (n) {
    var mes = String(n.mes);
    if (!mes) return;
    nominaMes[mes] = (nominaMes[mes] || 0) + (Number(n.neto) || 0);
  });
  var nominaPorMes = Object.keys(nominaMes).sort().map(function (mes) {
    return [mes, Math.round(nominaMes[mes] * 100) / 100];
  });

  // 4) Asistencia: total de horas por empleado.
  var horasEmp = {};
  leerTabla(HOJAS.ASISTENCIA).forEach(function (a) {
    var nombre = nombres[a.empleado_id] || '(desconocido)';
    horasEmp[nombre] = (horasEmp[nombre] || 0) + (Number(a.horas) || 0);
  });
  var horasPorEmpleado = Object.keys(horasEmp).map(function (nom) {
    return [nom, Math.round(horasEmp[nom] * 100) / 100];
  }).sort(function (a, b) { return b[1] - a[1]; }); // de mayor a menor

  // 5) Vacaciones por estado.
  var vacEstado = {};
  leerTabla(HOJAS.VACACIONES).forEach(function (v) {
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
function obtenerConfigCorreo() {
  var raw = PropertiesService.getScriptProperties().getProperty(CLAVE_CONFIG_CORREO);
  var def = {
    proveedor:  'google',
    fromNombre: 'Sistema RRHH',
    fromEmail:  '',
    apiKey:     '',
    dominio:    ''       // solo Mailgun lo requiere
  };
  if (!raw) return def;
  try { return Object.assign(def, JSON.parse(raw)); } catch (e) { return def; }
}

/**
 * Guarda la configuración del proveedor de correo.
 * Si apiKey llega vacía no sobreescribe la guardada (evita borrarla al editar).
 */
function guardarConfigCorreo(cfg) {
  var actual = obtenerConfigCorreo();
  if (!cfg.apiKey) cfg.apiKey = actual.apiKey; // preservar key existente si no se cambia
  PropertiesService.getScriptProperties().setProperty(CLAVE_CONFIG_CORREO, JSON.stringify(cfg));
  return { ok: true, mensaje: 'Configuración de correo guardada.' };
}

/**
 * Envía un correo de prueba al usuario actual para verificar la config.
 */
function probarConfigCorreo() {
  var destino = Session.getActiveUser().getEmail();
  if (!destino) destino = obtenerConfigAlertas().destinatarios.split(',')[0].trim();
  if (!destino) return { ok: false, mensaje: 'No se pudo determinar el correo del destinatario. Configura los destinatarios en la sección Alertas.' };

  try {
    var cfg = obtenerConfigCorreo();
    _enviarCorreo([destino], '🧪 [PRUEBA] Configuración de correo — Sistema RRHH',
      '<p>✅ El proveedor <strong>' + cfg.proveedor + '</strong> funciona correctamente.</p>' +
      '<p>Este mensaje fue enviado desde el módulo de Configuración del Sistema RRHH.</p>');
    return { ok: true, mensaje: 'Correo de prueba enviado a <strong>' + destino + '</strong>.' };
  } catch (e) {
    return { ok: false, mensaje: 'Error al enviar: ' + e.message };
  }
}

/** Devuelve la configuración de alertas desde PropertiesService. */
function obtenerConfigAlertas() {
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

/** Guarda la configuración de alertas. */
function guardarConfigAlertas(cfg) {
  PropertiesService.getScriptProperties().setProperty(CLAVE_CONFIG_ALERTAS, JSON.stringify(cfg));
  return { ok: true };
}

/**
 * Función principal de alertas — llamada por el trigger diario (8 a.m.).
 * También se puede invocar manualmente desde appsscript.google.com.
 */
function verificarAlertas() {
  var cfg    = obtenerConfigAlertas();
  var emails = cfg.destinatarios.split(',').map(function (e) { return e.trim(); }).filter(Boolean);
  if (!emails.length) return; // sin destinatarios, nada que hacer

  if (cfg.vacacionesPendientesActiva) {
    var msgVac = _cuerpoVacacionesPendientes();
    if (msgVac) _enviarCorreo(emails, '🏖 Vacaciones pendientes de aprobación', msgVac);
  }

  if (cfg.nominaMensualActiva) {
    var hoy = new Date();
    if (hoy.getDate() >= Number(cfg.nominaMensualDia)) {
      var msgNom = _cuerpoNominaMensual();
      if (msgNom) _enviarCorreo(emails, '💰 Nómina mensual no generada', msgNom);
    }
  }

  if (cfg.resumenSemanalActivo) {
    if (new Date().getDay() === 1) { // lunes
      _enviarCorreo(emails, '📊 Resumen semanal de RRHH', _cuerpoResumenSemanal());
    }
  }

  if (cfg.cumpleaniosActiva && new Date().getDate() === 1) {
    var msgCump = _cuerpoProximosCumpleanios();
    if (msgCump) _enviarCorreo(emails, '🎂 Cumpleaños de empleados este mes', msgCump);
  }
}

/** Genera el cuerpo HTML para vacaciones pendientes. */
function _cuerpoVacacionesPendientes() {
  var vacs      = leerTabla(HOJAS.VACACIONES);
  var pendientes = vacs.filter(function (v) { return v.estado === 'pendiente'; });
  if (!pendientes.length) return null;

  var mapa = mapaEmpleados();
  var filas = pendientes.map(function (v) {
    var nombre = mapa[v.empleado_id] || v.empleado_id || '—';
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
  var noms      = leerTabla(HOJAS.NOMINA);
  var yaTiene   = noms.some(function (n) { return String(n.mes) === mesActual; });
  if (yaTiene) return null; // ya se generó la nómina este mes

  return '<p>No se ha generado ningún registro de nómina para el mes ' +
    '<strong>' + mesActual + '</strong>.</p>' +
    '<p>Por favor ingresa al módulo de <strong>Nómina</strong> y genera los recibos de pago ' +
    'para todos los empleados activos.</p>';
}

/** Genera el cuerpo HTML del resumen semanal. */
function _cuerpoResumenSemanal() {
  var emps    = leerTabla(HOJAS.EMPLEADOS);
  var activos = emps.filter(function (e) { return e.estado === 'activo'; }).length;
  var inactivos = emps.length - activos;

  var vacs    = leerTabla(HOJAS.VACACIONES);
  var vacPend = vacs.filter(function (v) { return v.estado === 'pendiente'; }).length;
  var vacApro = vacs.filter(function (v) { return v.estado === 'aprobada'; }).length;

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
  var cfg = obtenerConfigCorreo();
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
  var cfg  = obtenerConfigCorreo();
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
function probarAlerta(tipo) {
  var cfg    = obtenerConfigAlertas();
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
function activarTriggerAlertas() {
  desactivarTriggerAlertas(); // elimina duplicados
  var t = ScriptApp.newTrigger('verificarAlertas')
    .timeBased().everyDays(1).atHour(8).create();
  PropertiesService.getScriptProperties().setProperty(CLAVE_TRIGGER_ID, t.getUniqueId());
  return { ok: true, mensaje: 'Verificación diaria activada (todos los días a las 8 a.m.).' };
}

/** Elimina el trigger diario si existe. */
function desactivarTriggerAlertas() {
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
function importarDatos(entidad, filas) {
  if (!HOJAS[entidad]) {
    return { ok: false, mensaje: 'Entidad no reconocida: ' + entidad };
  }
  if (!filas || filas.length === 0) {
    return { ok: false, mensaje: 'El archivo no contiene filas de datos.' };
  }

  var creados = 0, omitidos = 0, errores = [];
  var hoja = getHoja(HOJAS[entidad]);

  filas.forEach(function (fila, idx) {
    var numFila = idx + 2; // fila real en el Excel (encabezados en 1)
    try {
      if (entidad === 'EMPLEADOS') {
        var emp = {
          nombre:        String(fila.nombre        || '').trim(),
          cedula:        String(fila.cedula         || '').trim(),
          departamento:  String(fila.departamento  || '').trim(),
          puesto:        String(fila.puesto         || '').trim(),
          fecha_ingreso: String(fila.fecha_ingreso  || '').trim(),
          salario:       fila.salario,
          estado:        String(fila.estado || 'activo').trim().toLowerCase()
        };
        if (emp.estado !== 'activo' && emp.estado !== 'inactivo') emp.estado = 'activo';

        var error = validarEmpleado(emp);
        if (error) { errores.push({ fila: numFila, motivo: error }); return; }
        if (cedulaDuplicada(emp.cedula, null)) { omitidos++; return; }

        hoja.appendRow([generarId('EMP'), emp.nombre, emp.cedula,
          emp.departamento, emp.puesto, formatearFecha(emp.fecha_ingreso),
          Number(emp.salario) || 0, emp.estado]);
        creados++;

      } else if (entidad === 'DEPARTAMENTOS') {
        var dep = {
          nombre:      String(fila.nombre      || '').trim(),
          responsable: String(fila.responsable || '').trim()
        };
        if (!dep.nombre) { errores.push({ fila: numFila, motivo: 'Nombre vacío.' }); return; }
        if (departamentoDuplicado(dep.nombre, null)) { omitidos++; return; }
        hoja.appendRow([generarId('DEP'), dep.nombre, dep.responsable]);
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
function obtenerConfiguracion() {
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
 * Guarda el ID de la hoja de Google que se usará como base de datos.
 * Valida que el ID se pueda abrir antes de guardarlo.
 *
 * @param {string} id  ID de la hoja (la parte larga de la URL).
 * @return {Object} {ok, mensaje}
 */
function guardarIdHoja(id) {
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
    return { ok: true, mensaje: 'Hoja conectada: "' + libro.getName() + '".' };
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
function crearHojaNueva(nombre) {
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
function usarHojaLigada() {
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

function registrarBitacora(accion, entidad, entidadId, resumen) {
  try {
    var hoja = getHoja(HOJAS.BITACORA);
    var usuario = '';
    try { usuario = Session.getActiveUser().getEmail(); } catch (e) {}
    hoja.appendRow([generarId('BIT'), new Date(), usuario,
      accion, entidad, entidadId || '', resumen || '']);
  } catch (e) { /* no interrumpir operaciones por fallo de bitácora */ }
}

function listarBitacora(limite) {
  var registros = leerTabla(HOJAS.BITACORA);
  registros.forEach(function (r) {
    r.fecha = r.fecha instanceof Date
      ? Utilities.formatDate(r.fecha, Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm')
      : String(r.fecha);
  });
  registros.sort(function (a, b) { return b.fecha > a.fecha ? -1 : 1; }).reverse();
  if (limite) registros = registros.slice(0, Number(limite));
  return registros;
}


// ===================================================================
// MÓDULO: HISTORIAL DE SALARIOS
// ===================================================================

function listarHistorialSalario(empleadoId) {
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
// MÓDULO: BALANCE DE VACACIONES
// ===================================================================

function obtenerBalanceVacaciones(empleadoId) {
  var emp = leerTabla(HOJAS.EMPLEADOS).filter(function (e) {
    return String(e.id) === String(empleadoId);
  })[0];
  if (!emp) return { ok: false, mensaje: 'Empleado no encontrado.' };

  var diasPorAnio   = 15; // días mínimos legales en Costa Rica
  var fechaIngreso  = new Date(emp.fecha_ingreso);
  var ahora         = new Date();
  var aniosTrabajados = (ahora - fechaIngreso) / (365.25 * 24 * 60 * 60 * 1000);
  var diasAcumulados  = Math.floor(Math.max(0, aniosTrabajados) * diasPorAnio);

  var diasUsados = leerTabla(HOJAS.VACACIONES)
    .filter(function (v) {
      return String(v.empleado_id) === String(empleadoId) &&
             String(v.estado).toLowerCase() === 'aprobada';
    })
    .reduce(function (sum, v) { return sum + (Number(v.dias) || 0); }, 0);

  return {
    ok: true,
    nombre:          emp.nombre,
    diasAcumulados:  diasAcumulados,
    diasUsados:      diasUsados,
    diasDisponibles: Math.max(0, diasAcumulados - diasUsados)
  };
}


// ===================================================================
// MÓDULO: CAPACITACIONES
// ===================================================================

function listarCapacitaciones(empleadoId) {
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

function crearCapacitacion(cap) {
  if (!cap || !cap.empleado_id) return { ok: false, mensaje: 'Selecciona un empleado.' };
  if (!cap.curso || !String(cap.curso).trim()) {
    return { ok: false, mensaje: 'El nombre del curso es obligatorio.' };
  }
  var hoja = getHoja(HOJAS.CAPACITACIONES);
  var id   = generarId('CAP');
  hoja.appendRow([id, cap.empleado_id, String(cap.curso).trim(),
    cap.institucion || '',
    formatearFecha(cap.fecha_inicio),
    formatearFecha(cap.fecha_fin),
    cap.estado || 'en progreso',
    cap.certificado_url || '']);
  registrarBitacora('crear', 'Capacitaciones', id, String(cap.curso).trim());
  return { ok: true, mensaje: 'Capacitación registrada.', id: id };
}

function actualizarCapacitacion(cap) {
  if (!cap || !cap.id) return { ok: false, mensaje: 'Falta el identificador.' };
  var hoja = getHoja(HOJAS.CAPACITACIONES);
  var fila = buscarFilaPorId(hoja, cap.id);
  if (fila === -1) return { ok: false, mensaje: 'No se encontró la capacitación.' };
  hoja.getRange(fila, 1, 1, 8).setValues([[cap.id, cap.empleado_id,
    String(cap.curso).trim(), cap.institucion || '',
    formatearFecha(cap.fecha_inicio), formatearFecha(cap.fecha_fin),
    cap.estado || 'en progreso', cap.certificado_url || '']]);
  registrarBitacora('actualizar', 'Capacitaciones', cap.id, String(cap.curso).trim());
  return { ok: true, mensaje: 'Capacitación actualizada.' };
}

function eliminarCapacitacion(id) {
  var hoja = getHoja(HOJAS.CAPACITACIONES);
  var fila = buscarFilaPorId(hoja, id);
  if (fila === -1) return { ok: false, mensaje: 'No se encontró la capacitación.' };
  hoja.deleteRow(fila);
  registrarBitacora('eliminar', 'Capacitaciones', id, '');
  return { ok: true, mensaje: 'Capacitación eliminada.' };
}


// ===================================================================
// MÓDULO: EVALUACIONES DE DESEMPEÑO
// ===================================================================

function listarEvaluaciones(empleadoId) {
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

function crearEvaluacion(ev) {
  if (!ev || !ev.empleado_id) return { ok: false, mensaje: 'Selecciona un empleado.' };
  if (!ev.periodo || !String(ev.periodo).trim()) {
    return { ok: false, mensaje: 'El período es obligatorio.' };
  }
  var cal = Number(ev.calificacion);
  if (isNaN(cal) || cal < 1 || cal > 10) {
    return { ok: false, mensaje: 'La calificación debe ser un número entre 1 y 10.' };
  }
  var hoja = getHoja(HOJAS.EVALUACIONES);
  var id   = generarId('EVA');
  hoja.appendRow([id, ev.empleado_id, String(ev.periodo).trim(), cal,
    ev.comentarios || '', ev.evaluador || '',
    formatearFecha(ev.fecha || new Date())]);
  registrarBitacora('crear', 'Evaluaciones', id, 'Período: ' + ev.periodo);
  return { ok: true, mensaje: 'Evaluación registrada.', id: id };
}

function actualizarEvaluacion(ev) {
  if (!ev || !ev.id) return { ok: false, mensaje: 'Falta el identificador.' };
  var hoja = getHoja(HOJAS.EVALUACIONES);
  var fila = buscarFilaPorId(hoja, ev.id);
  if (fila === -1) return { ok: false, mensaje: 'No se encontró la evaluación.' };
  hoja.getRange(fila, 1, 1, 7).setValues([[ev.id, ev.empleado_id,
    String(ev.periodo).trim(), Number(ev.calificacion) || 0,
    ev.comentarios || '', ev.evaluador || '', formatearFecha(ev.fecha)]]);
  registrarBitacora('actualizar', 'Evaluaciones', ev.id, 'Período: ' + ev.periodo);
  return { ok: true, mensaje: 'Evaluación actualizada.' };
}

function eliminarEvaluacion(id) {
  var hoja = getHoja(HOJAS.EVALUACIONES);
  var fila = buscarFilaPorId(hoja, id);
  if (fila === -1) return { ok: false, mensaje: 'No se encontró la evaluación.' };
  hoja.deleteRow(fila);
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

function crearCarpetaEmpleado(empleadoId) {
  try {
    var emp = leerTabla(HOJAS.EMPLEADOS).filter(function (e) {
      return String(e.id) === String(empleadoId);
    })[0];
    if (!emp) return { ok: false, mensaje: 'Empleado no encontrado.' };
    var raiz     = _getCarpetaRaizDocs();
    var nombre   = 'EMP_' + empleadoId + '_' + String(emp.nombre).replace(/\s+/g, '_');
    var iter     = raiz.getFoldersByName(nombre);
    var carpeta  = iter.hasNext() ? iter.next() : raiz.createFolder(nombre);
    return { ok: true, carpetaUrl: carpeta.getUrl(),
      mensaje: 'Carpeta de documentos lista para ' + emp.nombre };
  } catch (e) {
    return { ok: false, mensaje: e.message };
  }
}

function listarDocumentos(empleadoId) {
  try {
    var raiz = _getCarpetaRaizDocs();
    var emp  = leerTabla(HOJAS.EMPLEADOS).filter(function (e) {
      return String(e.id) === String(empleadoId);
    })[0];
    if (!emp) return { ok: false, mensaje: 'Empleado no encontrado.', documentos: [] };
    var nombreCarpeta = 'EMP_' + empleadoId + '_' + String(emp.nombre).replace(/\s+/g, '_');
    var iter = raiz.getFoldersByName(nombreCarpeta);
    if (!iter.hasNext()) {
      return { ok: true, documentos: [], carpetaUrl: null };
    }
    var carpetaEmp = iter.next();
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

function crearRespaldo() {
  try {
    var libro  = getLibro();
    var fecha  = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd');
    var copia  = libro.copy('[BACKUP ' + fecha + '] ' + libro.getName());
    registrarBitacora('respaldo', 'Sistema', '', 'Backup: ' + copia.getName());
    return { ok: true, mensaje: 'Respaldo creado correctamente.', url: copia.getUrl() };
  } catch (e) {
    return { ok: false, mensaje: 'Error al crear respaldo: ' + e.message };
  }
}

function activarRespaldoSemanal() {
  desactivarRespaldoSemanal();
  var t = ScriptApp.newTrigger('crearRespaldo')
    .timeBased().everyWeeks(1).onWeekDay(ScriptApp.WeekDay.SUNDAY).atHour(2).create();
  PropertiesService.getScriptProperties().setProperty(CLAVE_RESPALDO_TRIGGER, t.getUniqueId());
  return { ok: true, mensaje: 'Respaldo automático semanal activado (domingos a las 2 a.m.).' };
}

function desactivarRespaldoSemanal() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'crearRespaldo') ScriptApp.deleteTrigger(t);
  });
  PropertiesService.getScriptProperties().deleteProperty(CLAVE_RESPALDO_TRIGGER);
  return { ok: true, mensaje: 'Respaldo automático desactivado.' };
}

function estadoRespaldo() {
  var activo = ScriptApp.getProjectTriggers().some(function (t) {
    return t.getHandlerFunction() === 'crearRespaldo';
  });
  return { activo: activo };
}


// ===================================================================
// MÓDULO: ROLES Y PERMISOS (basado en PIN)
// ===================================================================

var CLAVE_CONFIG_ROLES = 'CONFIG_ROLES';

function obtenerConfigRoles() {
  var raw = PropertiesService.getScriptProperties().getProperty(CLAVE_CONFIG_ROLES);
  var def = { pinAdmin: '', pinRrhh: '' };
  if (!raw) return def;
  try { return Object.assign(def, JSON.parse(raw)); } catch (e) { return def; }
}

function guardarConfigRoles(cfg) {
  PropertiesService.getScriptProperties().setProperty(CLAVE_CONFIG_ROLES, JSON.stringify(cfg));
  return { ok: true, mensaje: 'PINs de acceso guardados.' };
}

function verificarPIN(pin) {
  if (!pin || !String(pin).trim()) return { rol: 'consulta' };
  var cfg = obtenerConfigRoles();
  var p   = String(pin).trim();
  if (cfg.pinAdmin && p === String(cfg.pinAdmin).trim()) return { rol: 'admin' };
  if (cfg.pinRrhh  && p === String(cfg.pinRrhh).trim())  return { rol: 'rrhh' };
  return { rol: null, mensaje: 'PIN incorrecto.' };
}


// ===================================================================
// MÓDULO: NOTIFICACIONES WHATSAPP (CallMeBot)
// ===================================================================

var CLAVE_CONFIG_WHATSAPP = 'CONFIG_WHATSAPP';

function obtenerConfigWhatsApp() {
  var raw = PropertiesService.getScriptProperties().getProperty(CLAVE_CONFIG_WHATSAPP);
  var def = { telefono: '', apikey: '', activo: false };
  if (!raw) return def;
  try { return Object.assign(def, JSON.parse(raw)); } catch (e) { return def; }
}

function guardarConfigWhatsApp(cfg) {
  PropertiesService.getScriptProperties().setProperty(CLAVE_CONFIG_WHATSAPP, JSON.stringify(cfg));
  return { ok: true, mensaje: 'Configuración de WhatsApp guardada.' };
}

function probarWhatsApp() {
  var cfg = obtenerConfigWhatsApp();
  if (!cfg.telefono || !cfg.apikey) {
    return { ok: false, mensaje: 'Configura el teléfono y la API Key de CallMeBot primero.' };
  }
  return _enviarWhatsApp('🧪 Prueba de notificación del Sistema RRHH. ¡Todo funciona correctamente!', cfg);
}

function _enviarWhatsApp(mensaje, cfg) {
  if (!cfg) cfg = obtenerConfigWhatsApp();
  if (!cfg || !cfg.activo || !cfg.telefono || !cfg.apikey) return null;
  try {
    var url = 'https://api.callmebot.com/whatsapp.php' +
      '?phone='  + encodeURIComponent(cfg.telefono) +
      '&text='   + encodeURIComponent(mensaje) +
      '&apikey=' + encodeURIComponent(cfg.apikey);
    var res = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
    return { ok: true, mensaje: 'WhatsApp enviado.' };
  } catch (e) {
    return { ok: false, mensaje: 'Error WhatsApp: ' + e.message };
  }
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

function obtenerContadorAlertas() {
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
function inicializarHojas() {
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
