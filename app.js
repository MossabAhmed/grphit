const STORAGE_KEY = 'graphite-factory-dashboard-v1';

const currencyFormatter = (currency) => new Intl.NumberFormat('ar', {
  style: 'currency',
  currency: currency || 'USD',
  maximumFractionDigits: 2,
});

// Polyfill lightweight UUID generator when crypto.randomUUID is not available
if (typeof crypto === 'undefined' || typeof crypto.randomUUID !== 'function') {
  if (typeof crypto === 'undefined') window.crypto = {};
  crypto.randomUUID = function () {
    const s4 = () => Math.floor((1 + Math.random()) * 0x10000).toString(16).substring(1);
    return `${Date.now().toString(16)}-${s4()}-${s4()}-${s4()}-${s4()}${s4()}${s4()}`;
  };
}

const defaults = {
  settings: {
    factoryName: 'مصنع الجرافيت',
    currency: 'LYD',
    taxRate: 15,
  },
  inventory: [
    { id: crypto.randomUUID(), name: 'مسحوق جرافيت', category: 'خام', qty: 42, unit: 'طن', minLevel: 10 },
    { id: crypto.randomUUID(), name: 'قوالب ضغط', category: 'معدات', qty: 8, unit: 'قطعة', minLevel: 3 },
    { id: crypto.randomUUID(), name: 'منتج نهائي A', category: 'نهائي', qty: 120, unit: 'صندوق', minLevel: 30 },
  ],
  imports: [
    { id: crypto.randomUUID(), supplier: 'شركة الشرق', item: 'مسحوق جرافيت', qty: 20, cost: 25000, date: todayOffset(-10) },
    { id: crypto.randomUUID(), supplier: 'مؤسسة النور', item: 'قطع غيار', qty: 12, cost: 4800, date: todayOffset(-5) },
  ],
  exports: [
    { id: crypto.randomUUID(), customer: 'مصنع البناء الحديث', item: 'منتج نهائي A', qty: 30, revenue: 18600, date: todayOffset(-8) },
    { id: crypto.randomUUID(), customer: 'شركة المواد الصناعية', item: 'منتج نهائي B', qty: 18, revenue: 14100, date: todayOffset(-3) },
  ],
  expenses: [
    { id: crypto.randomUUID(), type: 'كهرباء', description: 'فاتورة التشغيل الشهرية', amount: 4200, date: todayOffset(-7) },
    { id: crypto.randomUUID(), type: 'صيانة', description: 'صيانة خط الإنتاج', amount: 5600, date: todayOffset(-2) },
    { id: crypto.randomUUID(), type: 'نقل', description: 'شحن داخلي', amount: 900, date: todayOffset(-1) },
  ],
  workers: [
    { id: crypto.randomUUID(), name: 'أحمد سالم', role: 'مشرف إنتاج', salary: 9500, advance: 1500 },
    { id: crypto.randomUUID(), name: 'محمود علي', role: 'فني تشغيل', salary: 7200, advance: 0 },
    { id: crypto.randomUUID(), name: 'سعيد حسن', role: 'عامل تعبئة', salary: 5600, advance: 600 },
  ],
  partners: [
    { id: crypto.randomUUID(), name: 'شركة الشرق', type: 'مورد', phone: '0123456789', note: 'مورد المواد الخام' },
    { id: crypto.randomUUID(), name: 'مصنع البناء الحديث', type: 'عميل', phone: '0112233445', note: 'عميل دوري' },
  ],
};

const state = loadState();
state.settings.currency = 'LYD';
let activeFilters = {
  inventory: '',
  imports: '',
  exports: '',
  expenses: '',
  workers: '',
  partners: '',
};

const sections = {
  dashboard: document.getElementById('dashboardSection'),
  inventory: document.getElementById('inventorySection'),
  imports: document.getElementById('importsSection'),
  exports: document.getElementById('exportsSection'),
  expenses: document.getElementById('expensesSection'),
  workers: document.getElementById('workersSection'),
  partners: document.getElementById('partnersSection'),
  reports: document.getElementById('reportsSection'),
  settings: document.getElementById('settingsSection'),
};

const tableConfigs = {
  inventory: {
    tbody: document.getElementById('inventoryTable'),
    search: document.getElementById('inventorySearch'),
    fields: ['name', 'category'],
  },
  imports: {
    tbody: document.getElementById('importsTable'),
    search: document.getElementById('importsSearch'),
    fields: ['supplier', 'item'],
  },
  exports: {
    tbody: document.getElementById('exportsTable'),
    search: document.getElementById('exportsSearch'),
    fields: ['customer', 'item'],
  },
  expenses: {
    tbody: document.getElementById('expensesTable'),
    search: document.getElementById('expensesSearch'),
    fields: ['type', 'description'],
  },
  workers: {
    tbody: document.getElementById('workersTable'),
    search: document.getElementById('workersSearch'),
    fields: ['name', 'role'],
  },
  partners: {
    tbody: document.getElementById('partnersTable'),
    search: document.getElementById('partnersSearch'),
    fields: ['name', 'type', 'phone', 'note'],
  },
};

const recordSchemas = {
  inventory: [
    { key: 'name', label: 'اسم الصنف', type: 'text' },
    { key: 'category', label: 'الفئة', type: 'text' },
    { key: 'qty', label: 'الكمية', type: 'number' },
    { key: 'unit', label: 'الوحدة', type: 'text' },
    { key: 'minLevel', label: 'حد النقص', type: 'number' },
  ],
  imports: [
    { key: 'supplier', label: 'المورد', type: 'text' },
    { key: 'item', label: 'العنصر', type: 'text' },
    { key: 'qty', label: 'الكمية', type: 'number' },
    { key: 'cost', label: 'التكلفة', type: 'number' },
    { key: 'date', label: 'التاريخ', type: 'date' },
  ],
  exports: [
    { key: 'customer', label: 'العميل', type: 'text' },
    { key: 'item', label: 'المنتج', type: 'text' },
    { key: 'qty', label: 'الكمية', type: 'number' },
    { key: 'revenue', label: 'الإيراد', type: 'number' },
    { key: 'date', label: 'التاريخ', type: 'date' },
  ],
  expenses: [
    { key: 'type', label: 'نوع المصروف', type: 'text' },
    { key: 'description', label: 'الوصف', type: 'text' },
    { key: 'amount', label: 'المبلغ', type: 'number' },
    { key: 'date', label: 'التاريخ', type: 'date' },
  ],
  workers: [
    { key: 'name', label: 'اسم العامل', type: 'text' },
    { key: 'role', label: 'الوظيفة', type: 'text' },
    { key: 'salary', label: 'الراتب الشهري', type: 'number' },
    { key: 'advance', label: 'السلفة', type: 'number' },
  ],
  partners: [
    { key: 'name', label: 'الاسم', type: 'text' },
    { key: 'type', label: 'النوع', type: 'text' },
    { key: 'phone', label: 'الهاتف', type: 'text' },
    { key: 'note', label: 'ملاحظات', type: 'text' },
  ],
};

const reportMonthInput = document.getElementById('reportsMonth');
const monthlySummaryContainer = document.getElementById('monthlySummary');

attachNavigation();
attachForms();
attachSearch();
attachActions();
renderAll();

function loadState() {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (!saved) {
    return structuredClone(defaults);
  }

  try {
    const parsed = JSON.parse(saved);
    return mergeState(defaults, parsed);
  } catch {
    return structuredClone(defaults);
  }
}

function mergeState(base, saved) {
  return {
    settings: { ...base.settings, ...(saved.settings || {}) },
    inventory: Array.isArray(saved.inventory) ? saved.inventory : structuredClone(base.inventory),
    imports: Array.isArray(saved.imports) ? saved.imports : structuredClone(base.imports),
    exports: Array.isArray(saved.exports) ? saved.exports : structuredClone(base.exports),
    expenses: Array.isArray(saved.expenses) ? saved.expenses : structuredClone(base.expenses),
    workers: Array.isArray(saved.workers) ? saved.workers : structuredClone(base.workers),
    partners: Array.isArray(saved.partners) ? saved.partners : structuredClone(base.partners),
  };
}

function persistState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function renderAll() {
  renderSettingsForm();
  renderDashboard();
  renderTables();
  renderReports();
  persistState();
}

function attachNavigation() {
  document.querySelectorAll('.nav-item').forEach((button) => {
    button.addEventListener('click', () => {
      const sectionName = button.dataset.section;
      document.querySelectorAll('.nav-item').forEach((item) => item.classList.remove('active'));
      button.classList.add('active');
      Object.entries(sections).forEach(([name, section]) => {
        section.classList.toggle('active-section', name === sectionName);
      });
    });
  });
}

function attachForms() {
  document.getElementById('inventoryForm').addEventListener('submit', (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    state.inventory.unshift({
      id: crypto.randomUUID(),
      name: form.name.value.trim(),
      category: form.category.value.trim(),
      qty: Number(form.qty.value),
      unit: form.unit.value.trim(),
      minLevel: Number(form.minLevel.value),
    });
    form.reset();
    renderAll();
  });

  document.getElementById('importsForm').addEventListener('submit', (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    state.imports.unshift({
      id: crypto.randomUUID(),
      supplier: form.supplier.value.trim(),
      item: form.item.value.trim(),
      qty: Number(form.qty.value),
      cost: Number(form.cost.value),
      date: form.date.value,
    });
    form.reset();
    renderAll();
  });

  document.getElementById('exportsForm').addEventListener('submit', (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    state.exports.unshift({
      id: crypto.randomUUID(),
      customer: form.customer.value.trim(),
      item: form.item.value.trim(),
      qty: Number(form.qty.value),
      revenue: Number(form.revenue.value),
      date: form.date.value,
    });
    form.reset();
    renderAll();
  });

  document.getElementById('expensesForm').addEventListener('submit', (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    state.expenses.unshift({
      id: crypto.randomUUID(),
      type: form.type.value.trim(),
      description: form.description.value.trim(),
      amount: Number(form.amount.value),
      date: form.date.value,
    });
    form.reset();
    renderAll();
  });

  document.getElementById('workersForm').addEventListener('submit', (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    state.workers.unshift({
      id: crypto.randomUUID(),
      name: form.name.value.trim(),
      role: form.role.value.trim(),
      salary: Number(form.salary.value),
      advance: Number(form.advance.value || 0),
    });
    form.reset();
    renderAll();
  });

  document.getElementById('partnersForm').addEventListener('submit', (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    state.partners.unshift({
      id: crypto.randomUUID(),
      name: form.name.value.trim(),
      type: form.type.value,
      phone: form.phone.value.trim(),
      note: form.note.value.trim(),
    });
    form.reset();
    renderAll();
  });

  document.getElementById('settingsForm').addEventListener('submit', (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    state.settings.factoryName = form.factoryName.value.trim() || defaults.settings.factoryName;
    state.settings.currency = 'LYD';
    state.settings.taxRate = Number(form.taxRate.value || defaults.settings.taxRate);
    renderAll();
    alert('تم حفظ الإعدادات بنجاح');
  });
}

function attachSearch() {
  Object.entries(tableConfigs).forEach(([key, config]) => {
    config.search.addEventListener('input', (event) => {
      activeFilters[key] = normalizeSearchText(event.target.value);
      renderTables();
    });
  });
}

function attachActions() {
  reportMonthInput.value = currentMonthKey();
  reportMonthInput.addEventListener('change', renderReports);

  document.getElementById('resetDemoBtn').addEventListener('click', () => {
    const confirmReset = confirm('سيتم استبدال البيانات الحالية ببيانات تجريبية. هل تريد المتابعة؟');
    if (!confirmReset) return;
    Object.assign(state, structuredClone(defaults));
    renderAll();
  });

  document.getElementById('exportDataBtn').addEventListener('click', () => {
    const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'graphite-factory-data.json';
    link.click();
    URL.revokeObjectURL(url);
  });

  document.getElementById('importDataInput').addEventListener('change', async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      // Merge safely but prevent imported file from changing the enforced currency
      const merged = mergeState(defaults, parsed);
      if (merged.settings) delete merged.settings.currency;
      Object.assign(state, merged);
      // enforce local currency to LYD
      state.settings.currency = 'LYD';
      renderAll();
      event.target.value = '';
    } catch {
      alert('تعذر قراءة الملف. تأكد أنه ملف JSON صحيح.');
    }
  });
}

function renderSettingsForm() {
  const form = document.getElementById('settingsForm');
  form.factoryName.value = state.settings.factoryName;
  form.currency.value = 'LYD';
  form.currency.readOnly = true;
  form.taxRate.value = state.settings.taxRate;
  document.querySelector('.topbar h2').textContent = `${state.settings.factoryName} - مؤشرات المصنع والعمليات اليومية`;
}

function renderDashboard() {
  const revenue = sum(state.exports.map((entry) => entry.revenue));
  const expenses = sum(state.expenses.map((entry) => entry.amount));
  const importsCost = sum(state.imports.map((entry) => entry.cost));
  const payroll = sum(state.workers.map((entry) => entry.salary - entry.advance));
  const netProfit = revenue - expenses - payroll;
  const lowStock = state.inventory.filter((item) => item.qty <= item.minLevel).length;

  const stats = [
    { label: 'إجمالي الإيرادات', value: revenue, money: true },
    { label: 'إجمالي المصاريف', value: expenses + payroll, money: true },
    { label: 'صافي الربح', value: netProfit, money: true },
    { label: 'تنبيهات المخزون', value: lowStock, money: false },
  ];

  const currency = currencyFormatter(state.settings.currency);
  document.getElementById('statsGrid').innerHTML = stats.map((item) => `
    <article class="stat-card">
      <span>${item.label}</span>
      <strong>${item.money ? currency.format(item.value) : item.value}</strong>
      <small>${item.label === 'تنبيهات المخزون' ? 'أصناف تحتاج متابعة' : 'محدثة الآن'}</small>
    </article>
  `).join('');

  document.getElementById('financialChart').innerHTML = [
    ['الإيرادات', revenue, 'var(--brand)'],
    ['المصاريف', expenses + payroll, 'var(--danger)'],
    ['الواردات', importsCost, 'var(--brand-2)'],
    ['صافي الربح', Math.max(netProfit, 0), '#a78bfa'],
  ].map(([label, value, color]) => {
    const max = Math.max(revenue, expenses + payroll, importsCost, Math.max(netProfit, 0), 1);
    const width = Math.round((value / max) * 100);
    return `
      <div class="chart-row">
        <strong>${label}</strong>
        <div class="bar-track"><div class="bar-fill" style="width:${width}%; background:${color};"></div></div>
        <span>${currency.format(value)}</span>
      </div>
    `;
  }).join('');

  const alerts = [];
  state.inventory
    .filter((item) => item.qty <= item.minLevel)
    .slice(0, 3)
    .forEach((item) => alerts.push(`الصنف ${item.name} وصل إلى الحد الأدنى.`));
  if (!alerts.length) alerts.push('لا توجد تنبيهات حرجة حالياً.');
  alerts.push(`إجمالي الواردات المسجلة: ${currency.format(importsCost)}.`);

  document.getElementById('alertsList').innerHTML = alerts.map((message) => `<li>${message}</li>`).join('');
}

function renderTables() {
  renderTable('inventory', state.inventory, (item) => [
    item.name,
    item.category,
    `${item.qty} ${item.unit}`,
    item.minLevel,
  ], (item) => item.qty <= item.minLevel);

  renderTable('imports', state.imports, (item) => [
    item.date,
    item.supplier,
    item.item,
    item.qty,
    money(item.cost),
  ]);

  renderTable('exports', state.exports, (item) => [
    item.date,
    item.customer,
    item.item,
    item.qty,
    money(item.revenue),
  ]);

  renderTable('expenses', state.expenses, (item) => [
    item.date,
    item.type,
    item.description,
    money(item.amount),
  ]);

  renderTable('workers', state.workers, (item) => [
    item.name,
    item.role,
    money(item.salary),
    money(item.advance),
    money(item.salary - item.advance),
  ]);

  renderTable('partners', state.partners, (item) => [
    item.name,
    item.type,
    item.phone,
    item.note || '-',
  ]);
}

function renderTable(key, rows, mapCells, highlightFn) {
  const config = tableConfigs[key];
  const query = activeFilters[key];
  const filtered = rows.filter((row) => {
    if (!query) return true;
    return Object.values(row).some((value) => normalizeSearchText(value).includes(query));
  });

  config.tbody.innerHTML = filtered.length
    ? filtered.map((row) => `
      <tr class="${highlightFn?.(row) ? 'warn-row' : ''}">
        ${mapCells(row).map((cell) => `<td>${cell}</td>`).join('')}
        <td>
          <div class="table-actions">
            <button class="ghost-btn" type="button" data-edit="${key}" data-id="${row.id}">تعديل</button>
            ${key === 'exports' ? `<button class="ghost-btn" type="button" data-print="invoice" data-id="${row.id}">طباعة فاتورة</button>` : ''}
            ${key === 'workers' ? `<button class="ghost-btn" type="button" data-print="payroll" data-id="${row.id}">طباعة راتب</button>` : ''}
            <button class="danger-btn" type="button" data-delete="${key}" data-id="${row.id}">حذف</button>
          </div>
        </td>
      </tr>
    `).join('')
    : `<tr><td colspan="${mapCells(rows[0] || {}).length + 1}">لا توجد بيانات مطابقة</td></tr>`;

  config.tbody.querySelectorAll('[data-edit]').forEach((button) => {
    button.addEventListener('click', () => openEditModal(button.dataset.edit, button.dataset.id));
  });

  config.tbody.querySelectorAll('[data-print]').forEach((button) => {
    button.addEventListener('click', () => printRecord(button.dataset.print, key, button.dataset.id));
  });

  config.tbody.querySelectorAll('[data-delete]').forEach((button) => {
    button.addEventListener('click', () => removeRecord(button.dataset.delete, button.dataset.id));
  });
}

// Modal-based editing
const editModal = document.getElementById('editModal');
const editForm = document.getElementById('editForm');
const editFields = document.getElementById('editFields');
const editCancel = document.getElementById('editCancel');
const editModalClose = document.getElementById('editModalClose');

function openEditModal(key, id) {
  const record = state[key].find((item) => item.id === id);
  if (!record) return;
  editFields.innerHTML = '';
  editForm.dataset.key = key;
  editForm.dataset.id = id;

  for (const field of recordSchemas[key]) {
    const wrapper = document.createElement('div');
    const input = document.createElement(field.type === 'number' ? 'input' : 'input');
    input.name = field.key;
    input.placeholder = field.label;
    if (field.type === 'number') input.type = 'number';
    if (field.type === 'date') input.type = 'date';
    input.value = record[field.key] ?? '';
    wrapper.appendChild(input);
    editFields.appendChild(wrapper);
  }

  editModal.setAttribute('aria-hidden', 'false');
  document.body.style.overflow = 'hidden';
}

function closeEditModal() {
  editModal.setAttribute('aria-hidden', 'true');
  document.body.style.overflow = '';
  editFields.innerHTML = '';
  delete editForm.dataset.key;
  delete editForm.dataset.id;
}

editCancel.addEventListener('click', closeEditModal);
editModalClose.addEventListener('click', closeEditModal);
editModal.addEventListener('click', (e) => { if (e.target === editModal) closeEditModal(); });

editForm.addEventListener('submit', (e) => {
  e.preventDefault();
  const key = editForm.dataset.key;
  const id = editForm.dataset.id;
  if (!key || !id) return closeEditModal();
  const formData = new FormData(editForm);
  const updated = {};
  for (const field of recordSchemas[key]) {
    let val = formData.get(field.key);
    if (field.type === 'number') {
      val = Number(val);
      if (!Number.isFinite(val)) val = 0;
    }
    updated[field.key] = val;
  }
  // keep other fields intact (like id, date when not present)
  state[key] = state[key].map((item) => item.id === id ? { ...item, ...updated } : item);
  closeEditModal();
  renderAll();
});

function printRecord(mode, key, id) {
  const record = state[key].find((item) => item.id === id);
  if (!record) return;

  const currency = currencyFormatter(state.settings.currency);
  const content = mode === 'invoice'
    ? `
      <div class="print-card">
        <h1>فاتورة تصدير</h1>
        <p>المصنع: ${state.settings.factoryName}</p>
        <p>العميل: ${record.customer}</p>
        <p>المنتج: ${record.item}</p>
        <p>الكمية: ${record.qty}</p>
        <p>الإيراد: ${currency.format(record.revenue)}</p>
        <p>التاريخ: ${record.date}</p>
      </div>
    `
    : `
      <div class="print-card">
        <h1>كشف راتب</h1>
        <p>المصنع: ${state.settings.factoryName}</p>
        <p>العامل: ${record.name}</p>
        <p>الوظيفة: ${record.role}</p>
        <p>الراتب: ${currency.format(record.salary)}</p>
        <p>السلفة: ${currency.format(record.advance)}</p>
        <p>الصافي: ${currency.format(record.salary - record.advance)}</p>
      </div>
    `;

  const popup = window.open('', '_blank', 'width=900,height=700');
  if (!popup) {
    // popup blocked — fallback to hidden iframe printing
    try {
      const iframe = document.createElement('iframe');
      iframe.style.display = 'none';
      document.body.appendChild(iframe);
      const doc = iframe.contentDocument || iframe.contentWindow.document;
      doc.open();
      doc.write(`
        <!doctype html>
        <html lang="ar" dir="rtl">
        <head>
          <meta charset="UTF-8" />
          <title>طباعة</title>
          <style>body{font-family: Cairo, sans-serif; padding:40px; color:#102235;} .print-card{border:1px solid #d7e1ec;border-radius:18px;padding:24px;max-width:640px;margin:0 auto;} h1{margin-top:0;} p{font-size:18px;line-height:1.8;}</style>
        </head>
        <body>${content}</body>
        </html>
      `);
      doc.close();
      iframe.contentWindow.focus();
      iframe.contentWindow.print();
      setTimeout(() => document.body.removeChild(iframe), 1500);
    } catch (e) {
      alert('تعذر فتح نافذة الطباعة أو الطباعة من الإطار.');
    }
    return;
  }
  popup.document.write(`
    <!doctype html>
    <html lang="ar" dir="rtl">
    <head>
      <meta charset="UTF-8" />
      <title>طباعة</title>
      <style>
        body { font-family: 'Cairo', sans-serif; padding: 40px; color: #102235; }
        .print-card { border: 1px solid #d7e1ec; border-radius: 18px; padding: 24px; max-width: 640px; margin: 0 auto; }
        h1 { margin-top: 0; }
        p { font-size: 18px; line-height: 1.8; }
      </style>
    </head>
    <body>${content}</body>
    </html>
  `);
  popup.document.close();
  popup.focus();
  popup.print();
}

function removeRecord(key, id) {
  if (!confirm('هل تريد حذف هذا السجل؟')) return;
  state[key] = state[key].filter((item) => item.id !== id);
  renderAll();
}

function renderReports() {
  const selectedMonth = reportMonthInput.value || currentMonthKey();
  const revenue = sum(state.exports.map((entry) => entry.revenue));
  const expenses = sum(state.expenses.map((entry) => entry.amount));
  const payroll = sum(state.workers.map((entry) => entry.salary - entry.advance));
  const importsCost = sum(state.imports.map((entry) => entry.cost));
  const net = revenue - expenses - payroll;
  const currency = currencyFormatter(state.settings.currency);

  const metrics = [
    ['الإيرادات', currency.format(revenue)],
    ['الواردات', currency.format(importsCost)],
    ['المصاريف التشغيلية', currency.format(expenses + payroll)],
    ['صافي الربح', currency.format(net)],
  ];

  document.getElementById('reportMetrics').innerHTML = metrics.map(([label, value]) => `
    <div class="metric-item"><span>${label}</span><strong>${value}</strong></div>
  `).join('');

  const expensesByType = Object.entries(
    state.expenses.reduce((acc, item) => {
      acc[item.type] = (acc[item.type] || 0) + item.amount;
      return acc;
    }, {})
  ).sort((a, b) => b[1] - a[1]).slice(0, 5);

  document.getElementById('expenseBreakdown').innerHTML = expensesByType.length
    ? expensesByType.map(([type, total]) => `<li>${type}: ${currency.format(total)}</li>`).join('')
    : '<li>لا توجد مصاريف مسجلة</li>';

  renderMonthlySummary(selectedMonth, currency);
}

function renderMonthlySummary(selectedMonth, currency) {
  const monthExports = state.exports.filter((entry) => entry.date?.startsWith(selectedMonth));
  const monthImports = state.imports.filter((entry) => entry.date?.startsWith(selectedMonth));
  const monthExpenses = state.expenses.filter((entry) => entry.date?.startsWith(selectedMonth));
  const exportTotal = sum(monthExports.map((entry) => entry.revenue));
  const importTotal = sum(monthImports.map((entry) => entry.cost));
  const expenseTotal = sum(monthExpenses.map((entry) => entry.amount));
  const payrollTotal = sum(state.workers.map((entry) => entry.salary - entry.advance));
  const netTotal = exportTotal - importTotal - expenseTotal - payrollTotal;

  monthlySummaryContainer.innerHTML = [
    ['الشهر', selectedMonth],
    ['إجمالي الصادرات', currency.format(exportTotal)],
    ['إجمالي الواردات', currency.format(importTotal)],
    ['إجمالي المصاريف', currency.format(expenseTotal)],
    ['الرواتب الحالية', currency.format(payrollTotal)],
    ['الصافي الشهري', currency.format(netTotal)],
  ].map(([label, value]) => `
    <div class="monthly-card">
      <span>${label}</span>
      <strong>${value}</strong>
    </div>
  `).join('');
}

function sum(values) {
  return values.reduce((total, value) => total + Number(value || 0), 0);
}

function money(amount) {
  return currencyFormatter(state.settings.currency).format(Number(amount || 0));
}

function todayOffset(days) {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}

function currentMonthKey() {
  return new Date().toISOString().slice(0, 7);
}

function normalizeSearchText(value) {
  return String(value ?? '')
    .normalize('NFKD')
    .replace(/[\u064b-\u065f\u0670\u0640]/g, '')
    // unify hamza variations to bare alef
    .replace(/[أإآ]/g, 'ا')
    // convert alif maqsura to ya
    .replace(/ى/g, 'ي')
    // remove tatweel
    .replace(/ـ/g, '')
    // convert Arabic-Indic digits to Latin digits
    .replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)))
    .toLowerCase()
    .trim();
}
