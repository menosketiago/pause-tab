const STORAGE_KEYS = {
    BLACKLIST: "blacklistedDomains",
};

const blacklistSection = document.getElementById("section-blacklist");
const blacklistContainer = document.getElementById("container-blacklist");
const clearAllBtn = document.getElementById("btn-clear-all");
const pauseTabBtn = document.getElementById("btn-pause-tab");
const blacklistTabBtn = document.getElementById("btn-blacklist-tab");
const trackTabBtn = document.getElementById("btn-track-tab");
const messageEl = document.getElementById("message");

let currentDomain = null;

const updateTrackingBtn = () => {
    if (!currentDomain) return;

    chrome.storage.local.get([STORAGE_KEYS.BLACKLIST], (res) => {
        const isBlacklisted = !!(res[STORAGE_KEYS.BLACKLIST] || {})[`domain_${currentDomain}`];

        blacklistTabBtn.classList.toggle("hidden", isBlacklisted);
        trackTabBtn.classList.toggle("hidden", !isBlacklisted);
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

const loadBlacklist = async () => {
    chrome.storage.local.get([STORAGE_KEYS.BLACKLIST], (res) => {
        const blacklist = res[STORAGE_KEYS.BLACKLIST] || {};
        const domains = Object.keys(blacklist)
            .map((key) => key.replace("domain_", ""))
            .filter((domain) => domain);

        blacklistSection.classList.toggle("hidden", domains.length === 0);
        clearAllBtn.classList.toggle("hidden", domains.length <= 1);

        blacklistContainer.querySelectorAll(".blacklist-item").forEach((el) => el.remove());

        if (domains.length === 0) return;

        domains.forEach((domain) => {
            const item = document.createElement("div");

            item.className = "blacklist-item";
            item.innerHTML = `
                <span>${domain.replace(/^www\./, "")}</span>
                <button id="item-remove" class="pause-tab-btn destructive" data-domain="${domain}">Remove</button>
            `;

            blacklistContainer.appendChild(item);
        });

        document.querySelectorAll("#item-remove").forEach((btn) => {
            btn.addEventListener("click", (e) => {
                const domain = e.target.dataset.domain;

                removeFromBlacklist(domain);
            });
        });
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
            if (response?.success) loadBlacklist();
        });
    }
});

clearAllBtn.addEventListener("click", clearAll);

// Load blacklist on popup open
chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => {
    if (tab?.url) {
        try {
            currentDomain = new URL(tab.url).hostname.replace(/^www\./, "");
        } catch {}
    }
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
