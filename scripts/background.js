const injectPauseModal = (tab) => {
    if (!tab || !tab.id || tab.url.startsWith('chrome://')) return;

    chrome.scripting.insertCSS({
        target: { tabId: tab.id },
        files: ["styles/index.css"]
    }).catch(err => console.error("CSS Injection failed:", err));

    chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: () => {
            if (document.getElementById('pause-tab-overlay')) return;

            const fontUrl = chrome.runtime.getURL("fonts/Nunito-VariableFont_wght.ttf");
            const styleBlock = document.createElement('style');
            styleBlock.textContent = "@font-face { font-family: 'Nunito'; src: url('" + fontUrl + "') format('truetype'); font-weight: 200 1000; }";
            document.head.appendChild(styleBlock);

            const overlay = document.createElement('div');
            overlay.id = 'pause-tab-overlay';
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

            const start = () => {
                remaining = 5;
                btn.classList.add('is-holding');
                lbl.innerText = remaining;
                interval = setInterval(() => {
                    remaining--;
                    lbl.innerText = remaining > 0 ? remaining : "";
                }, 1000);
                timer = setTimeout(() => {
                    overlay.remove();
                    styleBlock.remove();
                    clearInterval(interval);
                }, 5000);
            };

            const stop = () => {
                clearTimeout(timer);
                clearInterval(interval);
                btn.classList.remove('is-holding');
                lbl.innerText = "Hold to resume";
            };

            btn.addEventListener('mousedown', start);
            btn.addEventListener('touchstart', start);
            btn.addEventListener('mouseup', stop);
            btn.addEventListener('mouseleave', stop);
            btn.addEventListener('touchend', stop);
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