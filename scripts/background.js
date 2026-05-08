import { STORAGE_KEYS, MSG } from "./constants.js";
import { getDomain, getLocalDate } from "./background/utils.js";
import { injectPauseModal, pauseAllTabsForDomain, resumeAllTabsForDomain } from "./background/overlay.js";
import { injectTimeTracking } from "./background/toast.js";
import { updateContextMenus } from "./background/tabs.js";
import { addDomainToBlacklist, removeDomainFromBlacklist } from "./background/storage.js";

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

chrome.tabs.onActivated.addListener(async (info) => {
    const tab = await chrome.tabs.get(info.tabId);

    activeTabId = info.tabId;
    activeDomain = getDomain(tab.url);

    updateContextMenus(activeDomain);
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
    if (change.status === "complete") {
        chrome.tabs.get(id, (fullTab) => {
            if (chrome.runtime.lastError) return;

            const domainKey = `domain_${getDomain(fullTab.url)}`;
            chrome.storage.local.get([STORAGE_KEYS.PAUSED], (res) => {
                if ((res[STORAGE_KEYS.PAUSED] || {})[domainKey]) {
                    injectPauseModal(fullTab);
                }
            });

            injectTimeTracking(fullTab);

            if (fullTab.active) updateContextMenus(getDomain(fullTab.url));
        });
    }
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
    if (info.menuItemId === "pause-this-tab") {
        pauseAllTabsForDomain(getDomain(tab.url));
    }
    else if (
        info.menuItemId === "ignore-domain" ||
        info.menuItemId === "ignore-domain-action"
    ) {
        addDomainToBlacklist(tab);
    }
    else if (
        info.menuItemId === "track-domain" ||
        info.menuItemId === "track-domain-action"
    ) {
        const domain = getDomain(tab.url);
        if (domain) removeDomainFromBlacklist(domain);
    }
});

if (chrome.action) {
    chrome.action.onClicked.addListener((tab) => {
        pauseAllTabsForDomain(getDomain(tab.url));
    });
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg.type === MSG.PAUSE_STATE_CHANGED) {
        const domain = getDomain(sender.url);
        const domainKey = `domain_${domain}`;

        if (!domain) return;

        chrome.storage.local.get([STORAGE_KEYS.PAUSED], (res) => {
            const paused = res[STORAGE_KEYS.PAUSED] || {};

            if (msg.status === "paused") {
                paused[domainKey] = true;
            }
            else {
                delete paused[domainKey];
                resumeAllTabsForDomain(domain);
            }

            chrome.storage.local.set({ [STORAGE_KEYS.PAUSED]: paused });
        });
    }
    else if (msg.type === MSG.ADD_TO_BLACKLIST) {
        addDomainToBlacklist({ url: `https://${msg.domain}` }).then(() => {
            sendResponse({ success: true });
        });
        return true;
    }
    else if (msg.type === MSG.REMOVE_FROM_BLACKLIST) {
        removeDomainFromBlacklist(msg.domain).then(() => {
            sendResponse({ success: true });
        });
        return true;
    }
    else if (msg.type === MSG.GET_BLACKLIST) {
        chrome.storage.local.get([STORAGE_KEYS.BLACKLIST], (res) => {
            sendResponse({ blacklist: res[STORAGE_KEYS.BLACKLIST] || {} });
        });
        return true;
    }
    else if (msg.type === MSG.PAUSE_CURRENT_TAB) {
        pauseAllTabsForDomain(activeDomain);
    }
    else if (msg.type === MSG.RESUME_CURRENT_TAB) {
        if (!activeDomain) return;
        const domainKey = `domain_${activeDomain}`;
        chrome.storage.local.get([STORAGE_KEYS.PAUSED], (res) => {
            const paused = res[STORAGE_KEYS.PAUSED] || {};
            delete paused[domainKey];
            chrome.storage.local.set({ [STORAGE_KEYS.PAUSED]: paused });
        });
        resumeAllTabsForDomain(activeDomain);
    }
    else if (msg.type === MSG.BLACKLIST_CURRENT_TAB) {
        if (activeTabId) {
            chrome.tabs.get(activeTabId, (tab) => {
                if (chrome.runtime.lastError) return;
                addDomainToBlacklist(tab);
            });
        }
    }
});

startGlobalTimer();
