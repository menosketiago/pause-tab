import { STORAGE_KEYS, MSG } from "../constants.js";
import { getDomain } from "./utils.js";
import { updateContextMenus } from "./tabs.js";

export const addDomainToBlacklist = async (tab) => {
    const domain = getDomain(tab.url);
    if (!domain) return;

    const domainKey = `domain_${domain}`;
    const res = await chrome.storage.local.get([STORAGE_KEYS.BLACKLIST]);
    const blacklist = res[STORAGE_KEYS.BLACKLIST] || {};

    blacklist[domainKey] = true;

    await chrome.storage.local.set({ [STORAGE_KEYS.BLACKLIST]: blacklist });
    chrome.runtime.sendMessage({ type: MSG.BLACKLIST_UPDATED }).catch(() => {});

    updateContextMenus(domain);
};

export const removeDomainFromBlacklist = async (domain) => {
    const domainKey = `domain_${domain}`;
    const res = await chrome.storage.local.get([STORAGE_KEYS.BLACKLIST]);
    const blacklist = res[STORAGE_KEYS.BLACKLIST] || {};

    delete blacklist[domainKey];
    await chrome.storage.local.set({ [STORAGE_KEYS.BLACKLIST]: blacklist });
    chrome.runtime.sendMessage({ type: MSG.BLACKLIST_UPDATED }).catch(() => {});

    updateContextMenus(domain);
};
