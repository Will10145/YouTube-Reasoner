const MODAL_ID = "dyrnt-overlay";
const STATUS_ID = "dyrnt-status";
const FORM_ID = "dyrnt-form";
const INPUT_ID = "dyrnt-reason";
const OPTIONS_BUTTON_ID = "dyrnt-options";
const OPTIONS_LINK_ID = "dyrnt-options-inline";
const BLOCKED_UNTIL_KEY = "dyrntBlockedUntil";
const APPROVED_UNTIL_KEY = "dyrntApprovedUntil";
const STATS_KEY = "dyrntStats";
const HISTORY_KEY = "dyrntHistory";
const MAX_HISTORY_ITEMS = 50;
const COOLDOWN_MS = 5 * 60 * 1000; // 5 minutes
let activeOverlay = null;
let lastPromptedUrl = "";
let navWatcher = null;

if (window.top === window) {
  bootstrapIntervention();
}

async function bootstrapIntervention() {
  if (document.documentElement.dataset.dyrntInjected) {
    return;
  }
  document.documentElement.dataset.dyrntInjected = "true";
  lastPromptedUrl = location.href;

  // Check if user is currently approved (Gemini said yes recently)
  const approvedUntil = await getApprovedUntil();
  if (approvedUntil && Date.now() < approvedUntil) {
    // User is approved, let them through without modal
    return;
  }

  const blockedUntil = await getBlockedUntil();
  if (blockedUntil && Date.now() < blockedUntil) {
    showCooldownTimer(blockedUntil);
    return;
  }

  enforcePrompt();
  startNavigationWatcher();
}

function enforcePrompt() {
  if (activeOverlay) {
    return;
  }
  buildModal();
}

function startNavigationWatcher() {
  if (navWatcher) {
    return;
  }
  // YouTube is single-page; poll for URL changes to re-trigger the prompt.
  navWatcher = setInterval(() => {
    if (location.href === lastPromptedUrl) {
      return;
    }
    lastPromptedUrl = location.href;
    destroyModal();
    enforcePrompt();
  }, 1500);
}

function buildModal() {
  activeOverlay = document.createElement("div");
  activeOverlay.id = MODAL_ID;

  const dialog = document.createElement("div");
  dialog.className = "dyrnt-modal";

  dialog.innerHTML = `
    <h1 class="dyrnt-title">Really. Do you <em>really</em> need to open YouTube?</h1>
    <p class="dyrnt-lede">Pause for a beat. Explain why you're here and let Gemini decide if it is worth your attention.</p>
    <form id="${FORM_ID}" class="dyrnt-form">
      <label for="${INPUT_ID}">Give your reason:</label>
      <textarea id="${INPUT_ID}" name="reason" maxlength="320" rows="4" placeholder="Example: I am here to publish my documentary trailer." required></textarea>
      <div class="dyrnt-actions">
        <button type="submit" class="dyrnt-primary">Convince Gemini</button>
        <button type="button" class="dyrnt-secondary" id="dyrnt-abort">Never mind, take me away</button>
        <button type="button" class="dyrnt-tertiary" id="${OPTIONS_BUTTON_ID}" hidden>Open Gemini settings</button>
        <button type="button" class="dyrnt-tertiary" id="dyrnt-stats">📊 Stats</button>
      </div>
      <p id="${STATUS_ID}" aria-live="polite" class="dyrnt-status">Awaiting your reason...</p>
    </form>
    <footer class="dyrnt-footer">Made by Will · <a href="https://github.com/Will10145" target="_blank" rel="noopener">github.com/Will10145</a></footer>
  `;

  activeOverlay.appendChild(dialog);
  document.body.classList.add("dyrnt-blur");
  document.body.appendChild(activeOverlay);

  const form = document.getElementById(FORM_ID);
  const input = document.getElementById(INPUT_ID);
  const status = document.getElementById(STATUS_ID);
  const abortButton = document.getElementById("dyrnt-abort");
  const optionsButton = document.getElementById(OPTIONS_BUTTON_ID);
  const statsButton = document.getElementById("dyrnt-stats");

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const reason = (input.value || "").trim();
    if (!reason) {
      status.textContent = "Please give a real reason first.";
      return;
    }
    toggleFormDisabled(form, true);
    status.textContent = "Consulting Gemini...";

    try {
      const response = await chrome.runtime.sendMessage({
        type: "evaluate-reason",
        reason
      });

      if (!response || response.error) {
        if (isMissingApiKeyMessage(response?.error)) {
          promptForApiKey(status, form, optionsButton);
          return;
        }
        throw new Error(response?.error || "Unknown error");
      }

      if (response.allow) {
        status.textContent = response.message || "Gemini approved. Carry on.";
        const approvedUntil = Date.now() + COOLDOWN_MS;
        await setApprovedUntil(approvedUntil);
        await recordStat("approved", reason, response.message);
        setTimeout(() => {
          destroyModal();
        }, 650);
      } else {
        status.textContent = response.message || "Gemini rejected this justification.";
        const blockedUntil = Date.now() + COOLDOWN_MS;
        await setBlockedUntil(blockedUntil);
        await recordStat("rejected", reason, response.message);
        setTimeout(() => {
          showCooldownTimer(blockedUntil);
        }, 1500);
      }
    } catch (error) {
      console.error("Gemini evaluation failed", error);
      if (isMissingApiKeyMessage(error?.message)) {
        promptForApiKey(status, form, optionsButton);
      } else {
        status.textContent = error.message || "Gemini could not be reached.";
      }
      toggleFormDisabled(form, false);
    }
  });

  abortButton.addEventListener("click", async () => {
    status.textContent = "Honorable exit. Well done!";
    const blockedUntil = Date.now() + COOLDOWN_MS;
    await setBlockedUntil(blockedUntil);
    await recordStat("aborted", "", "User chose to leave YouTube");
    setTimeout(() => {
      showCooldownTimer(blockedUntil);
    }, 600);
  });

  if (optionsButton) {
    optionsButton.addEventListener("click", () => {
      openOptionsPage(status);
    });
  }

  if (statsButton) {
    statsButton.addEventListener("click", () => {
      chrome.runtime.sendMessage({ type: "open-stats-page" }, (response) => {
        if (chrome.runtime.lastError || response?.error) {
          console.error("Unable to open stats page", chrome.runtime.lastError || response?.error);
          // Fallback: open in new tab
          window.open(chrome.runtime.getURL("stats.html"), "_blank");
          return;
        }
      });
    });
  }
}

function destroyModal() {
  if (!activeOverlay) {
    return;
  }
  document.body.classList.remove("dyrnt-blur");
  activeOverlay.remove();
  activeOverlay = null;
  const status = document.getElementById(STATUS_ID);
  if (status) {
    status.textContent = "";
  }
}

function toggleFormDisabled(form, locked) {
  Array.from(form.elements).forEach((el) => {
    el.disabled = locked && el.tagName !== "P";
  });
}

function isMissingApiKeyMessage(message) {
  if (!message) {
    return false;
  }
  return message.toLowerCase().includes("gemini api key");
}

function promptForApiKey(statusNode, form, optionsButton) {
  statusNode.innerHTML = `Add your Gemini API key via the <button type="button" id="${OPTIONS_LINK_ID}" class="dyrnt-inline-link">extension options page</button> first.`;
  attachInlineOptionsHandler(statusNode);
  toggleFormDisabled(form, false);
  if (!optionsButton) {
    return;
  }
  optionsButton.hidden = false;
  optionsButton.disabled = false;
  try {
    optionsButton.focus();
  } catch (error) {
    // Ignore focus errors in unsupported browsers.
  }
}

function attachInlineOptionsHandler(statusNode) {
  const inlineButton = document.getElementById(OPTIONS_LINK_ID);
  if (!inlineButton) {
    return;
  }
  inlineButton.addEventListener("click", (event) => {
    event.preventDefault();
    openOptionsPage(statusNode);
  });
}

function openOptionsPage(statusNode) {
  statusNode.textContent = "Opening extension options...";
  chrome.runtime.sendMessage({ type: "open-options-page" }, (response) => {
    if (chrome.runtime.lastError || response?.error) {
      console.error("Unable to open options page", chrome.runtime.lastError || response?.error);
      statusNode.textContent = "Open the options page from chrome://extensions → Details.";
      return;
    }
    statusNode.textContent = "Options page opened in a new tab.";
  });
}

function getBlockedUntil() {
  return new Promise((resolve) => {
    chrome.storage.local.get([BLOCKED_UNTIL_KEY], (items) => {
      resolve(items[BLOCKED_UNTIL_KEY] || null);
    });
  });
}

function setBlockedUntil(timestamp) {
  return new Promise((resolve) => {
    chrome.storage.local.set({ [BLOCKED_UNTIL_KEY]: timestamp }, resolve);
  });
}

function clearBlockedUntil() {
  return new Promise((resolve) => {
    chrome.storage.local.remove(BLOCKED_UNTIL_KEY, resolve);
  });
}

function getApprovedUntil() {
  return new Promise((resolve) => {
    chrome.storage.local.get([APPROVED_UNTIL_KEY], (items) => {
      resolve(items[APPROVED_UNTIL_KEY] || null);
    });
  });
}

function setApprovedUntil(timestamp) {
  return new Promise((resolve) => {
    chrome.storage.local.set({ [APPROVED_UNTIL_KEY]: timestamp }, resolve);
  });
}

function showCooldownTimer(blockedUntil) {
  // Remove blur class before replacing content
  document.body.classList.remove("dyrnt-blur");
  
  // Stop the nav watcher so it doesn't interfere
  if (navWatcher) {
    clearInterval(navWatcher);
    navWatcher = null;
  }

  // Clear existing content
  document.head.innerHTML = `
    <meta charset="UTF-8">
    <title>Take a Break</title>
    <style>
      * { margin: 0; padding: 0; box-sizing: border-box; }
      body {
        min-height: 100vh;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        background: linear-gradient(135deg, #0f172a 0%, #1e293b 100%);
        font-family: "Space Grotesk", "Helvetica Neue", Arial, sans-serif;
        color: #f8fafc;
        text-align: center;
        padding: 2rem;
      }
      .emoji { font-size: 4rem; margin-bottom: 1rem; }
      h1 { 
      font-size: 2.5rem;
      margin-bottom: 0.5rem;
      background: linear-gradient(135deg, #f43f5e, #f97316);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
      background-clip: text; 
      }


      .subtitle {
      font-size: 1.1rem;
      color: #94a3b8;
      margin-bottom: 2rem;
      }


      .timer-container {
      background: rgba(248, 250, 252, 0.08);
      border-radius: 24px;
      padding: 2.5rem 3.5rem;
      margin-bottom: 2rem;
    }

.timer {
  font-size: 5rem;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  letter-spacing: 0.05em;
  background: linear-gradient(135deg, #f43f5e, #f97316);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
}

.timer-label {
  font-size: 0.95rem;
  color: #64748b;
  margin-top: 0.5rem;
}

.suggestion {
  background: rgba(248, 250, 252, 0.1);
  border-radius: 16px;
  padding: 1.5rem 2rem;
  max-width: 400px;
}

.suggestion h2 {
  font-size: 1rem;
  margin-bottom: 0.75rem;
  color: #f97316;
}

.suggestion ul {
  list-style: none;
  text-align: left;
}

.suggestion li {
  padding: 0.4rem 0;
  color: #e2e8f0;
  font-size: 0.95rem;
}

.suggestion li::before {
  content: "→ ";
  color: #f43f5e;
}

#done-view {
  display: none;
}

#done-view.visible {
  display: flex;
  flex-direction: column;
  align-items: center;
}

#done-view h1 {
  font-size: 3rem;
  margin-bottom: 1rem;
}

#done-view p {
  font-size: 1.25rem;
  color: #cbd5e1;
  max-width: 480px;
  line-height: 1.6;
}

.continue-btn {
  margin-top: 2rem;
  padding: 1rem 2.5rem;
  border: none;
  border-radius: 999px;
  background: linear-gradient(135deg, #f43f5e, #f97316);
  color: #111827;
  font-weight: 700;
  font-size: 1.1rem;
  cursor: pointer;
  transition: transform 150ms ease, box-shadow 150ms ease;
}

.continue-btn:hover {
  transform: scale(1.05);
  box-shadow: 0 12px 30px rgba(244, 63, 94, 0.35);
}

.footer {
  position: fixed;
  bottom: 1.5rem;
  left: 0;
  right: 0;
  text-align: center;
  font-size: 0.85rem;
  color: #64748b;
}

.footer a {
  color: #f97316;
  text-decoration: none;
}

.footer a:hover {
  text-decoration: underline;
}
</style>
  `;

  document.body.innerHTML = `
    <div id="timer-view">
      <div class="emoji">⏳</div>
      <h1>Well Done!</h1>
      <p class="subtitle">You chose intention over impulse. Take a break from YouTube.</p>
      <div class="timer-container">
        <div class="timer" id="countdown">05:00</div>
        <div class="timer-label">until you can try again</div>
      </div>
      <div class="suggestion">
        <h2>While you wait:</h2>
        <ul>
          <li>Take a 5-minute walk outside</li>
          <li>Read a chapter of that book</li>
          <li>Work on your side project</li>
          <li>Just sit and breathe</li>
        </ul>
      </div>
    </div>
    <div id="done-view">
      <div class="emoji">🎉</div>
      <h1>Time's Up!</h1>
      <p>Your 5-minute break is over. If you still want to visit YouTube, you can now make your case to Gemini.</p>
      <button class="continue-btn" id="continue-btn">Continue to YouTube</button>
    </div>
    <footer class="footer">Made by Will · <a href="https://github.com/Will10145" target="_blank" rel="noopener">github.com/Will10145</a></footer>
  `;

  const countdownEl = document.getElementById("countdown");
  const timerView = document.getElementById("timer-view");
  const doneView = document.getElementById("done-view");
  const continueBtn = document.getElementById("continue-btn");

  function updateTimer() {
    const remaining = Math.max(0, blockedUntil - Date.now());
    const totalSeconds = Math.ceil(remaining / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    countdownEl.textContent = String(minutes).padStart(2, "0") + ":" + String(seconds).padStart(2, "0");

    if (remaining <= 0) {
      timerView.style.display = "none";
      doneView.classList.add("visible");
      clearBlockedUntil();
      return;
    }
    setTimeout(updateTimer, 1000);
  }

  updateTimer();

  continueBtn.addEventListener("click", () => {
    location.reload();
  });
}

// Stats tracking functions
async function recordStat(result, reason = "", message = "") {
  // Update stats
  const stats = await getStats();
  stats.totalPrompts = (stats.totalPrompts || 0) + 1;
  
  if (result === "approved") {
    stats.totalApproved = (stats.totalApproved || 0) + 1;
  } else if (result === "rejected") {
    stats.totalRejected = (stats.totalRejected || 0) + 1;
  } else if (result === "aborted") {
    stats.totalAborted = (stats.totalAborted || 0) + 1;
  }
  
  await saveStats(stats);
  
  // Add to history
  const history = await getHistory();
  history.unshift({
    timestamp: Date.now(),
    result,
    reason,
    message
  });
  
  // Keep only the most recent items
  const trimmedHistory = history.slice(0, MAX_HISTORY_ITEMS);
  await saveHistory(trimmedHistory);
}

function getStats() {
  return new Promise((resolve) => {
    chrome.storage.local.get([STATS_KEY], (items) => {
      resolve(items[STATS_KEY] || {
        totalPrompts: 0,
        totalApproved: 0,
        totalRejected: 0,
        totalAborted: 0
      });
    });
  });
}

function saveStats(stats) {
  return new Promise((resolve) => {
    chrome.storage.local.set({ [STATS_KEY]: stats }, resolve);
  });
}

function getHistory() {
  return new Promise((resolve) => {
    chrome.storage.local.get([HISTORY_KEY], (items) => {
      resolve(items[HISTORY_KEY] || []);
    });
  });
}

function saveHistory(history) {
  return new Promise((resolve) => {
    chrome.storage.local.set({ [HISTORY_KEY]: history }, resolve);
  });
}
