/* ============ Планувальник меню — app.js ============ */
'use strict';

const STORAGE_KEY = 'meal-planner-v1';
const DAYS = ['Понеділок', 'Вівторок', 'Середа', 'Четвер', 'Пʼятниця', 'Субота', 'Неділя'];
const UNITS = ['г', 'кг', 'мл', 'л', 'шт'];
const TABS = [
  ['pantry', '🥫 Комора'],
  ['recipes', '📖 Рецепти'],
  ['menu', '📅 Меню на тиждень'],
  ['shopping', '🛒 Список покупок'],
  ['data', '💾 Дані'],
];

/* ---------- Стан ---------- */
// pantry: [{id,name,qty,unit}]
// dishes: [{id,name,desc,ingredients:[{productId,qty}]}]
// menu:   {0..6: [{id,dishId,snap:[{productId,qty}]}]}  snap = що саме списано (для точного повернення)
let state = load();
let currentTab = 'pantry';

function emptyState() {
  return { pantry: [], dishes: [], menu: { 0: [], 1: [], 2: [], 3: [], 4: [], 5: [], 6: [] } };
}
function load() {
  try {
    const s = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (s && s.pantry && s.dishes && s.menu) return s;
  } catch (e) { /* пошкоджені дані — починаємо з нуля */ }
  return emptyState();
}
function save() {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch (e) { alert('Не вдалося зберегти дані'); }
  render();
}

/* ---------- Допоміжні ---------- */
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const round = n => Math.round(n * 1000) / 1000;
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const product = id => state.pantry.find(p => p.id === id);
const dish = id => state.dishes.find(d => d.id === id);

/* ---------- Логіка комори ---------- */
function applyIngredients(list, sign) {          // sign: -1 списати, +1 повернути
  list.forEach(i => {
    const p = product(i.productId);
    if (p) p.qty = round(p.qty + sign * i.qty);
  });
}
function addToMenu(day, dishId) {
  const d = dish(dishId);
  if (!d) return;
  const snap = d.ingredients.map(i => ({ ...i }));
  applyIngredients(snap, -1);
  state.menu[day].push({ id: uid(), dishId, snap, cooked: false });
  save();
}
// Страву приготовано: продукти вже списані, тож відтепер вони не повертаються
function cookEntry(day, entryId) {
  const e = state.menu[day].find(x => x.id === entryId);
  if (!e) return;
  e.cooked = true;
  save();
}
function removeFromMenu(day, entryId) {
  const list = state.menu[day];
  const idx = list.findIndex(e => e.id === entryId);
  if (idx < 0) return;
  if (!list[idx].cooked) applyIngredients(list[idx].snap, +1);   // приготовані не повертаємо
  list.splice(idx, 1);
  save();
}
// Очистка ТІЛЬКИ меню на тиждень.
// Заплановані (не приготовані) страви повертають продукти в комору,
// приготовані — просто зникають з меню, комору не змінюють.
function clearMenu() {
  Object.keys(state.menu).forEach(day => {
    state.menu[day].forEach(e => { if (!e.cooked) applyIngredients(e.snap, +1); });
    state.menu[day] = [];
  });
  save();
}
function allEntries(dishId) {
  const res = [];   // лише неприготовані: приготовані вже остаточні
  Object.values(state.menu).forEach(l => l.forEach(e => { if (e.dishId === dishId && !e.cooked) res.push(e); }));
  return res;
}
function deleteDish(id) {
  // Повертаємо інгредієнти за всі записи в меню, потім видаляємо
  Object.keys(state.menu).forEach(day => {
    state.menu[day] = state.menu[day].filter(e => {
      if (e.dishId !== id) return true;
      if (!e.cooked) applyIngredients(e.snap, +1);
      return false;
    });
  });
  state.dishes = state.dishes.filter(d => d.id !== id);
  save();
}
function deleteProduct(id) {
  state.pantry = state.pantry.filter(p => p.id !== id);
  state.dishes.forEach(d => d.ingredients = d.ingredients.filter(i => i.productId !== id));
  Object.values(state.menu).forEach(l => l.forEach(e => e.snap = e.snap.filter(i => i.productId !== id)));
  save();
}
function updateDish(id, data) {
  const d = dish(id);
  // Для вже запланованих порцій: повертаємо старі списання й списуємо за новим складом
  allEntries(id).forEach(e => {
    applyIngredients(e.snap, +1);
    e.snap = data.ingredients.map(i => ({ ...i }));
    applyIngredients(e.snap, -1);
  });
  Object.assign(d, data);
  save();
}

/* ---------- Модальне вікно ---------- */
const modal = document.getElementById('modal');
const modalForm = document.getElementById('modal-form');
let modalSubmit = null;
function openModal(title, bodyHTML, onSubmit) {
  document.getElementById('modal-title').textContent = title;
  document.getElementById('modal-body').innerHTML = bodyHTML;
  modalSubmit = onSubmit;
  modal.showModal();
}
modalForm.addEventListener('submit', e => {
  e.preventDefault();
  if (modalSubmit && modalSubmit(new FormData(modalForm), modalForm) !== false) modal.close();
});
document.getElementById('modal-cancel').onclick = () => modal.close();

const inputCls = 'w-full border border-slate-300 rounded-lg px-3 py-2';
const btn = (cls, extra = '') => `class="px-3 py-1.5 rounded-lg text-sm ${cls}" ${extra}`;

/* ---------- Комора ---------- */
function productForm(p) {
  p = p || { name: '', qty: '', unit: 'г' };
  openModal(p.id ? 'Редагувати продукт' : 'Новий продукт', `
    <input name="name" required placeholder="Назва" value="${esc(p.name)}" class="${inputCls}">
    <div class="flex gap-2">
      <input name="qty" type="number" step="any" required placeholder="Кількість" value="${p.qty}" class="${inputCls}">
      <select name="unit" class="border border-slate-300 rounded-lg px-3 py-2">
        ${UNITS.map(u => `<option ${u === p.unit ? 'selected' : ''}>${u}</option>`).join('')}
      </select>
    </div>`, fd => {
    const data = { name: fd.get('name').trim(), qty: round(parseFloat(fd.get('qty'))), unit: fd.get('unit') };
    if (!data.name || isNaN(data.qty)) return false;
    if (p.id) Object.assign(product(p.id), data); else state.pantry.push({ id: uid(), ...data });
    save();
  });
}
function viewPantry() {
  const rows = state.pantry.map(p => {
    const bad = p.qty <= 0;
    return `<li class="flex items-center justify-between gap-2 p-3 rounded-lg border ${bad ? 'bg-red-50 border-red-300 text-red-700' : 'bg-white border-slate-200'}">
      <div><div class="font-medium">${esc(p.name)}</div>
        <div class="text-sm">${p.qty} ${esc(p.unit)} ${bad ? '⚠️ закінчується / немає' : ''}</div></div>
      <div class="flex gap-1">
        <button ${btn('bg-slate-200 text-slate-800', `data-act="edit-product" data-id="${p.id}"`)}>✏️</button>
        <button ${btn('bg-red-100 text-red-700', `data-act="del-product" data-id="${p.id}"`)}>🗑️</button>
      </div></li>`;
  }).join('');
  return `<div class="flex justify-between items-center mb-4"><h2 class="text-lg font-bold">Комора</h2>
    <button ${btn('bg-emerald-600 text-white', 'data-act="add-product"')}>+ Додати продукт</button></div>
    <ul class="space-y-2">${rows || '<p class="text-slate-500">Комора порожня. Додайте перший продукт.</p>'}</ul>`;
}

/* ---------- Рецепти ---------- */
function ingredientRow(i) {
  i = i || { productId: '', qty: '' };
  const opts = state.pantry.map(p => `<option value="${p.id}" ${p.id === i.productId ? 'selected' : ''}>${esc(p.name)} (${esc(p.unit)})</option>`).join('');
  return `<div class="flex gap-2 ing-row">
    <select name="ing-p" required class="${inputCls}"><option value="">— продукт —</option>${opts}</select>
    <input name="ing-q" type="number" step="any" min="0" required placeholder="к-сть" value="${i.qty}" class="w-24 border border-slate-300 rounded-lg px-2 py-2">
    <button type="button" data-rm class="text-red-600 px-2">✕</button></div>`;
}
function dishForm(d) {
  if (!state.pantry.length) return alert('Спочатку додайте продукти в Комору.');
  d = d || { name: '', desc: '', ingredients: [{}] };
  openModal(d.id ? 'Редагувати рецепт' : 'Новий рецепт', `
    <input name="name" required placeholder="Назва страви" value="${esc(d.name)}" class="${inputCls}">
    <textarea name="desc" rows="2" placeholder="Опис" class="${inputCls}">${esc(d.desc)}</textarea>
    <div class="text-sm font-medium">Інгредієнти на 1 порцію:</div>
    <div id="ing-list" class="space-y-2">${d.ingredients.map(ingredientRow).join('')}</div>
    <button type="button" id="add-ing" class="text-emerald-700 text-sm">+ Додати інгредієнт</button>`, (fd, form) => {
    const ingredients = [];
    form.querySelectorAll('.ing-row').forEach(r => {
      const productId = r.querySelector('[name=ing-p]').value;
      const qty = parseFloat(r.querySelector('[name=ing-q]').value);
      if (productId && qty > 0) {
        const ex = ingredients.find(x => x.productId === productId);
        if (ex) ex.qty = round(ex.qty + qty); else ingredients.push({ productId, qty: round(qty) });
      }
    });
    if (!ingredients.length) { alert('Додайте хоча б один інгредієнт'); return false; }
    const data = { name: fd.get('name').trim(), desc: fd.get('desc').trim(), ingredients };
    if (d.id) updateDish(d.id, data); else { state.dishes.push({ id: uid(), ...data }); save(); }
  });
  document.getElementById('add-ing').onclick = () =>
    document.getElementById('ing-list').insertAdjacentHTML('beforeend', ingredientRow());
  document.getElementById('ing-list').onclick = e => { if (e.target.hasAttribute('data-rm')) e.target.closest('.ing-row').remove(); };
}
function viewRecipes() {
  const cards = state.dishes.map(d => {
    const ings = d.ingredients.map(i => { const p = product(i.productId); return p ? `${esc(p.name)} — ${i.qty} ${esc(p.unit)}` : ''; }).filter(Boolean).join('<br>');
    return `<li class="bg-white border border-slate-200 rounded-lg p-4">
      <div class="flex justify-between gap-2"><div class="font-semibold">${esc(d.name)}</div>
        <div class="flex gap-1">
          <button ${btn('bg-slate-200', `data-act="edit-dish" data-id="${d.id}"`)}>✏️</button>
          <button ${btn('bg-red-100 text-red-700', `data-act="del-dish" data-id="${d.id}"`)}>🗑️</button></div></div>
      ${d.desc ? `<p class="text-sm text-slate-600 mt-1">${esc(d.desc)}</p>` : ''}
      <div class="text-sm text-slate-700 mt-2">${ings}</div></li>`;
  }).join('');
  return `<div class="flex justify-between items-center mb-4"><h2 class="text-lg font-bold">Рецепти</h2>
    <button ${btn('bg-emerald-600 text-white', 'data-act="add-dish"')}>+ Новий рецепт</button></div>
    <ul class="grid gap-3 sm:grid-cols-2">${cards || '<p class="text-slate-500">Рецептів ще немає.</p>'}</ul>`;
}

/* ---------- Меню на тиждень ---------- */
function viewMenu() {
  const opts = state.dishes.map(d => `<option value="${d.id}">${esc(d.name)}</option>`).join('');
  const warn = state.pantry.filter(p => p.qty < 0);
  const cols = DAYS.map((name, day) => {
    const items = state.menu[day].map(e => {
      const d = dish(e.dishId);
      const label = d ? esc(d.name) : 'Видалена страва';
      return `<li class="flex justify-between items-center gap-1 rounded px-2 py-1 text-sm ${e.cooked ? 'bg-slate-100 text-slate-500' : 'bg-emerald-50'}">
        <span>${e.cooked ? '✅ ' : ''}${label}</span>
        <span class="flex gap-1 shrink-0">
          ${e.cooked ? '' : `<button class="text-emerald-700 px-1" title="Приготовано" data-act="cook-menu" data-day="${day}" data-id="${e.id}">🍳</button>`}
          <button class="text-red-600 px-1" data-act="rm-menu" data-day="${day}" data-id="${e.id}">✕</button></span></li>`;
    }).join('');
    return `<div class="bg-white border border-slate-200 rounded-lg p-3">
      <div class="font-semibold mb-2">${name}</div>
      <ul class="space-y-1 mb-2">${items || '<li class="text-xs text-slate-400">Порожньо</li>'}</ul>
      ${state.dishes.length ? `<div class="flex gap-1"><select class="flex-1 min-w-0 border border-slate-300 rounded px-1 py-1 text-sm" id="sel-${day}">${opts}</select>
        <button ${btn('bg-emerald-600 text-white', `data-act="add-menu" data-day="${day}"`)}>+</button></div>` : ''}
    </div>`;
  }).join('');
  return `<h2 class="text-lg font-bold mb-3">Меню на тиждень</h2>
    ${warn.length ? `<div class="mb-4 p-3 rounded-lg bg-red-50 border border-red-300 text-red-700 text-sm">⚠️ Не вистачає продуктів: ${warn.map(p => `${esc(p.name)} (${-p.qty} ${esc(p.unit)})`).join(', ')}. Дивіться «Список покупок».</div>` : ''}
    ${state.dishes.length ? '' : '<p class="text-slate-500 mb-3">Спочатку створіть рецепти.</p>'}
    <div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">${cols}</div>
    <button ${btn('bg-red-100 text-red-700 mt-5', 'data-act="clear-menu"')}>🧹 Очистити меню</button>
`;
}

/* ---------- Список покупок ---------- */
function viewShopping() {
  const need = state.pantry.filter(p => p.qty < 0);
  const rows = need.map(p => `<li class="flex justify-between p-3 bg-white border border-red-200 rounded-lg">
    <span>${esc(p.name)}</span><span class="font-semibold text-red-700">купити ${round(-p.qty)} ${esc(p.unit)}</span></li>`).join('');
  return `<h2 class="text-lg font-bold mb-4">Список покупок</h2>
    <ul class="space-y-2">${rows || '<p class="text-slate-500">Усього вистачає ✅</p>'}</ul>`;
}

/* ---------- Дані: експорт, імпорт, встановлення ---------- */
let installPrompt = null;
window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); installPrompt = e; if (currentTab === 'data') render(); });
window.addEventListener('appinstalled', () => { installPrompt = null; render(); });

function exportData() {
  const blob = new Blob([JSON.stringify({ app: 'meal-planner', version: 1, state }, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'menu-backup-' + new Date().toISOString().slice(0, 10) + '.json';
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
function validState(s) {
  return s && Array.isArray(s.pantry) && Array.isArray(s.dishes) && s.menu && typeof s.menu === 'object';
}
function importData(file) {
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const parsed = JSON.parse(reader.result);
      const s = parsed.state || parsed;
      if (!validState(s)) throw new Error('bad');
      for (let d = 0; d < 7; d++) if (!Array.isArray(s.menu[d])) s.menu[d] = [];
      if (!confirm('Замінити всі поточні дані даними з файлу?')) return;
      state = s; save();
      alert('Дані відновлено ✅');
    } catch (e) { alert('Файл не схожий на резервну копію цього додатка.'); }
  };
  reader.readAsText(file);
}
function viewData() {
  const standalone = window.matchMedia('(display-mode: standalone)').matches;
  const card = 'bg-white border border-slate-200 rounded-lg p-4 space-y-2';
  return `<h2 class="text-lg font-bold mb-4">Дані</h2><div class="space-y-3">
    <div class="${card}"><div class="font-semibold">Резервна копія</div>
      <p class="text-sm text-slate-600">Усе (комора, рецепти, меню) зберігається в цьому браузері. Збережіть копію у файл, щоб не втратити дані або перенести на інший телефон.</p>
      <div class="flex gap-2 flex-wrap">
        <button ${btn('bg-emerald-600 text-white', 'data-act="export"')}>⬇️ Експорт у файл</button>
        <button ${btn('bg-slate-200', 'data-act="import"')}>⬆️ Імпорт з файлу</button>
        <input type="file" id="import-file" accept="application/json,.json" class="hidden"></div></div>
    <div class="${card}"><div class="font-semibold">Встановлення на телефон</div>
      ${standalone ? '<p class="text-sm text-emerald-700">✅ Додаток встановлено, працює офлайн.</p>'
        : installPrompt ? `<button ${btn('bg-emerald-600 text-white', 'data-act="install"')}>📲 Встановити додаток</button>`
        : '<p class="text-sm text-slate-600">У Chrome: меню ⋮ → «Додати на головний екран» / «Встановити додаток». Після першого відкриття з інтернетом додаток працює без нього.</p>'}</div>
  </div>`;
}

/* ---------- Рендер і події ---------- */
function render() {
  document.getElementById('tabs').innerHTML = TABS.map(([id, label]) =>
    `<button data-tab="${id}" class="px-3 py-2 rounded-t-lg whitespace-nowrap ${id === currentTab ? 'bg-slate-50 text-emerald-700 font-semibold' : 'hover:bg-emerald-500'}">${label}</button>`).join('');
  const views = { pantry: viewPantry, recipes: viewRecipes, menu: viewMenu, shopping: viewShopping, data: viewData };
  document.getElementById('view').innerHTML = views[currentTab]();
}

document.addEventListener('click', e => {
  const t = e.target.closest('[data-tab]');
  if (t) { currentTab = t.dataset.tab; return render(); }
  const el = e.target.closest('[data-act]');
  if (!el) return;
  const { act, id, day } = el.dataset;
  switch (act) {
    case 'add-product': return productForm();
    case 'edit-product': return productForm(product(id));
    case 'del-product': if (confirm('Видалити продукт? Його приберуть і з рецептів.')) deleteProduct(id); return;
    case 'add-dish': return dishForm();
    case 'edit-dish': return dishForm(dish(id));
    case 'del-dish': if (confirm('Видалити рецепт? Продукти за його порції в меню повернуться в комору.')) deleteDish(id); return;
    case 'add-menu': return addToMenu(+day, document.getElementById('sel-' + day).value);
    case 'cook-menu': if (confirm('Позначити страву приготованою? Продукти буде списано остаточно.')) cookEntry(+day, id); return;
    case 'rm-menu': {
      const entry = state.menu[day].find(x => x.id === id);
      if (entry && entry.cooked && !confirm('Страву вже приготовано, продукти не повернуться в комору. Видалити з меню?')) return;
      return removeFromMenu(+day, id);
    }
    case 'export': return exportData();
    case 'import': return document.getElementById('import-file').click();
    case 'install': if (installPrompt) { installPrompt.prompt(); installPrompt = null; } return;
    case 'clear-menu': {
      const all = Object.values(state.menu).flat();
      if (!all.length) return alert('Меню вже порожнє.');
      const cooked = all.filter(e => e.cooked).length, planned = all.length - cooked;
      if (confirm(`Очистити меню на тиждень?\n\nЗапланованих: ${planned} (продукти повернуться в комору)\nПриготованих: ${cooked} (комору не змінять)\n\nКомора, рецепти й список покупок залишаться.`)) clearMenu();
      return;
    }
  }
});

document.addEventListener('change', e => {
  if (e.target.id === 'import-file' && e.target.files[0]) { importData(e.target.files[0]); e.target.value = ''; }
});

render();
