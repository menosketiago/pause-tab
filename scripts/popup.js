const STORAGE_KEYS = {
    BLACKLIST: "blacklistedDomains",
    TIME: "timeTracking",
    PAUSED: "pausedDomains",
};

const pagesWrapper = document.getElementById("pages-wrapper");
const pageMain = document.getElementById("page-main");
const pageManageSites = document.getElementById("page-manage-sites");

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

const blacklistContainer = document.getElementById("container-blacklist");
const blacklistEmptyState = document.getElementById("blacklist-empty-state");
const clearAllBtn = document.getElementById("btn-clear-all");
const pauseTabBtn = document.getElementById("btn-pause-tab");
const blacklistTabBtn = document.getElementById("btn-blacklist-tab");
const trackTabBtn = document.getElementById("btn-track-tab");
const manageSitesBtn = document.getElementById("btn-manage-sites");
const statsEl = document.querySelector("#page-main .stats");
const pillTrackingDisabled = document.getElementById("pill-tracking-disabled");
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
        }
        else if (totalMinutes < 60) {
            displayValue = totalMinutes;
            unitText = totalMinutes === 1 ? "minute" : "minutes";
        }
        else {
            displayValue = totalMinutes;
            const hours = Math.floor(totalMinutes / 60);
            const mins = totalMinutes % 60;
            unitText = `minutes (${hours}h ${mins}m)`;
        }

        if (displayValue !== lastStatsValue) {
            const prevStr = lastStatsValue !== null ? String(lastStatsValue) : "";
            const newStr = String(displayValue);
            const maxLen = Math.max(prevStr.length, newStr.length);
            // Right-align both strings so digit positions stay in sync when length changes (e.g. 9 → 10)
            const paddedPrev = prevStr.padStart(maxLen, " ");

            // Only wrap digits that actually changed in a span to trigger the flip animation
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

let isPaused = false;
let isHolding = false;
let holdTimer, holdInterval, holdRemaining;

const updatePauseBtn = () => {
    if (!currentDomain) return;

    chrome.storage.local.get([STORAGE_KEYS.PAUSED], (res) => {
        isPaused = !!(res[STORAGE_KEYS.PAUSED] || {})[`domain_${currentDomain}`];
        pauseTabBtn.textContent = isPaused ? "Hold to resume" : "Pause tab";
    });
};

const startHold = () => {
    if (!isPaused || isHolding) return;
    isHolding = true;
    holdRemaining = 5;
    pauseTabBtn.classList.add("is-holding");
    pauseTabBtn.textContent = holdRemaining;

    holdInterval = setInterval(() => {
        holdRemaining--;
        pauseTabBtn.textContent = holdRemaining > 0 ? holdRemaining : "";
    }, 1000);

    holdTimer = setTimeout(() => {
        chrome.runtime.sendMessage({ type: "resumeCurrentTab" });
        window.close();
    }, 5000);
};

const stopHold = () => {
    if (!isHolding) return;
    isHolding = false;
    clearTimeout(holdTimer);
    clearInterval(holdInterval);
    pauseTabBtn.classList.remove("is-holding");
    pauseTabBtn.textContent = "Hold to resume";
};

pauseTabBtn.addEventListener("mousedown", startHold);
pauseTabBtn.addEventListener("touchstart", startHold);
pauseTabBtn.addEventListener("mouseup", stopHold);
pauseTabBtn.addEventListener("mouseleave", stopHold);
pauseTabBtn.addEventListener("touchend", stopHold);

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
            
            // 1. Create the span explicitly so we can measure it
            const span = document.createElement("span");
            span.textContent = domain;
            
            const button = document.createElement("button");
            button.className = "pause-tab-btn secondary item-remove";
            button.dataset.domain = domain;
            button.textContent = "Remove";

            item.appendChild(span);
            item.appendChild(button);
            blacklistContainer.appendChild(item);

            // 2. Logic: Only add the title attribute if the text is truncated
            // Note: This must happen AFTER item is appended to the container
            if (span.scrollWidth > span.clientWidth) {
                span.setAttribute("data-tooltip", domain);
            }
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
    if (isPaused) return;
    chrome.runtime.sendMessage({ type: "pauseCurrentTab" });
    window.close();
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
    updatePauseBtn();
    updateTrackingBtn();
    loadBlacklist();
});

// Listen for updates triggered by the context menu (outside the popup)
chrome.runtime.onMessage.addListener((msg) => {
    if (msg.type === "blacklistUpdated") {
        loadBlacklist();
        updateTrackingBtn();
    }
    else if (msg.type === "pauseStateChanged") {
        updatePauseBtn();
    }
});

setInterval(loadStats, 1000);
