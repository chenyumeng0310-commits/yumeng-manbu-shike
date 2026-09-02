const STORE_KEY = 'yumeng-manbu-shike-v1';
const PRIORITIES = {
  urgent: { label: '紧急', emoji: '!', className: 'urgent' },
  normal: { label: '普通', emoji: '●', className: 'normal' },
  relaxed: { label: '不急', emoji: '☁', className: 'relaxed' },
};

const app = document.querySelector('#app');
const pages = [...document.querySelectorAll('.page')];
const headerDate = document.querySelector('#header-date');
const pageTitle = document.querySelector('#page-title');
const pageSubtitle = document.querySelector('#page-subtitle');
const taskDialog = document.querySelector('#task-dialog');
const goalDialog = document.querySelector('#goal-dialog');
const settingsDialog = document.querySelector('#settings-dialog');
const toast = document.querySelector('#toast');
let activePage = 'today';
let selectedDate = dateKey(new Date());
let calendarCursor = startOfMonth(new Date());
let selectedGoalId = null;
let installPrompt = null;
let toastTimer = null;

function dateKey(date) {
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 10);
}

function startOfMonth(date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function addDays(date, count) {
  const next = new Date(date);
  next.setDate(next.getDate() + count);
  return next;
}

function uid(prefix) {
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function emptyState(title, detail) {
  return `<div class="empty-state"><strong>${title}</strong>${detail}</div>`;
}

function escapeHTML(value) {
  return String(value).replace(/[&<>'"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[char]));
}

function defaultState() {
  return {
    tasks: [],
    goals: [],
    settings: { morningTime: '08:00', overdueInterval: 30, notified: {} },
  };
}

function loadState() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORE_KEY));
    if (saved?.tasks && saved?.goals && saved?.settings) return saved;
  } catch (_) { /* use fresh state */ }
  return defaultState();
}

let state = loadState();
selectedGoalId = state.goals[0]?.id || null;

function saveState() {
  localStorage.setItem(STORE_KEY, JSON.stringify(state));
}

function displayDate(date) {
  return new Intl.DateTimeFormat('zh-CN', { month: 'long', day: 'numeric', weekday: 'long' }).format(date);
}

function shortDate(key) {
  return new Intl.DateTimeFormat('zh-CN', { month: 'numeric', day: 'numeric' }).format(new Date(`${key}T12:00:00`));
}

function dueDate(task) {
  return new Date(`${task.date}T${task.time}:00`);
}

function activeTasks() {
  return state.tasks.filter((task) => !task.completedAt);
}

function taskSort(left, right) {
  return dueDate(left) - dueDate(right);
}

function tasksForDate(key, includeDone = false) {
  return state.tasks.filter((task) => task.date === key && (includeDone || !task.completedAt)).sort(taskSort);
}

function priorityTag(priority) {
  const info = PRIORITIES[priority];
  return `<span class="priority ${info.className}">${info.label}</span>`;
}

function taskRow(task, options = {}) {
  const complete = Boolean(task.completedAt);
  const detail = options.detail ?? `${task.time} · 预计 ${task.duration} 分钟`;
  return `<article class="task-row ${complete ? 'done' : ''}"><button class="task-check ${complete ? 'done' : ''}" type="button" data-complete-task="${task.id}" aria-label="${complete ? '恢复' : '完成'} ${escapeHTML(task.title)}">${complete ? '✓' : ''}</button><div class="task-copy"><div class="task-name">${escapeHTML(task.emoji)} ${escapeHTML(task.title)}</div><div class="task-meta">${escapeHTML(detail)}</div></div>${priorityTag(task.priority)}</article>`;
}

function goalProgress(goal) {
  const linked = state.tasks.filter((task) => task.goalIds.includes(goal.id));
  const completeSteps = goal.steps.filter((step) => step.done).length;
  const completedTasks = linked.filter((task) => task.completedAt).length;
  const total = goal.steps.length + linked.length;
  const completed = completeSteps + completedTasks;
  return { completed, total: Math.max(total, 1), percent: Math.round((completed / Math.max(total, 1)) * 100), linked };
}

function renderToday() {
  const todayKey = dateKey(new Date());
  const pending = activeTasks().sort(taskSort);
  const focus = pending.find((task) => task.date <= todayKey) || pending[0];
  const today = tasksForDate(todayKey);
  const completedToday = state.tasks.filter((task) => task.completedAt && task.completedAt.slice(0, 10) === todayKey).length;
  const totalToday = today.length + completedToday;
  const percent = totalToday ? Math.round((completedToday / totalToday) * 100) : 0;
  const nextTasks = today.filter((task) => task.id !== focus?.id).slice(0, 3);
  const goal = state.goals[0];
  const goalInfo = goal ? goalProgress(goal) : null;
  document.querySelector('#today-page').innerHTML = `
    <div class="progress-line"><span>今日进度</span><div class="progress-track"><i style="width:${percent}%"></i></div><span>${completedToday} / ${totalToday}</span></div>
    <div class="section-heading"><h2>现在做这件事</h2><button class="section-link" data-go="calendar" type="button">日程 ›</button></div>
    ${focus ? `<section class="focus-task"><div class="focus-top">${focus.priority === 'urgent' ? '☀ 最临近截止' : '☀ 接下来安排'} · ${shortDate(focus.date)} ${focus.time}</div><div class="focus-row"><span class="focus-emoji">${escapeHTML(focus.emoji)}</span><span class="focus-title">${escapeHTML(focus.title)}</span><button class="complete-button" data-complete-task="${focus.id}" type="button" aria-label="完成 ${escapeHTML(focus.title)}">✓</button></div><div class="task-meta">${formatRemaining(dueDate(focus))} · 预计 ${focus.duration} 分钟</div></section>` : emptyState('今天的任务都完成啦 ✨', '给自己一点轻松的空白吧。')}
    <div class="section-heading"><h2>接下来</h2><button class="section-link" data-go="history" type="button">完成记录 ›</button></div>
    ${nextTasks.length ? `<section class="task-list">${nextTasks.map((task) => taskRow(task)).join('')}</section>` : emptyState('暂时没有更多待办', '点击右下角加号，记下下一件小事。')}
    ${goal ? `<button class="goal-glance" data-go="goals" type="button"><span class="goal-icon">${escapeHTML(goal.emoji)}</span><span><span class="goal-name">${escapeHTML(goal.name)}</span><span class="goal-meta">${goalInfo.completed} / ${goalInfo.total} 个步骤已完成</span></span><span class="goal-percent">${goalInfo.percent}%</span></button>` : ''}`;
}

function renderCalendar() {
  const year = calendarCursor.getFullYear();
  const month = calendarCursor.getMonth();
  const first = new Date(year, month, 1);
  const mondayOffset = (first.getDay() + 6) % 7;
  const gridStart = addDays(first, -mondayOffset);
  const days = Array.from({ length: 42 }, (_, index) => addDays(gridStart, index));
  const monthLabel = new Intl.DateTimeFormat('zh-CN', { year: 'numeric', month: 'long' }).format(first);
  const selected = tasksForDate(selectedDate);
  document.querySelector('#calendar-page').innerHTML = `
    <div class="month-header"><button class="month-arrow" data-month="-1" type="button" aria-label="上个月">‹</button><h2>${monthLabel}</h2><button class="month-arrow" data-month="1" type="button" aria-label="下个月">›</button></div>
    <div class="weekday-grid"><span>一</span><span>二</span><span>三</span><span>四</span><span>五</span><span>六</span><span>日</span></div>
    <div class="calendar-grid">${days.map((day) => calendarButton(day, month)).join('')}</div>
    <div class="agenda-label">${displayDate(new Date(`${selectedDate}T12:00:00`))}</div>
    <section class="agenda"><div class="agenda-top"><span>当天安排</span><span>${selected.length} 件</span></div>${selected.length ? selected.map(agendaRow).join('') : emptyState('这天没有安排', '留一点空白给自己吧。')}</section>`;
}

function calendarButton(day, cursorMonth) {
  const key = dateKey(day);
  const tasks = tasksForDate(key);
  const dots = [...new Set(tasks.map((task) => task.priority))].slice(0, 3).map((priority) => `<i class="calendar-dot ${priority === 'urgent' ? '' : priority}"></i>`).join('');
  const classes = ['calendar-day'];
  if (day.getMonth() !== cursorMonth) classes.push('muted');
  if (key === dateKey(new Date())) classes.push('today');
  if (key === selectedDate) classes.push('selected');
  return `<button class="${classes.join(' ')}" type="button" data-calendar-date="${key}" aria-label="${shortDate(key)}，${tasks.length}件任务"><span>${day.getDate()}</span><span class="calendar-dots">${dots}</span></button>`;
}

function agendaRow(task) {
  return `<article class="agenda-row"><span class="agenda-time">${task.time}</span><i class="agenda-stripe ${task.priority === 'urgent' ? '' : task.priority}"></i><div><div class="task-name">${escapeHTML(task.emoji)} ${escapeHTML(task.title)}</div><div class="task-meta">${PRIORITIES[task.priority].label} · 预计 ${task.duration} 分钟</div></div></article>`;
}

function renderReminders(selectedPriority = null) {
  const current = new Date();
  const pending = activeTasks();
  const grouped = Object.fromEntries(Object.keys(PRIORITIES).map((key) => [key, pending.filter((task) => task.priority === key).sort(taskSort)]));
  const mostUrgent = (priority) => grouped[priority][0];
  const priority = selectedPriority || document.querySelector('.level-button.selected')?.dataset.level || 'urgent';
  const tasks = grouped[priority];
  document.querySelector('#reminders-page').innerHTML = `
    <div class="section-heading"><h2>按紧急程度</h2><span class="tiny-text">现在 ${current.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}</span></div>
    <section class="levels">${Object.keys(PRIORITIES).map((key) => levelButton(key, grouped[key], priority)).join('')}</section>
    <div class="section-heading"><h2>${PRIORITIES[priority].label} · 剩余时间</h2><span class="tiny-text">${tasks.length} 件</span></div>
    <section class="task-list">${tasks.length ? tasks.map((task) => reminderTaskRow(task)).join('') : emptyState('这个等级没有待办', '很好，继续保持轻松节奏。')}</section>`;
}

function levelButton(priority, tasks, selected) {
  const first = tasks[0];
  const info = PRIORITIES[priority];
  return `<button class="level-button ${priority} ${selected === priority ? 'selected' : ''}" type="button" data-level="${priority}"><span class="level-icon">${info.emoji}</span><span><span class="level-name">${info.label}</span><span class="level-desc">${tasks.length ? `${tasks.length} 件任务，${priority === 'urgent' ? '最快截止' : '等待安排'}` : '暂时没有任务'}</span></span><span class="level-clock">${first ? formatRemaining(dueDate(first), true) : '—'}</span></button>`;
}

function reminderTaskRow(task) {
  return `<article class="task-row reminder-task"><i class="agenda-stripe ${task.priority === 'urgent' ? '' : task.priority}"></i><div class="task-copy"><div class="task-name">${escapeHTML(task.emoji)} ${escapeHTML(task.title)}</div><div class="task-meta">${shortDate(task.date)} ${task.time} 截止 · 预计 ${task.duration} 分钟</div></div><span class="reminder-time ${task.priority}">${formatRemaining(dueDate(task), true)}</span></article>`;
}

function renderGoals() {
  const goal = state.goals.find((item) => item.id === selectedGoalId) || state.goals[0];
  if (!goal) {
    document.querySelector('#goals-page').innerHTML = emptyState('还没有目标', '点击右下角加号，创建第一个想达成的目标。');
    return;
  }
  selectedGoalId = goal.id;
  const stats = goalProgress(goal);
  const taskSteps = stats.linked.map((task) => ({ id: task.id, name: `${task.emoji} ${task.title}`, done: Boolean(task.completedAt), note: task.completedAt ? '关联任务已完成' : `${shortDate(task.date)} ${task.time} 截止`, taskId: task.id }));
  const steps = [...goal.steps.map((step) => ({ ...step, note: step.done ? '已完成' : '下一步' })), ...taskSteps];
  document.querySelector('#goals-page').innerHTML = `
    <div class="goal-tabs" aria-label="目标切换">${state.goals.map((item) => `<button class="goal-tab ${item.id === goal.id ? 'active' : ''}" type="button" data-goal="${item.id}">${escapeHTML(item.emoji)} ${escapeHTML(item.name)}</button>`).join('')}</div>
    <section class="goal-hero"><div class="goal-ring" style="background:conic-gradient(#9d78d8 0 ${stats.percent}%, rgba(255,255,255,.64) ${stats.percent}% 100%)"><b>${stats.percent}%</b></div><div><div class="goal-label">进行中 · 截止 ${shortDate(goal.dueDate)}</div><div class="goal-hero-name">${escapeHTML(goal.name)}</div><div class="goal-hero-meta">${stats.completed} / ${stats.total} 个小步骤已完成</div></div></section>
    <div class="section-heading"><h2>下一步</h2><button class="section-link" data-add-step type="button">添加步骤 ＋</button></div>
    <section class="step-list">${steps.length ? steps.map((step) => stepRow(step)).join('') : emptyState('从第一步开始吧', '点击右下角新增一个目标步骤。')}</section>`;
}

function stepRow(step) {
  const action = step.taskId ? `data-complete-task="${step.taskId}"` : `data-toggle-step="${step.id}"`;
  return `<article class="step-row ${step.done ? 'complete' : ''}"><button class="step-check ${step.done ? 'done' : ''}" type="button" ${action} aria-label="${step.done ? '恢复' : '完成'} ${escapeHTML(step.name)}">${step.done ? '✓' : ''}</button><div><div class="step-name">${escapeHTML(step.name)}</div><div class="step-note">${escapeHTML(step.note)}</div></div><span class="step-arrow">›</span></article>`;
}

function renderHistory() {
  const completed = state.tasks.filter((task) => task.completedAt).sort((left, right) => new Date(right.completedAt) - new Date(left.completedAt));
  document.querySelector('#history-page').innerHTML = `<div class="section-heading"><h2>已完成</h2><span class="tiny-text">${completed.length} 件</span></div><section class="history-list">${completed.length ? completed.map((task) => `<article class="history-row"><span class="history-icon">${escapeHTML(task.emoji)}</span><div><div class="task-name">${escapeHTML(task.title)}</div><div class="task-meta">${shortDate(task.date)} · ${task.time} 截止</div></div><span class="history-date">${new Intl.DateTimeFormat('zh-CN', { month: 'numeric', day: 'numeric' }).format(new Date(task.completedAt))} 完成</span></article>`).join('') : emptyState('完成记录会出现在这里', '完成一个任务后，它会从待办中消失。')}</section>`;
}

function formatRemaining(date, compact = false) {
  const minutes = Math.round((date - new Date()) / 60000);
  const format = (value) => {
    if (value >= 1440) return `${Math.floor(value / 1440)} 天`;
    const hours = Math.floor(value / 60);
    const mins = value % 60;
    if (hours > 0) return compact ? `${hours}:${String(mins).padStart(2, '0')}` : `${hours} 小时 ${mins} 分钟`;
    return compact ? `${mins} 分` : `${mins} 分钟`;
  };
  if (minutes < 0) return compact ? `逾期 ${format(-minutes)}` : `已逾期 ${format(-minutes)}`;
  return compact ? format(minutes) : `还剩 ${format(minutes)}`;
}

function setHeader(page) {
  const headers = {
    today: ['Yumeng，一步步来，会越来越棒！', '慢慢来，今天也会很顺利。'],
    calendar: ['日历', '点选日期，查看当天要做什么。'],
    reminders: ['时间提醒', '先看最临近截止时间的任务。'],
    goals: ['我的目标', '把大目标变成今天能完成的事。'],
    history: ['完成记录', '每一点完成，都会留在这里。'],
  };
  pageTitle.textContent = headers[page][0];
  pageSubtitle.textContent = headers[page][1];
  headerDate.textContent = page === 'today' ? `${displayDate(new Date())} 🌷` : 'Yumeng · 漫步时刻 ✦';
}

function renderAll() {
  renderToday();
  renderCalendar();
  renderReminders();
  renderGoals();
  renderHistory();
  showPage(activePage, false);
}

function showPage(page, scroll = true) {
  activePage = page;
  pages.forEach((item) => item.classList.toggle('active', item.dataset.page === page));
  document.querySelectorAll('.nav-item').forEach((button) => button.classList.toggle('active', button.dataset.target === page));
  document.querySelector('#add-button').setAttribute('aria-label', page === 'goals' ? '新增目标' : '新增任务');
  setHeader(page);
  if (scroll) window.scrollTo({ top: 0, behavior: 'smooth' });
}

function showToast(message) {
  toast.textContent = message;
  toast.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('show'), 2200);
}

function completeTask(id) {
  const task = state.tasks.find((item) => item.id === id);
  if (!task) return;
  task.completedAt = task.completedAt ? null : new Date().toISOString();
  saveState();
  renderAll();
  showToast(task.completedAt ? '完成啦！任务已移入完成记录 ✨' : '任务已恢复到待办');
}

function toggleStep(id) {
  const goal = state.goals.find((item) => item.id === selectedGoalId);
  const step = goal?.steps.find((item) => item.id === id);
  if (!step) return;
  step.done = !step.done;
  saveState();
  renderAll();
  showToast(step.done ? '小步骤已完成 ✦' : '小步骤已恢复');
}

function openTaskDialog() {
  const form = document.querySelector('#task-form');
  form.reset();
  form.elements.date.value = selectedDate || dateKey(new Date());
  form.elements.time.value = '18:00';
  renderGoalPicker();
  taskDialog.showModal();
}

function renderGoalPicker() {
  document.querySelector('#goal-picker').innerHTML = `<legend>关联目标（可多选）</legend>${state.goals.length ? state.goals.map((goal) => `<label class="goal-option"><input type="checkbox" name="goalIds" value="${goal.id}" />${escapeHTML(goal.emoji)} ${escapeHTML(goal.name)}</label>`).join('') : '<span class="task-meta">创建目标后可关联。</span>'}`;
}

function openGoalDialog() {
  const form = document.querySelector('#goal-form');
  form.reset();
  form.elements.dueDate.value = dateKey(addDays(new Date(), 30));
  goalDialog.showModal();
}

function openStepDialog() {
  if (!selectedGoalId) return;
  const form = document.querySelector('#step-form');
  form.reset();
  document.querySelector('#step-dialog').showModal();
}

function openSettings() {
  const form = document.querySelector('#settings-form');
  form.elements.morningTime.value = state.settings.morningTime;
  form.elements.overdueInterval.value = String(state.settings.overdueInterval);
  document.querySelector('#permission-button').textContent = typeof Notification !== 'undefined' && Notification.permission === 'granted' ? '系统通知已开启' : '开启系统通知';
  settingsDialog.showModal();
}

function notify(title, body) {
  if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
    navigator.serviceWorker?.ready.then((registration) => registration.showNotification(title, { body, icon: './icon.svg', badge: './icon.svg' })).catch(() => new Notification(title, { body }));
  }
}

function checkReminders() {
  const now = new Date();
  const key = dateKey(now);
  const minuteOfDay = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  const notified = state.settings.notified || (state.settings.notified = {});
  if (minuteOfDay >= state.settings.morningTime && notified[`morning-${key}`] !== 'sent') {
    const dueToday = activeTasks().filter((task) => task.date === key);
    if (dueToday.length) notify('Yumeng · 漫步时刻', `今天有 ${dueToday.length} 件截止任务：${dueToday.map((task) => task.title).join('、')}`);
    notified[`morning-${key}`] = 'sent';
  }
  activeTasks().forEach((task) => {
    const due = dueDate(task);
    const minutes = Math.round((due - now) / 60000);
    if (minutes <= 60 && minutes > 0 && !notified[`hour-${task.id}`]) {
      notify('任务将在 1 小时内截止', `${task.emoji} ${task.title} · ${task.time} 截止`);
      notified[`hour-${task.id}`] = 'sent';
    }
    if (minutes <= 0) {
      const interval = Number(state.settings.overdueInterval);
      const slot = Math.floor(Math.abs(minutes) / interval);
      const notificationKey = `late-${task.id}-${slot}`;
      if (!notified[notificationKey]) {
        notify('任务已经逾期', `${task.emoji} ${task.title} 已逾期 ${formatRemaining(due, true).replace('逾期 ', '')}`);
        notified[notificationKey] = 'sent';
      }
    }
  });
  state.settings.notified = notified;
  saveState();
}

document.addEventListener('click', (event) => {
  const target = event.target.closest('button');
  if (!target) return;
  if (target.dataset.target) showPage(target.dataset.target);
  if (target.dataset.go) showPage(target.dataset.go);
  if (target.dataset.completeTask) completeTask(target.dataset.completeTask);
  if (target.dataset.toggleStep) toggleStep(target.dataset.toggleStep);
  if (target.dataset.calendarDate) { selectedDate = target.dataset.calendarDate; renderCalendar(); }
  if (target.dataset.month) { calendarCursor = new Date(calendarCursor.getFullYear(), calendarCursor.getMonth() + Number(target.dataset.month), 1); renderCalendar(); }
  if (target.dataset.level) renderReminders(target.dataset.level);
  if (target.dataset.goal) { selectedGoalId = target.dataset.goal; renderGoals(); }
  if (target.dataset.addStep !== undefined) openStepDialog();
  if (target.dataset.closeDialog) document.querySelector(`#${target.dataset.closeDialog}`).close();
});

document.querySelector('#add-button').addEventListener('click', () => activePage === 'goals' ? openGoalDialog() : openTaskDialog());
document.querySelector('#settings-button').addEventListener('click', openSettings);
document.querySelector('#task-form').addEventListener('submit', (event) => {
  event.preventDefault();
  const data = new FormData(event.currentTarget);
  state.tasks.push({ id: uid('task'), title: data.get('title').trim(), date: data.get('date'), time: data.get('time'), priority: data.get('priority'), duration: Number(data.get('duration')), emoji: data.get('emoji'), goalIds: data.getAll('goalIds'), completedAt: null, createdAt: Date.now() });
  saveState();
  taskDialog.close();
  renderAll();
  showToast('任务已加入漫步时刻 ✨');
});
document.querySelector('#goal-form').addEventListener('submit', (event) => {
  event.preventDefault();
  const data = new FormData(event.currentTarget);
  const goal = { id: uid('goal'), name: data.get('name').trim(), emoji: data.get('emoji'), dueDate: data.get('dueDate'), steps: [{ id: uid('step'), name: data.get('firstStep').trim(), done: false }] };
  state.goals.push(goal);
  selectedGoalId = goal.id;
  saveState();
  goalDialog.close();
  showPage('goals');
  renderAll();
  showToast('新目标已经出发啦 ✦');
});
document.querySelector('#step-form').addEventListener('submit', (event) => {
  event.preventDefault();
  const goal = state.goals.find((item) => item.id === selectedGoalId);
  const data = new FormData(event.currentTarget);
  if (!goal || !data.get('name').trim()) return;
  goal.steps.push({ id: uid('step'), name: data.get('name').trim(), done: false });
  saveState();
  document.querySelector('#step-dialog').close();
  renderAll();
  showToast('新的小步骤已添加 ✦');
});
document.querySelector('#settings-form').addEventListener('submit', (event) => {
  event.preventDefault();
  const data = new FormData(event.currentTarget);
  state.settings.morningTime = data.get('morningTime');
  state.settings.overdueInterval = Number(data.get('overdueInterval'));
  saveState();
  settingsDialog.close();
  checkReminders();
  showToast('提醒设置已保存');
});
document.querySelector('#permission-button').addEventListener('click', async () => {
  if (typeof Notification === 'undefined') return showToast('当前浏览器不支持系统通知');
  const result = await Notification.requestPermission();
  document.querySelector('#permission-button').textContent = result === 'granted' ? '系统通知已开启' : '未获得通知权限';
  if (result === 'granted') { notify('Yumeng · 漫步时刻', '提醒已经准备好啦 ✨'); showToast('系统通知已开启'); }
});

window.addEventListener('beforeinstallprompt', (event) => { event.preventDefault(); installPrompt = event; });
if ('serviceWorker' in navigator) window.addEventListener('load', () => {
  navigator.serviceWorker.register('./service-worker.js').then((registration) => registration.update());
});
window.addEventListener('focus', checkReminders);

renderAll();
checkReminders();
setInterval(() => { checkReminders(); if (activePage === 'reminders') renderReminders(); }, 60000);
