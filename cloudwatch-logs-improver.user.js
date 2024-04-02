// ==UserScript==
// @name         Cloudwatch colorizer
// @namespace    http://tampermonkey.net/
// @version      1.0
// @description  Script to colorize AWS Cloudwatch logs in the browser using ANSI escape codes
// @author       Arnaud Dassy
// @match        https://*.aws.amazon.com/*
// @icon         https://www.google.com/s2/favicons?sz=64&domain=github.com
//
// @homepageURL   https://github.com/ArnaudDassy/cloudwatch-logs-improver
// @downloadURL   https://raw.githubusercontent.com/ArnaudDassy/cloudwatch-logs-improver/blob/main/cloudwatch-ansi-colorizer.js
// @updateURL     https://raw.githubusercontent.com/ArnaudDassy/cloudwatch-logs-improver/blob/main/cloudwatch-ansi-colorizer.js
//
// @grant        none
// ==/UserScript==

// Match ANSI escape code
const escape_codes = new Map([
  ["0", "font-weight:normal"],
  ["1", "font-weight:bold"],
  ["2", "opacity:1"],
  ["4", "text-decoration:underline"],
  ["30", "color:darkslategray"],
  ["31", "color:darkred"],
  ["32", "color:darkgreen"],
  ["33", "color:darkgoldenrod"],
  ["34", "color:darkblue"],
  ["35", "color:indigo"],
  ["36", "color:darkcyan"],
  ["39", "color:black"],
  ["90", "color:darkgrey"],
  ["91", "color:red"],
  ["92", "color:green"],
  ["93", "color:goldenrod"],
  ["94", "color:blue"],
  ["95", "color:darkviolet"],
  ["96", "color:cyan"],
  ["97", "color:whitesmoke"],
]);

const match_pattern = /[\u001b]+(?:\[(\d+;?)*m)?/;
const datePattern = /\d{4}-\d{2}-\d{2}\w\d{2}:\d{2}:\d{2}.\d+\+\d{2}:\d{2}/;
const breakLinePattern = /\\r\s*/gm;

const errorMarkerPattern = /ERROR.+---/;
const warnMarkerPattern = /WARN.+---/;

const breakLineString = "</br>";
const spaceString = "&nbsp;";

const warnBackground = "rgba(255, 255, 0, 0.05)";
const errorBackground = "rgba(255, 0, 0, 0.05)";

const processAsciReplacement = (content, replacementString) => {
  if ((content || "").trim().length === 0) {
    return null;
  }

  let span_open = 0;
  let match = content.match(match_pattern);
  if (match === null) {
    return null;
  }
  while (match !== null) {
    if (match.length === 1) {
      content = content.replace(match_pattern, "");
      match = content.match(match_pattern);
      continue;
    }
    let modifiers = match.slice(1);
    if (JSON.stringify(modifiers) === '["0"]') {
      let replacement = "";
      if (span_open > 0) {
        replacement = "</span>";
        span_open -= 1;
      }
      content = content.replace(match_pattern, replacement);
      span_open = false;
      match = content.match(match_pattern);
      continue;
    }
    let styles = modifiers
      .map((code) => escape_codes.get(code))
      .filter((code) => code !== undefined);
    content = content.replace(
      match_pattern,
      `<span style="${styles.join(";")};-webkit-animation-duration:unset;">`,
    );
    span_open += 1;
    match = content.match(match_pattern);
  }
  while (span_open > 0) {
    content = content + "</span>";
    span_open -= 1;
  }
  content = content.replace(breakLinePattern, replacementString);
  return content;
};

const processDateReplacement = (content) => {
  if ((content || "").trim().length === 0) {
    return content;
  }

  let match = content.match(datePattern);
  if (match === null) {
    return content;
  }
  let index = 0;
  while (match !== null && index < 5) {
    index++;
    let dateMatch = match[0];
    const date = new Date(dateMatch);
    let replacement = `<span style="color:black; font-weight: bold">|${date.toLocaleString()}|</span>`;
    content = content.replace(dateMatch, replacement);
    match = content.match(datePattern);
  }
  return content;
};

const maybeUpdateNode = (node, replacementString) => {
  let updated = processAsciReplacement(node.innerHTML, replacementString);
  if (updated !== null) {
    node.innerHTML = processDateReplacement(updated);
    return true;
  }
  return false;
};

function recurseNodes(nodes) {
  for (let i = 0; i < nodes.length; i++) {
    let node = nodes[i];
    if (node.nodeName !== "SPAN" && node.nodeName !== "DIV") {
      continue;
    }
    let updated = false;
    if (
      (node.dataset !== undefined &&
        node.dataset.testid === "logs__log-events-table__message") ||
      (node.classList.contains("logs__log-events-table__content") &&
        node.parentNode.dataset.testid ===
          "logs__log-events-table__formatted-message")
    ) {
      let replacementString = "";
      if (
        node.dataset !== undefined &&
        node.dataset.testid === "logs__log-events-table__message"
      ) {
        replacementString = spaceString;
      } else {
        replacementString = breakLineString;
      }
      updated = maybeUpdateNode(node, replacementString);
    }
    if (node.childNodes !== undefined && !updated) {
      recurseNodes(node.childNodes);
    }
  }
}

const processMutations = (mutationsList) => {
  mutationsList.forEach((mutation) => {
    let target = mutation.target;

    if (target.nodeName.toLowerCase() === "tbody") {
      for (let i = 0; i < target.children.length; i++) {
        let tr = target.children[i];
        if (tr) {
          const span = tr.querySelector(
            "span[data-testid='logs__log-events-table__message']",
          );
          if (span) {
            let content = span.innerHTML;
						let tds = tr.children;
            if (content.match(errorMarkerPattern)) {
              applyBackgroundToTableData(tds, errorBackground);
            } else if (content.match(warnMarkerPattern)) {
							applyBackgroundToTableData(tds, warnBackground);
						}else{
							applyBackgroundToTableData(tds, null);
						}
            maybeUpdateNode(span, spaceString);
          }
        }
      }
    }
    // When a line is clicked
    let addedNode = mutation.addedNodes[0];

    if (!addedNode) return;

    let isShow =
      addedNode.nodeName === "DIV" &&
      mutation.previousSibling &&
      mutation.previousSibling.classList &&
      mutation.previousSibling.classList.contains(
        "logs__log-events-table__cell",
      );
    if (isShow) {
      maybeUpdateNode(addedNode, breakLineString);
    }
  });
};

function applyBackgroundToTableData(tds, background){
	for (let i = 0; i < tds.length; i++) {
		let td = tds[i];
		if (td) {
			td.style.backgroundColor = background;
		}
	}

}

const callback = (mutationsList) => {
  let mutations = mutationsList.map((x) => x); // shallow copy mutations
  mutations.forEach((mutation) => {
    if (
      mutation.nextSibling &&
      mutation.nextSibling.id === "microConsole-Logs"
    ) {
      let iframe = document.getElementById("microConsole-Logs");
      if (iframe) {
        new MutationObserver(processMutations).observe(
          iframe.contentWindow.document.body,
          {
            subtree: true,
            childList: true,
            characterData: true,
          },
        );
      }
    }
  });
};

(function () {
  "use strict";
  // Observe DOM changes
  const node = document.getElementById("c");
  if (node) {
    new MutationObserver(callback).observe(node, {
      subtree: true,
      childList: true,
    });
  }
})();
