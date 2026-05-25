// One-shot markdown → HTML converter for the Gait legal docs.
// Tailored to the actual constructs used in legal/*.md (no fenced code).
// Supports headings, lists, paragraphs, hr, tables (pipe), blockquotes (>).
// Keeps zero runtime deps.

import { readFileSync, writeFileSync } from "node:fs";

function escapeHtml(s) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function inline(text) {
  // Strip HTML comments first (used for TODOs in the source)
  text = text.replace(/<!--[\s\S]*?-->/g, "");
  // Escape HTML special chars before re-injecting our own tags
  let out = escapeHtml(text);
  // Bold **x** before italic *x*
  out = out.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  out = out.replace(/(?<![*\w])\*([^*\n]+)\*(?!\w)/g, "<em>$1</em>");
  // Links [text](url)
  out = out.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_, label, url) => {
    if (url.startsWith("./") || url.startsWith("../")) {
      // Local doc cross-link — strip extension, leading ./, trailing .md
      url = url.replace(/^\.?\.?\//, "/").replace(/\.md$/, "");
    }
    return `<a href="${url}">${label}</a>`;
  });
  return out;
}

function mdToHtml(md) {
  const lines = md.split("\n");
  const out = [];
  let i = 0;
  let inList = false;
  let listType = null; // "ul" | "ol"

  const closeList = () => {
    if (inList) {
      out.push(`</${listType}>`);
      inList = false;
      listType = null;
    }
  };

  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();

    // Skip HTML comments (multi-line)
    if (trimmed.startsWith("<!--")) {
      while (i < lines.length && !lines[i].includes("-->")) i++;
      i++;
      continue;
    }

    // Horizontal rule
    if (/^---+$/.test(trimmed)) {
      closeList();
      out.push("<hr>");
      i++;
      continue;
    }

    // Blank line
    if (trimmed === "") {
      closeList();
      i++;
      continue;
    }

    // Headings
    const h = trimmed.match(/^(#{1,6})\s+(.+)$/);
    if (h) {
      closeList();
      const level = h[1].length;
      out.push(`<h${level}>${inline(h[2])}</h${level}>`);
      i++;
      continue;
    }

    // Unordered list
    if (/^[-*]\s+/.test(trimmed)) {
      if (!inList || listType !== "ul") {
        closeList();
        out.push("<ul>");
        inList = true;
        listType = "ul";
      }
      out.push(`<li>${inline(trimmed.replace(/^[-*]\s+/, ""))}</li>`);
      i++;
      continue;
    }

    // Ordered list
    if (/^\d+\.\s+/.test(trimmed)) {
      if (!inList || listType !== "ol") {
        closeList();
        out.push("<ol>");
        inList = true;
        listType = "ol";
      }
      out.push(`<li>${inline(trimmed.replace(/^\d+\.\s+/, ""))}</li>`);
      i++;
      continue;
    }

    // Italic-only line used as "Last updated" subtitle
    if (/^\*\*Last updated:.*\*\*$/.test(trimmed)) {
      closeList();
      out.push(`<p class="last-updated">${inline(trimmed)}</p>`);
      i++;
      continue;
    }

    // Blockquote — consecutive lines starting with `>`
    if (trimmed.startsWith(">")) {
      closeList();
      const quoteLines = [];
      while (i < lines.length && lines[i].trim().startsWith(">")) {
        quoteLines.push(inline(lines[i].trim().replace(/^>\s?/, "")));
        i++;
      }
      out.push(`<blockquote>${quoteLines.join("<br>")}</blockquote>`);
      continue;
    }

    // Table — header row | followed by separator |---|---|...
    if (
      trimmed.startsWith("|") &&
      i + 1 < lines.length &&
      /^\|[\s:|-]+\|?$/.test(lines[i + 1].trim())
    ) {
      closeList();
      const splitRow = (row) => {
        const parts = row.split("|");
        if (parts[0].trim() === "") parts.shift();
        if (parts.length && parts[parts.length - 1].trim() === "") parts.pop();
        return parts.map((c) => inline(c.trim()));
      };
      const headerCells = splitRow(trimmed);
      i += 2;
      out.push("<table>");
      out.push("<thead><tr>" + headerCells.map((c) => `<th>${c}</th>`).join("") + "</tr></thead>");
      out.push("<tbody>");
      while (i < lines.length && lines[i].trim().startsWith("|")) {
        const cells = splitRow(lines[i].trim());
        out.push("<tr>" + cells.map((c) => `<td>${c}</td>`).join("") + "</tr>");
        i++;
      }
      out.push("</tbody></table>");
      continue;
    }

    // Paragraph (consume until blank line)
    closeList();
    const para = [trimmed];
    i++;
    while (i < lines.length && lines[i].trim() !== "" && !/^(#{1,6}\s|---+$|[-*]\s|\d+\.\s|<!--|>|\|)/.test(lines[i].trim())) {
      para.push(lines[i].trim());
      i++;
    }
    out.push(`<p>${inline(para.join(" "))}</p>`);
  }

  closeList();
  return out.join("\n");
}

function shell(title, body) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${title} — Gait</title>
  <link rel="stylesheet" href="/style.css">
</head>
<body>
  <header class="site"><a href="/">Gait</a></header>
  <main>
${body}
  </main>
  <footer class="site">
    Questions? <a href="mailto:hello.gait.app@gmail.com">hello.gait.app@gmail.com</a>
  </footer>
</body>
</html>
`;
}

const SRC = "/Users/bojro/Desktop/gait-app/legal";

const privacy = readFileSync(`${SRC}/privacy-policy.md`, "utf8");
const terms = readFileSync(`${SRC}/terms-of-service.md`, "utf8");
const support = readFileSync(`${SRC}/support.md`, "utf8");
const deletion = readFileSync(`${SRC}/account-deletion.md`, "utf8");

writeFileSync("privacy.html", shell("Privacy Policy", mdToHtml(privacy)));
writeFileSync("terms.html", shell("Terms of Service", mdToHtml(terms)));
writeFileSync("support.html", shell("Support", mdToHtml(support)));
writeFileSync("delete-account.html", shell("Delete Account", mdToHtml(deletion)));

console.log("wrote privacy.html, terms.html, support.html, delete-account.html");
