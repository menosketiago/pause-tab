import { STORAGE_KEYS, MSG } from "./constants.js";
import { loadStats } from "./popup/stats.js";
import { initBlacklist, loadBlacklist, clearAll } from "./popup/blacklist.js";
import { updatePauseBtn, initPauseBtn } from "./popup/pauseBtn.js";

const pagesWrapper      = document.getElementById("pages-wrapper");
const pageMain          = document.getElementById("page-main");
const pageManageSites   = document.getElementById("page-manage-sites");
const pillTrackingDisabled = document.getElementById("pill-tracking-disabled");
const blacklistTabBtn   = document.getElementById("btn-blacklist-tab");
const trackTabBtn       = document.getElementById("btn-track-tab");
const manageSitesBtn    = document.getElementById("btn-manage-sites");

let currentDomain = null;

// CSS can't transition height: auto, so we keep it in px and update manually
const updateHeight = () => {
    const activePage = pagesWrapper.classList.contains("show-manage-sites")
        ? pageManageSites
        : pageMain;
    pagesWrapper.style.height = `${activePage.scrollHeight}px`;
};

const navigateTo = (showManage) => {
    // Snapshot current px height so the transition has a concrete from-value
    pagesWrapper.style.height = `${pagesWrapper.offsetHeight}px`;
    pagesWrapper.offsetHeight; // force layout so transition has a from-value
    pagesWrapper.classList.toggle("show-manage-sites", showManage);
    const target = showManage ? pageManageSites : pageMain;
    pagesWrapper.style.height = `${target.scrollHeight}px`;
};

const updateTrackingBtn = () => {
    if (!currentDomain) return;

    chrome.storage.local.get([STORAGE_KEYS.BLACKLIST], (res) => {
        const isBlacklisted = !!(res[STORAGE_KEYS.BLACKLIST] || {})[`domain_${currentDomain}`];

        pillTrackingDisabled.classList.toggle("is-hidden", !isBlacklisted);
        blacklistTabBtn.classList.toggle("is-hidden", isBlacklisted);
        trackTabBtn.classList.toggle("is-hidden", !isBlacklisted);
        updateHeight();
    });
};

initBlacklist({ updateHeight, updateTrackingBtn });
initPauseBtn();

blacklistTabBtn.addEventListener("click", () => {
    chrome.runtime.sendMessage({ type: MSG.BLACKLIST_CURRENT_TAB });
});

trackTabBtn.addEventListener("click", () => {
    if (!currentDomain) return;
    chrome.runtime.sendMessage(
        { type: MSG.REMOVE_FROM_BLACKLIST, domain: currentDomain },
        (response) => {
            if (response?.success) {
                loadBlacklist();
                updateTrackingBtn();
            }
        },
    );
});

manageSitesBtn.addEventListener("click", () => navigateTo(true));
document.getElementById("btn-back").addEventListener("click", () => navigateTo(false));
document.getElementById("btn-clear-all").addEventListener("click", clearAll);

chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => {
    if (tab?.url) {
        try {
            currentDomain = new URL(tab.url).hostname.replace(/^www\./, "");
        } catch {}
    }
    loadStats(currentDomain);
    updatePauseBtn(currentDomain);
    updateTrackingBtn();
    loadBlacklist();
});

chrome.runtime.onMessage.addListener((msg) => {
    if (msg.type === MSG.BLACKLIST_UPDATED) {
        loadBlacklist();
        updateTrackingBtn();
    }
    else if (msg.type === MSG.PAUSE_STATE_CHANGED) {
        updatePauseBtn(currentDomain);
    }
});

setInterval(() => loadStats(currentDomain), 1000);
