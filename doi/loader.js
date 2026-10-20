/* Dose of Insights loader for Webflow. One script for both regions.
 * Webflow page embed:
 *   <div id="doi-app" data-region="us"></div>
 *   <script src="https://trentraleigh89.github.io/Market-Intel-Brief-US/doi/loader.js" defer></script>
 * The brief renders inside a shadow root so Webflow styles and the brief's styles never touch.
 * Data and app code are fetched fresh on every visit (version.json is never cached).
 */
(function () {
  'use strict';
  var BASE = {
    us: 'https://trentraleigh89.github.io/Market-Intel-Brief-US/doi/us/',
    emea: 'https://trentraleigh89.github.io/Market-Intel-Brief-EMEA/doi/emea/'
  };
  var PAGES = { us: '/doi/market-intel-us', emea: '/doi/market-intel-emea' };
  var host = document.getElementById('doi-app');
  if (!host || host.shadowRoot) return;
  var region = (host.getAttribute('data-region') || 'us').toLowerCase();
  if (!BASE[region]) region = 'us';
  var base = host.getAttribute('data-base') || BASE[region];
  try { window.localStorage.setItem('doi_region', region); } catch (e) { /* storage blocked */ }

  // ---- analytics: the brief calls window.plausible(name, {props}); send those to GA4 ----
  function track(name, props) {
    var ev = 'doi_' + String(name).toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
    var params = { doi_region: region };
    for (var k in (props || {})) params[k] = props[k];
    try {
      if (typeof window.gtag === 'function') window.gtag('event', ev.slice(0, 40), params);
      else (window.dataLayer = window.dataLayer || []).push(Object.assign({ event: ev.slice(0, 40) }, params));
    } catch (e) { /* never break the page for analytics */ }
  }
  if (!window.plausible) window.plausible = function (name, opts) { track(name, opts && opts.props); };

  // ---- container ----
  // Inline reset on the host: outranks any Webflow rule, so nothing inherited leaks into the brief.
  host.style.cssText = 'all: initial; display: block; position: relative;';
  var root = host.attachShadow({ mode: 'open' });
  root.innerHTML = '<style>:host{all:initial;display:block}</style><div id="root"><div class="lfhs-loading" style="padding:48px;text-align:center;font:600 13px/1 sans-serif;letter-spacing:.14em;color:#7a7f88;text-transform:uppercase">Loading brief</div></div>';
  window.DOI_ROOT = root;
  window.DOI_MOUNT = root.getElementById('root');
  window.DOI_URLS = PAGES;

  function fail(msg) {
    window.DOI_MOUNT.innerHTML = '<div style="padding:48px;font:500 15px/1.5 sans-serif;color:#191919">The brief could not load. Refresh the page; if it persists, contact the brief owner.</div>';
    track('load_error', { reason: msg });
  }
  function script(src) {
    return new Promise(function (ok, no) {
      var s = document.createElement('script'); s.src = src; s.async = false;
      s.onload = ok; s.onerror = function () { no(new Error('script ' + src)); };
      document.head.appendChild(s);
    });
  }
  function abs(u) { return /^https?:/.test(u) ? u : base + u; }

  fetch(base + 'version.json?t=' + Date.now(), { cache: 'no-store' })
    .then(function (r) { if (!r.ok) throw new Error('version ' + r.status); return r.json(); })
    .then(function (ver) {
      var q = '?v=' + ver.v;
      // fonts must be declared at page level to work inside a shadow root
      (ver.headLinks || []).forEach(function (tag) {
        var d = document.createElement('div'); d.innerHTML = tag;
        var el = d.firstChild; if (el && !document.head.querySelector('link[href="' + el.getAttribute('href') + '"]')) document.head.appendChild(el);
      });
      return Promise.all([
        fetch(base + 'shadow.css' + q).then(function (r) { return r.text(); }),
        fetch(base + 'data.json' + q).then(function (r) { if (!r.ok) throw new Error('data ' + r.status); return r.json(); })
      ]).then(function (res) {
        var st = document.createElement('style'); st.textContent = res[0];
        root.insertBefore(st, root.firstChild.nextSibling);
        window.DOI_DATA = res[1];
        var chain = window.React && window.ReactDOM ? Promise.resolve()
          : (ver.react || []).reduce(function (p, u) { return p.then(function () { return script(abs(u)); }); }, Promise.resolve());
        return chain.then(function () { return script(base + 'app.js' + q); }).then(function () {
          track('brief_loaded', { issue: ver.newest, as_of: ver.asOf });
        });
      });
    })
    .catch(function (e) { fail(String(e && e.message || e)); });

  // Fonts and the :root color variables only work at page level, so copy exactly those rules out
  // (nothing else, so the brief's styles never touch the Webflow page).
  var copied = false;
  function lift() {
    var styles = root.querySelectorAll('style'), parts = [];
    for (var i = 0; i < styles.length; i++) {
      var rules; try { rules = styles[i].sheet && styles[i].sheet.cssRules; } catch (e) { rules = null; }
      if (!rules) continue;
      for (var j = 0; j < rules.length; j++) {
        var r = rules[j];
        if (r.type === 3 || r.type === 5 || (r.type === 1 && r.selectorText === ':root')) parts.push(r.cssText);
      }
    }
    if (!parts.some(function (t) { return /@font-face/.test(t); })) return false;
    parts.sort(function (a, b) { return (/^@import/.test(b) ? 1 : 0) - (/^@import/.test(a) ? 1 : 0); });
    var g = document.createElement('style'); g.setAttribute('data-doi', region);
    g.textContent = parts.join('\n'); document.head.appendChild(g); return true;
  }
  new MutationObserver(function (ms, obs) {
    if (!copied && lift()) { copied = true; obs.disconnect(); }
  }).observe(root, { childList: true, subtree: true });

  // Region switch: record which way people move between the two pages.
  root.addEventListener('click', function (e) {
    var a = e.target && e.target.closest ? e.target.closest('a[href]') : null;
    if (!a) return;
    var href = a.getAttribute('href');
    for (var r in PAGES) if (r !== region && href && href.indexOf(PAGES[r]) === 0) track('region_switch', { from: region, to: r });
  }, true);
})();
