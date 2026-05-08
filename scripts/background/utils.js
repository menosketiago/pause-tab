export const getDomain = (url) => {
    if (!url) return null;
    try {
        return new URL(url).hostname.replace(/^www\./, "");
    } catch {
        return null;
    }
};

export const getLocalDate = () => new Date().toISOString().split("T")[0];

// Fetches CSS files in the background (full extension access) and rewrites
// relative asset URLs to absolute chrome-extension:// URLs before passing to pages
export const fetchCss = async (...paths) => {
    const extBase = chrome.runtime.getURL("");
    const texts = await Promise.all(
        paths.map((p) => fetch(chrome.runtime.getURL(p)).then((r) => r.text()))
    );
    
    return texts.join("\n")
        .replace(/url\(["']?\.\.\//g, `url("${extBase}`)
        // :root doesn't match in shadow trees (shadow root is a DocumentFragment, not an element)
        // :host matches the shadow host and lets custom properties cascade into the tree
        .replace(/:root\b/g, ":host");
};
