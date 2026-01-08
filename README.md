# Do You Really Need To Open This?

A Chrome extension that intercepts every YouTube visit, forces a reflective pause, and sends your justification to the Google Gemini API. Gemini either approves the reason or nudges you to step away.

## Requirements

- Google Gemini API key with access to the Generative Language REST API.
- Chrome 114+ (any Chromium browser that supports Manifest V3 should work).

## Setup

1. **Clone or download** this repository.
2. **Enable developer mode** in `chrome://extensions`.
3. **Load unpacked** and select this folder.
4. **Open the extension options page** (Details → Extension options).
5. **Paste your Gemini API key** and save.
6. If the modal later says "Add your Gemini API key", click the inline "extension options page" link in the prompt or revisit the options page from Chrome's Extensions screen and re-save your key.

## How It Works

- `content.js` injects a full-screen modal whenever a YouTube page loads or the SPA navigation changes.
- After you submit a reason, `background.js` forwards it to Gemini using the `gemini-1.5-flash` model and expects a JSON verdict.
- Responses with `decision: "allow"` let you continue; anything else keeps YouTube blocked until you give a stronger reason or leave.

## Customization Ideas

- Tweak `styles/modal.css` for a different mood.
- Adjust the decision guidelines inside `buildGeminiPayload()` if you prefer a stricter or more lenient guardian.
- Replace the fallback redirect URL in `content.js` with your favorite distraction-free site.

## Testing Tips

- Use the Chrome DevTools console on YouTube to watch any `console.error` messages coming from the content script.
- Inspect `chrome://extensions` → "Service Worker" console for Gemini API responses and potential network issues.
- If Gemini keeps rejecting valid reasons, log the raw response in `background.js` to tune the system prompt.

## Security Notes

- Keys are stored only in Chrome's `storage.sync` area and are never sent anywhere except Google's Gemini API endpoint.
- Consider creating a dedicated Gemini API key with restricted quotas for this extension.
