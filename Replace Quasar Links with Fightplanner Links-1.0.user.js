// ==UserScript==
// @name         Replace Quasar Links with Fightplanner Links
// @namespace    http://tampermonkey.net/
// @version      1.0
// @description  Replace all "quasar:" links with "fightplanner:" on gamebanana.com
// @author       FIREXDF
// @match        https://*.gamebanana.com/*
// @grant        none
// ==/UserScript==

(function () {
  "use strict";

  const links = document.querySelectorAll('a[href^="quasar:"]');

  links.forEach((link) => {
    link.href = link.href.replace(/^quasar:/, "fightplanner:");
  });

  const observer = new MutationObserver(() => {
    const newLinks = document.querySelectorAll('a[href^="quasar:"]');
    newLinks.forEach((link) => {
      link.href = link.href.replace(/^quasar:/, "fightplanner:");
    });
  });

  observer.observe(document.body, { childList: true, subtree: true });
})();
