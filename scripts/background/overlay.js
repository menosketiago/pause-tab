import { fetchCss, getDomain } from "./utils.js";

export const injectPauseModal = async (tab) => {
    if (
        !tab ||
        !tab.id ||
        !tab.url ||
        tab.url.startsWith("chrome://") ||
        tab.url.includes("chrome.google.com/webstore")
    ) {
        console.warn("Pause Tab: Action blocked on restricted Google/System pages.");

        return;
    }

    const css = await fetchCss("styles/global.css", "styles/components.css", "styles/overlay.css");

    chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: (css) => {
            if (document.getElementById("pause-tab-overlay-host")) return;

            const scrollBarWidth = window.innerWidth - document.documentElement.clientWidth;
            const originalOverflow = document.body.style.overflow;
            const originalPadding = document.body.style.paddingRight;

            if (scrollBarWidth > 0) document.body.style.paddingRight = `${scrollBarWidth}px`;

            document.body.style.overflow = "hidden";

            chrome.runtime.sendMessage({ type: "pauseStateChanged", status: "paused" });

            const host = document.createElement("div");

            host.id = "pause-tab-overlay-host";
            document.body.appendChild(host);

            const shadow = host.attachShadow({ mode: "open" });

            const style = document.createElement("style");

            style.textContent = css;
            shadow.appendChild(style);

            const overlay = document.createElement("div");

            overlay.id = "pause-tab-overlay";
            overlay.setAttribute("role", "dialog");
            overlay.setAttribute("aria-modal", "true");
            overlay.setAttribute("tabindex", "-1");

            const imgBase = chrome.runtime.getURL("images/");

            overlay.innerHTML = `
                <article>
                    <picture>
                        <source type="image/avif" srcset="${imgBase}pausenaut-overlay.avif 1x, ${imgBase}pausenaut-overlay@2x.avif 2x">
                        <source type="image/webp" srcset="${imgBase}pausenaut-overlay.webp 1x, ${imgBase}pausenaut-overlay@2x.webp 2x">
                        <img src="${imgBase}pausenaut-overlay.png" width="96" height="78" alt="">
                    </picture>
                    <h1>Tab paused</h1>
                    <p>Hold the button below pressed for 5 seconds to resume</p>
                    <footer>
                        <button id="resume-button" class="pause-tab-btn primary">Hold to resume</button>
                    </footer>
                </article>
            `;
            shadow.appendChild(overlay);
            overlay.focus();

            const btn = shadow.querySelector("#resume-button");

            let timer, interval, remaining;
            let isHolding = false;

            const start = (e) => {
                if (e.code === "Space") e.preventDefault();
                if (isHolding || e.repeat) return;

                isHolding = true;
                remaining = 5;

                btn.classList.add("is-holding");
                btn.innerText = remaining;

                interval = setInterval(() => {
                    remaining--;
                    btn.innerText = remaining > 0 ? remaining : "";
                }, 1000);

                timer = setTimeout(() => {
                    document.body.style.overflow = originalOverflow;
                    document.body.style.paddingRight = originalPadding;

                    host.remove();
                    clearInterval(interval);
                    chrome.runtime.sendMessage({ type: "pauseStateChanged", status: "resumed" });

                    // Remove event listeners
                    window.removeEventListener("keydown", keydownHandler);
                    window.removeEventListener("keyup", keyupHandler);
                }, 5000);
            };

            const stop = (e) => {
                if (e.code === "Space") e.preventDefault();

                isHolding = false;
                clearTimeout(timer);
                clearInterval(interval);

                btn.classList.remove("is-holding");
                btn.innerText = "Hold to resume";
            };

            const keydownHandler = (e) => {
                if (e.code === "Space") start(e);
            };

            const keyupHandler = (e) => {
                if (e.code === "Space") stop(e);
            };

            // Add event listeners
            btn.addEventListener("mousedown", start);
            btn.addEventListener("touchstart", start);
            btn.addEventListener("mouseup", stop);
            btn.addEventListener("mouseleave", stop);
            btn.addEventListener("touchend", stop);
            window.addEventListener("keydown", keydownHandler);
            window.addEventListener("keyup", keyupHandler);
        },
        args: [css],
    }).catch((err) => console.error("Pause Tab: Script injection failed:", err));
};

export const pauseAllTabsForDomain = async (domain) => {
    if (!domain) return;

    const tabs = await chrome.tabs.query({});

    for (const tab of tabs) {
        if (getDomain(tab.url) === domain) injectPauseModal(tab);
    }
};

export const resumeAllTabsForDomain = async (domain) => {
    if (!domain) return;

    const tabs = await chrome.tabs.query({});

    for (const tab of tabs) {
        if (getDomain(tab.url) === domain) {
            chrome.scripting.executeScript({
                target: { tabId: tab.id },
                func: () => {
                    const host = document.getElementById("pause-tab-overlay-host");

                    if (!host) return;

                    document.body.style.overflow = "";
                    document.body.style.paddingRight = "";
                    
                    host.remove();
                },
            }).catch(() => {});
        }
    }
};
