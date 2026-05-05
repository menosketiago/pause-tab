const STORAGE_KEYS = {
    BLACKLIST: "blacklistedDomains",
};

const blacklistContainer = document.getElementById("container-blacklist");
const clearAllBtn = document.getElementById("btn-clear-all");
const messageEl = document.getElementById("message");

const showMessage = (text, type = "success") => {
    messageEl.textContent = text;
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

        clearAllBtn.classList.toggle("hidden", domains.length <= 1);

        if (domains.length === 0) {
            blacklistContainer.innerHTML =
                '<div class="empty-state">No domains blacklisted</div>';

            return;
        }

        blacklistContainer.innerHTML = "";

        domains.forEach((domain) => {
            const item = document.createElement("div");

            item.className = "blacklist-item";
            item.innerHTML = `
                <span>${domain}</span>
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
                showMessage(`${domain} removed from blacklist`);
                loadBlacklist();
            }
        },
    );
};

const clearAll = () => {
    if (confirm("Are you sure you want to clear all blacklisted domains?")) {
        chrome.storage.local.set({ [STORAGE_KEYS.BLACKLIST]: {} }, () => {
            showMessage("All domains cleared");
            loadBlacklist();
        });
    }
};

// Event listeners
clearAllBtn.addEventListener("click", clearAll);

// Load blacklist on popup open
loadBlacklist();

// Listen for updates from context menu
chrome.runtime.onMessage.addListener((msg) => {
    if (msg.type === "blacklistUpdated") loadBlacklist();
});
