// Default Habits and Settings
const DEFAULT_HABITS = [
  { id: 'water', name: 'Drink a glass of water 💧', interval: 45, enabled: true, created: Date.now() },
  { id: 'squats', name: 'Do 15 squats 🏋️', interval: 60, enabled: true, created: Date.now() },
  { id: 'stretch', name: 'Stretch neck & shoulders 🧘', interval: 30, enabled: true, created: Date.now() },
  { id: 'eyes', name: 'Look away for 20s (20-20-20 rule) 👁️', interval: 20, enabled: true, created: Date.now() },
  { id: 'walk', name: 'Stand up and walk for 2 mins 🚶', interval: 60, enabled: true, created: Date.now() }
];

const DEFAULT_SETTINGS = {
  mode: 'cycle', // 'cycle' or 'individual'
  cycleInterval: 45, // minutes
  startHour: '09:00',
  endHour: '18:00',
  workDays: [1, 2, 3, 4, 5], // Monday to Friday (0 = Sunday, 1 = Monday, etc.)
  soundEnabled: true,
  paused: false
};

// Track notifications that have been explicitly handled to prevent double-processing
// or race conditions on OSes where clearing triggers onClosed incorrectly.
const processedNotifications = new Set();

// ----------------------------------------------------
// Life-cycle Events
// ----------------------------------------------------

chrome.runtime.onInstalled.addListener(async (details) => {
  if (details.reason === 'install') {
    await chrome.storage.local.set({
      habits: DEFAULT_HABITS,
      settings: DEFAULT_SETTINGS,
      stats: {},
      streak: 0,
      lastActiveDate: '',
      lastCycledHabitId: ''
    });
    console.log('DeskHabits initialized with default settings and habits.');
  }
  await rebuildAlarms();
});

chrome.runtime.onStartup.addListener(async () => {
  await rebuildAlarms();
});

// ----------------------------------------------------
// Time Verification & Rescheduling Helpers
// ----------------------------------------------------

function timeStringToMinutes(timeStr) {
  const [hours, minutes] = timeStr.split(':').map(Number);
  return hours * 60 + minutes;
}

function isWithinActiveWindow(now, settings) {
  // Check active day
  if (!settings.workDays.includes(now.getDay())) {
    return false;
  }

  // Check active hours
  const currentMinutes = now.getHours() * 60 + now.getMinutes();
  const startMinutes = timeStringToMinutes(settings.startHour);
  const endMinutes = timeStringToMinutes(settings.endHour);

  if (startMinutes <= endMinutes) {
    return currentMinutes >= startMinutes && currentMinutes <= endMinutes;
  } else {
    // Overnight shift: e.g. 22:00 to 06:00
    return currentMinutes >= startMinutes || currentMinutes <= endMinutes;
  }
}

function getNextWorkingWindowStart(now, settings) {
  let targetDate = new Date(now.getTime());
  const [startH, startM] = settings.startHour.split(':').map(Number);
  targetDate.setHours(startH, startM, 0, 0);

  // If the target time today is in the past, or if today is not a work day,
  // we look at future days.
  if (targetDate.getTime() <= now.getTime() || !settings.workDays.includes(targetDate.getDay())) {
    for (let i = 1; i <= 7; i++) {
      targetDate.setDate(targetDate.getDate() + 1);
      if (settings.workDays.includes(targetDate.getDay())) {
        break;
      }
    }
  }

  return targetDate.getTime();
}

// ----------------------------------------------------
// Alarm Management
// ----------------------------------------------------

async function rebuildAlarms() {
  await chrome.alarms.clearAll();

  const data = await chrome.storage.local.get(['settings', 'habits']);
  const settings = { ...DEFAULT_SETTINGS, ...(data.settings || {}) };
  const habits = data.habits || DEFAULT_HABITS;

  if (settings.paused) {
    console.log('DeskHabits is paused. No alarms scheduled.');
    return;
  }

  const now = new Date();
  const inWindow = isWithinActiveWindow(now, settings);
  let startTimestamp = null;

  if (!inWindow) {
    startTimestamp = getNextWorkingWindowStart(now, settings);
    console.log(`Currently outside active window. Rescheduling alarms to start on next session: ${new Date(startTimestamp).toLocaleString()}`);
  }

  if (settings.mode === 'cycle') {
    const activeHabitsCount = habits.filter(h => h.enabled).length;
    if (activeHabitsCount === 0) return;

    if (startTimestamp) {
      // Outside window: fire first at next start window, then repeat
      chrome.alarms.create('cycle_alarm', {
        when: startTimestamp,
        periodInMinutes: settings.cycleInterval
      });
    } else {
      // Inside window: fire after the standard cycle interval
      chrome.alarms.create('cycle_alarm', {
        delayInMinutes: settings.cycleInterval,
        periodInMinutes: settings.cycleInterval
      });
    }
  } else if (settings.mode === 'individual') {
    const enabledHabits = habits.filter(h => h.enabled);
    
    for (const habit of enabledHabits) {
      const alarmName = `habit_alarm|||${habit.id}`;
      if (startTimestamp) {
        // Outside window: fire at next start window, then repeat
        chrome.alarms.create(alarmName, {
          when: startTimestamp,
          periodInMinutes: habit.interval
        });
      } else {
        // Inside window: fire after the habit-specific interval
        chrome.alarms.create(alarmName, {
          delayInMinutes: habit.interval,
          periodInMinutes: habit.interval
        });
      }
    }
  }
}

// ----------------------------------------------------
// Notification Triggering
// ----------------------------------------------------

async function triggerNotification(habit) {
  const data = await chrome.storage.local.get('settings');
  const settings = data.settings || DEFAULT_SETTINGS;

  const notificationId = `habit-notification|||${habit.id}|||${Date.now()}`;
  
  // Store as pending so Linux users can mark it from the popup dashboard
  await chrome.storage.local.set({ pendingHabit: habit });
  
  chrome.notifications.create(notificationId, {
    type: 'basic',
    iconUrl: '/icons/icon-128.png',
    title: 'Time for a Desk Break!',
    message: habit.name,
    buttons: [
      { title: 'Done! ✅' },
      { title: 'Snooze 5m ⏳' }
    ],
    requireInteraction: true // Keep notification visible until action
  }, (id) => {
    if (chrome.runtime.lastError) {
      console.error('Error creating notification:', chrome.runtime.lastError);
    } else {
      console.log(`Notification triggered for: ${habit.name}`);
    }
  });
}

// ----------------------------------------------------
// Alarm Event Listener
// ----------------------------------------------------

chrome.alarms.onAlarm.addListener(async (alarm) => {
  const data = await chrome.storage.local.get(['settings', 'habits', 'lastCycledHabitId']);
  const settings = data.settings || DEFAULT_SETTINGS;
  const habits = data.habits || DEFAULT_HABITS;

  if (settings.paused) return;

  // Verify active window before firing
  const now = new Date();
  if (!isWithinActiveWindow(now, settings)) {
    console.log('Alarm fired outside active window. Rescheduling...');
    await rebuildAlarms();
    return;
  }

  // Handle Snooze Alarm
  if (alarm.name.startsWith('snooze_alarm|||')) {
    const parts = alarm.name.split('|||');
    const habitId = parts[1];
    const habit = habits.find(h => h.id === habitId);
    if (habit) {
      await triggerNotification(habit);
    }
    // Delete the one-off snooze alarm
    await chrome.alarms.clear(alarm.name);
    return;
  }

  // Handle Cycle Mode Alarm
  if (alarm.name === 'cycle_alarm') {
    const enabledHabits = habits.filter(h => h.enabled);
    if (enabledHabits.length === 0) return;

    let nextHabit;
    const lastId = data.lastCycledHabitId;

    if (lastId) {
      const lastIndex = enabledHabits.findIndex(h => h.id === lastId);
      if (lastIndex !== -1 && lastIndex < enabledHabits.length - 1) {
        nextHabit = enabledHabits[lastIndex + 1];
      } else {
        nextHabit = enabledHabits[0];
      }
    } else {
      nextHabit = enabledHabits[0];
    }

    if (nextHabit) {
      await chrome.storage.local.set({ lastCycledHabitId: nextHabit.id });
      await triggerNotification(nextHabit);
    }
  }

  // Handle Individual Mode Alarm
  if (alarm.name.startsWith('habit_alarm|||')) {
    const habitId = alarm.name.replace('habit_alarm|||', '');
    const habit = habits.find(h => h.id === habitId);
    if (habit && habit.enabled) {
      await triggerNotification(habit);
    }
  }
});

// ----------------------------------------------------
// Notification Button Interactions
// ----------------------------------------------------

// Helper to get local date string YYYY-MM-DD
function getLocalDateString(d = new Date()) {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

async function markHabitAsDone(notificationId) {
  if (!notificationId.startsWith('habit-notification|||')) return;
  processedNotifications.add(notificationId);

  const parts = notificationId.split('|||');
  const habitId = parts[1];

  const data = await chrome.storage.local.get(['habits', 'stats', 'streak', 'lastActiveDate']);
  const habits = data.habits || DEFAULT_HABITS;
  const stats = data.stats || {};
  let streak = data.streak || 0;
  let lastActiveDate = data.lastActiveDate || '';

  const habit = habits.find(h => h.id === habitId);
  if (!habit) return;

  const today = getLocalDateString();

  console.log(`Habit completed: ${habit.name}`);
  
  if (!stats[today]) {
    stats[today] = { completed: 0, skipped: 0, completionsByHabit: {} };
  }
  stats[today].completed += 1;
  stats[today].completionsByHabit[habitId] = (stats[today].completionsByHabit[habitId] || 0) + 1;

  if (lastActiveDate !== today) {
    if (lastActiveDate === getYesterdayDateString()) {
      streak += 1;
    } else if (lastActiveDate === '') {
      streak = 1;
    } else {
      streak = 1;
    }
    lastActiveDate = today;
  }

  await chrome.storage.local.set({ stats, streak, lastActiveDate });
  chrome.notifications.clear(notificationId);
  await chrome.storage.local.remove('pendingHabit');

  chrome.runtime.sendMessage({ type: 'STATS_UPDATED' }).catch(() => {});
}

async function markHabitAsSkipped(notificationId) {
  if (!notificationId.startsWith('habit-notification|||')) return;
  processedNotifications.add(notificationId);

  const parts = notificationId.split('|||');
  const habitId = parts[1];

  const today = getLocalDateString();
  const data = await chrome.storage.local.get('stats');
  const stats = data.stats || {};

  if (!stats[today]) {
    stats[today] = { completed: 0, skipped: 0, completionsByHabit: {} };
  }
  stats[today].skipped += 1;

  await chrome.storage.local.set({ stats });
  chrome.notifications.clear(notificationId);
  await chrome.storage.local.remove('pendingHabit');

  chrome.runtime.sendMessage({ type: 'STATS_UPDATED' }).catch(() => {});
}

chrome.notifications.onClicked.addListener(async (notificationId) => {
  await markHabitAsDone(notificationId);
});

chrome.notifications.onButtonClicked.addListener(async (notificationId, buttonIndex) => {
  if (!notificationId.startsWith('habit-notification|||')) return;
  
  // Flag immediately so onClosed listener (triggered by clearing or OS dismissal) won't log a skip
  processedNotifications.add(notificationId);

  if (buttonIndex === 0) {
    await markHabitAsDone(notificationId);
  } else if (buttonIndex === 1) {
    // Clicked "Snooze 5m ⏳"
    const parts = notificationId.split('|||');
    const habitId = parts[1];
    
    const data = await chrome.storage.local.get(['habits', 'stats']);
    const habits = data.habits || DEFAULT_HABITS;
    const stats = data.stats || {};
    const habit = habits.find(h => h.id === habitId);
    if (!habit) return;

    console.log(`Habit snoozed: ${habit.name}`);
    
    const snoozeAlarmName = `snooze_alarm|||${habitId}|||${Date.now()}`;
    chrome.alarms.create(snoozeAlarmName, { delayInMinutes: 5 });

    const today = getLocalDateString();
    if (!stats[today]) {
      stats[today] = { completed: 0, skipped: 0, completionsByHabit: {} };
    }
    // We don't mark as skipped yet since user snoozed it.
    
    chrome.notifications.clear(notificationId);
  }
});

// If the user dismisses the notification (closes it without clicking buttons), log as skipped
chrome.notifications.onClosed.addListener(async (notificationId, byUser) => {
  if (!notificationId.startsWith('habit-notification|||')) return;
  if (!byUser) return; // Ignore programmatic closures
  
  if (processedNotifications.has(notificationId)) {
    processedNotifications.delete(notificationId);
    return;
  }

  await markHabitAsSkipped(notificationId);
});

// Helper for yesterday's date
function getYesterdayDateString() {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return getLocalDateString(d);
}

// ----------------------------------------------------
// Communication Interface
// ----------------------------------------------------

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'SETTINGS_CHANGED' || message.type === 'HABITS_CHANGED') {
    (async () => {
      await rebuildAlarms();
      sendResponse({ success: true });
    })();
    return true; // Keep message channel open for async response
  }
  if (message.type === 'TRIGGER_NOW') {
    (async () => {
      const data = await chrome.storage.local.get('habits');
      const habits = data.habits || DEFAULT_HABITS;
      const enabledHabits = habits.filter(h => h.enabled);
      if (enabledHabits.length > 0) {
        const randomHabit = enabledHabits[Math.floor(Math.random() * enabledHabits.length)];
        await triggerNotification(randomHabit);
        sendResponse({ success: true });
      } else {
        sendResponse({ success: false, error: 'No active habits found.' });
      }
    })();
    return true;
  }
  if (message.type === 'MARK_DONE') {
    (async () => {
      await markHabitAsDone(message.notificationId);
      sendResponse({ success: true });
    })();
    return true;
  }
  if (message.type === 'MARK_SKIPPED') {
    (async () => {
      await markHabitAsSkipped(message.notificationId);
      sendResponse({ success: true });
    })();
    return true;
  }
});
