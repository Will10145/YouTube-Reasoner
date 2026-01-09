const STATS_KEY = "dyrntStats";
const HISTORY_KEY = "dyrntHistory";
const MAX_HISTORY_ITEMS = 50;

document.addEventListener("DOMContentLoaded", () => {
  loadAndDisplayStats();
  setupEventListeners();
});

function setupEventListeners() {
  const clearButton = document.getElementById("clear-stats");
  const exportButton = document.getElementById("export-stats");

  clearButton.addEventListener("click", () => {
    if (confirm("Are you sure you want to clear all stats? This cannot be undone.")) {
      clearAllStats();
    }
  });

  exportButton.addEventListener("click", () => {
    exportStats();
  });
}

async function loadAndDisplayStats() {
  const stats = await getStats();
  const history = await getHistory();

  // Update stat cards
  document.getElementById("total-prompts").textContent = stats.totalPrompts || 0;
  document.getElementById("total-approved").textContent = stats.totalApproved || 0;
  document.getElementById("total-rejected").textContent = stats.totalRejected || 0;
  document.getElementById("total-aborted").textContent = stats.totalAborted || 0;

  // Display history
  displayHistory(history);
}

function displayHistory(history) {
  const container = document.getElementById("history-container");

  if (!history || history.length === 0) {
    container.innerHTML = '<div class="empty-state">No activity yet. Start using YouTube and your stats will appear here!</div>';
    return;
  }

  // Sort by timestamp, newest first
  const sortedHistory = [...history].sort((a, b) => b.timestamp - a.timestamp);

  container.innerHTML = sortedHistory
    .map((item) => {
      const resultClass = item.result.toLowerCase();
      const resultLabel = item.result.charAt(0).toUpperCase() + item.result.slice(1);
      const date = new Date(item.timestamp);
      const formattedDate = date.toLocaleString();

      let content = `
        <div class="history-item ${resultClass}">
          <span class="history-result ${resultClass}">${resultLabel}</span>
          <div class="history-time">${formattedDate}</div>
      `;

      if (item.reason) {
        content += `<div class="history-reason">"${escapeHtml(item.reason)}"</div>`;
      }

      if (item.message) {
        content += `<div class="history-message">${escapeHtml(item.message)}</div>`;
      }

      content += `</div>`;
      return content;
    })
    .join("");
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

function getHistory() {
  return new Promise((resolve) => {
    chrome.storage.local.get([HISTORY_KEY], (items) => {
      resolve(items[HISTORY_KEY] || []);
    });
  });
}

async function clearAllStats() {
  await new Promise((resolve) => {
    chrome.storage.local.remove([STATS_KEY, HISTORY_KEY], resolve);
  });
  loadAndDisplayStats();
}

async function exportStats() {
  const stats = await getStats();
  const history = await getHistory();

  const exportData = {
    stats,
    history,
    exportDate: new Date().toISOString()
  };

  const blob = new Blob([JSON.stringify(exportData, null, 2)], {
    type: "application/json"
  });

  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `youtube-reasoner-stats-${Date.now()}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function escapeHtml(text) {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}
