import { STORAGE_KEYS } from "../constants.js";

const statsMinutesEl = document.getElementById("stats-big-number");
const statsUnitEl    = document.getElementById("stats-unit");
const statsDomainEl  = document.getElementById("stats-domain");
const pausenautAvif  = document.getElementById("stats-pausenaut-avif");
const pausenautWebp  = document.getElementById("stats-pausenaut-webp");
const pausenautImg   = document.getElementById("stats-pausenaut-img");

let lastStatsValue = null;

const updatePausenaut = (seconds) => {
    const name = seconds >= 7200 ? "pausenaut-cry"
               : seconds >= 3600 ? "pausenaut-surprised"
               : seconds >= 1800 ? "pausenaut-smile"
               : "pausenaut-flirty";

    const base = `../images/${name}`;
    
    pausenautAvif.srcset = `${base}.avif 1x, ${base}@2x.avif 2x`;
    pausenautWebp.srcset = `${base}.webp 1x, ${base}@2x.webp 2x`;
    pausenautImg.src     = `${base}.png`;
};

export const loadStats = (currentDomain) => {
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

        updatePausenaut(seconds);
    });
};
