import { fetchCss, getDomain } from "./utils.js";

export const injectTimeTracking = async (tab) => {
    if (!tab || !tab.id) return;

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
        .catch(() => {});
};
