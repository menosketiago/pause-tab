// PAUSE OVERLAY

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

            // Calculate scrollbar width to prevent page jump
            const scrollBarWidth = window.innerWidth - document.documentElement.clientWidth;
            const originalOverflow = document.body.style.overflow;
            const originalPadding = document.body.style.paddingRight;

            if (scrollBarWidth > 0) {
                document.body.style.paddingRight = `${scrollBarWidth}px`;
            }

            document.body.style.overflow = 'hidden';

            // Notify background to stop timer
            chrome.runtime.sendMessage({ type: 'pauseStateChanged', status: 'paused' });

            const fontUrl = chrome.runtime.getURL("fonts/Nunito-VariableFont_wght.ttf");
            const styleBlock = document.createElement('style');

            styleBlock.textContent = `@font-face { font-family: 'Nunito'; src: url('${fontUrl}') format('truetype'); font-weight: 200 1000; }`;
            document.head.appendChild(styleBlock);

            const overlay = document.createElement('div');

            overlay.id = 'pause-tab-overlay';
            overlay.setAttribute('role', 'dialog');
            overlay.setAttribute('aria-modal', 'true');
            overlay.setAttribute('tabindex', '-1');
            overlay.innerHTML = `
                <article>
                    <h1>Tab paused</h1>
                    <p>When you are ready, hold the button below for 5 seconds to resume.</p>
                    <footer>
                        <button id="resume-button" class="pause-tab-btn primary">Hold to resume</button>
                    </footer>
                </article>
            `;
            document.body.appendChild(overlay);
            overlay.focus();

            const btn = document.getElementById('resume-button');
            let timer, interval, remaining;
            let isHolding = false;

            const start = (e) => {
                if (e.code === 'Space') e.preventDefault();
                if (isHolding || e.repeat) return;
                
                isHolding = true;
                remaining = 5;
                btn.classList.add('is-holding');
                btn.innerText = remaining;
                
                interval = setInterval(() => { 
                    remaining--; 
                    btn.innerText = remaining > 0 ? remaining : ""; 
                }, 1000);
                
                timer = setTimeout(() => {
                    // Restore original scroll settings
                    document.body.style.overflow = originalOverflow;
                    document.body.style.paddingRight = originalPadding;
                    
                    overlay.remove();
                    styleBlock.remove();
                    clearInterval(interval);
                    chrome.runtime.sendMessage({ type: 'pauseStateChanged', status: 'resumed' });
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
                btn.innerText = "Hold to resume";
            };

            const keydownHandler = (e) => { if (e.code === 'Space') start(e); };
            const keyupHandler = (e) => { if (e.code === 'Space') stop(e); };

            btn.addEventListener('mousedown', start);
            btn.addEventListener('touchstart', start);
            btn.addEventListener('mouseup', stop);
            btn.addEventListener('mouseleave', stop);
            btn.addEventListener('touchend', stop);
            window.addEventListener('keydown', keydownHandler);
            window.addEventListener('keyup', keyupHandler);
        }
    });
};

// TIME TOAST

const injectTimeTracking = (tab) => {
    if (!tab || !tab.id) return;
    
    // Don't inject into restricted URLs
    if (!tab.url || tab.url.startsWith('chrome://') || tab.url.includes("chrome.google.com/webstore")) {
        return;
    }

    chrome.scripting.insertCSS({ 
        target: { tabId: tab.id }, 
        files: ["styles/index.css"] 
    }).catch(() => {});

    chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: (tabId, favIconUrl) => {
            if (window.pauseTabInterval) clearInterval(window.pauseTabInterval);

            window.pauseTabInterval = setInterval(() => {
                if (!chrome.runtime?.id) {
                    clearInterval(window.pauseTabInterval);
                    return;
                }

                if (document.getElementById('pause-tab-overlay')) return;

                chrome.storage.local.get(['timeTracking'], (res) => {
                    if (chrome.runtime.lastError) {
                        clearInterval(window.pauseTabInterval);
                        return;
                    }

                    const timeTracking = res.timeTracking || {};
                    const time = timeTracking[`tab_${tabId}`] || 0;

                    // Trigger toast every 15 minutes (900 seconds)
                    if (time > 0 && time % 900 === 0) {
                        if (document.getElementById('pause-tab-toast-container')) return; 
                        if (!document.body) return;

                        // Create Container for Glow isolation
                        const container = document.createElement('div');
                        container.id = 'pause-tab-toast-container';

                        // Create actual Toast content
                        const toast = document.createElement('div');
                        toast.id = 'pause-tab-toast';
                        
                        let content = '';

                        if (favIconUrl && typeof favIconUrl === 'string') {
                            content = `<img src="${favIconUrl}" />`;
                        }

                        content += `<span>Tab used for ${Math.floor(time / 60)}m</span>`;
                        
                        toast.innerHTML = content;
                        container.appendChild(toast);
                        document.body.appendChild(container);
                        
                        setTimeout(() => {
                            if (container && container.parentNode) container.remove();
                        }, 7200);

                        // Dismiss on click
                        container.addEventListener('click', () => {
                            if (container && container.parentNode) container.remove();
                        });
                    }
                });
            }, 1000);
        },
        args: [tab.id, typeof tab.favIconUrl === 'string' ? tab.favIconUrl : null]
    }).catch(() => {});
};

// TRACKING CONSTANTS & BACKGROUND LOGIC

const STORAGE_KEYS = {
    TIME: 'timeTracking',
    DATE: 'lastResetDate',
    PAUSED: 'pausedTabs'
};

const getLocalDate = () => new Date().toISOString().split('T')[0];

let activeTabId = null;

const updateActiveTab = async () => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    activeTabId = tab?.id || null;
};

const startGlobalTimer = () => {
    setInterval(async () => {
        if (!activeTabId) return;

        const res = await chrome.storage.local.get([STORAGE_KEYS.TIME, STORAGE_KEYS.PAUSED, STORAGE_KEYS.DATE]);
        
        if (res[STORAGE_KEYS.DATE] !== getLocalDate()) {
            await chrome.storage.local.set({ [STORAGE_KEYS.TIME]: {}, [STORAGE_KEYS.DATE]: getLocalDate() });

            return;
        }

        const tabKey = `tab_${activeTabId}`;

        if (!res[STORAGE_KEYS.PAUSED]?.[tabKey]) {
            const timeData = res[STORAGE_KEYS.TIME] || {};
            timeData[tabKey] = (timeData[tabKey] || 0) + 1;

            chrome.storage.local.set({ [STORAGE_KEYS.TIME]: timeData });
        }
    }, 1000);
};

// INITIALIZE THE EXTENSION

chrome.runtime.onInstalled.addListener(async () => {
    chrome.contextMenus.create({ 
        id: "pause-this-tab", 
        title: "Pause this tab", 
        contexts: ["page"] 
    });

    await chrome.storage.local.set({ 
        [STORAGE_KEYS.TIME]: {}, 
        [STORAGE_KEYS.DATE]: getLocalDate(), 
        [STORAGE_KEYS.PAUSED]: {} 
    });

    updateActiveTab();
});

// EVENT LISTENERS

chrome.tabs.onActivated.addListener(info => { 
    activeTabId = info.tabId; 
});

chrome.windows.onFocusChanged.addListener(async (windowId) => {
    if (windowId === chrome.windows.WINDOW_ID_NONE) activeTabId = null;
    else updateActiveTab();
});

chrome.tabs.onUpdated.addListener((id, change, tab) => {
    if (change.status === 'complete') {
        chrome.tabs.get(id, (fullTab) => {
            injectTimeTracking(fullTab);
        });
    }
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
    if (info.menuItemId === "pause-this-tab") injectPauseModal(tab);
});

chrome.action?.onClicked.addListener(tab => injectPauseModal(tab));

chrome.runtime.onMessage.addListener((msg, sender) => {
    const tabKey = `tab_${sender.tab.id}`;
    chrome.storage.local.get([STORAGE_KEYS.PAUSED], (res) => {
        const paused = res[STORAGE_KEYS.PAUSED] || {};
        if (msg.status === 'paused') paused[tabKey] = true;
        else delete paused[tabKey];
        chrome.storage.local.set({ [STORAGE_KEYS.PAUSED]: paused });
    });
});

startGlobalTimer();