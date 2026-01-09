const MODEL_NAME = "gemini-2.5-flash-lite";
const API_URL = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL_NAME}:generateContent`;

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === "evaluate-reason") {
    handleEvaluation(message.reason)
      .then((result) => sendResponse(result))
      .catch((error) => {
        console.error("Gemini evaluation error", error);
        sendResponse({ error: error.message || "Gemini request failed" });
      });

    return true;
  }

  if (message?.type === "open-options-page") {
    chrome.runtime.openOptionsPage(() => {
      if (chrome.runtime.lastError) {
        console.error("Unable to open options page", chrome.runtime.lastError);
        sendResponse({ error: chrome.runtime.lastError.message });
        return;
      }
      sendResponse({ opened: true });
    });

    return true;
  }

  if (message?.type === "open-stats-page") {
    chrome.tabs.create({ url: chrome.runtime.getURL("stats.html") }, (tab) => {
      if (chrome.runtime.lastError) {
        console.error("Unable to open stats page", chrome.runtime.lastError);
        sendResponse({ error: chrome.runtime.lastError.message });
        return;
      }
      sendResponse({ opened: true });
    });

    return true;
  }

  return false;
});

async function handleEvaluation(reason) {
  const trimmed = (reason || "").trim();
  if (!trimmed) {
    throw new Error("A meaningful reason is required.");
  }

  const apiKey = await getGeminiKey();
  if (!apiKey) {
    throw new Error("Add your Gemini API key in the extension options page.");
  }

  const payload = buildGeminiPayload(trimmed);
  const response = await fetch(`${API_URL}?key=${apiKey}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    const errorMessage = await safeRead(response);
    throw new Error(`Gemini API error (${response.status}): ${errorMessage}`);
  }

  const data = await response.json();
  return interpretGeminiDecision(data);
}

function buildGeminiPayload(reason) {
  const systemInstruction = {
    role: "system",
    parts: [
      {
        // FYI I used ChatGPT to generate this prompt.
        text: "You vet whether someone truly needs to open YouTube. Approve only if the reason is intentional, time-boxed, and purposeful. Reject vague, impulsive, or entertainment-only reasons. Always respond with minified JSON containing decision (allow|deny) and message (short guidance)."
      }
    ]
  };

  const userContent = {
    role: "user",
    parts: [
      {
        text: `Reason provided:\n${reason}\n\nRespond only with JSON.`
      }
    ]
  };

  return {
    systemInstruction,
    contents: [userContent],
    generationConfig: {
      temperature: 0.2,
      maxOutputTokens: 180,
      responseMimeType: "application/json"
    }
  };
}

async function getGeminiKey() {
  return new Promise((resolve) => {
    chrome.storage.sync.get(["geminiApiKey"], (items) => {
      resolve(items.geminiApiKey || null);
    });
  });
}

function interpretGeminiDecision(data) {
  const raw = extractTextResponse(data);
  if (!raw) {
    throw new Error("Gemini returned an empty response.");
  }

  const parsed = tryParseJson(raw);
  if (!parsed) {
    return {
      allow: raw.toLowerCase().includes("allow") && !raw.toLowerCase().includes("deny"),
      message: raw
    };
  }

  const decision = String(parsed.decision || "").toLowerCase();
  const allow = decision === "allow";
  const message = parsed.message || parsed.summary || "Gemini responded without guidance.";

  return { allow, message };
}

function extractTextResponse(data) {
  const candidates = data?.candidates || [];
  if (!candidates.length) {
    return "";
  }
  return candidates
    .map((candidate) => candidate?.content?.parts?.map((part) => part.text || "").join(""))
    .join("\n")
    .trim();
}

async function safeRead(response) {
  try {
    return await response.text();
  } catch (error) {
    console.warn("Unable to read Gemini error body", error);
    return "No response body";
  }
}

function tryParseJson(input) {
  try {
    return JSON.parse(input);
  } catch (error) {
    return null;
  }
}
