const injectPauseModal = (tab) => {
    if (!tab || !tab.id || !tab.url || 
        tab.url.startsWith('chrome://') || 
        tab.url.includes("chrome.google.com/webstore")) {
        console.warn("Pause Tab: Action blocked on restricted Google/System pages.");
        return;
    }

    chrome.scripting.insertCSS({
        target: { tabId: tab.id },
        files: ["styles/index.css"]
    }).catch(err => console.error("CSS Injection failed:", err));

    chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: () => {
            if (document.getElementById('pause-tab-overlay')) return;

            const originalOverflow = document.body.style.overflow;
            document.body.style.overflow = 'hidden';

            const fontUrl = chrome.runtime.getURL("fonts/Nunito-VariableFont_wght.ttf");
            const styleBlock = document.createElement('style');
            styleBlock.textContent = "@font-face { font-family: 'Nunito'; src: url('" + fontUrl + "') format('truetype'); font-weight: 200 1000; }";
            document.head.appendChild(styleBlock);

            const overlay = document.createElement('div');
            overlay.id = 'pause-tab-overlay';
            overlay.setAttribute('role', 'dialog');
            overlay.setAttribute('aria-modal', 'true');
            overlay.setAttribute('tabindex', '-1'); // Allows programmatic focus
            overlay.innerHTML = `
                <article>
                    <h1>Tab paused</h1>
                    <p>When you are ready, hold the button below for 5 seconds to resume.</p>
                    <footer>
                        <button id="resume-button" class="primary"><span id="hold-label">Hold to resume</span></button>
                    </footer>
                </article>
            `;
            document.body.appendChild(overlay);

            const btn = document.getElementById('resume-button');
            const lbl = document.getElementById('hold-label');
            let timer, interval, remaining;
            let isHolding = false;

            // Focus the overlay container instead of the button
            overlay.focus();

            const start = (e) => {
                // Ignore if event target is an input or if space is pressed while focusing another button
                if (e.code === 'Space') e.preventDefault();
                if (isHolding || e.repeat) return;

                isHolding = true;
                remaining = 5;
                btn.classList.add('is-holding');
                lbl.innerText = remaining;

                interval = setInterval(() => {
                    remaining--;
                    lbl.innerText = remaining > 0 ? remaining : "";
                }, 1000);

                timer = setTimeout(() => {
                    document.body.style.overflow = originalOverflow;
                    overlay.remove();
                    styleBlock.remove();
                    clearInterval(interval);
                    // Clean up window listeners
                    window.removeEventListener('keydown', keydownHandler);
                    window.removeEventListener('keyup', keyupHandler);
                }, 5000);
            };

            const stop = (e) => {
                if (e.code === 'Space') e.preventDefault();
                isHolding = false;
                clearTimeout(timer);
                clearInterval(interval);
                btn.classList.remove('is-holding');
                lbl.innerText = "Hold to resume";
            };

            const keydownHandler = (e) => {
                if (e.code === 'Space') start(e);
            };

            const keyupHandler = (e) => {
                if (e.code === 'Space') stop(e);
            };

            // Mouse and Touch
            btn.addEventListener('mousedown', start);
            btn.addEventListener('touchstart', start);
            btn.addEventListener('mouseup', stop);
            btn.addEventListener('mouseleave', stop);
            btn.addEventListener('touchend', stop);

            // Keyboard
            window.addEventListener('keydown', keydownHandler);
            window.addEventListener('keyup', keyupHandler);
        }
    }).catch(err => console.error("Script Injection failed:", err));
};

// INITIALIZE

chrome.runtime.onInstalled.addListener(() => {
    chrome.contextMenus.create({
        id: "pause-this-tab",
        title: "Pause this tab",
        contexts: ["page"]
    });
});

// LISTENERS

chrome.contextMenus.onClicked.addListener((info, tab) => {
    if (info.menuItemId === "pause-this-tab") {
        injectPauseModal(tab);
    }
});

chrome.action?.onClicked.addListener((tab) => {
    injectPauseModal(tab);
});