// PAUSE OVERLAY

// Fetches CSS files in the background (full extension access) and rewrites
// relative asset URLs to absolute chrome-extension:// URLs before passing to pages
const fetchCss = async (...paths) => {
    const extBase = chrome.runtime.getURL("");
    const texts = await Promise.all(
        paths.map((p) => fetch(chrome.runtime.getURL(p)).then((r) => r.text()))
    );
    return texts.join("\n")
        .replace(/url\(["']?\.\.\//g, `url("${extBase}`)
        // :root doesn't match in shadow trees (shadow root is a DocumentFragment, not an element)
        // :host matches the shadow host and lets custom properties cascade into the tree
        .replace(/:root\b/g, ":host");
};

const injectPauseModal = async (tab) => {
    if (
        !tab ||
        !tab.id ||
        !tab.url ||
        tab.url.startsWith("chrome://") ||
        tab.url.includes("chrome.google.com/webstore")
    ) {
        console.warn("Pause Tab: Action blocked on restricted Google/System pages.");
        return;
    }

    const css = await fetchCss("styles/global.css", "styles/components.css", "styles/overlay.css");

    chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: (css) => {
            if (document.getElementById("pause-tab-overlay-host")) return;

            const scrollBarWidth = window.innerWidth - document.documentElement.clientWidth;
            const originalOverflow = document.body.style.overflow;
            const originalPadding = document.body.style.paddingRight;

            if (scrollBarWidth > 0) document.body.style.paddingRight = `${scrollBarWidth}px`;
            document.body.style.overflow = "hidden";

            chrome.runtime.sendMessage({ type: "pauseStateChanged", status: "paused" });

            const host = document.createElement("div");
            host.id = "pause-tab-overlay-host";
            document.body.appendChild(host);

            const shadow = host.attachShadow({ mode: "open" });

            const style = document.createElement("style");
            style.textContent = css;
            shadow.appendChild(style);

            const overlay = document.createElement("div");
            overlay.id = "pause-tab-overlay";
            overlay.setAttribute("role", "dialog");
            overlay.setAttribute("aria-modal", "true");
            overlay.setAttribute("tabindex", "-1");
            overlay.innerHTML = `
                <article class="bg-image">
                    <h1>Tab paused</h1>
                    <p>When you are ready, hold the button below for 5 seconds to resume.</p>
                    <footer>
                        <button id="resume-button" class="pause-tab-btn primary">Hold to resume</button>
                    </footer>
                </article>
            `;
            shadow.appendChild(overlay);
            overlay.focus();

            const btn = shadow.querySelector("#resume-button");

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
                    btn.innerText = remaining > 0 ? remaining : "";
                }, 1000);

                timer = setTimeout(() => {
                    document.body.style.overflow = originalOverflow;
                    document.body.style.paddingRight = originalPadding;
                    host.remove();
                    clearInterval(interval);
                    chrome.runtime.sendMessage({ type: "pauseStateChanged", status: "resumed" });
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

            btn.addEventListener("mousedown", start);
            btn.addEventListener("touchstart", start);
            btn.addEventListener("mouseup", stop);
            btn.addEventListener("mouseleave", stop);
            btn.addEventListener("touchend", stop);
            window.addEventListener("keydown", keydownHandler);
            window.addEventListener("keyup", keyupHandler);
        },
        args: [css],
    }).catch((err) => console.error("Pause Tab: Script injection failed:", err));
};

// TIME TOAST

const injectTimeTracking = async (tab) => {
    if (!tab || !tab.id) return;

    // Don't inject into restricted URLs
    if (
        !tab.url ||
        tab.url.startsWith("chrome://") ||
        tab.url.includes("chrome.google.com/webstore")
    )
        return;

    const css = await fetchCss("styles/global.css", "styles/components.css", "styles/toast.css");

    chrome.scripting
        .executeScript({
            target: { tabId: tab.id },
            func: (domain, favIconUrl, css) => {
                if (window.pauseTabInterval) clearInterval(window.pauseTabInterval);

                window.pauseTabInterval = setInterval(() => {
                    if (!chrome.runtime || !chrome.runtime.id) {
                        clearInterval(window.pauseTabInterval);
                        return;
                    }

                    // Pause overlay takes priority — don't show toast while paused
                    if (document.getElementById("pause-tab-overlay-host")) return;

                    chrome.storage.local.get(["timeTracking"], (res) => {
                        if (chrome.runtime.lastError) {
                            clearInterval(window.pauseTabInterval);
                            return;
                        }

                        const timeTracking = res.timeTracking || {};
                        const time = timeTracking[`domain_${domain}`] || 0;

                        // Trigger toast every 15 minutes (900 seconds)
                        if (time > 0 && time % 900 === 0) {
                            if (document.getElementById("pause-tab-toast-host")) return;
                            if (!document.body) return;

                            {
                                const host = document.createElement("div");
                                host.id = "pause-tab-toast-host";
                                document.body.appendChild(host);

                                const shadow = host.attachShadow({ mode: "open" });

                                const style = document.createElement("style");
                                style.textContent = css;
                                shadow.appendChild(style);

                                const container = document.createElement("div");
                                container.id = "pause-tab-toast-container";

                                const toast = document.createElement("div");
                                toast.id = "pause-tab-toast";

                                let content = "";
                                if (favIconUrl && typeof favIconUrl === "string") {
                                    content = `<img src="${favIconUrl}" />`;
                                }
                                content += `<span>Used for ${Math.floor(time / 60)}m</span>`;
                                toast.innerHTML = content;

                                container.appendChild(toast);
                                shadow.appendChild(container);

                                const remove = () => { if (host.parentNode) host.remove(); };
                                setTimeout(remove, 12000);
                                host.addEventListener("click", remove);
                            }
                        }
                    });
                }, 1000);
            },
            args: [
                getDomain(tab.url),
                typeof tab.favIconUrl === "string" ? tab.favIconUrl : null,
                css,
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
