import { STORAGE_KEYS } from "../constants.js";

export const updateContextMenus = async (domain) => {
    const domainKey = `domain_${domain}`;
    const res = await chrome.storage.local.get([STORAGE_KEYS.BLACKLIST]);
    const isBlacklisted = !!(res[STORAGE_KEYS.BLACKLIST] || {})[domainKey];

    chrome.contextMenus.update("ignore-domain", { visible: !isBlacklisted });
    chrome.contextMenus.update("ignore-domain-action", { visible: !isBlacklisted });
    chrome.contextMenus.update("track-domain", { visible: isBlacklisted });
    chrome.contextMenus.update("track-domain-action", { visible: isBlacklisted });
};
