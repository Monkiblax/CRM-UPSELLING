// Pruebas automáticas del importador de CSV (lógica pura, sin navegador ni base de datos).
// Uso:  node tests/import.test.js   (sale con código 1 si algo falla). Correrlo tras cualquier cambio al importador.
const fs = require('fs');
const html = fs.readFileSync(require('path').join(__dirname, '..', 'index.html'), 'utf8');
const i = html.indexOf('/* ---------- Importar clientes desde CSV');
const code = html.slice(html.lastIndexOf('<script>', i) + 8, html.indexOf('</script>', i));

const DEFAULT_STAGES = [
  ['lead', 'Lead'], ['lead_asignados', 'Lead asignados'], ['appointment', 'Appointment'], ['cx_followup', 'Preparación'],
  ['followup', 'Propuesta'], ['pitch', 'Negociación'], ['invoice', 'Invoice'], ['pagado', 'Pagado'], ['suscripcion', 'Suscripción'], ['lost', 'LOST']
].map(([id, label]) => ({id, label}));
const DEFAULT_PROGS = ['Abacus Experience', 'PRO', 'Bundle', 'Bundle premium', 'Portfolio Hacking', 'Options Pocket', 'PMC', 'CPA New York', 'CPA Miami', 'Traders Club', 'Dynamic', 'Inner Circle', '1 a 1'];

function load(stages = DEFAULT_STAGES, progs = DEFAULT_PROGS) {
  const window = {};
  const el = () => ({addEventListener() {}, style: {}, hidden: true, innerHTML: '', textContent: ''});
  const document = {getElementById: () => el()};
  const getProgramas = d => Array.isArray(d.programas) ? d.programas : [];
  const getHistorial = d => Array.isArray(d.historial) ? d.historial : [];
  new Function('window', 'document', 'STAGES', 'PROGRAMAS', 'getProgramas', 'getHistorial', 'allDocs', 'escapeHtml', 'claude', code)(
    window, document, stages, progs, getProgramas, getHistorial, [], s => s, undefined);
  return window.ImportLogic;
}
const L = load();

let pass = 0, fail = 0;
const eq = (name, got, exp) => {
  const g = JSON.stringify(got), e = JSON.stringify(exp);
  if (g === e) pass++; else { fail++; console.log('FAIL', name, '\n   got:', g, '\n   exp:', e); }
};
const ok = (name, cond, extra) => { if (cond) pass++; else { fail++; console.log('FAIL', name, extra !== undefined ? JSON.stringify(extra) : ''); } };
let nid = 0;
const doc = (nombre, correo, importe, extra = {}) => Object.assign({id: 'd' + (++nid), nombre, correo, importe, stage: 'lead'}, extra);
// aplica un plan a una "base" simulada (como lo haría addMany + updates)
function apply(docs, res) {
  const out = docs.map(d => Object.assign({}, d));
  res.toAdd.forEach(r => { const {programas, ...rest} = r; out.push(Object.assign({id: 'n' + (++nid)}, rest, programas && programas.length ? {programas} : {})); });
  res.toUpdate.forEach(u => { const d = out.find(x => x.id === u.id); d.programas = u.programas; });
  return out;
}
const names = r => r.toAdd.map(x => x.nombre);

/* ============ 1. Formato original del Sheet (con encabezado) ============ */
{
  const csv = 'Stage,Nombre,Correo Electronico,Numero de Telefono,Importe,Fecha de Cierre\nLead,Ana Uno,ana@x.com,(809) 555-1234,1500,\nPagado,Beto Dos,beto@x.com,1 (786) 484-6491,"$20,000",2026-11-01\n';
  const r = L.plan(csv, []);
  eq('T1 total/nuevos', [r.total, r.toAdd.length, r.existing, r.noHeader, r.delimiter], [2, 2, 0, false, ',']);
  eq('T1 etapa/importe/tel', r.toAdd.map(x => [x.stage, x.importe, x.telefono, x.fechaCierre]), [['lead', 1500, '(809) 555-1234', ''], ['pagado', 20000, '1 (786) 484-6491', '2026-11-01']]);
}
/* ============ 2. Formato del archivo de prueba de Domingo (sin encabezado, 4 columnas) ============ */
{
  const csv = 'Persona Uno,uno@x.com,(646) 420-1684,Bundle\nPersona Dos,dos@x.com,(787) 529-1939,Bundle\nPersona Tres,tres@x.com,(786) 214-1568,bundle';
  const r = L.plan(csv, []);
  eq('T2 sin encabezado', [r.noHeader, r.total, r.toAdd.length], [true, 3, 3]);
  eq('T2 programas', r.toAdd.map(x => x.programas), [['Bundle'], ['Bundle'], ['Bundle']]);
  eq('T2 importe 0 y lead', r.toAdd.map(x => [x.importe, x.stage]), [[0, 'lead'], [0, 'lead'], [0, 'lead']]);
  ok('T2 la 1.ª fila NO se pierde', names(r)[0] === 'Persona Uno', names(r));
}
/* ============ 3. Menos columnas sin encabezado ============ */
{
  eq('T3 3 col', names(L.plan('A Uno,a@x.com,555\nB Dos,b@x.com,666', [])), ['A Uno', 'B Dos']);
  eq('T3 2 col', names(L.plan('A Uno,a@x.com\nB Dos,b@x.com', [])), ['A Uno', 'B Dos']);
  const r = L.plan('A Uno,a@x.com\nB Dos,b@x.com', []);
  eq('T3 2 col sin programas', r.toAdd.map(x => x.programas), [[], []]);
}
/* ============ 4. Variantes de encabezado ============ */
{
  for (const [h, label] of [
    ['Cliente,Mail,Cel', 'Cliente/Mail/Cel'], ['Alumno,E-mail,Whatsapp', 'Alumno/E-mail/Whatsapp'], ['NOMBRE,CORREO,TELÉFONO', 'MAYÚSCULAS'],
    ['Nombre completo,Correo electrónico,Número de teléfono', 'Nombre completo'], [' nombre ,  correo  ,telefono', 'espacios'], ['Name,Email,Phone', 'inglés']]) {
    const r = L.plan(h + '\nAna Uno,ana@x.com,555-1111', []);
    ok('T4 ' + label, !r.error && r.toAdd.length === 1 && r.toAdd[0].nombre === 'Ana Uno' && r.toAdd[0].correo === 'ana@x.com' && r.toAdd[0].telefono === '555-1111' && !r.noHeader, r);
  }
  const r = L.plan('Importe,Nombre,Stage,Extra,Correo\n"1,200",Ana Uno,Pagado,zzz,ana@x.com', []);
  eq('T4 otro orden + columna extra', [r.toAdd[0].nombre, r.toAdd[0].importe, r.toAdd[0].stage, r.toAdd[0].correo], ['Ana Uno', 1200, 'pagado', 'ana@x.com']);
  const r2 = L.plan('Nombre,Correo,Nombre\nAna Uno,ana@x.com,OTRO', []);
  eq('T4 columna duplicada: gana la primera', r2.toAdd[0].nombre, 'Ana Uno');
}
/* ============ 5. Encabezado irreconocible: NO debe importar la fila de títulos como cliente ============ */
{
  const r = L.plan('Foo,Bar,Baz\nx,y,z', []);
  ok('T5 error y 0 clientes', !!r.error && !r.toAdd, r);
  ok('T5 el error lista los encabezados', r.error.includes('"Foo"') && r.error.includes('"Baz"'), r.error);
  const r2 = L.plan('Correo,Telefono\nana@x.com,555', []);
  ok('T5 sin columna Nombre -> error', !!r2.error, r2);
}
/* ============ 6. Vacíos ============ */
{
  ok('T6 vacío', !!L.plan('', []).error);
  ok('T6 solo espacios/saltos', !!L.plan('\n\n  \n', []).error);
  ok('T6 solo encabezado', !!L.plan('Nombre,Correo\n', []).error);
  ok('T6 solo comas', !!L.plan(',,,\n,,,', []).error);
}
/* ============ 7. Separadores ============ */
{
  const semi = L.plan('Nombre;Correo;Importe\nAna Uno;ana@x.com;1.500,50\nBeto;b@x.com;300', []);
  eq('T7 punto y coma', [semi.delimiter, semi.toAdd.map(x => [x.nombre, x.importe])], [';', [['Ana Uno', 1500.5], ['Beto', 300]]]);
  const tab = L.plan('Nombre\tCorreo\tImporte\nAna Uno\tana@x.com\t100', []);
  eq('T7 tabulador', [tab.delimiter, tab.toAdd[0].importe], ['\t', 100]);
  const q = L.plan('"Nombre, completo";Correo\n"Pérez; Juan";j@x.com', []);
  eq('T7 coma/; dentro de comillas', [q.delimiter, q.toAdd[0].nombre], [';', 'Pérez; Juan']);
  const noHdrSemi = L.plan('Ana Uno;ana@x.com;555;PRO', []);
  eq('T7 sin encabezado con ;', [noHdrSemi.noHeader, noHdrSemi.toAdd[0].programas], [true, ['PRO']]);
}
/* ============ 8. Saltos de línea, BOM, líneas vacías ============ */
{
  const r = L.plan('\uFEFFNombre,Correo\r\nAna Uno,ana@x.com\r\n\r\n,\r\nBeto Dos,b@x.com\r\n\r\n', []);
  eq('T8 CRLF+BOM+vacías', [r.total, names(r)], [2, ['Ana Uno', 'Beto Dos']]);
  const r2 = L.plan('Nombre,Correo\rAna Uno,ana@x.com\rBeto,b@x.com', []);
  ok('T8 solo \\r (Mac antiguo) no se pierde en silencio', r2.error || r2.toAdd.length === 2 || r2.toAdd.length === 1, r2);
}
/* ============ 9. Comillas, comas y saltos dentro de celdas ============ */
{
  const r = L.plan('Nombre,Correo,Notas\n"Pérez, Juan ""Juancho""",j@x.com,"linea1\nlinea2"\nBeto,b@x.com,x', []);
  eq('T9 comillas escapadas', [r.total, names(r)], [2, ['Pérez, Juan "Juancho"', 'Beto']]);
  eq('T9 parseCSV multilínea', L.parseCSV('a,"b\nc",d\ne,f,g', ',').length, 2);
}
/* ============ 10. Importes ============ */
{
  const m = s => L.parseMoney(s);
  const t = (s, v, st) => eq('T10 ' + JSON.stringify(s), [m(s).v, m(s).st], [v, st]);
  t('$1,500', 1500, 'ambiguous'); t('1500', 1500, 'ok'); t('1500.50', 1500.5, 'ok'); t('1.500,50', 1500.5, 'ok'); t('1,500.50', 1500.5, 'ok');
  t('1500,5', 1500.5, 'ok'); t('1.500', 1500, 'ambiguous'); t('1,500', 1500, 'ambiguous'); t('1.234.567', 1234567, 'ok'); t('1,234,567', 1234567, 'ok');
  t('1,234,567.89', 1234567.89, 'ok'); t('USD 2,000.00', 2000, 'ok'); t('$ 2 000', 2000, 'ok'); t('', 0, 'empty'); t('   ', 0, 'empty');
  t('abc', 0, 'bad'); t('N/A', 0, 'bad'); t('0', 0, 'ok'); t('12.5', 12.5, 'ok'); t('(100)', -100, 'negative'); t('-100', -100, 'negative');
  t('9750', 9750, 'ok'); t('20000', 20000, 'ok'); t('1e3', 1000, 'ambiguous'); t('2.5E+3', 2500, 'ambiguous');
  const r = L.plan('Nombre,Importe\nA,"$1,500"\nB,abc\nC,(50)\nD,1.250', []);
  eq('T10 avisos', [r.warnings.ambiguousMoney, r.warnings.badMoney, r.warnings.negativeMoney], [2, 1, 1]);
  eq('T10 negativo se guarda como 0', L.plan('Nombre,Importe\nA,-50\nB,(20)', []).toAdd.map(x => x.importe), [0, 0]);
}
/* ============ 11. Duplicados contra la base ============ */
{
  const db = [doc('Ana Uno', 'ana@x.com', 1500)];
  eq('T11 igual -> existe', L.plan('Nombre,Correo,Importe\nAna Uno,ana@x.com,1500', db).toAdd.length, 0);
  eq('T11 mayúsculas/espacios/tildes', L.plan('Nombre,Correo,Importe\n"  ANA  uno ",ANA@X.COM,1500', db).toAdd.length, 0);
  eq('T11 importe distinto -> NUEVO', L.plan('Nombre,Correo,Importe\nAna Uno,ana@x.com,1600', db).toAdd.length, 1);
  eq('T11 correo distinto -> NUEVO', L.plan('Nombre,Correo,Importe\nAna Uno,otro@x.com,1500', db).toAdd.length, 1);
  const tres = 'Nombre,Correo,Importe\nAna Uno,ana@x.com,1500\nAna Uno,ana@x.com,1500\nAna Uno,ana@x.com,1500';
  eq('T11 archivo 3 vs base 1 -> agrega 2', L.plan(tres, db).toAdd.length, 2);
  eq('T11 archivo 3 vs base 3 -> 0', L.plan(tres, [db[0], doc('Ana Uno', 'ana@x.com', 1500), doc('Ana Uno', 'ana@x.com', 1500)]).toAdd.length, 0);
  eq('T11 archivo 1 vs base 3 -> 0', L.plan('Nombre,Correo,Importe\nAna Uno,ana@x.com,1500', [db[0], doc('Ana Uno', 'ana@x.com', 1500), doc('Ana Uno', 'ana@x.com', 1500)]).toAdd.length, 0);
  eq('T11 José/Jose es la misma persona', L.plan('Nombre,Correo,Importe\nJose Perez,jp@x.com,10', [doc('José Pérez', 'jp@x.com', 10)]).toAdd.length, 0);
  eq('T11 importe 1500 vs 1500.00', L.plan('Nombre,Correo,Importe\nAna Uno,ana@x.com,1500.00', db).toAdd.length, 0);
}
/* ============ 12. Idempotencia: importar dos veces no duplica ============ */
{
  const cases = {
    'con importe': 'Stage,Nombre,Correo,Importe,Programa\nLead,Ana,a@x.com,100,Bundle\nLead,Ana,a@x.com,100,Bundle\nPagado,Beto,b@x.com,"$2,000",PRO; Bundle premium',
    'sin importe': 'Nombre,Correo,Programa\nAna,a@x.com,Bundle\nBeto,b@x.com,PRO\nAna,a@x.com,PRO',
    'sin encabezado': 'Ana,a@x.com,555,Bundle\nBeto,b@x.com,666,PRO\nAna,a@x.com,555,PRO\nCarla,c@x.com,,'
  };
  for (const [k, csv] of Object.entries(cases)) {
    const r1 = L.plan(csv, []);
    const db1 = apply([], r1);
    const r2 = L.plan(csv, db1);
    eq('T12 ' + k + ' 2.ª vez: 0 nuevos', r2.toAdd.length, 0);
    eq('T12 ' + k + ' 2.ª vez: 0 actualizaciones', r2.toUpdate.length, 0);
    const r3 = L.plan(csv, apply(db1, r2));
    eq('T12 ' + k + ' 3.ª vez estable', [r3.toAdd.length, r3.toUpdate.length], [0, 0]);
  }
}
/* ============ 13. Programas ============ */
{
  const r = L.plan('Nombre,Correo,Programa\nA,a@x.com,Bundle; PRO\nB,b@x.com,"Bundle, PRO"\nC,c@x.com,bundle premium\nD,d@x.com,Bundle;bundle\nE,e@x.com,ProgramaRaro\nF,f@x.com,Options pocket | CPA new york', []);
  eq('T13 varios por celda', r.toAdd.map(x => x.programas), [['Bundle', 'PRO'], ['Bundle', 'PRO'], ['Bundle premium'], ['Bundle'], [], ['Options Pocket', 'CPA New York']]);
  eq('T13 desconocidos', r.unknownProgs, ['ProgramaRaro']);
  const db = [doc('Ana', 'a@x.com', 0, {programas: ['PRO']})];
  const r2 = L.plan('Nombre,Correo,Programa\nAna,a@x.com,PRO', db);
  eq('T13 ya lo tiene -> sin cambios', [r2.toAdd.length, r2.toUpdate.length, r2.existing], [0, 0, 1]);
  const r3 = L.plan('Nombre,Correo,Programa\nAna,a@x.com,PRO; Bundle', db);
  eq('T13 suma el que falta', r3.toUpdate.map(u => [u.programas, u.added]), [[['PRO', 'Bundle'], ['Bundle']]]);
  const r4 = L.plan('Ana,a@x.com,,Bundle\nAna,a@x.com,,PRO\nAna,a@x.com,,Bundle premium', [doc('Ana', 'a@x.com', 0)]);
  eq('T13 misma persona 3 veces en el archivo -> 1 actualización', [r4.toAdd.length, r4.toUpdate.length, r4.toUpdate[0].programas], [0, 1, ['Bundle', 'PRO', 'Bundle premium']]);
  const dup = [doc('Ana', 'a@x.com', 0), doc('Ana', 'a@x.com', 0)];
  const r5 = L.plan('Ana,a@x.com,,Bundle', dup);
  eq('T13 persona duplicada en la base: solo se toca la primera', [r5.toUpdate.length, r5.toUpdate[0].id], [1, dup[0].id]);
  const r6 = L.plan('Nombre,Correo,Importe,Programa\nAna,a@x.com,1500,Bundle', [doc('Ana', 'a@x.com', 1500)]);
  eq('T13 con Importe, fila existente recibe el programa', [r6.toAdd.length, r6.toUpdate.length, r6.toUpdate[0].added], [0, 1, ['Bundle']]);
  const r7 = L.plan('Nombre,Correo\nAna,a@x.com', [doc('Ana', 'a@x.com', 0, {programas: ['PRO']})]);
  eq('T13 sin columna Programa no toca programas', [r7.toAdd.length, r7.toUpdate.length], [0, 0]);
}
/* ============ 14. Etapas ============ */
{
  const r = L.plan('Stage,Nombre\nLead,A\nlead asignados,B\nPREPARACIÓN,C\npreparacion,D\nPropuesta,E\nLOST,F\nlost,G\nSuscripción,H\n,I\nRaro,J\nNegociacion,K\nAppointment ,L', []);
  eq('T14 etapas', r.toAdd.map(x => x.stage), ['lead', 'lead_asignados', 'cx_followup', 'cx_followup', 'followup', 'lost', 'lost', 'suscripcion', 'lead', 'lead', 'pitch', 'appointment']);
  eq('T14 desconocida avisa', r.warnings.unknownStages, 1);
  const L2 = load([{id: 'lead', label: 'Lead'}, {id: 'e_ab12', label: 'Ventas &amp; Cierre'}, {id: 'e_cd34', label: 'Seguimiento'}]);
  const r2 = L2.plan('Stage,Nombre\nventas & cierre,A\nSeguimiento,B\nPagado,C', []);
  eq('T14 etapas personalizadas (con &amp;)', r2.toAdd.map(x => x.stage), ['e_ab12', 'e_cd34', 'lead']);
  const r3 = L2.plan('Stage,Nombre\ne_ab12,A', []);
  eq('T14 por id', r3.toAdd[0].stage, 'e_ab12');
}
/* ============ 15. Filas problemáticas ============ */
{
  const r = L.plan('Nombre,Correo\nAna,a@x.com\nNombre,Correo\n,solo@correo.com\n   ,x\nBeto,b@x.com', []);
  eq('T15 encabezado repetido/sin nombre', [names(r), r.warnings.noName, r.total], [['Ana', 'Beto'], 2, 2]);
  const r2 = L.plan('Nombre,Telefono\nAna,1.8094E+10\nBeto,0123456789\nCarla,+1 809 555 1111\nDora,"(809) 555-1111 ext 5"', []);
  eq('T15 teléfonos tal cual', r2.toAdd.map(x => x.telefono), ['1.8094E+10', '0123456789', '+1 809 555 1111', '(809) 555-1111 ext 5']);
  eq('T15 aviso notación científica', r2.warnings.sciPhones, 1);
  const r3 = L.plan('Nombre,Correo\n  Ana   Uno  ,ana@x.com', []);
  eq('T15 nombre se recorta', r3.toAdd[0].nombre, 'Ana   Uno');
  const r4 = L.plan('Nombre\n<img src=x onerror=alert(1)>\n=HYPERLINK("http://x")', []);
  eq('T15 texto peligroso queda como dato', names(r4).length, 2);
}
/* ============ 16. Orden y metadatos de las filas nuevas ============ */
{
  const r = L.plan('Nombre\nA\nB\nC', []);
  const ord = r.toAdd.map(x => x.order);
  ok('T16 order estrictamente creciente', ord[0] < ord[1] && ord[1] < ord[2], ord);
  ok('T16 campos mínimos', r.toAdd.every(x => x.stage && typeof x.importe === 'number' && Array.isArray(x.programas)));
}
/* ============ 17. Rendimiento ============ */
{
  const db = []; for (let k = 0; k < 1262; k++) db.push(doc('Cliente ' + k, 'c' + k + '@x.com', k));
  let csv = 'Stage,Nombre,Correo,Telefono,Importe\n';
  for (let k = 0; k < 6000; k++) csv += `Lead,Cliente ${k},c${k}@x.com,555-${k},${k}\n`;
  const t0 = Date.now(); const r = L.plan(csv, db); const ms = Date.now() - t0;
  eq('T17 6000 filas vs 1262 existentes', [r.total, r.existing, r.toAdd.length], [6000, 1262, 4738]);
  ok('T17 rápido (<1,5 s)', ms < 1500, ms);
}
/* ============ 18. Lectura de archivos (codificación / tipo) ============ */
(async () => {
  const mk = (bytes, size) => ({size: size || bytes.length, arrayBuffer: async () => new Uint8Array(bytes).buffer});
  const enc = s => Array.from(Buffer.from(s, 'utf8'));
  eq('T18 UTF-8', await L.readFile(mk(enc('Nombre\nJosé'))), 'Nombre\nJosé');
  eq('T18 Windows-1252 (Excel ANSI)', await L.readFile(mk([...Buffer.from('Nombre\n'), 0x4A, 0x6F, 0x73, 0xE9, 0x20, 0xF1])), 'Nombre\nJosé ñ');
  eq('T18 UTF-16 LE con BOM', await L.readFile(mk([0xFF, 0xFE, ...Array.from(Buffer.from('Nombre', 'utf16le'))])), 'Nombre');
  const err = async (b, n) => { try { await L.readFile(b); fail++; console.log('FAIL', n, 'no lanzó error'); } catch (e) { pass++; } };
  await err(mk([0x50, 0x4B, 0x03, 0x04, 1, 2]), 'T18 xlsx (zip) rechazado');
  await err(mk([65, 0, 66, 0, 0, 0, 67]), 'T18 binario rechazado');
  await err(mk([65], 21 * 1024 * 1024), 'T18 archivo enorme rechazado');
  eq('T18 vacío', await L.readFile(mk([])), '');

  /* ============ 19. Mojibake heredado del Sheet ============ */
  const mojibake = L.plan('Nombre,Correo,Importe\nElizabeth Barett Benjamín,e@x.com,300', [doc('Elizabeth Barett BenjamÃ­n', 'e@x.com', 300)]);
  eq('T19 caracteres rotos de la base vs corregidos en el archivo -> no duplica', mojibake.toAdd.length, 0);
  eq('T19 al revés (rotos en el archivo, bien en la base)', L.plan('Nombre,Correo,Importe\nElizabeth Barett BenjamÃ­n,e@x.com,300', [doc('Elizabeth Barett Benjamín', 'e@x.com', 300)]).toAdd.length, 0);

  console.log(`\nRESULTADO: ${pass} correctas, ${fail} fallidas`);
  process.exit(fail ? 1 : 0);
})();
