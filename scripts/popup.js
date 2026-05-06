const STORAGE_KEYS = {
    BLACKLIST: "blacklistedDomains",
    TIME: "timeTracking",
};

const pagesWrapper = document.getElementById("pages-wrapper");
const pageMain = document.getElementById("page-main");
const pageManageSites = document.getElementById("page-manage-sites");

const updateHeight = () => {
    const activePage = pagesWrapper.classList.contains("show-manage-sites")
        ? pageManageSites
        : pageMain;
    pagesWrapper.style.height = `${activePage.scrollHeight}px`;
};

const navigateTo = (showManage) => {
    pagesWrapper.style.height = `${pagesWrapper.offsetHeight}px`;
    pagesWrapper.offsetHeight; // force layout so transition has a from-value
    pagesWrapper.classList.toggle("show-manage-sites", showManage);
    const target = showManage ? pageManageSites : pageMain;
    pagesWrapper.style.height = `${target.scrollHeight}px`;
};
const blacklistContainer = document.getElementById("container-blacklist");
const blacklistEmptyState = document.getElementById("blacklist-empty-state");
const clearAllBtn = document.getElementById("btn-clear-all");
const pauseTabBtn = document.getElementById("btn-pause-tab");
const blacklistTabBtn = document.getElementById("btn-blacklist-tab");
const trackTabBtn = document.getElementById("btn-track-tab");
const manageSitesBtn = document.getElementById("btn-manage-sites");
const statsMinutesEl = document.getElementById("stats-big-number");
const statsUnitEl = document.getElementById("stats-unit");
const statsDomainEl = document.getElementById("stats-domain");
const messageEl = document.getElementById("message");

let currentDomain = null;
let lastStatsValue = null;

const loadStats = () => {
    if (!currentDomain) return;

    chrome.storage.local.get([STORAGE_KEYS.TIME], (res) => {
        const seconds = (res[STORAGE_KEYS.TIME] || {})[`domain_${currentDomain}`] || 0;
        const totalMinutes = Math.floor(seconds / 60);

        let displayValue, unitText;

        if (seconds < 60) {
            displayValue = seconds;
            unitText = seconds === 1 ? "second" : "seconds";
        } else if (totalMinutes < 60) {
            displayValue = totalMinutes;
            unitText = totalMinutes === 1 ? "minute" : "minutes";
        } else {
            displayValue = totalMinutes;
            const hours = Math.floor(totalMinutes / 60);
            const mins = totalMinutes % 60;
            unitText = `minutes (${hours}h ${mins}m)`;
        }

        if (displayValue !== lastStatsValue) {
            const prevStr = lastStatsValue !== null ? String(lastStatsValue) : "";
            const newStr = String(displayValue);
            const maxLen = Math.max(prevStr.length, newStr.length);
            const paddedPrev = prevStr.padStart(maxLen, " ");

            statsMinutesEl.innerHTML = newStr
                .split("")
                .map((char, i) => {
                    const prevChar = paddedPrev[maxLen - newStr.length + i];
                    return char !== prevChar
                        ? `<span style="animation-delay:${i * 40}ms">${char}</span>`
                        : char;
                })
                .join("");

            lastStatsValue = displayValue;
        }

        statsUnitEl.textContent = unitText;
        statsDomainEl.textContent = currentDomain;
    });
};

const updateTrackingBtn = () => {
    if (!currentDomain) return;

    chrome.storage.local.get([STORAGE_KEYS.BLACKLIST], (res) => {
        const isBlacklisted = !!(res[STORAGE_KEYS.BLACKLIST] || {})[`domain_${currentDomain}`];

        blacklistTabBtn.classList.toggle("is-hidden", isBlacklisted);
        trackTabBtn.classList.toggle("is-hidden", !isBlacklisted);
    });
};

const showMessage = (text, type = "success") => {
    messageEl.innerHTML = text;
    messageEl.className = `message ${type}`;
    messageEl.style.display = "block";
    setTimeout(() => {
        messageEl.style.display = "none";
    }, 12000);
};

const loadBlacklist = () => {
    chrome.storage.local.get([STORAGE_KEYS.BLACKLIST], (res) => {
        const blacklist = res[STORAGE_KEYS.BLACKLIST] || {};
        const domains = Object.keys(blacklist)
            .map((key) => key.replace("domain_", ""))
            .filter((domain) => domain);

        manageSitesBtn.classList.toggle("is-hidden", domains.length === 0);
        clearAllBtn.classList.toggle("is-hidden", domains.length <= 1);
        blacklistEmptyState.classList.toggle("is-hidden", domains.length > 0);

        blacklistContainer.querySelectorAll(".blacklist-item").forEach((el) => el.remove());

        if (domains.length === 0) return;

        domains.forEach((domain) => {
            const item = document.createElement("div");

            item.className = "blacklist-item";
            item.innerHTML = `
                <span>${domain}</span>
                <button class="item-remove pause-tab-btn secondary" data-domain="${domain}">Remove</button>
            `;

            blacklistContainer.appendChild(item);
        });

        document.querySelectorAll(".item-remove").forEach((btn) => {
            btn.addEventListener("click", (e) => {
                removeFromBlacklist(e.target.dataset.domain);
            });
        });

        updateHeight();
    });
};

const removeFromBlacklist = (domain) => {
    chrome.runtime.sendMessage(
        { type: "removeFromBlacklist", domain },
        (response) => {
            if (response?.success) {
                showMessage(`<strong>${domain}</strong> is now being tracked ⏱️`, "success");
                loadBlacklist();
            }
        },
    );
};

const clearAll = () => {
    if (confirm("Are you sure you want to clear all untracked sites?")) {
        chrome.storage.local.set({ [STORAGE_KEYS.BLACKLIST]: {} }, () => {
            showMessage("Tracking everything again ⏱️", "success");
            loadBlacklist();
            updateTrackingBtn();
        });
    }
};

// Event listeners
pauseTabBtn.addEventListener("click", () => {
    chrome.runtime.sendMessage({ type: "pauseCurrentTab" }, () => {
        window.close();
    });
});

blacklistTabBtn.addEventListener("click", () => {
    chrome.runtime.sendMessage({ type: "blacklistCurrentTab" });
});

trackTabBtn.addEventListener("click", () => {
    if (currentDomain) {
        chrome.runtime.sendMessage({ type: "removeFromBlacklist", domain: currentDomain }, (response) => {
            if (response?.success) {
                loadBlacklist();
                updateTrackingBtn();
            }
        });
    }
});

manageSitesBtn.addEventListener("click", () => navigateTo(true));

document.getElementById("btn-back").addEventListener("click", () => navigateTo(false));

clearAllBtn.addEventListener("click", clearAll);

// Init
chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => {
    if (tab?.url) {
        try {
            currentDomain = new URL(tab.url).hostname.replace(/^www\./, "");
        } catch {}
    }
    loadStats();
    updateTrackingBtn();
    loadBlacklist();
});

// Listen for updates from context menu
chrome.runtime.onMessage.addListener((msg) => {
    if (msg.type === "blacklistUpdated") {
        loadBlacklist();
        updateTrackingBtn();
    }
});

setInterval(loadStats, 1000);
