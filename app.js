const DB_NAME = 'graphite-factory-db';
const DB_VERSION = 1;
const STORE_NAME = 'app-state';
const LEGACY_KEY = 'graphite-factory-dashboard-v1';

const $ = (id) => document.getElementById(id);
const uid = () => crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
const today = () => new Date().toISOString().slice(0, 10);
const monthKey = (date = today()) => String(date).slice(0, 7);
const num = (value) => { const n = Number(value); return Number.isFinite(n) ? n : 0; };
const sum = (values) => values.reduce((total, value) => total + num(value), 0);
const money = (value) => currencyFormatter(state.settings.currency).format(num(value));
const currencyFormatter = (currency) => new Intl.NumberFormat('ar', { style: 'currency', currency: currency || 'LYD', maximumFractionDigits: 2 });
const esc = (value) => String(value ?? '').replace(/[&<>'"]/g, (char) => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', "'":'&#39;', '"':'&quot;' }[char]));
const normalize = (value) => String(value ?? '').normalize('NFKD').replace(/[\u064b-\u065f\u0670\u0640]/g, '').replace(/[أإآ]/g, 'ا').replace(/ى/g, 'ي').toLowerCase().trim();

const defaults = () => ({
  version: 2,
  settings: { factoryName: 'مصنع الجرافيت', currency: 'LYD', taxRate: 15 },
  products: [
    { id: uid(), name: 'مسحوق جرافيت', category: 'خام', unit: 'طن', openingQty: 42, openingCost: 1100, minLevel: 10 },
    { id: uid(), name: 'قوالب ضغط', category: 'معدات', unit: 'قطعة', openingQty: 8, openingCost: 600, minLevel: 3 },
    { id: uid(), name: 'منتج نهائي A', category: 'نهائي', unit: 'صندوق', openingQty: 120, openingCost: 320, minLevel: 30 },
  ],
  imports: [
    { id: uid(), supplier: 'شركة الشرق', itemId: '', qty: 20, cost: 25000, freight: 1000, duty: 400, otherCost: 0, date: offsetDate(-10) },
    { id: uid(), supplier: 'مؤسسة النور', itemId: '', qty: 12, cost: 4800, freight: 200, duty: 0, otherCost: 0, date: offsetDate(-5) },
  ],
  exports: [],
  expenses: [
    { id: uid(), type: 'كهرباء', description: 'فاتورة التشغيل الشهرية', amount: 4200, date: offsetDate(-7), paymentStatus: 'paid' },
    { id: uid(), type: 'صيانة', description: 'صيانة خط الإنتاج', amount: 5600, date: offsetDate(-2), paymentStatus: 'paid' },
    { id: uid(), type: 'نقل', description: 'شحن داخلي', amount: 900, date: offsetDate(-1), paymentStatus: 'paid' },
  ],
  payroll: [
    { id: uid(), name: 'أحمد سالم', role: 'مشرف إنتاج', salary: 9500, advance: 1500, month: monthKey() },
    { id: uid(), name: 'محمود علي', role: 'فني تشغيل', salary: 7200, advance: 0, month: monthKey() },
    { id: uid(), name: 'سعيد حسن', role: 'عامل تعبئة', salary: 5600, advance: 600, month: monthKey() },
  ],
  partners: [
    { id: uid(), name: 'شركة الشرق', type: 'مورد', phone: '0123456789', note: 'مورد المواد الخام' },
    { id: uid(), name: 'مصنع البناء الحديث', type: 'عميل', phone: '0112233445', note: 'عميل دوري' },
  ],
});

function offsetDate(days) { const d = new Date(); d.setDate(d.getDate() + days); return d.toISOString().slice(0, 10); }
let state = null;
let db = null;
const filters = { inventory: '', imports: '', exports: '', expenses: '', workers: '', partners: '' };
const sections = ['dashboard','inventory','imports','exports','expenses','workers','partners','reports','settings'];

const tableConfig = {
  inventory: { tbody: 'inventoryTable', search: 'inventorySearch' },
  imports: { tbody: 'importsTable', search: 'importsSearch' },
  exports: { tbody: 'exportsTable', search: 'exportsSearch' },
  expenses: { tbody: 'expensesTable', search: 'expensesSearch' },
  workers: { tbody: 'workersTable', search: 'workersSearch' },
  partners: { tbody: 'partnersTable', search: 'partnersSearch' },
};

window.addEventListener('DOMContentLoaded', init);

async function init() {
  try {
    db = await openDatabase();
    state = await loadState();
    normalizeState();
    bindNavigation();
    bindForms();
    bindSearch();
    bindActions();
    renderAll();
    await saveState();
  } catch (error) {
    console.error(error);
    alert('تعذر فتح قاعدة البيانات المحلية. جرّب متصفحًا حديثًا أو اسمح بالتخزين المحلي.');
  }
}

function openDatabase() {
  return new Promise((resolve, reject) => {
    if (!('indexedDB' in window)) return reject(new Error('IndexedDB unavailable'));
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE_NAME);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function readDatabase() {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const request = tx.objectStore(STORE_NAME).get('state');
    request.onsuccess = () => resolve(request.result || null);
    request.onerror = () => reject(request.error);
  });
}

function saveState() {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).put(state, 'state');
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
  });
}

async function loadState() {
  const stored = await readDatabase();
  if (stored) return mergeState(defaults(), stored);
  const legacy = localStorage.getItem(LEGACY_KEY);
  if (legacy) {
    try { return migrateLegacy(JSON.parse(legacy)); } catch { /* use demo data */ }
  }
  return seedState(defaults());
}

function seedState(value) {
  const productIds = value.products.map((p) => p.id);
  value.imports.forEach((entry, index) => { entry.itemId = productIds[index % productIds.length]; });
  value.exports.push({ id: uid(), customer: 'مصنع البناء الحديث', itemId: productIds[2], qty: 30, revenue: 18600, paid: 12000, date: offsetDate(-8) });
  value.exports.push({ id: uid(), customer: 'شركة المواد الصناعية', itemId: productIds[2], qty: 18, revenue: 14100, paid: 14100, date: offsetDate(-3) });
  return value;
}

function migrateLegacy(old) {
  const value = defaults();
  if (Array.isArray(old.inventory) && old.inventory.length) value.products = [];
  (old.inventory || []).forEach((item) => value.products.push({ id: uid(), name: item.name, category: item.category || 'عام', unit: item.unit || 'وحدة', openingQty: num(item.qty), openingCost: 0, minLevel: num(item.minLevel) }));
  const allProducts = new Map(value.products.map((p) => [normalize(p.name), p.id]));
  value.imports = (old.imports || []).map((x) => ({ id: x.id || uid(), supplier: x.supplier || '', itemId: allProducts.get(normalize(x.item)) || value.products[0].id, qty: num(x.qty), cost: num(x.cost), freight: 0, duty: 0, otherCost: 0, date: x.date || today() }));
  value.exports = (old.exports || []).map((x) => ({ id: x.id || uid(), customer: x.customer || '', itemId: allProducts.get(normalize(x.item)) || value.products[0].id, qty: num(x.qty), revenue: num(x.revenue), paid: 0, date: x.date || today() }));
  value.expenses = (old.expenses || []).map((x) => ({ ...x, amount: num(x.amount), paymentStatus: 'paid' }));
  value.payroll = (old.workers || []).map((x) => ({ id: x.id || uid(), name: x.name || '', role: x.role || '', salary: num(x.salary), advance: num(x.advance), month: monthKey() }));
  value.partners = old.partners || value.partners;
  value.settings = { ...value.settings, ...(old.settings || {}) };
  return value;
}

function mergeState(base, saved) {
  const result = { ...base, ...saved, settings: { ...base.settings, ...(saved.settings || {}) } };
  result.products = Array.isArray(saved.products) ? saved.products : (Array.isArray(saved.inventory) ? saved.inventory.map((x) => ({ ...x, openingQty: num(x.qty), openingCost: 0 })) : base.products);
  result.imports = Array.isArray(saved.imports) ? saved.imports : base.imports;
  result.exports = Array.isArray(saved.exports) ? saved.exports : base.exports;
  result.expenses = Array.isArray(saved.expenses) ? saved.expenses : base.expenses;
  result.payroll = Array.isArray(saved.payroll) ? saved.payroll : (saved.workers || base.payroll);
  result.partners = Array.isArray(saved.partners) ? saved.partners : base.partners;
  return result;
}

function normalizeState() {
  state.version = 2;
  state.products.forEach((p) => { p.id ||= uid(); p.openingQty = num(p.openingQty ?? p.qty); p.openingCost = num(p.openingCost); p.minLevel = num(p.minLevel); });
  const fallback = state.products[0]?.id;
  state.imports.forEach((x) => { x.id ||= uid(); x.itemId ||= fallback; x.qty = num(x.qty); x.cost = num(x.cost); x.freight = num(x.freight); x.duty = num(x.duty); x.otherCost = num(x.otherCost); });
  state.exports.forEach((x) => { x.id ||= uid(); x.itemId ||= fallback; x.qty = num(x.qty); x.revenue = num(x.revenue); x.paid = num(x.paid); });
  state.expenses.forEach((x) => { x.id ||= uid(); x.amount = num(x.amount); x.paymentStatus ||= 'paid'; });
  state.payroll.forEach((x) => { x.id ||= uid(); x.salary = num(x.salary); x.advance = num(x.advance); x.month ||= monthKey(); });
}

function bindNavigation() {
  document.querySelectorAll('.nav-item').forEach((button) => button.addEventListener('click', () => {
    document.querySelectorAll('.nav-item').forEach((item) => item.classList.toggle('active', item === button));
    sections.forEach((name) => $(name + 'Section').classList.toggle('active-section', name === button.dataset.section));
  }));
}

function bindForms() {
  $('inventoryForm').addEventListener('submit', async (event) => { event.preventDefault(); const f = event.currentTarget; state.products.unshift({ id: uid(), name: f.name.value.trim(), category: f.category.value.trim(), unit: f.unit.value.trim(), openingQty: num(f.qty.value), openingCost: num(f.openingCost.value), minLevel: num(f.minLevel.value) }); await changed('تمت إضافة الصنف'); f.reset(); });
  $('importsForm').addEventListener('submit', async (event) => { event.preventDefault(); const f = event.currentTarget; const entry = { id: uid(), supplier: f.supplier.value.trim(), itemId: f.itemId.value, qty: num(f.qty.value), cost: num(f.cost.value), freight: num(f.freight.value), duty: num(f.duty.value), otherCost: num(f.otherCost.value), date: f.date.value }; if (!entry.itemId || entry.qty <= 0) return notify('اختر صنفًا وأدخل كمية صحيحة', true); state.imports.unshift(entry); await changed('تم تسجيل الاستلام وتحديث المخزون'); f.reset(); });
  $('exportsForm').addEventListener('submit', async (event) => { event.preventDefault(); const f = event.currentTarget; const entry = { id: uid(), customer: f.customer.value.trim(), itemId: f.itemId.value, qty: num(f.qty.value), revenue: num(f.revenue.value), paid: num(f.paid.value), date: f.date.value }; if (!entry.itemId || entry.qty <= 0) return notify('اختر صنفًا وأدخل كمية صحيحة', true); state.exports.unshift(entry); const validation = calculateInventory(); if (validation.error) { state.exports.shift(); return notify(validation.error, true); } await changed('تم تسجيل البيع وخصم الكمية وحساب التكلفة'); f.reset(); });
  $('expensesForm').addEventListener('submit', async (event) => { event.preventDefault(); const f = event.currentTarget; state.expenses.unshift({ id: uid(), type: f.type.value.trim(), description: f.description.value.trim(), amount: num(f.amount.value), date: f.date.value, paymentStatus: f.paymentStatus.value }); await changed('تمت إضافة المصروف'); f.reset(); });
  $('workersForm').addEventListener('submit', async (event) => { event.preventDefault(); const f = event.currentTarget; state.payroll.unshift({ id: uid(), name: f.name.value.trim(), role: f.role.value.trim(), salary: num(f.salary.value), advance: num(f.advance.value), month: f.month.value }); await changed('تم تسجيل الراتب للشهر المحدد'); f.reset(); });
  $('partnersForm').addEventListener('submit', async (event) => { event.preventDefault(); const f = event.currentTarget; state.partners.unshift({ id: uid(), name: f.name.value.trim(), type: f.type.value, phone: f.phone.value.trim(), note: f.note.value.trim() }); await changed('تمت إضافة الجهة'); f.reset(); });
  $('settingsForm').addEventListener('submit', async (event) => { event.preventDefault(); const f = event.currentTarget; state.settings = { factoryName: f.factoryName.value.trim(), currency: (f.currency.value.trim() || 'LYD').toUpperCase(), taxRate: Math.min(100, Math.max(0, num(f.taxRate.value))) }; await changed('تم حفظ الإعدادات'); });
}

function bindSearch() { Object.entries(tableConfig).forEach(([key, config]) => $(config.search).addEventListener('input', (event) => { filters[key] = normalize(event.target.value); renderTables(); })); }
function bindActions() {
  $('dashboardMonth').value = monthKey(); $('reportsMonth').value = monthKey();
  $('dashboardMonth').addEventListener('change', renderDashboard); $('reportsMonth').addEventListener('change', renderReports);
  $('resetDemoBtn').addEventListener('click', async () => { if (!confirm('سيتم استبدال البيانات الحالية ببيانات تجريبية. اكتب موافقًا بالضغط على موافق للمتابعة.')) return; state = seedState(defaults()); await changed('تمت إعادة البيانات التجريبية'); });
  $('exportDataBtn').addEventListener('click', () => { const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' }); const link = document.createElement('a'); link.href = URL.createObjectURL(blob); link.download = `graphite-backup-${today()}.json`; link.click(); setTimeout(() => URL.revokeObjectURL(link.href), 500); });
  $('importDataInput').addEventListener('change', async (event) => { const file = event.target.files?.[0]; if (!file) return; try { const imported = JSON.parse(await file.text()); const next = mergeState(defaults(), imported); const check = validateState(next); if (check) throw new Error(check); state = next; await changed('تم استيراد النسخة الاحتياطية'); } catch (error) { notify(`تعذر الاستيراد: ${error.message}`, true); } event.target.value = ''; });
}

function validateState(value) { if (!Array.isArray(value.products) || !Array.isArray(value.imports) || !Array.isArray(value.exports)) return 'مخطط الملف غير صحيح'; if (value.products.some((p) => !p.id || !p.name)) return 'يوجد صنف بلا معرف أو اسم'; if (calculateInventory(value).error) return calculateInventory(value).error; return ''; }
async function changed(message) { normalizeState(); const result = calculateInventory(); if (result.error) { notify(result.error, true); return; } renderAll(); await saveState(); notify(message); }
function notify(message, isError = false) { const toast = $('toast'); toast.textContent = message; toast.className = `toast show ${isError ? 'error' : ''}`; setTimeout(() => toast.classList.remove('show'), 3000); }

function product(id) { return state.products.find((p) => p.id === id); }
function landedCost(entry) { return num(entry.cost) + num(entry.freight) + num(entry.duty) + num(entry.otherCost); }
function calculateInventory(source = state) {
  const result = {}; source.products.forEach((p) => { result[p.id] = { ...p, qty: num(p.openingQty), value: num(p.openingQty) * num(p.openingCost), avgCost: num(p.openingCost), cogs: 0 }; });
  const movements = [...source.imports.map((x) => ({ ...x, kind: 'in' })), ...source.exports.map((x) => ({ ...x, kind: 'out' }))].sort((a, b) => `${a.date || ''}${a.id}`.localeCompare(`${b.date || ''}${b.id}`));
  for (const movement of movements) {
    const item = result[movement.itemId]; if (!item) continue;
    if (movement.kind === 'in') { const value = landedCost(movement); item.qty += num(movement.qty); item.value += value; item.avgCost = item.qty ? item.value / item.qty : 0; }
    else { if (item.qty - num(movement.qty) < -0.000001) return { error: `الرصيد غير كافٍ للصنف: ${item.name}` }; const cogs = num(movement.qty) * item.avgCost; item.qty -= num(movement.qty); item.value -= cogs; item.cogs += cogs; item.avgCost = item.qty ? item.value / item.qty : 0; movement._cogs = cogs; }
  }
  return { items: result, movements };
}

function renderAll() { renderSettings(); renderDashboard(); renderTables(); renderReports(); fillProductSelects(); }
function renderSettings() { $('pageTitle').textContent = `${state.settings.factoryName} - مؤشرات المصنع والعمليات اليومية`; $('settingsForm').factoryName.value = state.settings.factoryName; $('settingsForm').currency.value = state.settings.currency; $('settingsForm').taxRate.value = state.settings.taxRate; }
function periodData(month) { const inv = calculateInventory(); const exports = state.exports.filter((x) => monthKey(x.date) === month); const imports = state.imports.filter((x) => monthKey(x.date) === month); const expenses = state.expenses.filter((x) => monthKey(x.date) === month); const payroll = state.payroll.filter((x) => x.month === month); const revenue = sum(exports.map((x) => x.revenue)); const cogs = sum(exports.map((x) => { const item = inv.movements.find((m) => m.id === x.id); return item?._cogs || num(x.qty) * (product(x.itemId)?.openingCost || 0); })); const operating = sum(expenses.map((x) => x.amount)); const salaries = sum(payroll.map((x) => x.salary)); return { exports, imports, expenses, payroll, revenue, cogs, operating, salaries, net: revenue - cogs - operating - salaries, inv }; }
function renderDashboard() { const data = periodData($('dashboardMonth').value || monthKey()); const all = calculateInventory(); const low = Object.values(all.items || {}).filter((x) => x.qty <= x.minLevel).length; const stats = [['إيرادات الشهر', data.revenue, true], ['تكلفة المبيعات', data.cogs, true], ['المصروفات والرواتب', data.operating + data.salaries, true], ['صافي الربح', data.net, true], ['تنبيهات المخزون', low, false]]; $('statsGrid').innerHTML = stats.map(([label, value, isMoney]) => `<article class="stat-card"><span>${esc(label)}</span><strong class="${isMoney && value < 0 ? 'negative' : ''}">${isMoney ? money(value) : value}</strong><small>${isMoney ? 'للشهر المحدد' : 'أصناف تحت الحد'}</small></article>`).join(''); const chart = [['الإيرادات', data.revenue, 'var(--brand)'], ['COGS', data.cogs, 'var(--danger)'], ['المصروفات والرواتب', data.operating + data.salaries, 'var(--warning)'], ['صافي الربح', data.net, 'var(--brand-2)']]; const max = Math.max(...chart.map((x) => Math.abs(x[1])), 1); $('financialChart').innerHTML = chart.map(([label, value, color]) => `<div class="chart-row"><strong>${esc(label)}</strong><div class="bar-track"><div class="bar-fill" style="width:${Math.min(100, Math.round(Math.abs(value) / max * 100))}%;background:${color}"></div></div><span class="${value < 0 ? 'negative' : ''}">${money(value)}</span></div>`).join(''); const alerts = Object.values(all.items || {}).filter((x) => x.qty <= x.minLevel).map((x) => `الصنف ${x.name} وصل إلى حد إعادة الطلب (${x.qty} ${x.unit}).`); if (!alerts.length) alerts.push('لا توجد أصناف تحت حد إعادة الطلب.'); $('alertsList').innerHTML = alerts.slice(0, 6).map((x) => `<li>${esc(x)}</li>`).join(''); }

function fillProductSelects() { [['importItem','اختر الصنف'], ['exportItem','اختر الصنف']].forEach(([id, placeholder]) => { const select = $(id); const selected = select.value; select.innerHTML = `<option value="">${placeholder}</option>` + state.products.map((p) => `<option value="${esc(p.id)}">${esc(p.name)} (${esc(p.unit)})</option>`).join(''); if (state.products.some((p) => p.id === selected)) select.value = selected; }); }
function filtered(rows, key, extra = '') { const query = filters[key]; return rows.filter((row) => !query || Object.values(row).some((value) => normalize(value).includes(query))).filter((row) => !extra || extra(row)); }
function actionButtons(key, id) { return `<button class="danger-btn" type="button" data-delete="${esc(key)}" data-id="${esc(id)}">حذف</button>`; }
function renderTables() { const inv = calculateInventory(); renderTable('inventory', Object.values(inv.items || {}), (row) => { const low = row.qty <= row.minLevel; return [esc(row.name), esc(row.category), num(row.qty).toFixed(2), esc(row.unit), money(row.avgCost), money(row.value), `<span class="status ${low ? 'status-warn' : 'status-ok'}">${low ? 'إعادة طلب' : 'جيد'}</span>`]; }, (row) => row.qty <= row.minLevel); renderTable('imports', state.imports, (row) => { const p = product(row.itemId); const total = landedCost(row); return [esc(row.date), esc(row.supplier), esc(p?.name || 'صنف محذوف'), num(row.qty).toFixed(2), money(total), money(row.qty ? total / row.qty : 0)]; }); renderTable('exports', state.exports, (row) => { const p = product(row.itemId); const movement = inv.movements.find((x) => x.id === row.id); const cogs = movement?._cogs || 0; return [esc(row.date), esc(row.customer), esc(p?.name || 'صنف محذوف'), num(row.qty).toFixed(2), money(row.revenue), money(cogs), `<span class="${row.revenue - cogs < 0 ? 'negative' : ''}">${money(row.revenue - cogs)}</span>`]; }); renderTable('expenses', state.expenses, (row) => [esc(row.date), esc(row.type), esc(row.description), money(row.amount), row.paymentStatus === 'paid' ? 'مدفوع' : 'مستحق']); renderTable('workers', state.payroll, (row) => [esc(row.month), esc(row.name), esc(row.role), money(row.salary), money(row.advance), money(row.salary - row.advance)]); renderTable('partners', state.partners, (row) => [esc(row.name), esc(row.type), esc(row.phone), esc(row.note || '-')]); }
function renderTable(key, rows, cells, highlight) { const config = tableConfig[key]; const filteredRows = filtered(rows, key); $(config.tbody).innerHTML = filteredRows.length ? filteredRows.map((row) => `<tr class="${highlight?.(row) ? 'warn-row' : ''}">${cells(row).map((cell) => `<td>${cell}</td>`).join('')}<td class="table-actions">${actionButtons(key, row.id)}</td></tr>`).join('') : `<tr><td colspan="12" class="empty">لا توجد بيانات مطابقة</td></tr>`; $(config.tbody).querySelectorAll('[data-delete]').forEach((button) => button.addEventListener('click', () => removeRecord(button.dataset.delete, button.dataset.id))); }
async function removeRecord(key, id) { if (!confirm('حذف السجل؟ سيتم إعادة احتساب الأرصدة والتقارير.')) return; if (key === 'inventory') { const used = state.imports.some((x) => x.itemId === id) || state.exports.some((x) => x.itemId === id); if (used) return notify('لا يمكن حذف صنف مرتبط بحركات. احذفه من الاستخدام أو اتركه للأرشيف.', true); state.products = state.products.filter((x) => x.id !== id); } else { const collection = key === 'workers' ? 'payroll' : key; state[collection] = state[collection].filter((x) => x.id !== id); } await changed('تم حذف السجل وإعادة الحساب'); }

function renderReports() { const data = periodData($('reportsMonth').value || monthKey()); const metrics = [['الإيرادات', money(data.revenue)], ['تكلفة المبيعات', money(data.cogs)], ['المصروفات التشغيلية', money(data.operating)], ['الرواتب', money(data.salaries)], ['صافي الربح', money(data.net)]]; $('reportMetrics').innerHTML = metrics.map(([label, value]) => `<div class="metric-item"><span>${esc(label)}</span><strong>${esc(value)}</strong></div>`).join(''); const grouped = {}; data.expenses.forEach((x) => { grouped[x.type] = (grouped[x.type] || 0) + num(x.amount); }); const breakdown = Object.entries(grouped).sort((a, b) => b[1] - a[1]); $('expenseBreakdown').innerHTML = breakdown.length ? breakdown.map(([type, total]) => `<li>${esc(type)}: ${money(total)}</li>`).join('') : '<li>لا توجد مصروفات في الشهر المحدد</li>'; $('monthlySummary').innerHTML = [['الشهر', $('reportsMonth').value], ['المبيعات', money(data.revenue)], ['تكلفة المبيعات', money(data.cogs)], ['المصروفات', money(data.operating)], ['الرواتب', money(data.salaries)], ['صافي الربح', money(data.net)]].map(([label, value]) => `<div class="monthly-card"><span>${esc(label)}</span><strong class="${String(value).includes('-') ? 'negative' : ''}">${esc(value)}</strong></div>`).join(''); }
