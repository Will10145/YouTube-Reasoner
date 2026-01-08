const form = document.getElementById("options-form");
const keyInput = document.getElementById("gemini-key");
const statusEl = document.getElementById("status");

initialize();

function initialize() {
  chrome.storage.sync.get(["geminiApiKey"], (items) => {
    keyInput.value = items.geminiApiKey || "";
  });
}

form.addEventListener("submit", (event) => {
  event.preventDefault();
  const value = keyInput.value.trim();
  if (!value) {
    statusEl.textContent = "API key cannot be blank.";
    return;
  }
  chrome.storage.sync.set({ geminiApiKey: value }, () => {
    statusEl.textContent = "Saved!";
    setTimeout(() => {
      statusEl.textContent = "";
    }, 2000);
  });
});
