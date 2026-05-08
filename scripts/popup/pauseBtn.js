import { STORAGE_KEYS, MSG } from "../constants.js";

const pauseTabBtn = document.getElementById("btn-pause-tab");

let isPaused = false;
let isHolding = false;
let holdTimer, holdInterval, holdRemaining;

export const updatePauseBtn = (currentDomain) => {
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
        chrome.runtime.sendMessage({ type: MSG.RESUME_CURRENT_TAB });
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

export const initPauseBtn = () => {
    pauseTabBtn.addEventListener("click", () => {
        if (isPaused) return;
        chrome.runtime.sendMessage({ type: MSG.PAUSE_CURRENT_TAB });
        window.close();
    });

    pauseTabBtn.addEventListener("mousedown", startHold);
    pauseTabBtn.addEventListener("touchstart", startHold);
    pauseTabBtn.addEventListener("mouseup", stopHold);
    pauseTabBtn.addEventListener("mouseleave", stopHold);
    pauseTabBtn.addEventListener("touchend", stopHold);
};
