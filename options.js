const form = document.getElementById("options-form");
const keyInput = document.getElementById("gemini-key");
const serviceSelect = document.getElementById("ai-service");
const statusEl = document.getElementById("status");

initialize();

function initialize() {
  chrome.storage.sync.get(["geminiApiKey", "aiService"], (items) => {
    keyInput.value = items.geminiApiKey || "";
    serviceSelect.value = items.aiService || "gemini";
  });
}

form.addEventListener("submit", (event) => {
  event.preventDefault();
  const value = keyInput.value.trim();
  const service = serviceSelect.value;
  if (!value) {
    statusEl.textContent = "API key cannot be blank.";
    return;
  }
  chrome.storage.sync.set({ geminiApiKey: value, aiService: service }, () => {
    statusEl.textContent = "Saved!";
    setTimeout(() => {
      statusEl.textContent = "";
    }, 2000);
  });
});
