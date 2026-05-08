import { STORAGE_KEYS, MSG } from "../constants.js";

const blacklistContainer  = document.getElementById("container-blacklist");
const blacklistEmptyState = document.getElementById("blacklist-empty-state");
const clearAllBtn         = document.getElementById("btn-clear-all");
const manageSitesBtn      = document.getElementById("btn-manage-sites");
const messageEl           = document.getElementById("message");

let _updateHeight, _updateTrackingBtn;

export const initBlacklist = ({ updateHeight, updateTrackingBtn }) => {
    _updateHeight = updateHeight;
    _updateTrackingBtn = updateTrackingBtn;
};

export const showMessage = (text, type = "success") => {
    messageEl.innerHTML = text;
    messageEl.className = `message ${type}`;
    messageEl.style.display = "block";
    setTimeout(() => {
        messageEl.style.display = "none";
    }, 12000);
};

const removeFromBlacklist = (domain) => {
    chrome.runtime.sendMessage(
        { type: MSG.REMOVE_FROM_BLACKLIST, domain },
        (response) => {
            if (response?.success) {
                showMessage(`<strong>${domain}</strong> is now being tracked ⏱️`, "success");
                loadBlacklist();
            }
        },
    );
};

export const loadBlacklist = () => {
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

            const span = document.createElement("span");
            span.textContent = domain;

            const button = document.createElement("button");
            button.className = "pause-tab-btn secondary item-remove";
            button.dataset.domain = domain;
            button.textContent = "Remove";

            item.appendChild(span);
            item.appendChild(button);
            blacklistContainer.appendChild(item);

            if (span.scrollWidth > span.clientWidth) {
                span.setAttribute("data-tooltip", domain);
            }
        });

        document.querySelectorAll(".item-remove").forEach((btn) => {
            btn.addEventListener("click", (e) => {
                removeFromBlacklist(e.target.dataset.domain);
            });
        });

        _updateHeight?.();
    });
};

export const clearAll = () => {
    if (confirm("Are you sure you want to clear all untracked sites?")) {
        chrome.storage.local.set({ [STORAGE_KEYS.BLACKLIST]: {} }, () => {
            showMessage("Tracking everything again ⏱️", "success");
            loadBlacklist();
            _updateTrackingBtn?.();
        });
    }
};
