// State cache
let habitsState = [];
let settingsState = {};

// Helper to get local date string YYYY-MM-DD
function getLocalDateString(d = new Date()) {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function getYesterdayString() {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return getLocalDateString(d);
}

// Helper to safely send messages to background without unhandled rejection errors
async function safeSendMessage(msg) {
  try {
    return await chrome.runtime.sendMessage(msg);
  } catch (err) {
    console.warn('Background message notice:', err ? err.message : err);
    return null;
  }
}

// ----------------------------------------------------
// Initial Setup
// ----------------------------------------------------
document.addEventListener('DOMContentLoaded', async () => {
  await loadStateFromStorage();
  initializeTabs();
  initializeDashboardView();
  initializeHabitsView();
  initializeSettingsView();
  initializeStatsView();

  // Open external links reliably in a new Chrome tab
  document.addEventListener('click', (e) => {
    const link = e.target.closest('a[target="_blank"]');
    if (link && link.href && !link.href.startsWith('javascript:')) {
      e.preventDefault();
      chrome.tabs.create({ url: link.href });
    }
  });

  // Poll for ETA updates periodically to keep countdown fresh
  setInterval(updateNextReminderETA, 10000);

  // Listen to stats updates from background.js
  if (chrome.runtime && chrome.runtime.onMessage) {
    chrome.runtime.onMessage.addListener((message) => {
      if (message && message.type === 'STATS_UPDATED') {
        (async () => {
          await loadStateFromStorage();
          renderDashboard();
          renderStats();
        })();
      }
    });
  }
});

async function loadStateFromStorage() {
  const data = await chrome.storage.local.get(['habits', 'settings']);
  habitsState = data.habits || [];
  settingsState = {
    mode: 'cycle',
    cycleInterval: 45,
    startHour: '09:00',
    endHour: '18:00',
    workDays: [1, 2, 3, 4, 5],
    soundEnabled: true,
    paused: false,
    ...(data.settings || {})
  };
}

// ----------------------------------------------------
// Tab Navigation
// ----------------------------------------------------
function initializeTabs() {
  const tabButtons = document.querySelectorAll('.tab-btn');
  const viewPanes = document.querySelectorAll('.view-pane');

  tabButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      const targetTab = btn.getAttribute('data-tab');

      // Update button active state
      tabButtons.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');

      // Update pane active state
      viewPanes.forEach(pane => {
        pane.classList.remove('active');
        if (pane.id === `tab-${targetTab}`) {
          pane.classList.add('active');
        }
      });

      // Refresh view-specific data when opened
      if (targetTab === 'dashboard') {
        renderDashboard();
      } else if (targetTab === 'habits') {
        renderHabits();
      } else if (targetTab === 'stats') {
        renderStats();
      } else if (targetTab === 'wellness') {
        renderWellnessHub();
      }
    });
  });
}

// ----------------------------------------------------
// 1. Dashboard Controller
// ----------------------------------------------------
async function initializeDashboardView() {
  const masterToggle = document.getElementById('master-pause-toggle');
  
  if (masterToggle) {
    masterToggle.checked = !settingsState.paused;

    masterToggle.addEventListener('change', async (e) => {
      settingsState.paused = !e.target.checked;
      await chrome.storage.local.set({ settings: settingsState });
      
      // Notify background.js to clear/rebuild alarms
      await safeSendMessage({ type: 'SETTINGS_CHANGED' });
      
      renderDashboard();
    });
  }

  // Trigger reminder now button
  const triggerBtn = document.getElementById('trigger-now-btn');
  if (triggerBtn) {
    triggerBtn.addEventListener('click', async () => {
      triggerBtn.disabled = true;
      triggerBtn.textContent = '⏱️';
      
      try {
        const response = await safeSendMessage({ type: 'TRIGGER_NOW' });
        if (response && !response.success) {
          alert(response.error || 'Failed to trigger.');
        }
      } catch (err) {
        console.error(err);
      } finally {
        setTimeout(() => {
          triggerBtn.disabled = false;
          triggerBtn.textContent = '▶';
        }, 1000);
      }
    });
  }

  const pendingDoneBtn = document.getElementById('pending-done-btn');
  const pendingSkipBtn = document.getElementById('pending-skip-btn');
  
  if (pendingDoneBtn) {
    pendingDoneBtn.addEventListener('click', async () => {
      const section = document.getElementById('pending-habit-section');
      if (!section) return;
      const habitId = section.dataset.habitId;
      const habitName = section.dataset.habitName;

      if (!habitId) return;

      // Write stats directly — avoids service worker wake-up issues
      const storageData = await chrome.storage.local.get(['stats', 'streak', 'lastActiveDate']);
      const stats = storageData.stats || {};
      let streak = storageData.streak || 0;
      let lastActiveDate = storageData.lastActiveDate || '';
      const today = getLocalDateString();
      const yesterday = getYesterdayString();

      if (!stats[today]) stats[today] = { completed: 0, skipped: 0, completionsByHabit: {} };
      stats[today].completed += 1;
      stats[today].completionsByHabit[habitId] = (stats[today].completionsByHabit[habitId] || 0) + 1;

      if (lastActiveDate !== today) {
        streak = lastActiveDate === yesterday ? streak + 1 : 1;
        lastActiveDate = today;
      }

      await chrome.storage.local.set({ stats, streak, lastActiveDate });
      await chrome.storage.local.remove('pendingHabit');
      section.classList.add('hidden');

      await loadStateFromStorage();
      renderDashboard();
      renderStats();
    });
  }

  if (pendingSkipBtn) {
    pendingSkipBtn.addEventListener('click', async () => {
      const section = document.getElementById('pending-habit-section');
      if (!section || !section.dataset.habitId) return;

      const storageData = await chrome.storage.local.get('stats');
      const stats = storageData.stats || {};
      const today = getLocalDateString();

      if (!stats[today]) stats[today] = { completed: 0, skipped: 0, completionsByHabit: {} };
      stats[today].skipped += 1;

      await chrome.storage.local.set({ stats });
      await chrome.storage.local.remove('pendingHabit');
      section.classList.add('hidden');

      await loadStateFromStorage();
      renderDashboard();
      renderStats();
    });
  }

  renderDashboard();
}

async function renderDashboard() {
  const data = await chrome.storage.local.get(['stats', 'streak', 'settings', 'pendingHabit']);
  const stats = data.stats || {};
  const streak = data.streak || 0;
  const settings = data.settings || {};
  
  const today = getLocalDateString();
  const todayStats = stats[today] || { completed: 0, skipped: 0 };

  const completed = todayStats.completed || 0;
  const skipped = todayStats.skipped || 0;
  const total = completed + skipped;
  const percent = total > 0 ? Math.round((completed / total) * 100) : 0;

  // Render text counts
  document.getElementById('streak-value').textContent = streak;
  document.getElementById('completed-value').textContent = completed;
  document.getElementById('skipped-value').textContent = skipped;
  document.getElementById('today-percent-text').textContent = `${percent}%`;

  // Animate progress circle SVG (r=50, C = 2 * pi * r = 314.16)
  const circle = document.getElementById('today-progress-circle');
  const circumference = 314.16;
  const offset = circumference - (percent / 100) * circumference;
  circle.style.strokeDashoffset = offset;

  // Master switch status display styling
  const masterToggle = document.getElementById('master-pause-toggle');
  masterToggle.checked = !settings.paused;

  // Render Pending Habit Section
  const pendingSection = document.getElementById('pending-habit-section');
  if (data.pendingHabit) {
    document.getElementById('pending-habit-name').textContent = data.pendingHabit.name;
    pendingSection.classList.remove('hidden');
    pendingSection.dataset.habitId = data.pendingHabit.id;
    pendingSection.dataset.habitName = data.pendingHabit.name;
  } else {
    pendingSection.classList.add('hidden');
  }

  // Get active reminder alarm
  await updateNextReminderETA();
}

async function updateNextReminderETA() {
  const titleEl = document.getElementById('next-reminder-title');
  const etaEl = document.getElementById('next-reminder-eta');

  const data = await chrome.storage.local.get(['settings', 'habits']);
  const settings = data.settings || {};
  const habits = data.habits || [];

  if (settings.paused) {
    titleEl.textContent = 'DeskHabits is Paused';
    etaEl.textContent = 'Turn on "Active" above to resume';
    return;
  }

  // Double check if we are in active hours right now
  const now = new Date();
  const startM = timeStringToMinutes(settings.startHour);
  const endM = timeStringToMinutes(settings.endHour);
  const currentM = now.getHours() * 60 + now.getMinutes();
  const insideHours = startM <= endM ? (currentM >= startM && currentM <= endM) : (currentM >= startM || currentM <= endM);
  const insideDays = settings.workDays.includes(now.getDay());

  if (!insideDays || !insideHours) {
    titleEl.textContent = 'Outside Active Window';
    
    // Calculate start time tomorrow or next work day
    let targetDate = new Date();
    const [startH, startMin] = settings.startHour.split(':').map(Number);
    targetDate.setHours(startH, startMin, 0, 0);

    if (targetDate.getTime() <= now.getTime() || !settings.workDays.includes(targetDate.getDay())) {
      for (let i = 1; i <= 7; i++) {
        targetDate.setDate(targetDate.getDate() + 1);
        if (settings.workDays.includes(targetDate.getDay())) {
          break;
        }
      }
    }
    
    const formattedTime = targetDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const formattedDate = targetDate.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' });
    etaEl.textContent = `Starts: ${formattedDate} at ${formattedTime}`;
    return;
  }

  const alarms = await chrome.alarms.getAll();
  const activeAlarms = alarms.filter(a => a.name === 'cycle_alarm' || a.name.startsWith('habit_alarm|||'));

  if (activeAlarms.length === 0) {
    titleEl.textContent = 'No alarms active';
    etaEl.textContent = 'Please enable habits in the Habits tab';
    return;
  }

  // Sort by next trigger time
  activeAlarms.sort((a, b) => a.scheduledTime - b.scheduledTime);
  const nextAlarm = activeAlarms[0];

  const diffMs = nextAlarm.scheduledTime - Date.now();
  const diffMinutes = Math.max(0, Math.round(diffMs / 60000));

  let etaText = diffMinutes <= 0 ? 'any second now' : `in ${diffMinutes}m`;
  if (diffMinutes === 1) etaText = 'in 1 minute';

  if (nextAlarm.name === 'cycle_alarm') {
    titleEl.textContent = 'Next Habit Cycle';
    etaEl.textContent = `Notification triggers ${etaText}`;
  } else {
    const habitId = nextAlarm.name.replace('habit_alarm|||', '');
    const habit = habits.find(h => h.id === habitId);
    titleEl.textContent = habit ? habit.name : 'Physical Habit Reminders';
    etaEl.textContent = `Triggering ${etaText}`;
  }
}

function timeStringToMinutes(timeStr) {
  const [hours, minutes] = timeStr.split(':').map(Number);
  return hours * 60 + minutes;
}

// ----------------------------------------------------
// 2. Habits Controller (CRUD)
// ----------------------------------------------------
function initializeHabitsView() {
  const openFormBtn = document.getElementById('open-add-habit-btn');
  const cancelFormBtn = document.getElementById('cancel-habit-btn');
  const saveFormBtn = document.getElementById('save-habit-btn');
  const formContainer = document.getElementById('habit-form-container');

  openFormBtn.addEventListener('click', () => {
    document.getElementById('habit-form-title').textContent = 'Create New Habit';
    document.getElementById('habit-name-input').value = '';
    document.getElementById('habit-interval-input').value = '30';
    document.getElementById('habit-edit-id').value = '';
    formContainer.classList.remove('hidden');
    openFormBtn.classList.add('hidden');
  });

  cancelFormBtn.addEventListener('click', () => {
    formContainer.classList.add('hidden');
    openFormBtn.classList.remove('hidden');
  });

  saveFormBtn.addEventListener('click', async () => {
    const name = document.getElementById('habit-name-input').value.trim();
    const interval = parseInt(document.getElementById('habit-interval-input').value);
    const editId = document.getElementById('habit-edit-id').value;

    if (!name) {
      alert('Please fill out the habit action name.');
      return;
    }
    if (isNaN(interval) || interval <= 0) {
      alert('Please enter a valid interval in minutes (greater than 0).');
      return;
    }

    if (editId) {
      // Edit mode
      const idx = habitsState.findIndex(h => h.id === editId);
      if (idx !== -1) {
        habitsState[idx].name = name;
        habitsState[idx].interval = interval;
      }
    } else {
      // Add mode
      const newHabit = {
        id: 'habit_' + Date.now(),
        name: name,
        interval: interval,
        enabled: true,
        created: Date.now()
      };
      habitsState.push(newHabit);
    }

    await chrome.storage.local.set({ habits: habitsState });
    await safeSendMessage({ type: 'HABITS_CHANGED' });
    
    // Clear and Hide Form
    formContainer.classList.add('hidden');
    openFormBtn.classList.remove('hidden');
    
    renderHabits();
    renderDashboard(); // Update alarms count if displayed
  });

  renderHabits();
}

function renderHabits() {
  const listContainer = document.getElementById('habits-list-container');
  listContainer.innerHTML = '';

  if (habitsState.length === 0) {
    listContainer.innerHTML = '<div class="glass-card text-center" style="color: var(--text-sub); font-size: 12px; padding: 20px;">No habits defined yet. Click + Add Habit to create one.</div>';
    return;
  }

  // Sort habits by creation time
  const sortedHabits = [...habitsState].sort((a, b) => b.created - a.created);

  sortedHabits.forEach(habit => {
    const item = document.createElement('div');
    item.className = 'habit-item';
    item.innerHTML = `
      <div class="habit-info-group">
        <span class="habit-title">${escapeHTML(habit.name)}</span>
        <span class="habit-meta">Every ${habit.interval} minutes</span>
      </div>
      <div class="habit-controls">
        <button class="icon-btn edit-btn" data-id="${habit.id}">✏️</button>
        <button class="icon-btn delete-btn" data-id="${habit.id}">🗑️</button>
        <label class="switch">
          <input type="checkbox" class="habit-toggle" data-id="${habit.id}" ${habit.enabled ? 'checked' : ''}>
          <span class="slider round"></span>
        </label>
      </div>
    `;

    // Event listener: toggle checkbox
    item.querySelector('.habit-toggle').addEventListener('change', async (e) => {
      const hId = e.target.getAttribute('data-id');
      const idx = habitsState.findIndex(h => h.id === hId);
      if (idx !== -1) {
        habitsState[idx].enabled = e.target.checked;
        await chrome.storage.local.set({ habits: habitsState });
        await safeSendMessage({ type: 'HABITS_CHANGED' });
        updateNextReminderETA();
      }
    });

    // Event listener: Edit
    item.querySelector('.edit-btn').addEventListener('click', () => {
      const hId = habit.id;
      document.getElementById('habit-form-title').textContent = 'Edit Habit';
      document.getElementById('habit-name-input').value = habit.name;
      document.getElementById('habit-interval-input').value = habit.interval;
      document.getElementById('habit-edit-id').value = hId;
      
      document.getElementById('habit-form-container').classList.remove('hidden');
      document.getElementById('open-add-habit-btn').classList.add('hidden');
    });

    // Event listener: Delete
    item.querySelector('.delete-btn').addEventListener('click', async () => {
      if (confirm(`Are you sure you want to delete "${habit.name}"?`)) {
        habitsState = habitsState.filter(h => h.id !== habit.id);
        await chrome.storage.local.set({ habits: habitsState });
        await safeSendMessage({ type: 'HABITS_CHANGED' });
        renderHabits();
        renderDashboard();
      }
    });

    listContainer.appendChild(item);
  });
}

function escapeHTML(str) {
  return str.replace(/[&<>'"]/g, 
    tag => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      "'": '&#39;',
      '"': '&quot;'
    }[tag] || tag)
  );
}

// ----------------------------------------------------
// 3. Settings Controller
// ----------------------------------------------------
function initializeSettingsView() {
  const radioCycle = document.querySelector('input[name="reminder-mode"][value="cycle"]');
  const radioIndividual = document.querySelector('input[name="reminder-mode"][value="individual"]');
  const cycleGroup = document.getElementById('cycle-interval-group');

  // Initial Visibility toggling
  const toggleCycleIntervalInput = () => {
    if (radioCycle.checked) {
      cycleGroup.classList.remove('hidden');
    } else {
      cycleGroup.classList.add('hidden');
    }
  };

  radioCycle.addEventListener('change', toggleCycleIntervalInput);
  radioIndividual.addEventListener('change', toggleCycleIntervalInput);

  // Populate initial values
  radioCycle.checked = settingsState.mode === 'cycle';
  radioIndividual.checked = settingsState.mode === 'individual';
  toggleCycleIntervalInput();

  document.getElementById('settings-cycle-interval').value = settingsState.cycleInterval || 45;
  document.getElementById('settings-start-time').value = settingsState.startHour || '09:00';
  document.getElementById('settings-end-time').value = settingsState.endHour || '18:00';

  // Workdays checklist population
  const workdayCheckboxes = document.querySelectorAll('input[name="workday"]');
  workdayCheckboxes.forEach(cb => {
    const val = parseInt(cb.value);
    cb.checked = settingsState.workDays.includes(val);
  });

  // Save Settings
  document.getElementById('save-settings-btn').addEventListener('click', async () => {
    const selectedMode = document.querySelector('input[name="reminder-mode"]:checked').value;
    const cycleInterval = parseInt(document.getElementById('settings-cycle-interval').value);
    const startTime = document.getElementById('settings-start-time').value;
    const endTime = document.getElementById('settings-end-time').value;

    const selectedDays = [];
    document.querySelectorAll('input[name="workday"]:checked').forEach(cb => {
      selectedDays.push(parseInt(cb.value));
    });

    if (isNaN(cycleInterval) || cycleInterval <= 0) {
      alert('Global cycle interval must be a valid number of minutes (greater than 0).');
      return;
    }
    if (selectedDays.length === 0) {
      alert('Please select at least one active workday.');
      return;
    }

    settingsState.mode = selectedMode;
    settingsState.cycleInterval = cycleInterval;
    settingsState.startHour = startTime;
    settingsState.endHour = endTime;
    settingsState.workDays = selectedDays;

    await chrome.storage.local.set({ settings: settingsState });
    await safeSendMessage({ type: 'SETTINGS_CHANGED' });

    // Show success feedback
    const toast = document.getElementById('settings-save-success');
    toast.classList.remove('hidden');
    setTimeout(() => {
      toast.classList.add('hidden');
    }, 2000);

    renderDashboard();
  });

  const resetBtn = document.getElementById('reset-stats-btn');
  if (resetBtn) {
    resetBtn.addEventListener('click', async () => {
      if (confirm('Are you sure you want to reset all your stats and streak data? This cannot be undone.')) {
        await chrome.storage.local.set({ stats: {}, streak: 0, lastActiveDate: '' });
        alert('All stats and streaks have been reset.');
        await loadStateFromStorage();
        renderDashboard();
        renderStats();
      }
    });
  }
}

// ----------------------------------------------------
// 4. Stats Controller (Charts & Summary)
// ----------------------------------------------------
async function initializeStatsView() {
  await renderStats();
}

async function renderStats() {
  const data = await chrome.storage.local.get('stats');
  const stats = data.stats || {};

  // 1. Calculate overall summary metrics
  let totalCompletions = 0;
  let totalSkips = 0;

  Object.values(stats).forEach(day => {
    totalCompletions += day.completed || 0;
    totalSkips += day.skipped || 0;
  });

  const totalInteractions = totalCompletions + totalSkips;
  const overallRate = totalInteractions > 0 ? Math.round((totalCompletions / totalInteractions) * 100) : 0;

  const totalCompletionsEl = document.getElementById('stats-total-completions');
  const completionRateEl = document.getElementById('stats-completion-rate');

  if (totalCompletionsEl) totalCompletionsEl.textContent = totalCompletions;
  if (completionRateEl) completionRateEl.textContent = `${overallRate}%`;

  // 2. Render weekly bar chart (last 7 days)
  const chartBarsContainer = document.getElementById('weekly-chart-bars');
  const chartLabelsContainer = document.getElementById('weekly-chart-labels');
  
  if (chartBarsContainer) chartBarsContainer.innerHTML = '';
  if (chartLabelsContainer) chartLabelsContainer.innerHTML = '';

  const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const datesList = [];

  // Get current week's Monday to Sunday
  const curr = new Date();
  const day = curr.getDay(); // 0 = Sunday, 1 = Monday
  const diffToMonday = curr.getDate() - day + (day === 0 ? -6 : 1);
  const monday = new Date(curr.getTime());
  monday.setDate(diffToMonday);

  for (let i = 0; i < 7; i++) {
    const d = new Date(monday.getTime());
    d.setDate(monday.getDate() + i);
    datesList.push(d);
  }

  // Draw chart elements
  datesList.forEach(dateObj => {
    const dateString = getLocalDateString(dateObj);
    const dayStats = stats[dateString] || { completed: 0, skipped: 0 };
    const compCount = dayStats.completed || 0;
    const skipCount = dayStats.skipped || 0;
    const totalDay = compCount + skipCount;
    const dayPercent = totalDay > 0 ? Math.round((compCount / totalDay) * 100) : 0;

    // We scale the bar height to represent completed reminders.
    // If there were no reminders today, height is 0%
    const barHeightPercent = totalDay > 0 ? dayPercent : 0;

    // Create bar DOM
    const barWrapper = document.createElement('div');
    barWrapper.className = 'chart-bar-wrap';
    barWrapper.title = `${dateObj.toLocaleDateString([], { month: 'short', day: 'numeric' })}: ${compCount} Done, ${skipCount} Skipped (${dayPercent}%)`;
    
    const barFill = document.createElement('div');
    barFill.className = 'chart-bar-fill';
    barFill.style.height = `${barHeightPercent}%`;
    
    // Customize color depending on performance (grey if empty, red if low, green if high)
    if (totalDay > 0) {
      if (dayPercent < 50) {
        barFill.style.background = 'var(--danger)';
      } else if (dayPercent < 80) {
        barFill.style.background = 'var(--warning)';
      } else {
        barFill.style.background = 'var(--success)';
      }
    } else {
      barFill.style.background = 'rgba(255, 255, 255, 0.05)';
      barFill.style.height = '4px'; // Minimal height placeholder
    }

    barWrapper.appendChild(barFill);
    if (chartBarsContainer) chartBarsContainer.appendChild(barWrapper);

    // Create Label DOM
    const labelItem = document.createElement('div');
    labelItem.className = 'chart-label-item';
    labelItem.textContent = dayNames[dateObj.getDay()];
    if (chartLabelsContainer) chartLabelsContainer.appendChild(labelItem);
  });
}

// ----------------------------------------------------
// 5. Wellness Hub Controller (Live JSON Feed)
// ----------------------------------------------------
const FALLBACK_DEALS = [
  {
    id: "hydration_1",
    category: "Hydration",
    title: "LARQ Smart Self-Cleaning Bottle",
    description: "UV-C LED light sanitizes water & bottle interior automatically.",
    price: "$99.00",
    rating: "★ 4.8",
    badge_class: "hydration",
    image_url: "https://m.media-amazon.com/images/I/51+uE5wN5vL._AC_SL1500_.jpg",
    affiliate_url: "https://www.amazon.com/s?k=smart+water+bottle&tag=deskhabits-20"
  },
  {
    id: "posture_1",
    category: "Posture",
    title: "Everlasting Ergonomic Seat Cushion",
    description: "Memory foam U-shape cut-out relieves tailbone & back pressure.",
    price: "$39.95",
    rating: "★ 4.9",
    badge_class: "posture",
    image_url: "https://m.media-amazon.com/images/I/81h9bXn8BvL._AC_SL1500_.jpg",
    affiliate_url: "https://www.amazon.com/s?k=ergonomic+seat+cushion&tag=deskhabits-20"
  },
  {
    id: "recovery_1",
    category: "Recovery",
    title: "Theragun Mini Deep Tissue Massage Gun",
    description: "Ultra-portable massage gun relieves neck & shoulder stiffness.",
    price: "$179.00",
    rating: "★ 4.8",
    badge_class: "recovery",
    image_url: "https://m.media-amazon.com/images/I/61NfT-jN27L._AC_SL1500_.jpg",
    affiliate_url: "https://www.amazon.com/s?k=mini+massage+gun&tag=deskhabits-20"
  },
  {
    id: "eye_health_1",
    category: "Eye Health",
    title: "ANRRI Blue Light Blocking Glasses",
    description: "Reduces digital eye strain & headaches during long coding sessions.",
    price: "$25.95",
    rating: "★ 4.7",
    badge_class: "eye-health",
    image_url: "https://m.media-amazon.com/images/I/61D8N2g4b4L._AC_SL1500_.jpg",
    affiliate_url: "https://www.amazon.com/s?k=blue+light+blocking+glasses&tag=deskhabits-20"
  }
];

async function renderWellnessHub() {
  const container = document.getElementById('wellness-list-container');
  if (!container) return;

  let deals = FALLBACK_DEALS;

  try {
    const res = await fetch('https://raw.githubusercontent.com/barradas/habits-notification-extension/main/wellness_deals.json', { cache: 'no-cache' });
    if (res.ok) {
      const data = await res.json();
      if (data && Array.isArray(data.deals) && data.deals.length > 0) {
        deals = data.deals;
      }
    }
  } catch (err) {
    console.log('Using local fallback wellness deals:', err ? err.message : err);
  }

  container.innerHTML = '';

  deals.forEach(deal => {
    const card = document.createElement('div');
    card.className = 'wellness-card';
    card.innerHTML = `
      <div class="product-badge-row">
        <span class="product-badge ${deal.badge_class || 'hydration'}">${escapeHTML(deal.category || 'Gear')}</span>
        <span class="product-rating">${escapeHTML(deal.rating || '★ 4.8')}</span>
      </div>
      <div class="product-content">
        <img class="product-thumb-img" src="${escapeHTML(deal.image_url)}" alt="${escapeHTML(deal.title)}" />
        <div class="product-info">
          <h4>${escapeHTML(deal.title)}</h4>
          <p>${escapeHTML(deal.description)}</p>
          <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 4px;">
            <span class="product-price-tag">${escapeHTML(deal.price || '')}</span>
            <a href="${escapeHTML(deal.affiliate_url)}" target="_blank" rel="noopener noreferrer" class="btn btn-primary btn-sm product-link">Check Deal ↗</a>
          </div>
        </div>
      </div>
    `;

    const img = card.querySelector('.product-thumb-img');
    if (img) {
      img.addEventListener('error', () => {
        img.src = '/icons/icon-48.png';
      }, { once: true });
    }

    container.appendChild(card);
  });
}
