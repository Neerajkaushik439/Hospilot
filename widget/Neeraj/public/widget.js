/**
 * Hospilot widget frontend — talks only to our backend (same-origin).
 * Hospilot API calls happen server-side. Token stays in runtime memory.
 */
(function () {
  'use strict';

  const STATES = {
    IDLE: 'IDLE',
    SUBMITTING: 'SUBMITTING',
    PLANNING: 'PLANNING',
    READY: 'READY',
    LOADING_IFRAME: 'LOADING_IFRAME',
    VIEWING_PLAN: 'VIEWING_PLAN',
    ERROR: 'ERROR',
  };

  const CONFIG = {
    maxGoalLength: 2000,
    minGoalLength: 3,
    pollIntervalMs: 2500,
    maxPollDurationMs: 90000,
    hospilotIframeSrc: 'https://hospilot.carer.ai',
    defaultGoal: 'Check ICU bed capacity for tonight'
  };

  /** @type {{
   *  state: string,
   *  goal: string,
   *  sessionId: string|null,
   *  token: string|null,
   *  status: string|null,
   *  errorMessage: string|null,
   *  iframeStatus: string|null,
   *  postMessageSent: boolean,
   *  pollTimer: number|null,
   *  pollStartedAt: number|null,
   *  abortPoll: boolean,
   * }} */
  const app = {
    state: STATES.IDLE,
    goal: CONFIG.defaultGoal,
    sessionId: null,
    token: null,
    status: null,
    errorMessage: null,
    iframeStatus: null,
    postMessageSent: false,
    pollTimer: null,
    pollStartedAt: null,
    abortPoll: false,
    initTimers: [],
    initAttempts: 0,
  };

  const els = {};

  function $(id) {
    return document.getElementById(id);
  }

  function setState(next) {
    app.state = next;
    render();
  }

  function clearSessionMemory() {
    app.sessionId = null;
    app.token = null;
    app.status = null;
    app.postMessageSent = false;
    app.iframeStatus = null;
    app.abortPoll = true;
    if (app.pollTimer) {
      clearTimeout(app.pollTimer);
      app.pollTimer = null;
    }
    app.pollStartedAt = null;

    if (els.frame) {
      els.frame.removeAttribute('src');
      els.frame.onload = null;
    }
    if (els.iframePanel) {
      els.iframePanel.classList.remove('is-open');
      els.iframePanel.setAttribute('aria-hidden', 'true');
    }
  }

  function announce(message) {
    if (els.live) {
      els.live.textContent = message;
    }
  }

  function humanError(err, fallback) {
    if (!err) return fallback;
    if (typeof err === 'string') return err;
    if (err.error && err.error.message) return err.error.message;
    if (err.message) return err.message;
    return fallback;
  }

  async function apiCreateSession(goal) {
    const res = await fetch('/api/session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ goal }),
    });

    let data = null;
    try {
      data = await res.json();
    } catch {
      data = null;
    }

    if (!res.ok) {
      const message = humanError(
        data,
        res.status === 401 || res.status === 403
          ? 'Unable to authenticate with Hospilot. Please try again later.'
          : res.status === 429
            ? 'Too many requests. Please wait a moment and try again.'
            : res.status === 504
              ? 'The plan is taking longer than expected. Please try again.'
              : 'Unable to create the plan right now. Please try again.'
      );
      const e = new Error(message);
      e.code = data && data.error && data.error.code;
      e.status = res.status;
      throw e;
    }

    if (!data || !data.sessionId || !data.token) {
      throw new Error('Unexpected response while creating the plan. Please try again.');
    }

    return data;
  }

  async function apiGetSession(sessionId, token) {
    const res = await fetch(`/api/session/${encodeURIComponent(sessionId)}`, {
      method: 'GET',
      headers: {
        'X-Hospilot-Token': token,
      },
    });

    let data = null;
    try {
      data = await res.json();
    } catch {
      data = null;
    }

    if (!res.ok) {
      const message = humanError(
        data,
        'Unable to check plan status right now. Please try again.'
      );
      const e = new Error(message);
      e.code = data && data.error && data.error.code;
      e.status = res.status;
      throw e;
    }

    return data;
  }

  function goalIsValid(goal) {
    const t = (goal || '').trim();
    return t.length >= CONFIG.minGoalLength && t.length <= CONFIG.maxGoalLength;
  }

  async function startGeneratePlan() {
    if (app.state === STATES.SUBMITTING || app.state === STATES.PLANNING) {
      return;
    }

    const goal = (els.goal.value || '').trim();
    if (!goalIsValid(goal)) {
      app.errorMessage = 'Please enter a short description of your hospital operations goal.';
      setState(STATES.ERROR);
      announce(app.errorMessage);
      return;
    }

    // New goal → clear previous session/iframe state
    clearSessionMemory();
    app.abortPoll = false;
    app.goal = goal;
    app.errorMessage = null;
    setState(STATES.SUBMITTING);
    announce('Creating your Hospilot plan…');

    try {
      const created = await apiCreateSession(goal);
      if (app.abortPoll) return;

      app.sessionId = created.sessionId;
      app.token = created.token;
      app.status = created.status || 'planning';
      setState(STATES.PLANNING);
      announce('Planning in progress…');
      app.pollStartedAt = Date.now();
      await pollUntilReady();
    } catch (err) {
      if (app.abortPoll) return;
      app.errorMessage = humanError(err, 'Unable to create the plan right now. Please try again.');
      setState(STATES.ERROR);
      announce(app.errorMessage);
    }
  }

  async function pollUntilReady() {
    while (!app.abortPoll) {
      if (!app.sessionId || !app.token) {
        app.errorMessage = 'Session was lost. Please generate the plan again.';
        setState(STATES.ERROR);
        return;
      }

      const elapsed = Date.now() - (app.pollStartedAt || Date.now());
      if (elapsed > CONFIG.maxPollDurationMs) {
        app.errorMessage =
          'The plan is taking longer than expected. Please try again.';
        setState(STATES.ERROR);
        announce(app.errorMessage);
        return;
      }

      try {
        const result = await apiGetSession(app.sessionId, app.token);
        if (app.abortPoll) return;

        app.status = result.status;
        if (result.ready) {
          setState(STATES.READY);
          announce('Plan ready');
          return;
        }
        if (result.status === 'failed') {
          app.errorMessage = 'Planning failed. Please try a different goal or try again.';
          setState(STATES.ERROR);
          announce(app.errorMessage);
          return;
        }
      } catch (err) {
        if (app.abortPoll) return;
        // Transient poll errors: retry until overall timeout
        if (err.status === 401 || err.status === 403) {
          app.errorMessage = humanError(err, 'Authentication failed while checking the plan.');
          setState(STATES.ERROR);
          announce(app.errorMessage);
          return;
        }
      }

      await new Promise((resolve) => {
        app.pollTimer = window.setTimeout(resolve, CONFIG.pollIntervalMs);
      });
    }
  }

  function buildWidgetInitMessage() {
    return {
      type: 'widget_init',
      token: app.token,
      sessionId: app.sessionId,
    };
  }

  function sendWidgetInit(frame, { markComplete } = { markComplete: false }) {
    if (!frame || !frame.contentWindow || !app.token || !app.sessionId) return false;
    // Never post into about:blank / incomplete navigations
    try {
      const href = frame.contentWindow.location.href;
      if (!href || href === 'about:blank') return false;
    } catch {
      // Cross-origin: expected once Hospilot has loaded — safe to postMessage
    }

    const message = buildWidgetInitMessage();
    frame.contentWindow.postMessage(message, '*');
    app.initAttempts = (app.initAttempts || 0) + 1;

    if (markComplete) {
      app.postMessageSent = true;
      app.iframeStatus = 'Plan loaded';
      setState(STATES.VIEWING_PLAN);
      announce('Plan loaded');
      if (els.iframeStatus) els.iframeStatus.textContent = app.iframeStatus;
    }
    return true;
  }

  function openIframe() {
    if (app.state !== STATES.READY && app.state !== STATES.VIEWING_PLAN && app.state !== STATES.LOADING_IFRAME) {
      return;
    }
    if (!app.sessionId || !app.token) {
      app.errorMessage = 'Missing session information. Please generate the plan again.';
      setState(STATES.ERROR);
      return;
    }

    // Clear prior init timers
    if (app.initTimers && app.initTimers.length) {
      app.initTimers.forEach((id) => clearTimeout(id));
    }
    app.initTimers = [];
    app.initAttempts = 0;
    app.postMessageSent = false;
    app.iframeStatus = 'Connecting to Hospilot dashboard…';
    setState(STATES.LOADING_IFRAME);
    announce(app.iframeStatus);

    els.iframePanel.classList.add('is-open');
    els.iframePanel.setAttribute('aria-hidden', 'false');
    els.iframeStatus.textContent = app.iframeStatus;

    const frame = els.frame;
    frame.onload = null;

    frame.onload = function onFrameLoad() {
      // Ignore blank navigations used only to reset the frame
      try {
        if (frame.contentWindow.location.href === 'about:blank') return;
      } catch {
        // Cross-origin Hospilot document — this is the load we want
      }

      app.iframeStatus = 'Opening your Hospilot plan…';
      if (els.iframeStatus) els.iframeStatus.textContent = app.iframeStatus;

      // Hospilot is an SPA: onload can fire before its message listener is ready.
      // Retry widget_init a few times, then mark complete.
      const delays = [0, 400, 1000, 2000, 3500];
      delays.forEach((delay, index) => {
        const timer = window.setTimeout(() => {
          const isLast = index === delays.length - 1;
          sendWidgetInit(frame, { markComplete: isLast });
        }, delay);
        app.initTimers.push(timer);
      });
    };

    // Reset then load Hospilot (do not postMessage on about:blank)
    frame.src = 'about:blank';
    window.setTimeout(() => {
      frame.src = CONFIG.hospilotIframeSrc;
    }, 50);

    // Soft timeout for slow iframe loads
    const slowTimer = window.setTimeout(() => {
      if (app.state === STATES.LOADING_IFRAME && !app.postMessageSent) {
        app.iframeStatus = 'Dashboard is taking longer than usual to load…';
        if (els.iframeStatus) els.iframeStatus.textContent = app.iframeStatus;
      }
    }, 15000);
    app.initTimers.push(slowTimer);
  }

  function reloadIframe() {
    if (!app.sessionId || !app.token) return;
    openIframe();
  }

  function closeIframe() {
    if (app.initTimers && app.initTimers.length) {
      app.initTimers.forEach((id) => clearTimeout(id));
      app.initTimers = [];
    }
    if (els.frame) {
      els.frame.onload = null;
      els.frame.src = 'about:blank';
    }
    els.iframePanel.classList.remove('is-open');
    els.iframePanel.setAttribute('aria-hidden', 'true');
    app.postMessageSent = false;
    app.iframeStatus = null;
    if (app.sessionId && app.token) {
      setState(STATES.READY);
    } else {
      setState(STATES.IDLE);
    }
  }

  function render() {
    const busy =
      app.state === STATES.SUBMITTING ||
      app.state === STATES.PLANNING ||
      app.state === STATES.LOADING_IFRAME;

    const goal = els.goal.value || '';
    const valid = goalIsValid(goal);

    els.goal.disabled = busy;
    els.charCount.textContent = `${goal.length} / ${CONFIG.maxGoalLength}`;

    els.generateBtn.disabled = busy || !valid;
    els.generateBtn.textContent =
      app.state === STATES.SUBMITTING || app.state === STATES.PLANNING
        ? 'Creating Plan...'
        : 'Generate Plan';

    document.querySelectorAll('.hp-example-btn').forEach((btn) => {
      btn.disabled = busy;
    });

    els.viewBtn.disabled = app.state !== STATES.READY && app.state !== STATES.VIEWING_PLAN;
    els.retryBtn.hidden = app.state !== STATES.ERROR;

    // Status panel
    els.status.classList.remove('is-visible', 'is-ready', 'is-error');
    els.spinner.hidden = true;
    els.check.hidden = true;

    if (app.state === STATES.SUBMITTING) {
      els.status.classList.add('is-visible');
      els.spinner.hidden = false;
      els.statusTitle.textContent = 'Creating your Hospilot plan…';
      els.statusDetail.textContent = 'Authenticating and starting a planning session.';
    } else if (app.state === STATES.PLANNING) {
      els.status.classList.add('is-visible');
      els.spinner.hidden = false;
      els.statusTitle.textContent = 'Planning in progress…';
      els.statusDetail.textContent =
        'Hospilot is building the agent pipeline. This usually takes 10–30 seconds.';
    } else if (app.state === STATES.READY) {
      els.status.classList.add('is-visible', 'is-ready');
      els.check.hidden = false;
      els.statusTitle.textContent = 'Plan ready';
      els.statusDetail.textContent = 'Open the live Hospilot dashboard to review the plan.';
    } else if (app.state === STATES.LOADING_IFRAME) {
      els.status.classList.add('is-visible');
      els.spinner.hidden = false;
      els.statusTitle.textContent = 'Connecting to Hospilot dashboard…';
      els.statusDetail.textContent = 'Loading the plan viewer.';
    } else if (app.state === STATES.VIEWING_PLAN) {
      els.status.classList.add('is-visible', 'is-ready');
      els.check.hidden = false;
      els.statusTitle.textContent = 'Plan loaded';
      els.statusDetail.textContent = 'The Hospilot dashboard is showing your session.';
    } else if (app.state === STATES.ERROR) {
      els.status.classList.add('is-visible', 'is-error');
      els.statusTitle.textContent = 'Something went wrong';
      els.statusDetail.textContent =
        app.errorMessage || 'Unable to complete the request. Please try again.';
    }
  }

  function buildDom() {
    const root = document.createElement('div');
    root.id = 'hospilot-widget';
    root.className = 'hp-widget';
    root.setAttribute('role', 'region');
    root.setAttribute('aria-label', 'Hospilot AI Workflow Assistant');

    root.innerHTML = `
      <div class="hp-widget-header">
        <div class="hp-brand-row">
          <div class="hp-brand-mark" aria-hidden="true">H</div>
          <div>
            <div class="hp-brand-title">Hospilot</div>
            <div class="hp-brand-sub">AI Workflow Assistant</div>
          </div>
        </div>
        <p class="hp-header-desc">Describe a hospital operations goal and generate a live Hospilot plan.</p>
      </div>
      <div class="hp-widget-body">
        <div>
          <label class="hp-label" for="hp-goal">Goal</label>
          <div class="hp-textarea-wrap">
            <textarea
              id="hp-goal"
              class="hp-textarea"
              maxlength="${CONFIG.maxGoalLength}"
              placeholder="e.g. Check ICU bed capacity for tonight"
              aria-describedby="hp-char-count hp-live"
            ></textarea>
            <div id="hp-char-count" class="hp-char-count" aria-live="polite">0 / ${CONFIG.maxGoalLength}</div>
          </div>
        </div>


        <div class="hp-actions">
          <button type="button" class="hp-btn hp-btn-primary" id="hp-generate">Generate Plan</button>
          <button type="button" class="hp-btn hp-btn-secondary" id="hp-view" disabled>View Plan</button>
          <button type="button" class="hp-btn hp-btn-secondary" id="hp-retry" hidden>Try again</button>
        </div>

        <div class="hp-status" id="hp-status" role="status">
          <div class="hp-status-row">
            <div class="hp-spinner" id="hp-spinner" hidden></div>
            <div class="hp-check" id="hp-check" hidden aria-hidden="true">✓</div>
            <div>
              <p class="hp-status-title" id="hp-status-title"></p>
              <p class="hp-status-detail" id="hp-status-detail"></p>
            </div>
          </div>
        </div>
        <div id="hp-live" class="visually-hidden" aria-live="polite" style="position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0,0,0,0);"></div>
      </div>
    `;

    const panel = document.createElement('div');
    panel.id = 'hp-iframe-panel';
    panel.className = 'hp-iframe-panel';
    panel.setAttribute('aria-hidden', 'true');
    panel.innerHTML = `
      <div class="hp-iframe-shell" role="dialog" aria-modal="true" aria-label="Hospilot plan viewer">
        <div class="hp-iframe-toolbar">
          <div>
            <div class="hp-iframe-toolbar-title">Hospilot Plan</div>
            <div class="hp-iframe-toolbar-status" id="hp-iframe-status">Connecting to Hospilot dashboard…</div>
          </div>
          <div class="hp-iframe-toolbar-actions">
            <button type="button" class="hp-btn hp-btn-secondary" id="hp-reload">Reload Plan</button>
            <button type="button" class="hp-btn hp-btn-secondary" id="hp-close">Close</button>
          </div>
        </div>
        <iframe id="hospilot-frame" title="Hospilot dashboard" referrerpolicy="no-referrer-when-downgrade"></iframe>
      </div>
    `;

    document.body.appendChild(root);
    document.body.appendChild(panel);

    els.root = root;
    els.goal = $('hp-goal');
    els.charCount = $('hp-char-count');

    els.generateBtn = $('hp-generate');
    els.viewBtn = $('hp-view');
    els.retryBtn = $('hp-retry');
    els.status = $('hp-status');
    els.spinner = $('hp-spinner');
    els.check = $('hp-check');
    els.statusTitle = $('hp-status-title');
    els.statusDetail = $('hp-status-detail');
    els.live = $('hp-live');
    els.iframePanel = $('hp-iframe-panel');
    els.iframeStatus = $('hp-iframe-status');
    els.frame = $('hospilot-frame');
    els.reloadBtn = $('hp-reload');
    els.closeBtn = $('hp-close');

    els.goal.value = CONFIG.defaultGoal;
    els.goal.addEventListener('input', () => render());

    els.generateBtn.addEventListener('click', () => {
      startGeneratePlan();
    });

    els.viewBtn.addEventListener('click', () => {
      openIframe();
    });

    els.retryBtn.addEventListener('click', () => {
      startGeneratePlan();
    });

    els.reloadBtn.addEventListener('click', () => {
      reloadIframe();
    });

    els.closeBtn.addEventListener('click', () => {
      closeIframe();
    });

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && els.iframePanel.classList.contains('is-open')) {
        closeIframe();
      }
    });

    // Offline detection
    window.addEventListener('offline', () => {
      if (app.state === STATES.PLANNING || app.state === STATES.SUBMITTING) {
        app.errorMessage = 'Network disconnected. Please reconnect and try again.';
        app.abortPoll = true;
        setState(STATES.ERROR);
        announce(app.errorMessage);
      }
    });

    render();
  }

  // Expose for tests
  window.HospilotWidget = {
    STATES,
    CONFIG,
    getState: () => ({ ...app }),
    _test: {
      goalIsValid,
      humanError,
      buildPostMessage: (token, sessionId) => ({
        type: 'widget_init',
        token,
        sessionId,
      }),
    },
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', buildDom);
  } else {
    buildDom();
  }
})();
