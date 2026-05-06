// PAUSE OVERLAY

const injectPauseModal = (tab) => {
    if (
        !tab ||
        !tab.id ||
        !tab.url ||
        tab.url.startsWith("chrome://") ||
        tab.url.includes("chrome.google.com/webstore")
    ) {
        console.warn(
            "Pause Tab: Action blocked on restricted Google/System pages.",
        );
        return;
    }

    chrome.scripting
        .insertCSS({
            target: { tabId: tab.id },
            files: ["styles/global.css", "styles/components.css", "styles/overlay.css"],
        })
        .catch((err) => console.error("CSS Injection failed:", err));

    chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: () => {
            const scrollBarWidth =
                window.innerWidth - document.documentElement.clientWidth;
            const originalOverflow = document.body.style.overflow;
            const originalPadding = document.body.style.paddingRight;
            const fontUrl = chrome.runtime.getURL(
                "fonts/Nunito-VariableFont_wght.ttf",
            );
            const styleBlock = document.createElement("style");
            const overlay = document.createElement("div");

            let timer, interval, remaining;

            let isHolding = false;

            const start = (e) => {
                if (e.code === "Space") e.preventDefault();

                if (isHolding || e.repeat) return;

                isHolding = true;
                remaining = 5;

                btn.classList.add("is-holding");
                btn.innerText = remaining;

                interval = setInterval(() => {
                    remaining--;

                    if (remaining > 0) {
                        btn.innerText = remaining;
                    } else {
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
                    chrome.runtime.sendMessage({
                        type: "pauseStateChanged",
                        status: "resumed",
                    });
                    window.removeEventListener("keydown", keydownHandler);
                    window.removeEventListener("keyup", keyupHandler);
                }, 5000);
            };

            const stop = (e) => {
                if (e.code === "Space") e.preventDefault();
                isHolding = false;
                clearTimeout(timer);
                clearInterval(interval);
                btn.classList.remove("is-holding");
                btn.innerText = "Hold to resume";
            };

            const keydownHandler = (e) => {
                if (e.code === "Space") start(e);
            };

            const keyupHandler = (e) => {
                if (e.code === "Space") stop(e);
            };

            if (document.getElementById("pause-tab-overlay")) return;

            // Calculate scrollbar width to prevent page jump
            if (scrollBarWidth > 0)
                document.body.style.paddingRight = `${scrollBarWidth}px`;

            document.body.style.overflow = "hidden";

            // Notify background to stop timer
            chrome.runtime.sendMessage({
                type: "pauseStateChanged",
                status: "paused",
            });

            styleBlock.textContent = `@font-face { font-family: 'Nunito'; src: url('${fontUrl}') format('truetype'); font-weight: 200 1000; }`;
            document.head.appendChild(styleBlock);

            overlay.id = "pause-tab-overlay";
            overlay.setAttribute("role", "dialog");
            overlay.setAttribute("aria-modal", "true");
            overlay.setAttribute("tabindex", "-1");

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

            const btn = overlay.querySelector("#resume-button");

            btn.addEventListener("mousedown", start);
            btn.addEventListener("touchstart", start);
            btn.addEventListener("mouseup", stop);
            btn.addEventListener("mouseleave", stop);
            btn.addEventListener("touchend", stop);
            window.addEventListener("keydown", keydownHandler);
            window.addEventListener("keyup", keyupHandler);
        },
    });
};

// TIME TOAST

const injectTimeTracking = (tab) => {
    if (!tab || !tab.id) return;

    // Don't inject into restricted URLs
    if (
        !tab.url ||
        tab.url.startsWith("chrome://") ||
        tab.url.includes("chrome.google.com/webstore")
    )
        return;

    chrome.scripting
        .insertCSS({
            target: { tabId: tab.id },
            files: ["styles/global.css", "styles/components.css", "styles/toast.css"],
        })
        .catch(() => { });

    chrome.scripting
        .executeScript({
            target: { tabId: tab.id },
            func: (domain, favIconUrl) => {
                let overlayElement,
                    toastContainer,
                    container,
                    toast,
                    content,
                    timeTracking,
                    time;

                if (window.pauseTabInterval) clearInterval(window.pauseTabInterval);

                window.pauseTabInterval = setInterval(() => {
                    if (!chrome.runtime || !chrome.runtime.id) {
                        clearInterval(window.pauseTabInterval);
                        return;
                    }

                    overlayElement = document.getElementById("pause-tab-overlay");
                    if (overlayElement) return;

                    chrome.storage.local.get(["timeTracking"], (res) => {
                        if (chrome.runtime.lastError) {
                            clearInterval(window.pauseTabInterval);
                            return;
                        }

                        timeTracking = res.timeTracking || {};
                        time = timeTracking[`domain_${domain}`] || 0;

                        // Trigger toast every 15 minutes (900 seconds)
                        if (time > 0 && time % 900 === 0) {
                            toastContainer = document.getElementById(
                                "pause-tab-toast-container",
                            );
                            if (toastContainer) return;

                            if (!document.body) return;

                            // Create Container for the glow
                            container = document.createElement("div");
                            container.id = "pause-tab-toast-container";

                            // Create the actual toast
                            toast = document.createElement("div");
                            toast.id = "pause-tab-toast";

                            content = "";

                            if (favIconUrl && typeof favIconUrl === "string") {
                                content = `<img src="${favIconUrl}" />`;
                            }

                            content += `<span>Used for ${Math.floor(time / 60)}m</span>`;

                            toast.innerHTML = content;
                            container.appendChild(toast);
                            document.body.appendChild(container);

                            setTimeout(() => {
                                if (container && container.parentNode) container.remove();
                            }, 12000);

                            // Dismiss on click
                            container.addEventListener("click", () => {
                                if (container && container.parentNode) container.remove();
                            });
                        }
                    });
                }, 1000);
            },
            args: [
                getDomain(tab.url),
                typeof tab.favIconUrl === "string" ? tab.favIconUrl : null,
            ],
        })
        .catch(() => { });
};

// TRACKING CONSTANTS & BACKGROUND LOGIC

const STORAGE_KEYS = {
    TIME: "timeTracking",
    DATE: "lastResetDate",
    PAUSED: "pausedDomains",
    BLACKLIST: "blacklistedDomains",
};

const getLocalDate = () => new Date().toISOString().split("T")[0];

const getDomain = (url) => {
    if (!url) return null;

    try {
        return new URL(url).hostname.replace(/^www\./, "");
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
    } else {
        activeTabId = null;
    }

    if (tab) {
        activeDomain = getDomain(tab.url);
    } else {
        activeDomain = null;
    }
};

const startGlobalTimer = () => {
    setInterval(async () => {
        let res, domainKey, paused, blacklist, timeData, currentTime;

        if (!activeTabId || !activeDomain) return;

        res = await chrome.storage.local.get([
            STORAGE_KEYS.TIME,
            STORAGE_KEYS.PAUSED,
            STORAGE_KEYS.BLACKLIST,
            STORAGE_KEYS.DATE,
        ]);

        if (res[STORAGE_KEYS.DATE] !== getLocalDate()) {
            await chrome.storage.local.set({
                [STORAGE_KEYS.TIME]: {},
                [STORAGE_KEYS.DATE]: getLocalDate(),
            });
            return;
        }

        domainKey = `domain_${activeDomain}`;
        paused = res[STORAGE_KEYS.PAUSED] || {};
        blacklist = res[STORAGE_KEYS.BLACKLIST] || {};

        if (!paused[domainKey] && !blacklist[domainKey]) {
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
        contexts: ["page"],
    });

    chrome.contextMenus.create({
        id: "separator-1",
        type: "separator",
        contexts: ["page"],
    });

    chrome.contextMenus.create({
        id: "ignore-domain",
        title: "Don't track time on this site",
        contexts: ["page"],
    });

    chrome.contextMenus.create({
        id: "track-domain",
        title: "Resume tracking this site",
        contexts: ["page"],
    });

    chrome.contextMenus.create({
        id: "ignore-domain-action",
        title: "Don't track time on this site",
        contexts: ["action"],
    });

    chrome.contextMenus.create({
        id: "track-domain-action",
        title: "Resume tracking this site",
        contexts: ["action"],
    });

    await chrome.storage.local.set({
        [STORAGE_KEYS.TIME]: {},
        [STORAGE_KEYS.DATE]: getLocalDate(),
        [STORAGE_KEYS.PAUSED]: {},
        [STORAGE_KEYS.BLACKLIST]: {},
    });

    updateActiveTab();
});

// EVENT LISTENERS

const updateContextMenus = async (domain) => {
    const domainKey = `domain_${domain}`;
    const res = await chrome.storage.local.get([STORAGE_KEYS.BLACKLIST]);
    const isBlacklisted = !!(res[STORAGE_KEYS.BLACKLIST] || {})[domainKey];

    chrome.contextMenus.update("ignore-domain", { visible: !isBlacklisted });
    chrome.contextMenus.update("ignore-domain-action", { visible: !isBlacklisted });
    chrome.contextMenus.update("track-domain", { visible: isBlacklisted });
    chrome.contextMenus.update("track-domain-action", { visible: isBlacklisted });
};

chrome.tabs.onActivated.addListener(async (info) => {
    const tab = await chrome.tabs.get(info.tabId);

    activeTabId = info.tabId;
    activeDomain = getDomain(tab.url);
    updateContextMenus(activeDomain);
});

chrome.windows.onFocusChanged.addListener(async (windowId) => {
    if (windowId === chrome.windows.WINDOW_ID_NONE) {
        activeTabId = null;
    } else {
        updateActiveTab();
    }
});

chrome.tabs.onUpdated.addListener((id, change, tab) => {
    if (change.status === "complete") {
        chrome.tabs.get(id, (fullTab) => {
            if (chrome.runtime.lastError) return;
            injectTimeTracking(fullTab);
            if (fullTab.active) updateContextMenus(getDomain(fullTab.url));
        });
    }
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
    if (info.menuItemId === "pause-this-tab") {
        injectPauseModal(tab);
    } else if (
        info.menuItemId === "ignore-domain" ||
        info.menuItemId === "ignore-domain-action"
    ) {
        addDomainToBlacklist(tab);
    } else if (
        info.menuItemId === "track-domain" ||
        info.menuItemId === "track-domain-action"
    ) {
        const domain = getDomain(tab.url);
        if (domain) removeDomainFromBlacklist(domain);
    }
});

const addDomainToBlacklist = async (tab) => {
    const domain = getDomain(tab.url);
    if (!domain) return;

    const domainKey = `domain_${domain}`;
    const res = await chrome.storage.local.get([STORAGE_KEYS.BLACKLIST]);
    const blacklist = res[STORAGE_KEYS.BLACKLIST] || {};

    blacklist[domainKey] = true;
    await chrome.storage.local.set({ [STORAGE_KEYS.BLACKLIST]: blacklist });
    chrome.runtime.sendMessage({ type: "blacklistUpdated" }).catch(() => {});
    updateContextMenus(domain);
};

const removeDomainFromBlacklist = async (domain) => {
    const domainKey = `domain_${domain}`;
    const res = await chrome.storage.local.get([STORAGE_KEYS.BLACKLIST]);
    const blacklist = res[STORAGE_KEYS.BLACKLIST] || {};

    delete blacklist[domainKey];
    await chrome.storage.local.set({ [STORAGE_KEYS.BLACKLIST]: blacklist });
    chrome.runtime.sendMessage({ type: "blacklistUpdated" }).catch(() => {});
    updateContextMenus(domain);
};

if (chrome.action) {
    chrome.action.onClicked.addListener((tab) => {
        injectPauseModal(tab);
    });
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg.type === "pauseStateChanged") {
        const domain = getDomain(sender.url);
        const domainKey = `domain_${domain}`;

        if (!domain) return;

        chrome.storage.local.get([STORAGE_KEYS.PAUSED], (res) => {
            const paused = res[STORAGE_KEYS.PAUSED] || {};

            if (msg.status === "paused") {
                paused[domainKey] = true;
            } else {
                delete paused[domainKey];
            }

            chrome.storage.local.set({ [STORAGE_KEYS.PAUSED]: paused });
        });
    } else if (msg.type === "addToBlacklist") {
        addDomainToBlacklist({ url: `https://${msg.domain}` }).then(() => {
            sendResponse({ success: true });
        });
        return true;
    } else if (msg.type === "removeFromBlacklist") {
        removeDomainFromBlacklist(msg.domain).then(() => {
            sendResponse({ success: true });
        });
        return true;
    } else if (msg.type === "getBlacklist") {
        chrome.storage.local.get([STORAGE_KEYS.BLACKLIST], (res) => {
            sendResponse({ blacklist: res[STORAGE_KEYS.BLACKLIST] || {} });
        });
        return true;
    } else if (msg.type === "pauseCurrentTab") {
        if (activeTabId) {
            chrome.tabs.get(activeTabId, (tab) => {
                if (chrome.runtime.lastError) return;
                injectPauseModal(tab);
            });
        }
    } else if (msg.type === "blacklistCurrentTab") {
        if (activeTabId) {
            chrome.tabs.get(activeTabId, (tab) => {
                if (chrome.runtime.lastError) return;
                addDomainToBlacklist(tab);
            });
        }
    }
});

startGlobalTimer();
