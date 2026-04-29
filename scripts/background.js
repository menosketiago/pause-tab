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
            const scrollBarWidth = window.innerWidth - document.documentElement.clientWidth;
            const originalOverflow = document.body.style.overflow;
            const originalPadding = document.body.style.paddingRight;
            const fontUrl = chrome.runtime.getURL("fonts/Nunito-VariableFont_wght.ttf");
            const styleBlock = document.createElement('style');
            const overlay = document.createElement('div');
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

                    if (remaining > 0) {
                        btn.innerText = remaining;
                    }
                    else {
                        btn.innerText = "";
                    }
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
            
            const keydownHandler = (e) => {
                if (e.code === 'Space') start(e);
            };

            const keyupHandler = (e) => {
                if (e.code === 'Space') stop(e);
            };

            if (document.getElementById('pause-tab-overlay')) return;

            // Calculate scrollbar width to prevent page jump
            if (scrollBarWidth > 0) document.body.style.paddingRight = `${scrollBarWidth}px`;

            document.body.style.overflow = 'hidden';

            // Notify background to stop timer
            chrome.runtime.sendMessage({ type: 'pauseStateChanged', status: 'paused' });

            styleBlock.textContent = `@font-face { font-family: 'Nunito'; src: url('${fontUrl}') format('truetype'); font-weight: 200 1000; }`;
            document.head.appendChild(styleBlock);

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
    if (!tab.url || tab.url.startsWith('chrome://') || tab.url.includes("chrome.google.com/webstore")) return;

    chrome.scripting.insertCSS({ 
        target: { tabId: tab.id }, 
        files: ["styles/index.css"] 
    }).catch(() => {});

    chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: (domain, favIconUrl) => {
            let overlayElement, toastContainer, container, toast, content, timeTracking, time;
            
            if (window.pauseTabInterval) clearInterval(window.pauseTabInterval);

            window.pauseTabInterval = setInterval(() => {
                if (!chrome.runtime || !chrome.runtime.id) {
                    clearInterval(window.pauseTabInterval);
                    return;
                }

                overlayElement = document.getElementById('pause-tab-overlay');
                if (overlayElement) return;

                chrome.storage.local.get(['timeTracking'], (res) => {
                    if (chrome.runtime.lastError) {
                        clearInterval(window.pauseTabInterval);
                        return;
                    }

                    timeTracking = res.timeTracking || {};
                    time = timeTracking[`domain_${domain}`] || 0;

                    // Trigger toast every 15 minutes (900 seconds)
                    if (time > 0 && time % 900 === 0) {
                        toastContainer = document.getElementById('pause-tab-toast-container');
                        if (toastContainer) return;
                        
                        if (!document.body) return;

                        // Create Container for Glow isolation
                        container = document.createElement('div');
                        container.id = 'pause-tab-toast-container';

                        // Create actual Toast content
                        toast = document.createElement('div');
                        toast.id = 'pause-tab-toast';
                        
                        content = '';

                        if (favIconUrl && typeof favIconUrl === 'string') {
                            content = `<img src="${favIconUrl}" />`;
                        }

                        content += `<span>${domain} used for ${Math.floor(time / 60)}m</span>`;
                        
                        toast.innerHTML = content;
                        container.appendChild(toast);
                        document.body.appendChild(container);
                        
                        setTimeout(() => {
                            if (container && container.parentNode) container.remove();
                        }, 12000);

                        // Dismiss on click
                        container.addEventListener('click', () => {
                            if (container && container.parentNode) container.remove();
                        });
                    }
                });
            }, 1000);
        },
        args: [
            getDomain(tab.url),
            typeof tab.favIconUrl === 'string' ? tab.favIconUrl : null
        ]
    }).catch(() => {});
};

// TRACKING CONSTANTS & BACKGROUND LOGIC

const STORAGE_KEYS = {
    TIME: 'timeTracking',
    DATE: 'lastResetDate',
    PAUSED: 'pausedDomains'
};

const getLocalDate = () => new Date().toISOString().split('T')[0];

const getDomain = (url) => {
    if (!url) return null;

    try {
        return new URL(url).hostname;
    } catch {
        return null;
    }
};

let activeTabId = null;
let activeDomain = null;

const updateActiveTab = async () => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    
    if (tab && tab.id) {
        activeTabId = tab.id;
    }
    else {
        activeTabId = null;
    }
    
    if (tab) {
        activeDomain = getDomain(tab.url);
    }
    else {
        activeDomain = null;
    }
};

const startGlobalTimer = () => {
    setInterval(async () => {
        let res, domainKey, paused, timeData, currentTime;
        
        if (!activeTabId || !activeDomain) return;

        res = await chrome.storage.local.get([STORAGE_KEYS.TIME, STORAGE_KEYS.PAUSED, STORAGE_KEYS.DATE]);
        
        if (res[STORAGE_KEYS.DATE] !== getLocalDate()) {
            await chrome.storage.local.set({ [STORAGE_KEYS.TIME]: {}, [STORAGE_KEYS.DATE]: getLocalDate() });
            return;
        }

        domainKey = `domain_${activeDomain}`;
        paused = res[STORAGE_KEYS.PAUSED] || {};

        if (!paused[domainKey]) {
            timeData = res[STORAGE_KEYS.TIME] || {};
            currentTime = timeData[domainKey] || 0;
            timeData[domainKey] = currentTime + 1;

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

chrome.tabs.onActivated.addListener(async (info) => { 
    const tab = await chrome.tabs.get(info.tabId);

    activeTabId = info.tabId;
    activeDomain = getDomain(tab.url);
});

chrome.windows.onFocusChanged.addListener(async (windowId) => {
    if (windowId === chrome.windows.WINDOW_ID_NONE) {
        activeTabId = null;
    }
    else {
        updateActiveTab();
    }
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

if (chrome.action) {
    chrome.action.onClicked.addListener(tab => {
        injectPauseModal(tab);
    });
}

chrome.runtime.onMessage.addListener((msg, sender) => {
    const domain = getDomain(sender.url);
    const domainKey = `domain_${domain}`;

    if (!domain) return;

    chrome.storage.local.get([STORAGE_KEYS.PAUSED], (res) => {
        const paused = res[STORAGE_KEYS.PAUSED] || {};

        if (msg.status === 'paused') {
            paused[domainKey] = true;
        }
        else {
            delete paused[domainKey];
        }

        chrome.storage.local.set({ [STORAGE_KEYS.PAUSED]: paused });
    });
});

startGlobalTimer();