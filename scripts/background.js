// CREATE MENU ITEM
chrome.runtime.onInstalled.addListener(() => {
    chrome.contextMenus.create({
        id: "pause-this-tab",
        title: "Pause this tab",
        contexts: ["page"]
    });
});

// LISTEN TO CLICK ON MENU ITEM
chrome.contextMenus.onClicked.addListener((info, tab) => {
    if (info.menuItemId === "pause-this-tab") {
        
        // 1. Inject the CSS file
        chrome.scripting.insertCSS({
            target: { tabId: tab.id },
            files: ["styles/index.css"]
        });

        // 2. Inject the Logic
        chrome.scripting.executeScript({
            target: { tabId: tab.id },
            func: () => {
                // Prevent duplicate overlays
                if (document.getElementById('pause-tab-overlay')) return;

                const overlay = document.createElement('div');
                overlay.id = 'pause-tab-overlay';
                overlay.innerHTML = `
                    <article>
                        <h1>Tab paused</h1>
                        <p>Take a moment to stretch, grab a coffee, or just breathe. Click the "resume now" button to unpause the tab.</p>
                        <footer>
                            <button id="resume-button" class="primary">Resume now</button>
                        </footer>
                    </article>
                `;

                document.body.appendChild(overlay);

                // Target the specific button for removal
                const resumeBtn = document.getElementById('resume-button');
                resumeBtn.addEventListener('click', () => {
                    overlay.remove();
                });
            }
        });
    }
});