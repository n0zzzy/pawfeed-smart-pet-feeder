// Smart Pet Feeder - simulated device logic.
// Shared by server.js (Node, in-memory) and the browser (hosted / offline mode, saved in localStorage).
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.FeederCore = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  const SLOT_GRAMS = 10;          // 1 slot = ~10 g
  const MAX_SLOTS = 10;           // hopper/dispenser limit
  const LOW_FOOD_THRESHOLD = 15;  // percent
  const RECONNECT_DELAY_MS = 3000;
  // Demo account for the class project (not real security: the app has no private data).
  const ACCOUNTS = { testuser: 'Feeder@123' };

  function freshState() {
    return {
      deviceId: 'FEEDER_01',
      connection: 'CONNECTED',
      networkAvailable: true,
      manualPairingCalls: 0,
      foodLevel: 100,
      portionSlots: 1,
      dispenseCount: 0,
      jammed: false,
      clock: '07:59:00',
      schedules: [],       // { id, time, slots }
      deviceSchedules: [], // copy that lives "on the device" (synced from app)
      feedLog: [],         // { id, time, source, slots, weight_grams, status }
      notifications: [],   // { id, type, message, time }
      nextId: 1,
    };
  }

  function toSeconds(t) {
    const [h, m, s = 0] = t.split(':').map(Number);
    return h * 3600 + m * 60 + s;
  }
  function isValidTime(t) {
    return typeof t === 'string' && /^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/.test(t);
  }
  function normTime(t) { return t.length === 5 ? `${t}:00` : t; }

  // load(): returns a saved state or null.  save(state): persists it (optional).
  // authenticate(username, password): checks a login (defaults to the built-in demo account).
  function createDevice({ load, save, authenticate } = {}) {
    const checkLogin = authenticate || ((username, password) => ACCOUNTS[username] === password);
    let state = (load && load()) || freshState();
    let reconnectTimer = null;
    const persist = () => save && save(state);

    // Timers don't survive a page reload, so finish any pending network/sync work on load.
    if (state.connection === 'RECONNECTING' && state.networkAvailable) state.connection = 'CONNECTED';
    state.deviceSchedules = state.schedules.map(s => {
      const old = state.deviceSchedules.find(d => d.id === s.id && d.time === s.time);
      return { ...s, fired: old ? old.fired : false };
    });

    function notify(type, message) {
      state.notifications.unshift({ id: state.nextId++, type, message, time: state.clock });
    }

    // Real feeders are never exactly on target; vary within ±2%.
    function measureWeight(slots) {
      const target = slots * SLOT_GRAMS;
      const variance = (Math.random() * 0.04 - 0.02) * target;
      return Math.round((target + variance) * 10) / 10;
    }

    function checkFoodLevel() {
      const hasAlert = state.notifications.some(n => n.type === 'LOW_FOOD');
      if (state.foodLevel < LOW_FOOD_THRESHOLD && !hasAlert) {
        notify('LOW_FOOD', `Low food: hopper is at ${state.foodLevel}%. Please refill soon.`);
      }
      if (state.foodLevel >= LOW_FOOD_THRESHOLD) {
        state.notifications = state.notifications.filter(n => n.type !== 'LOW_FOOD');
      }
    }

    function dispense(source, slots) {
      if (state.connection !== 'CONNECTED' && source === 'MANUAL') {
        return { status: 'OFFLINE', weight_grams: 0 };
      }
      if (state.jammed) {
        const entry = { id: state.nextId++, time: state.clock, source, slots, weight_grams: 0, status: 'JAM_DETECTED' };
        state.feedLog.unshift(entry);
        notify('JAM', 'Motor stopped: chute jam detected. Please clear the chute.');
        return entry;
      }
      const weight = measureWeight(slots);
      state.dispenseCount += 1;
      state.foodLevel = Math.max(0, state.foodLevel - slots);
      const entry = { id: state.nextId++, time: state.clock, source, slots, weight_grams: weight, status: 'DISPENSED', triggered: true };
      state.feedLog.unshift(entry);
      checkFoodLevel();
      return entry;
    }

    // Device clock tick: fire any schedule that is due (within ±60 s) and not yet fired.
    function tick() {
      const now = toSeconds(state.clock);
      for (const sch of state.deviceSchedules) {
        const diff = Math.abs(now - toSeconds(sch.time));
        if (diff <= 60 && !sch.fired) {
          sch.fired = true;
          dispense('SCHEDULED', sch.slots);
        }
      }
    }

    // Simulates the cloud pushing the app's schedules down to the device (~300-800 ms).
    function syncSchedulesToDevice() {
      const snapshot = state.schedules.map(s => ({ ...s, fired: false }));
      setTimeout(() => { state.deviceSchedules = snapshot; persist(); }, 300 + Math.random() * 500);
    }

    const routes = {
      'POST /api/login': ({ username, password }) => {
        if (!username || !password) {
          return [400, { status: 'MISSING_CREDENTIALS', message: 'Enter your username and password.' }];
        }
        if (!checkLogin(username, password)) {
          return [401, { status: 'INVALID_CREDENTIALS', message: 'Invalid username or password.' }];
        }
        return [200, { status: 'OK', user: username }];
      },

      'GET /api/status': () => [200, state],

      'POST /api/feed': () => {
        const r = dispense('MANUAL', state.portionSlots);
        return [r.status === 'DISPENSED' ? 200 : 409, r];
      },

      'POST /api/portion': ({ slots }) => {
        const n = Number(slots);
        if (!Number.isInteger(n) || n < 1 || n > MAX_SLOTS) {
          return [400, { status: 'INVALID_PORTION', message: `Portion must be 1-${MAX_SLOTS} slots.` }];
        }
        state.portionSlots = n;
        return [200, { status: 'OK', portionSlots: n }];
      },

      'POST /api/schedules': ({ time, slots }) => {
        if (!isValidTime(time)) return [400, { status: 'INVALID_TIME' }];
        const sch = { id: state.nextId++, time: normTime(time), slots: Number(slots) || state.portionSlots };
        state.schedules.push(sch);
        syncSchedulesToDevice();
        return [201, sch];
      },

      'PUT /api/schedules': ({ id, time, slots }) => {
        const sch = state.schedules.find(s => s.id === Number(id));
        if (!sch) return [404, { status: 'NOT_FOUND' }];
        if (time !== undefined) {
          if (!isValidTime(time)) return [400, { status: 'INVALID_TIME' }];
          sch.time = normTime(time);
        }
        if (slots !== undefined) sch.slots = Number(slots);
        syncSchedulesToDevice();
        return [200, sch];
      },

      'DELETE /api/schedules': ({ id }) => {
        state.schedules = state.schedules.filter(s => s.id !== Number(id));
        syncSchedulesToDevice();
        return [200, { status: 'OK' }];
      },

      'POST /api/pair': () => {
        state.manualPairingCalls += 1;
        if (state.networkAvailable) state.connection = 'CONNECTED';
        return [200, { connection: state.connection }];
      },

      // ----- simulation / test hooks -----
      'POST /api/sim/clock': ({ time }) => {
        if (!isValidTime(time)) return [400, { status: 'INVALID_TIME' }];
        state.clock = normTime(time);
        tick();
        return [200, { clock: state.clock }];
      },

      'POST /api/sim/food': ({ percent }) => {
        const p = Math.max(0, Math.min(100, Number(percent)));
        state.foodLevel = p;
        checkFoodLevel();
        return [200, { foodLevel: p }];
      },

      'POST /api/sim/jam': ({ jammed }) => {
        state.jammed = Boolean(jammed);
        return [200, { jammed: state.jammed }];
      },

      'POST /api/sim/network': ({ connected }) => {
        clearTimeout(reconnectTimer);
        state.networkAvailable = Boolean(connected);
        if (!state.networkAvailable) {
          state.connection = 'DISCONNECTED';
        } else {
          // Device firmware retries on its own; no pairing call needed.
          state.connection = 'RECONNECTING';
          reconnectTimer = setTimeout(() => { state.connection = 'CONNECTED'; persist(); }, RECONNECT_DELAY_MS);
        }
        return [200, { networkAvailable: state.networkAvailable }];
      },

      'POST /api/sim/reset': () => {
        clearTimeout(reconnectTimer);
        state = freshState();
        return [200, { status: 'RESET' }];
      },
    };

    // Returns [httpStatus, payload]
    function handle(method, pathname, body) {
      const route = routes[`${method} ${pathname}`];
      if (!route) return [404, { status: 'NOT_FOUND' }];
      const result = route(body || {});
      persist();
      return result;
    }

    return { handle };
  }

  return { createDevice };
});
