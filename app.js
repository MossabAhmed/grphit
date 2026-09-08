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
const esc = (value) => String(value ?? '').replace(/[&<>'\"]/g, (char) => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', "'":'&#39;', '\"':'&quot;' }[char]));
const normalize = (value) => String(value ?? '').normalize('NFKD').replace(/[\u064b-\u065f\u0670\u0640]/g, '').replace(/[أإآ]/g, 'ا').replace(/ى/g, 'ي').toLowerCase().trim();

const UNIT_CATEGORIES = {
  weight: { label: 'الوزن', units: [{ id: 'g', label: 'جرام', factor: 0.001 }, { id: 'kg', label: 'كجم', factor: 1 }, { id: 'ton', label: 'طن', factor: 1000 }] },
  count: { label: 'العدد', units: [{ id: 'piece', label: 'قطعة', factor: 1 }, { id: 'box', label: 'صندوق', factor: 1 }, { id: 'carton', label: 'كرتونة', factor: 1 }] },
  volume: { label: 'الحجم', units: [{ id: 'liter', label: 'لتر', factor: 1 }, { id: 'm3', label: 'متر مكعب', factor: 1000 }] },
};
const unitInfo = (category, id) => UNIT_CATEGORIES[category]?.units.find((unit) => unit.id === id);
const unitLabel = (category, id) => unitInfo(category, id)?.label || id || '-';

const defaults = () => ({
  version: 2,
  settings: { factoryName: 'مصنع الجرافيت', currency: 'LYD' },
  products: [
    { id: uid(), name: 'مسحوق جرافيت', category: 'خام', unitCategory: 'weight', baseUnit: 'kg', openingQty: 42000, openingCost: 1.1, minLevel: 10000, alternateUnits: [{ id: 'ton', label: 'طن', factorToBase: 1000 }] },
    { id: uid(), name: 'قوالب ضغط', category: 'معدات', unitCategory: 'count', baseUnit: 'piece', openingQty: 8, openingCost: 600, minLevel: 3, alternateUnits: [] },
    { id: uid(), name: 'منتج نهائي A', category: 'نهائي', unitCategory: 'count', baseUnit: 'box', openingQty: 120, openingCost: 320, minLevel: 30, alternateUnits: [] },
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
const sections = ['dashboard','inventory','imports','exports','expenses','workers','partners','production','receivables','reports','settings'];

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
    populateUnitFields();
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
  value.imports = (old.imports || []).map((x) => ({ id: x.id || uid(), supplier: x.supplier || '', itemId: allProducts.get(normalize(x.item)) || value.products[0].id, qty: num(x.qty), enteredQty: num(x.qty), enteredUnit: 'base', cost: num(x.cost), freight: 0, duty: 0, otherCost: 0, date: x.date || today() }));
  value.exports = (old.exports || []).map((x) => ({ id: x.id || uid(), customer: x.customer || '', itemId: allProducts.get(normalize(x.item)) || value.products[0].id, qty: num(x.qty), enteredQty: num(x.qty), enteredUnit: 'base', revenue: num(x.revenue), paid: 0, date: x.date || today() }));
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
  result.production = Array.isArray(saved.production) ? saved.production : [];
  return result;
}

function inferCategory(label) {
  const value = normalize(label);
  if (['طن', 'كجم', 'كيلوجرام', 'جرام'].some((x) => value.includes(normalize(x)))) return 'weight';
  return 'count';
}

function inferUnit(label, category) {
  const value = normalize(label);
  if (category === 'weight') return value.includes('طن') ? 'ton' : value.includes('جرام') ? 'g' : 'kg';
  return value.includes('صندوق') ? 'box' : 'piece';
}

function normalizeState() {
  state.version = 2;
  state.settings = { factoryName: state.settings.factoryName || 'مصنع الجرافيت', currency: state.settings.currency || 'LYD' };
  state.products.forEach((p) => { p.id ||= uid(); p.unitCategory ||= inferCategory(p.unit); p.baseUnit ||= inferUnit(p.unit, p.unitCategory); p.alternateUnits ||= []; p.openingQty = num(p.openingQty ?? p.qty); p.openingCost = num(p.openingCost); p.minLevel = num(p.minLevel); });
  deduplicateProducts();
  const fallback = state.products[0]?.id;
  state.production ||= [];
  state.imports.forEach((x) => { x.id ||= uid(); x.itemId ||= fallback; x.enteredQty = num(x.enteredQty ?? x.qty); x.enteredUnit ||= 'base'; x.qty = num(x.qty); x.cost = num(x.cost); x.freight = num(x.freight); x.duty = num(x.duty); x.otherCost = num(x.otherCost); x.paid = Math.min(landedCost(x), Math.max(0, num(x.paid))); x.cancelled = Boolean(x.cancelled); });
  state.exports.forEach((x) => { x.id ||= uid(); x.itemId ||= fallback; x.enteredQty = num(x.enteredQty ?? x.qty); x.enteredUnit ||= 'base'; x.qty = num(x.qty); x.revenue = num(x.revenue); x.paid = num(x.paid); });
  state.expenses.forEach((x) => { x.id ||= uid(); x.amount = num(x.amount); x.paymentStatus ||= 'paid'; });
  state.payroll.forEach((x) => { x.id ||= uid(); x.salary = num(x.salary); x.advance = num(x.advance); x.month ||= monthKey(); });
  state.production.forEach((x) => { x.id ||= uid(); x.productId ||= fallback; x.materialId ||= fallback; x.quantity = num(x.quantity); x.materialQty = num(x.materialQty); x.waste = num(x.waste); x.date ||= today(); x.cancelled = Boolean(x.cancelled); });
  state.imports.forEach((x) => { x.supplier = canonicalPartnerName(x.supplier, 'مورد'); });
  state.exports.forEach((x) => { x.customer = canonicalPartnerName(x.customer, 'عميل'); });
}

function deduplicateProducts() {
  const groups = new Map();
  state.products.forEach((item) => { const key = `${normalize(item.name)}|${item.unitCategory}|${item.baseUnit}`; if (!groups.has(key)) groups.set(key, []); groups.get(key).push(item); });
  groups.forEach((items) => {
    if (items.length < 2) return;
    const primary = items[0];
    const ids = new Set(items.slice(1).map((item) => item.id));
    const totalQty = sum(items.map((item) => item.openingQty));
    const totalValue = sum(items.map((item) => num(item.openingQty) * num(item.openingCost)));
    primary.openingQty = totalQty; primary.openingCost = totalQty ? totalValue / totalQty : 0; primary.minLevel = Math.max(...items.map((item) => num(item.minLevel)));
    state.imports.forEach((entry) => { if (ids.has(entry.itemId)) entry.itemId = primary.id; });
    state.exports.forEach((entry) => { if (ids.has(entry.itemId)) entry.itemId = primary.id; });
    state.products = state.products.filter((item) => !ids.has(item.id));
  });
}

function bindNavigation() {
  document.querySelectorAll('.nav-item').forEach((button) => button.addEventListener('click', () => {
    document.querySelectorAll('.nav-item').forEach((item) => item.classList.toggle('active', item === button));
    sections.forEach((name) => $(name + 'Section').classList.toggle('active-section', name === button.dataset.section));
  }));
}

function bindForms() {
  $('inventoryForm').addEventListener('submit', async (event) => { event.preventDefault(); const f = event.currentTarget; const category = f.unitCategory.value; const baseUnit = f.baseUnit.value; const alternateUnit = f.alternateUnit.value; const factor = num(f.alternateFactor.value); if (alternateUnit && factor <= 0) return notify('أدخل معامل تحويل صحيح للوحدة البديلة', true); state.products.unshift({ id: uid(), name: f.name.value.trim(), category: f.category.value.trim(), unitCategory: category, baseUnit, openingQty: num(f.qty.value), openingCost: num(f.openingCost.value), minLevel: num(f.minLevel.value), alternateUnits: alternateUnit ? [{ id: alternateUnit, label: unitLabel(category, alternateUnit), factorToBase: factor }] : [] }); await changed('تمت إضافة الصنف'); f.reset(); populateUnitFields(); });
  $('importsForm').addEventListener('submit', async (event) => { event.preventDefault(); const f = event.currentTarget; const p = product(f.itemId.value); const conversion = conversionFactor(p, f.enteredUnit.value); const entry = { id: uid(), supplier: canonicalPartnerName(f.supplier.value, 'مورد'), itemId: f.itemId.value, enteredQty: num(f.qty.value), enteredUnit: f.enteredUnit.value, qty: num(f.qty.value) * conversion, cost: num(f.cost.value), freight: num(f.freight.value), duty: num(f.duty.value), otherCost: num(f.otherCost.value), paid: num(f.paid.value), date: f.date.value, cancelled: false }; if (!p || !conversion || entry.qty <= 0 || entry.paid < 0 || entry.paid > landedCost(entry)) return notify('تحقق من الصنف والكمية وأن المدفوع لا يتجاوز التكلفة الواصلة', true); state.imports.unshift(entry); await changed('تم تسجيل الاستلام وتحويل الكمية للمخزون'); f.reset(); populateMovementUnits('importItem', 'importUnit'); });
  $('exportsForm').addEventListener('submit', async (event) => { event.preventDefault(); const f = event.currentTarget; const p = product(f.itemId.value); const conversion = conversionFactor(p, f.enteredUnit.value); const entry = { id: uid(), customer: canonicalPartnerName(f.customer.value, 'عميل'), itemId: f.itemId.value, enteredQty: num(f.qty.value), enteredUnit: f.enteredUnit.value, qty: num(f.qty.value) * conversion, revenue: num(f.revenue.value), paid: num(f.paid.value), date: f.date.value }; if (!p || !conversion || entry.qty <= 0) return notify('اختر صنفًا ووحدة متوافقة وأدخل كمية صحيحة', true); state.exports.unshift(entry); const validation = calculateInventory(); if (validation.error) { state.exports.shift(); return notify(validation.error, true); } await changed('تم تسجيل البيع وخصم الكمية الأساسية'); f.reset(); populateMovementUnits('exportItem', 'exportUnit'); });
  $('expensesForm').addEventListener('submit', async (event) => { event.preventDefault(); const f = event.currentTarget; state.expenses.unshift({ id: uid(), type: f.type.value.trim(), description: f.description.value.trim(), amount: num(f.amount.value), date: f.date.value, paymentStatus: f.paymentStatus.value }); await changed('تمت إضافة المصروف'); f.reset(); });
  $('workersForm').addEventListener('submit', async (event) => { event.preventDefault(); const f = event.currentTarget; state.payroll.unshift({ id: uid(), name: f.name.value.trim(), role: f.role.value.trim(), salary: num(f.salary.value), advance: num(f.advance.value), month: f.month.value }); await changed('تم تسجيل الراتب للشهر المحدد'); f.reset(); });
  $('partnersForm').addEventListener('submit', async (event) => { event.preventDefault(); const f = event.currentTarget; state.partners.unshift({ id: uid(), name: f.name.value.trim(), type: f.type.value, phone: f.phone.value.trim(), note: f.note.value.trim() }); await changed('تمت إضافة الجهة'); f.reset(); });
  $('settingsForm').addEventListener('submit', async (event) => { event.preventDefault(); const f = event.currentTarget; state.settings = { factoryName: f.factoryName.value.trim(), currency: (f.currency.value.trim() || 'LYD').toUpperCase() }; await changed('تم حفظ الإعدادات'); });
  $('inventoryUnitCategory').addEventListener('change', populateUnitFields);
  $('importItem').addEventListener('change', () => populateMovementUnits('importItem', 'importUnit'));
  $('exportItem').addEventListener('change', () => populateMovementUnits('exportItem', 'exportUnit'));
  $('productionForm').addEventListener('submit', async (event) => { event.preventDefault(); const f = event.currentTarget; const productItem = product(f.productId.value); const material = product(f.materialId.value); const productFactor = conversionFactor(productItem, f.productUnit.value); const materialFactor = conversionFactor(material, f.materialUnit.value); const entry = { id: uid(), reference: f.reference.value.trim() || `PROD-${today()}-${String(Date.now()).slice(-4)}`, productId: f.productId.value, quantity: num(f.quantity.value) * productFactor, enteredQuantity: num(f.quantity.value), enteredUnit: f.productUnit.value, materialId: f.materialId.value, materialQty: num(f.materialQty.value) * materialFactor, enteredMaterialQty: num(f.materialQty.value), materialUnit: f.materialUnit.value, waste: num(f.waste.value) * materialFactor, date: f.date.value, note: f.note.value.trim(), cancelled: false }; if (!productItem || !material || productItem.id === material.id || !productFactor || !materialFactor || entry.quantity <= 0 || entry.materialQty <= 0) return notify('اختر منتجًا وخامة مختلفين وأدخل كميات صحيحة', true); state.production.unshift(entry); const validation = calculateInventory(); if (validation.error) { state.production.shift(); return notify(validation.error, true); } await changed('تم تسجيل الإنتاج وخصم الخام وإضافة المنتج'); f.reset(); populateProductionFields(); });
  $('productionProduct').addEventListener('change', () => populateMovementUnits('productionProduct', 'productionUnit'));
  $('productionMaterial').addEventListener('change', () => populateMovementUnits('productionMaterial', 'productionMaterialUnit'));
}

function bindSearch() { Object.entries(tableConfig).forEach(([key, config]) => $(config.search).addEventListener('input', (event) => { filters[key] = normalize(event.target.value); renderTables(); })); }
function populateUnitFields() {
  const category = $('inventoryUnitCategory').value || 'weight';
  $('inventoryUnitCategory').innerHTML = Object.entries(UNIT_CATEGORIES).map(([id, value]) => `<option value="${id}">${value.label}</option>`).join('');
  $('inventoryUnitCategory').value = category;
  const units = UNIT_CATEGORIES[category].units;
  $('inventoryBaseUnit').innerHTML = units.map((unit) => `<option value="${unit.id}">${unit.label}</option>`).join('');
  $('inventoryAlternateUnit').innerHTML = `<option value="">لا توجد وحدة بديلة</option>` + units.map((unit) => `<option value="${unit.id}">${unit.label}</option>`).join('');
}
function conversionFactor(item, enteredUnit) {
  if (!item) return 0;
  if (!enteredUnit || enteredUnit === 'base') return 1;
  if (enteredUnit === item.baseUnit) return 1;
  return item.alternateUnits?.find((unit) => unit.id === enteredUnit)?.factorToBase || 0;
}
function populateMovementUnits(itemSelectId, unitSelectId) {
  const item = product($(itemSelectId).value); const select = $(unitSelectId);
  if (!item) { select.innerHTML = '<option value="">اختر الصنف أولًا</option>'; return; }
  const options = [`<option value="base">${unitLabel(item.unitCategory, item.baseUnit)} (أساسية)</option>`];
  (item.alternateUnits || []).forEach((unit) => options.push(`<option value="${esc(unit.id)}">${esc(unit.label)} (×${unit.factorToBase})</option>`));
  select.innerHTML = options.join('');
}
function bindActions() {
  $('dashboardMonth').value = monthKey(); $('reportsMonth').value = monthKey();
  $('dashboardMonth').addEventListener('change', renderDashboard); $('reportsMonth').addEventListener('change', renderReports);
  addPrintTools();
  document.querySelectorAll('[data-print-report]').forEach((button) => button.addEventListener('click', () => printReport(button.dataset.printReport)));
  $('resetDemoBtn').addEventListener('click', async () => { if (!confirm('تحذير: سيتم استبدال جميع البيانات الحالية ببيانات تجريبية. يفضل تصدير نسخة احتياطية قبل المتابعة. هل تريد الاستمرار؟')) return; state = seedState(defaults()); await changed('تمت إعادة البيانات التجريبية'); });
  $('exportDataBtn').addEventListener('click', () => { const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' }); const link = document.createElement('a'); link.href = URL.createObjectURL(blob); link.download = `graphite-backup-${today()}.json`; link.click(); setTimeout(() => URL.revokeObjectURL(link.href), 500); });
  $('importDataInput').addEventListener('change', async (event) => { const file = event.target.files?.[0]; if (!file) return; try { const imported = JSON.parse(await file.text()); const next = mergeState(defaults(), imported); const check = validateState(next); if (check) throw new Error(check); state = next; await changed('تم استيراد النسخة الاحتياطية'); } catch (error) { notify(`تعذر الاستيراد: ${error.message}`, true); } event.target.value = ''; });
}

function addPrintTools() {
  const tools = [['inventorySection', 'inventory', 'طباعة كشف المخزون'], ['importsSection', 'imports', 'طباعة سجل الواردات'], ['exportsSection', 'exports', 'طباعة سجل المبيعات'], ['expensesSection', 'expenses', 'طباعة سجل المصروفات'], ['reportsSection', 'reports', 'طباعة التقرير الشهري']];
  tools.forEach(([sectionId, reportKey, label]) => { const head = document.querySelector(`#${sectionId} .section-head`); if (!head || head.querySelector(`[data-print-report="${reportKey}"]`)) return; const wrap = document.createElement('div'); wrap.className = 'section-tools'; const search = head.querySelector('.search-input, .period-input'); if (search) { search.replaceWith(wrap); wrap.appendChild(search); } else head.appendChild(wrap); const button = document.createElement('button'); button.type = 'button'; button.className = 'ghost-btn'; button.dataset.printReport = reportKey; button.textContent = label; wrap.appendChild(button); });
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
function renderSettings() { $('pageTitle').textContent = `${state.settings.factoryName} - مؤشرات المصنع والعمليات اليومية`; $('settingsForm').factoryName.value = state.settings.factoryName; $('settingsForm').currency.value = state.settings.currency; }
function periodData(month) { const inv = calculateInventory(); const exports = state.exports.filter((x) => monthKey(x.date) === month); const imports = state.imports.filter((x) => monthKey(x.date) === month); const expenses = state.expenses.filter((x) => monthKey(x.date) === month); const payroll = state.payroll.filter((x) => x.month === month); const revenue = sum(exports.map((x) => x.revenue)); const cogs = sum(exports.map((x) => { const item = inv.movements.find((m) => m.id === x.id); return item?._cogs || num(x.qty) * (product(x.itemId)?.openingCost || 0); })); const operating = sum(expenses.map((x) => x.amount)); const salaries = sum(payroll.map((x) => x.salary)); return { exports, imports, expenses, payroll, revenue, cogs, operating, salaries, net: revenue - cogs - operating - salaries, inv }; }
 function renderDashboard() { const data = periodData($('dashboardMonth').value || monthKey()); const all = calculateInventory(); const low = Object.values(all.items || {}).filter((x) => x.qty <= x.minLevel).length; const stats = [['إيرادات الشهر', data.revenue, true], ['تكلفة المبيعات', data.cogs, true], ['المصروفات والرواتب', data.operating + data.salaries, true], ['صافي الربح', data.net, true], ['تنبيهات المخزون', low, false]]; $('statsGrid').innerHTML = stats.map(([label, value, isMoney]) => `<article class="stat-card"><span>${esc(label)}</span><strong class="${isMoney && value < 0 ? 'negative' : ''}">${isMoney ? money(value) : value}</strong><small>${isMoney ? 'للشهر المحدد' : 'أصناف تحت الحد'}</small></article>`).join(''); const chart = [['الإيرادات', data.revenue, 'var(--brand)'], ['COGS', data.cogs, 'var(--danger)'], ['المصروفات والرواتب', data.operating + data.salaries, 'var(--warning)'], ['صافي الربح', data.net, 'var(--brand-2)']]; const max = Math.max(...chart.map((x) => Math.abs(x[1])), 1); $('financialChart').innerHTML = chart.map(([label, value, color]) => `<div class="chart-row"><strong>${esc(label)}</strong><div class="bar-track"><div class="bar-fill" style="width:${Math.min(100, Math.round(Math.abs(value) / max * 100))}%;background:${color}"></div></div><span class="${value < 0 ? 'negative' : ''}">${money(value)}</span></div>`).join(''); const alerts = Object.values(all.items || {}).filter((x) => x.qty <= x.minLevel).map((x) => `الصنف ${x.name} وصل إلى حد إعادة الطلب (${x.qty} ${unitLabel(x.unitCategory, x.baseUnit)}).`); if (!alerts.length) alerts.push('لا توجد أصناف تحت حد إعادة الطلب.'); $('alertsList').innerHTML = alerts.slice(0, 6).map((x) => `<li>${esc(x)}</li>`).join(''); }

function fillProductSelects() { [['importItem','اختر الصنف'], ['exportItem','اختر الصنف']].forEach(([id, placeholder]) => { const select = $(id); const selected = select.value; select.innerHTML = `<option value="">${placeholder}</option>` + state.products.map((p) => `<option value="${esc(p.id)}">${esc(p.name)} (${esc(unitLabel(p.unitCategory, p.baseUnit))})</option>`).join(''); if (state.products.some((p) => p.id === selected)) select.value = selected; }); populateMovementUnits('importItem', 'importUnit'); populateMovementUnits('exportItem', 'exportUnit'); }
function filtered(rows, key, extra = '') { const query = filters[key]; return rows.filter((row) => !query || Object.values(row).some((value) => normalize(value).includes(query))).filter((row) => !extra || extra(row)); }
function actionButtons(key, id) { const printable = ['imports', 'exports', 'expenses'].includes(key) ? `<button class="print-btn" type="button" data-print="${esc(key)}" data-id="${esc(id)}">طباعة</button>` : ''; return `${printable}<button class="ghost-btn" type="button" data-edit="${esc(key)}" data-id="${esc(id)}">تعديل</button><button class="danger-btn" type="button" data-delete="${esc(key)}" data-id="${esc(id)}">حذف</button>`; }
function renderTables() { const inv = calculateInventory(); renderTable('inventory', Object.values(inv.items || {}), (row) => { const low = row.qty <= row.minLevel; return [esc(row.name), esc(row.category), num(row.qty).toFixed(2), esc(unitLabel(row.unitCategory, row.baseUnit)), money(row.avgCost), money(row.value), `<span class="status ${low ? 'status-warn' : 'status-ok'}">${low ? 'إعادة طلب' : 'جيد'}</span>`]; }, (row) => row.qty <= row.minLevel); renderTable('imports', state.imports, (row) => { const p = product(row.itemId); const total = landedCost(row); return [esc(row.date), esc(row.supplier), esc(p?.name || 'صنف محذوف'), `${num(row.enteredQty).toFixed(2)} ${esc(row.enteredUnit === 'base' ? unitLabel(p?.unitCategory, p?.baseUnit) : unitLabel(p?.unitCategory, row.enteredUnit))}`, `${num(row.qty).toFixed(2)} ${esc(unitLabel(p?.unitCategory, p?.baseUnit))}`, money(total)]; }); renderTable('exports', state.exports, (row) => { const p = product(row.itemId); const movement = inv.movements.find((x) => x.id === row.id); const cogs = movement?._cogs || 0; return [esc(row.date), esc(row.customer), esc(p?.name || 'صنف محذوف'), `${num(row.enteredQty).toFixed(2)} ${esc(row.enteredUnit === 'base' ? unitLabel(p?.unitCategory, p?.baseUnit) : unitLabel(p?.unitCategory, row.enteredUnit))}`, `${num(row.qty).toFixed(2)} ${esc(unitLabel(p?.unitCategory, p?.baseUnit))}`, money(row.revenue), money(cogs), `<span class="${row.revenue - cogs < 0 ? 'negative' : ''}">${money(row.revenue - cogs)}</span>`]; }); renderTable('expenses', state.expenses, (row) => [esc(row.date), esc(row.type), esc(row.description), money(row.amount), row.paymentStatus === 'paid' ? 'مدفوع' : 'مستحق']); renderTable('workers', state.payroll, (row) => [esc(row.month), esc(row.name), esc(row.role), money(row.salary), money(row.advance), money(row.salary - row.advance)]); renderTable('partners', state.partners, (row) => [esc(row.name), esc(row.type), esc(row.phone), esc(row.note || '-')]); }
function renderTable(key, rows, cells, highlight) { const config = tableConfig[key]; const filteredRows = filtered(rows, key); $(config.tbody).innerHTML = filteredRows.length ? filteredRows.map((row) => `<tr class="${highlight?.(row) ? 'warn-row' : ''}">${cells(row).map((cell) => `<td>${cell}</td>`).join('')}<td class="table-actions">${actionButtons(key, row.id)}</td></tr>`).join('') : `<tr><td colspan="12" class="empty">لا توجد بيانات مطابقة</td></tr>`; $(config.tbody).querySelectorAll('[data-delete]').forEach((button) => button.addEventListener('click', () => removeRecord(button.dataset.delete, button.dataset.id))); $(config.tbody).querySelectorAll('[data-edit]').forEach((button) => button.addEventListener('click', () => openEditModal(button.dataset.edit, button.dataset.id))); $(config.tbody).querySelectorAll('[data-print]').forEach((button) => button.addEventListener('click', () => printRecord(button.dataset.print, button.dataset.id))); }
function printRecord(type, id) {
  const record = state[type]?.find((item) => item.id === id); if (!record) return;
  const p = product(record.itemId); const number = `${type === 'exports' ? 'INV' : type === 'imports' ? 'GRN' : 'PV'}-${String(id).slice(0, 8).toUpperCase()}`;
  if (type === 'exports') { const total = num(record.revenue); const paid = num(record.paid); const cogs = calculateInventory().movements.find((item) => item.id === id)?._cogs || 0; printDocument('فاتورة مبيعات / تصدير', number, `<div class="info-grid"><div><b>العميل:</b> ${esc(record.customer)}</div><div><b>التاريخ:</b> ${esc(record.date)}</div><div><b>طريقة العملية:</b> بيع / تصدير</div><div><b>العملة:</b> ${esc(state.settings.currency)}</div></div><table><thead><tr><th>البيان</th><th>الكمية</th><th>الوحدة</th><th>الإجمالي</th></tr></thead><tbody><tr><td>${esc(p?.name || 'صنف محذوف')}</td><td>${num(record.enteredQty).toFixed(2)}</td><td>${esc(record.enteredUnit === 'base' ? unitLabel(p?.unitCategory, p?.baseUnit) : unitLabel(p?.unitCategory, record.enteredUnit))}</td><td>${money(total)}</td></tr></tbody></table><div class="totals"><div><span>الإجمالي</span><b>${money(total)}</b></div><div><span>المدفوع</span><b>${money(paid)}</b></div><div><span>المتبقي</span><b>${money(Math.max(0, total - paid))}</b></div></div><p class="note">هذه الفاتورة صادرة عن النظام الداخلي للمصنع. تكلفة البضاعة: ${money(cogs)}.</p>`); }
  if (type === 'imports') { const total = landedCost(record); printDocument('سند استلام مشتريات', number, `<div class="info-grid"><div><b>المورد:</b> ${esc(record.supplier)}</div><div><b>التاريخ:</b> ${esc(record.date)}</div><div><b>الصنف:</b> ${esc(p?.name || 'صنف محذوف')}</div><div><b>الوحدة الأساسية:</b> ${esc(unitLabel(p?.unitCategory, p?.baseUnit))}</div></div><table><thead><tr><th>الكمية المدخلة</th><th>الكمية الأساسية</th><th>سعر الشراء</th><th>الشحن</th><th>الجمارك</th><th>تكاليف أخرى</th><th>التكلفة الواصلة</th></tr></thead><tbody><tr><td>${num(record.enteredQty).toFixed(2)} ${esc(record.enteredUnit === 'base' ? unitLabel(p?.unitCategory, p?.baseUnit) : unitLabel(p?.unitCategory, record.enteredUnit))}</td><td>${num(record.qty).toFixed(2)} ${esc(unitLabel(p?.unitCategory, p?.baseUnit))}</td><td>${money(record.cost)}</td><td>${money(record.freight)}</td><td>${money(record.duty)}</td><td>${money(record.otherCost)}</td><td>${money(total)}</td></tr></tbody></table><div class="totals"><div><span>إجمالي التكلفة الواصلة</span><b>${money(total)}</b></div></div>`); }
  if (type === 'expenses') printDocument('سند صرف مصروفات', number, `<div class="info-grid"><div><b>التاريخ:</b> ${esc(record.date)}</div><div><b>الحالة:</b> ${record.paymentStatus === 'paid' ? 'مدفوع' : 'مستحق'}</div><div><b>نوع المصروف:</b> ${esc(record.type)}</div><div><b>الوصف:</b> ${esc(record.description)}</div></div><div class="totals"><div><span>المبلغ</span><b>${money(record.amount)}</b></div></div><p class="note">تم إنشاء هذا السند لتوثيق مصروف تشغيلي في سجلات المصنع.</p>`);
}
function printReport(type) {
  if (type === 'reports') { const data = periodData($('reportsMonth').value || monthKey()); printDocument('التقرير المالي الشهري', `REPORT-${$('reportsMonth').value || monthKey()}`, `<div class="info-grid"><div><b>الفترة:</b> ${esc($('reportsMonth').value || monthKey())}</div><div><b>العملة:</b> ${esc(state.settings.currency)}</div></div><table><thead><tr><th>المؤشر</th><th>القيمة</th></tr></thead><tbody>${[['الإيرادات', data.revenue],['تكلفة البضاعة المباعة', data.cogs],['المصروفات التشغيلية', data.operating],['الرواتب', data.salaries],['صافي الربح', data.net]].map(([label, value]) => `<tr><td>${label}</td><td>${money(value)}</td></tr>`).join('')}</tbody></table>`); return; }
  const rows = type === 'inventory' ? Object.values(calculateInventory().items || {}).map((item) => `<tr><td>${esc(item.name)}</td><td>${esc(item.category)}</td><td>${num(item.qty).toFixed(2)}</td><td>${esc(unitLabel(item.unitCategory, item.baseUnit))}</td><td>${money(item.avgCost)}</td><td>${money(item.value)}</td></tr>`).join('') : type === 'imports' ? activeRows(state.imports).map((item) => `<tr><td>${esc(item.date)}</td><td>${esc(item.supplier)}</td><td>${esc(product(item.itemId)?.name || '-')}</td><td>${num(item.qty).toFixed(2)}</td><td>${money(landedCost(item))}</td><td>${money(item.paid)}</td><td>${money(Math.max(0, landedCost(item) - num(item.paid)))}</td></tr>`).join('') : type === 'exports' ? activeRows(state.exports).map((item) => `<tr><td>${esc(item.date)}</td><td>${esc(item.customer)}</td><td>${esc(product(item.itemId)?.name || '-')}</td><td>${num(item.qty).toFixed(2)}</td><td>${money(item.revenue)}</td></tr>`).join('') : activeRows(state.expenses).map((item) => `<tr><td>${esc(item.date)}</td><td>${esc(item.type)}</td><td>${esc(item.description)}</td><td>${money(item.amount)}</td></tr>`).join('');
  const configs = { inventory: ['كشف المخزون', ['الصنف','الفئة','الرصيد','الوحدة','متوسط التكلفة','القيمة']], imports: ['سجل الواردات', ['التاريخ','المورد','الصنف','الكمية الأساسية','التكلفة الواصلة','المدفوع','المتبقي']], exports: ['سجل المبيعات والصادرات', ['التاريخ','العميل','الصنف','الكمية الأساسية','الإيراد']], expenses: ['سجل المصروفات', ['التاريخ','النوع','الوصف','المبلغ']] }; const [title, headers] = configs[type]; printDocument(title, `REPORT-${today()}`, `<table><thead><tr>${headers.map((header) => `<th>${header}</th>`).join('')}</tr></thead><tbody>${rows}</tbody></table>`);
}
const editModal = $('editModal');
const editForm = $('editForm');
function openEditModal(key, id) {
  const collection = key === 'workers' ? 'payroll' : key === 'inventory' ? 'products' : key; const record = state[collection]?.find((item) => item.id === id); if (!record) return;
  editForm.dataset.key = key; editForm.dataset.id = id;
  const fields = key === 'inventory' ? [['name','اسم الصنف','text'],['category','الفئة','text'],['minLevel','حد إعادة الطلب','number'],['openingCost','تكلفة الوحدة','number']] : key === 'imports' ? [['supplier','المورد','text'],['enteredQty','الكمية المدخلة','number'],['cost','سعر الشراء','number'],['freight','الشحن','number'],['duty','الجمارك','number'],['otherCost','تكاليف أخرى','number'],['paid','المدفوع للمورد','number'],['date','التاريخ','date']] : key === 'exports' ? [['customer','العميل','text'],['enteredQty','الكمية المدخلة','number'],['revenue','قيمة البيع','number'],['paid','المحصل','number'],['date','التاريخ','date']] : key === 'expenses' ? [['type','النوع','text'],['description','الوصف','text'],['amount','المبلغ','number'],['date','التاريخ','date']] : key === 'workers' ? [['name','العامل','text'],['role','الوظيفة','text'],['salary','الراتب','number'],['advance','السلفة','number'],['month','الشهر','month']] : [['name','الاسم','text'],['phone','الهاتف','text'],['note','ملاحظات','text']];
  $('editFields').innerHTML = fields.map(([name, label, type]) => `<label>${label}<input name="${name}" type="${type}" value="${esc(record[name] ?? '')}" required></label>`).join('');
  if (['imports','exports'].includes(key)) { const p = product(record.itemId); $('editFields').innerHTML += `<label>الصنف<select name="itemId">${state.products.map((item) => `<option value="${esc(item.id)}" ${item.id === record.itemId ? 'selected' : ''}>${esc(item.name)}</option>`).join('')}</select></label><label>الوحدة<select name="enteredUnit"><option value="base">${esc(unitLabel(p?.unitCategory, p?.baseUnit))} (أساسية)</option>${(p?.alternateUnits || []).map((unit) => `<option value="${esc(unit.id)}" ${unit.id === record.enteredUnit ? 'selected' : ''}>${esc(unit.label)}</option>`).join('')}</select></label>`; }
  editModal.setAttribute('aria-hidden', 'false'); document.body.style.overflow = 'hidden';
}
function closeEditModal() { editModal.setAttribute('aria-hidden', 'true'); document.body.style.overflow = ''; editForm.reset(); delete editForm.dataset.key; delete editForm.dataset.id; }
$('editCancel').addEventListener('click', closeEditModal); $('editModalClose').addEventListener('click', closeEditModal); editModal.addEventListener('click', (event) => { if (event.target === editModal) closeEditModal(); });
editForm.addEventListener('submit', async (event) => { event.preventDefault(); const key = editForm.dataset.key; const id = editForm.dataset.id; const collection = key === 'workers' ? 'payroll' : key === 'inventory' ? 'products' : key; const record = state[collection]?.find((item) => item.id === id); if (!record) return closeEditModal(); const data = new FormData(editForm); const updated = {}; for (const [field, value] of data.entries()) updated[field] = ['enteredQty','cost','freight','duty','otherCost','revenue','paid','amount','salary','advance','minLevel','openingCost'].includes(field) ? num(value) : value; if (['imports','exports'].includes(key)) { const p = product(updated.itemId || record.itemId); const factor = conversionFactor(p, updated.enteredUnit || record.enteredUnit); if (!p || !factor) return notify('الوحدة غير متوافقة مع الصنف', true); if (key === 'imports' && (updated.paid < 0 || updated.paid > landedCost({ ...record, ...updated }))) return notify('المدفوع للمورد لا يمكن أن يتجاوز التكلفة الواصلة', true); updated.itemId = p.id; updated.qty = num(updated.enteredQty) * factor; } const before = { ...record }; Object.assign(record, updated); const validation = calculateInventory(); if (validation.error) { Object.assign(record, before); return notify(validation.error, true); } closeEditModal(); await changed('تم تعديل السجل وإعادة احتساب المخزون والتقارير'); });
async function removeRecord(key, id) { if (!confirm('حذف السجل؟ سيتم إعادة احتساب الأرصدة والتقارير.')) return; if (key === 'inventory') { const used = state.imports.some((x) => x.itemId === id) || state.exports.some((x) => x.itemId === id) || state.production.some((x) => x.productId === id || x.materialId === id); if (used) return notify('لا يمكن حذف صنف مرتبط بحركات. احذفه من الاستخدام أو اتركه للأرشيف.', true); state.products = state.products.filter((x) => x.id !== id); } else { const collection = key === 'workers' ? 'payroll' : key; state[collection] = state[collection].filter((x) => x.id !== id); } await changed('تم حذف السجل وإعادة الحساب'); }

function renderReports() { const data = periodData($('reportsMonth').value || monthKey()); const metrics = [['الإيرادات', money(data.revenue)], ['تكلفة المبيعات', money(data.cogs)], ['المصروفات التشغيلية', money(data.operating)], ['الرواتب', money(data.salaries)], ['صافي الربح', money(data.net)]]; $('reportMetrics').innerHTML = metrics.map(([label, value]) => `<div class="metric-item"><span>${esc(label)}</span><strong>${esc(value)}</strong></div>`).join(''); const grouped = {}; data.expenses.forEach((x) => { grouped[x.type] = (grouped[x.type] || 0) + num(x.amount); }); const breakdown = Object.entries(grouped).sort((a, b) => b[1] - a[1]); $('expenseBreakdown').innerHTML = breakdown.length ? breakdown.map(([type, total]) => `<li>${esc(type)}: ${money(total)}</li>`).join('') : '<li>لا توجد مصروفات في الشهر المحدد</li>'; $('monthlySummary').innerHTML = [['الشهر', $('reportsMonth').value], ['المبيعات', money(data.revenue)], ['تكلفة المبيعات', money(data.cogs)], ['المصروفات', money(data.operating)], ['الرواتب', money(data.salaries)], ['صافي الربح', money(data.net)]].map(([label, value]) => `<div class="monthly-card"><span>${esc(label)}</span><strong class="${String(value).includes('-') ? 'negative' : ''}">${esc(value)}</strong></div>`).join(''); }


// Same-page print renderer: avoids popup blockers and keeps the user in the application.
function printDocument(title, number, body) {
  const existing = document.querySelector('.print-sheet');
  if (existing) existing.remove();
  const sheet = document.createElement('div');
  sheet.className = 'print-sheet';
  sheet.innerHTML = `<div class="print-page"><header class="print-header"><div class="print-brand"><h1>${esc(state.settings.factoryName)}</h1><p>الجمهورية الليبية — مستند تجاري</p><p>هاتف المصنع: ____________</p></div><div class="print-document"><h2>${esc(title)}</h2><div>رقم المستند: ${esc(number)}</div><div>تاريخ الإصدار: ${esc(today())}</div></div></header>${body}<div class="print-signature"><span>توقيع المسؤول</span><span>توقيع العميل / المورد</span></div><footer class="print-footer"><span>${esc(state.settings.factoryName)}</span><span>العملة: ${esc(state.settings.currency)} — مستند صادر من النظام</span></footer></div>`;
  document.body.appendChild(sheet);
  document.body.classList.add('printing-document');
  let cleaned = false;
  const cleanup = () => {
    if (cleaned) return;
    cleaned = true;
    sheet.remove();
    document.body.classList.remove('printing-document');
  };
  window.addEventListener('afterprint', cleanup, { once: true });
  window.setTimeout(() => window.print(), 80);
}


function activeRows(rows) { return (rows || []).filter((row) => !row.cancelled); }
function partnerKey(value) { return normalize(String(value ?? '').replace(/\s+/g, ' ')); }
function canonicalPartnerName(value, type) { const cleaned = String(value ?? '').replace(/\s+/g, ' ').trim(); if (!cleaned) return ''; const match = (state.partners || []).find((partner) => partner.type === type && partnerKey(partner.name) === partnerKey(cleaned)); return match ? match.name.trim() : cleaned; }
function fillPartnerSuggestions() { const customers = $('customerSuggestions'); const suppliers = $('supplierSuggestions'); if (customers) customers.innerHTML = state.partners.filter((partner) => partner.type === 'عميل').map((partner) => `<option value="${esc(partner.name.trim())}"></option>`).join(''); if (suppliers) suppliers.innerHTML = state.partners.filter((partner) => partner.type === 'مورد').map((partner) => `<option value="${esc(partner.name.trim())}"></option>`).join(''); }
function calculateInventory(source = state) {
  const result = {}; (source.production || []).forEach((x) => { x._cost = 0; }); source.products.forEach((p) => { result[p.id] = { ...p, qty: num(p.openingQty), value: num(p.openingQty) * num(p.openingCost), avgCost: num(p.openingCost), cogs: 0 }; });
  const movements = [];
  activeRows(source.imports).forEach((x) => movements.push({ ...x, kind: 'in', order: 1 }));
  activeRows(source.production).forEach((x) => { movements.push({ ...x, kind: 'production-out', itemId: x.materialId, qty: x.materialQty, order: 2 }); movements.push({ ...x, kind: 'production-in', itemId: x.productId, qty: x.quantity, order: 3 }); });
  activeRows(source.exports).forEach((x) => movements.push({ ...x, kind: 'out', order: 4 }));
  movements.sort((a, b) => `${a.date || ''}${a.order}${a.id}`.localeCompare(`${b.date || ''}${b.order}${b.id}`));
  for (const movement of movements) {
    const item = result[movement.itemId]; if (!item) continue;
    if (movement.kind === 'in') { const value = landedCost(movement); item.qty += num(movement.qty); item.value += value; item.avgCost = item.qty ? item.value / item.qty : 0; }
    else if (movement.kind === 'production-out' || movement.kind === 'out') { if (item.qty - num(movement.qty) < -0.000001) return { error: `الرصيد غير كافٍ للصنف: ${item.name}` }; const cogs = num(movement.qty) * item.avgCost; item.qty -= num(movement.qty); item.value -= cogs; item.cogs += cogs; item.avgCost = item.qty ? item.value / item.qty : 0; movement._cogs = cogs; if (movement.kind === 'production-out') { const production = source.production.find((x) => x.id === movement.id); if (production) production._cost = (production._cost || 0) + cogs; } }
    else if (movement.kind === 'production-in') { const production = source.production.find((x) => x.id === movement.id); const value = num(production?._cost); item.qty += num(movement.qty); item.value += value; item.avgCost = item.qty ? item.value / item.qty : 0; movement._cost = value; }
  }
  return { items: result, movements };
}
function populateProductionFields() {
  const productSelect = $('productionProduct'); const materialSelect = $('productionMaterial'); if (!productSelect || !materialSelect) return;
  const productValue = productSelect.value; const materialValue = materialSelect.value;
  const options = state.products.map((p) => `<option value="${esc(p.id)}">${esc(p.name)} (${esc(unitLabel(p.unitCategory, p.baseUnit))})</option>`).join('');
  productSelect.innerHTML = options; materialSelect.innerHTML = options; if (state.products.some((p) => p.id === productValue)) productSelect.value = productValue; if (state.products.some((p) => p.id === materialValue)) materialSelect.value = materialValue;
  populateMovementUnits('productionProduct', 'productionUnit'); populateMovementUnits('productionMaterial', 'productionMaterialUnit');
}
function fillProductSelects() { [['importItem','اختر الصنف'], ['exportItem','اختر الصنف']].forEach(([id, placeholder]) => { const select = $(id); const selected = select.value; select.innerHTML = `<option value="">${placeholder}</option>` + state.products.map((p) => `<option value="${esc(p.id)}">${esc(p.name)} (${esc(unitLabel(p.unitCategory, p.baseUnit))})</option>`).join(''); if (state.products.some((p) => p.id === selected)) select.value = selected; }); populateMovementUnits('importItem', 'importUnit'); populateMovementUnits('exportItem', 'exportUnit'); populateProductionFields(); fillPartnerSuggestions(); }
function actionButtons(key, id, row) { if (row?.cancelled) return '<span class="status status-warn">ملغاة</span>'; const transactional = ['imports','exports','expenses','production'].includes(key); const printable = ['imports','exports','expenses'].includes(key) ? `<button class="print-btn" type="button" data-print="${esc(key)}" data-id="${esc(id)}">طباعة</button>` : ''; const edit = key !== 'production' ? `<button class="ghost-btn" type="button" data-edit="${esc(key)}" data-id="${esc(id)}">تعديل</button>` : ''; const cancel = transactional ? `<button class="cancel-btn" type="button" data-cancel="${esc(key)}" data-id="${esc(id)}">إلغاء</button>` : `<button class="danger-btn" type="button" data-delete="${esc(key)}" data-id="${esc(id)}">حذف</button>`; return `${printable}${edit}${cancel}`; }
function renderTable(key, rows, cells, highlight) { const config = tableConfig[key]; const filteredRows = filtered(rows, key); $(config.tbody).innerHTML = filteredRows.length ? filteredRows.map((row) => `<tr class="${highlight?.(row) ? 'warn-row' : ''} ${row.cancelled ? 'cancelled-row' : ''}">${cells(row).map((cell) => `<td>${cell}</td>`).join('')}<td class="table-actions">${actionButtons(key, row.id, row)}</td></tr>`).join('') : `<tr><td colspan="14" class="empty">لا توجد بيانات مطابقة</td></tr>`; $(config.tbody).querySelectorAll('[data-cancel]').forEach((button) => button.addEventListener('click', () => cancelRecord(button.dataset.cancel, button.dataset.id))); $(config.tbody).querySelectorAll('[data-delete]').forEach((button) => button.addEventListener('click', () => removeRecord(button.dataset.delete, button.dataset.id))); $(config.tbody).querySelectorAll('[data-edit]').forEach((button) => button.addEventListener('click', () => openEditModal(button.dataset.edit, button.dataset.id))); $(config.tbody).querySelectorAll('[data-print]').forEach((button) => button.addEventListener('click', () => printRecord(button.dataset.print, button.dataset.id))); }
function renderTables() { const inv = calculateInventory(); renderTable('inventory', Object.values(inv.items || {}), (row) => { const low = row.qty <= row.minLevel; return [esc(row.name), esc(row.category), num(row.qty).toFixed(2), esc(unitLabel(row.unitCategory, row.baseUnit)), money(row.avgCost), money(row.value), `<span class="status ${low ? 'status-warn' : 'status-ok'}">${low ? 'إعادة طلب' : 'جيد'}</span>`]; }, (row) => row.qty <= row.minLevel); renderTable('imports', state.imports, (row) => { const p = product(row.itemId); const total = landedCost(row); return [esc(row.date), esc(row.supplier), esc(p?.name || 'صنف محذوف'), `${num(row.enteredQty).toFixed(2)} ${esc(row.enteredUnit === 'base' ? unitLabel(p?.unitCategory, p?.baseUnit) : unitLabel(p?.unitCategory, row.enteredUnit))}`, `${num(row.qty).toFixed(2)} ${esc(unitLabel(p?.unitCategory, p?.baseUnit))}`, money(total), money(row.paid), money(Math.max(0, total - num(row.paid)))]; }); renderTable('exports', state.exports, (row) => { const p = product(row.itemId); const movement = inv.movements.find((x) => x.id === row.id && x.kind === 'out'); const cogs = movement?._cogs || 0; return [esc(row.date), esc(row.customer), esc(p?.name || 'صنف محذوف'), `${num(row.enteredQty).toFixed(2)} ${esc(row.enteredUnit === 'base' ? unitLabel(p?.unitCategory, p?.baseUnit) : unitLabel(p?.unitCategory, row.enteredUnit))}`, `${num(row.qty).toFixed(2)} ${esc(unitLabel(p?.unitCategory, p?.baseUnit))}`, money(row.revenue), money(cogs), `<span class="${row.revenue - cogs < 0 ? 'negative' : ''}">${money(row.revenue - cogs)}</span>`]; }); renderTable('expenses', state.expenses, (row) => [esc(row.date), esc(row.type), esc(row.description), money(row.amount), row.paymentStatus === 'paid' ? 'مدفوع' : 'مستحق']); renderTable('workers', state.payroll, (row) => [esc(row.month), esc(row.name), esc(row.role), money(row.salary), money(row.advance), money(row.salary - row.advance)]); renderTable('partners', state.partners, (row) => [esc(row.name), esc(row.type), esc(row.phone), esc(row.note || '-')]); renderProductionTable(); renderReceivables(); }
function renderProductionTable() { const body = $('productionTable'); if (!body) return; body.innerHTML = state.production.length ? state.production.map((row) => { const p = product(row.productId); const m = product(row.materialId); return `<tr class="${row.cancelled ? 'cancelled-row' : ''}"><td>${esc(row.date)}</td><td>${esc(row.reference)}</td><td>${esc(p?.name || '-')} ${num(row.quantity).toFixed(2)} ${esc(unitLabel(p?.unitCategory, p?.baseUnit))}</td><td>${num(row.enteredQuantity).toFixed(2)} ${esc(unitLabel(p?.unitCategory, row.enteredUnit))}</td><td>${esc(m?.name || '-')} ${num(row.materialQty).toFixed(2)} ${esc(unitLabel(m?.unitCategory, m?.baseUnit))}</td><td>${money(row._cost || 0)}</td><td>${row.cancelled ? '<span class="status status-warn">ملغى</span>' : '<span class="status status-ok">مسجل</span>'}</td><td class="table-actions">${actionButtons('production', row.id, row)}</td></tr>`; }).join('') : '<tr><td colspan="8" class="empty">لا توجد أوامر إنتاج</td></tr>'; body.querySelectorAll('[data-cancel]').forEach((button) => button.addEventListener('click', () => cancelRecord('production', button.dataset.id))); }
function renderReceivables() { const customers = {}; activeRows(state.exports).forEach((x) => { customers[x.customer] ||= { total: 0, paid: 0 }; customers[x.customer].total += num(x.revenue); customers[x.customer].paid += num(x.paid); }); const suppliers = {}; activeRows(state.imports).forEach((x) => { const total = landedCost(x); suppliers[x.supplier] ||= { total: 0, paid: 0 }; suppliers[x.supplier].total += total; suppliers[x.supplier].paid += num(x.paid); }); const customerRows = Object.entries(customers); const supplierRows = Object.entries(suppliers); $('customerDebtsTable').innerHTML = customerRows.length ? customerRows.map(([name, x]) => `<tr><td>${esc(name)}</td><td>${money(x.total)}</td><td>${money(x.paid)}</td><td>${money(Math.max(0, x.total - x.paid))}</td></tr>`).join('') : '<tr><td colspan="4" class="empty">لا توجد ذمم عملاء</td></tr>'; $('supplierDebtsTable').innerHTML = supplierRows.length ? supplierRows.map(([name, x]) => `<tr><td>${esc(name)}</td><td>${money(x.total)}</td><td>${money(x.paid)}</td><td>${money(Math.max(0, x.total - x.paid))}</td></tr>`).join('') : '<tr><td colspan="4" class="empty">لا توجد ذمم موردين</td></tr>'; const receivable = sum(customerRows.map(([, x]) => x.total - x.paid)); const payable = sum(supplierRows.map(([, x]) => x.total - x.paid)); $('receivableStats').innerHTML = [['المستحق على العملاء', receivable], ['المستحق للموردين', payable], ['صافي الذمم', receivable - payable]].map(([label, value]) => `<article class="stat-card"><span>${label}</span><strong class="${value < 0 ? 'negative' : ''}">${money(value)}</strong></article>`).join(''); }
async function cancelRecord(key, id) { const collection = key === 'production' ? 'production' : key; const record = state[collection]?.find((x) => x.id === id); if (!record || record.cancelled) return; if (!confirm('سيتم إلغاء العملية وحفظها في السجل دون احتسابها في المخزون والتقارير. هل تريد المتابعة؟')) return; record.cancelled = true; const validation = calculateInventory(); if (validation.error) { record.cancelled = false; return notify(validation.error, true); } await changed('تم إلغاء العملية مع الاحتفاظ بسجلها'); }
function periodData(month) { const inv = calculateInventory(); const exports = activeRows(state.exports).filter((x) => monthKey(x.date) === month); const imports = activeRows(state.imports).filter((x) => monthKey(x.date) === month); const expenses = activeRows(state.expenses).filter((x) => monthKey(x.date) === month); const payroll = state.payroll.filter((x) => x.month === month); const revenue = sum(exports.map((x) => x.revenue)); const cogs = sum(exports.map((x) => { const item = inv.movements.find((m) => m.id === x.id && m.kind === 'out'); return item?._cogs || 0; })); const operating = sum(expenses.map((x) => x.amount)); const salaries = sum(payroll.map((x) => x.salary)); return { exports, imports, expenses, payroll, revenue, cogs, operating, salaries, net: revenue - cogs - operating - salaries, inv }; }
function renderAll() { renderSettings(); renderDashboard(); renderTables(); renderReports(); fillProductSelects(); }

$('productionProduct')?.addEventListener('change', () => populateMovementUnits('productionProduct', 'productionUnit'));
$('productionMaterial')?.addEventListener('change', () => populateMovementUnits('productionMaterial', 'productionMaterialUnit'));
