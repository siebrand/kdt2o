const changelogUrl = "./CHANGELOG.md";
const target = document.getElementById("changelog-content");

function escapeHtml(value) {
    return value
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
}

function renderInlineMarkdown(value) {
    let html = escapeHtml(value);
    html = html.replace(/`([^`]+)`/g, "<code>$1</code>");
    html = html.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
    html = html.replace(/\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g, (_, text, url) => '<a href="' + url + '" rel="noopener noreferrer">' + text + '</a>');
    return html;
}

function renderMarkdown(markdown) {
    const lines = markdown.split(/\r?\n/);
    const output = [];
    let listItems = [];
    let paragraphLines = [];

    function flushList() {
        if (!listItems.length) return;
        output.push("<ul>" + listItems.map((item) => "<li>" + renderInlineMarkdown(item) + "</li>").join("") + "</ul>");
        listItems = [];
    }

    function flushParagraph() {
        if (!paragraphLines.length) return;
        output.push("<p>" + renderInlineMarkdown(paragraphLines.join(" ")) + "</p>");
        paragraphLines = [];
    }

    for (const sourceLine of lines) {
        if (!sourceLine.trim()) {
            flushParagraph();
            flushList();
            continue;
        }

        const line = sourceLine.trim();
        if (line.startsWith("## ")) {
            flushParagraph();
            flushList();
            output.push("<h2>" + renderInlineMarkdown(line.slice(3)) + "</h2>");
            continue;
        }

        if (line.startsWith("# ")) {
            flushParagraph();
            flushList();
            output.push("<h1>" + renderInlineMarkdown(line.slice(2)) + "</h1>");
            continue;
        }

        if (/^- /.test(line)) {
            flushParagraph();
            listItems.push(line.replace(/^-\s*/, ""));
            continue;
        }

        if (listItems.length && /^\s+/.test(sourceLine)) {
            listItems[listItems.length - 1] += " " + line;
            continue;
        }

        flushList();
        paragraphLines.push(line);
    }

    flushParagraph();
    flushList();
    return output.join("");
}

async function loadChangelog() {
    try {
        const response = await fetch(changelogUrl, {cache: "no-store"});
        if (!response.ok) {
            throw new Error("Changelog not available");
        }
        const markdown = await response.text();
        target.innerHTML = renderMarkdown(markdown);
    } catch (error) {
        target.textContent = "De changelog kon niet worden geladen.";
    }
}

loadChangelog();
