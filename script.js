/* Bebejaik Consulting Systems Limited – page scripts */
(function () {
  "use strict";

  /* ========= CONFIG: edit these when your backend is ready ========= */
  var CONFIG = {
    whatsappNumber: "254724850225",          // number shown on the poster, international format, no "+"
    whatsappDefaultText: "Hello Bebejaik Consulting Systems, I would like to enquire about your services.",
    payments: {
      // Leave an endpoint as "" to run in DEMO mode (simulated response, nothing is charged).
      mobileEndpoint: "",   // e.g. "/api/payments/mobile/prompt"  (your bank / M-Pesa STK-push API, called from YOUR backend)
      cardEndpoint: "",     // e.g. "/api/payments/card/charge"    (receives a gateway TOKEN, never raw card data)
      statusEndpoint: "",   // e.g. "/api/payments/status?id="     (poll until PAID / FAILED)
      currency: "KES"
    }
  };

  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };

  /* ---------- WhatsApp links ---------- */
  function waUrl(text) {
    return "https://wa.me/" + CONFIG.whatsappNumber + "?text=" + encodeURIComponent(text || CONFIG.whatsappDefaultText);
  }
  $$("[data-wa]").forEach(function (a) { a.href = waUrl(); });

  /* ---------- Mobile menu, year, back-to-top ---------- */
  var toggle = $(".menu-toggle"), nav = $(".nav");
  toggle.addEventListener("click", function () {
    var open = nav.classList.toggle("open");
    toggle.setAttribute("aria-expanded", open);
  });
  $$(".nav a").forEach(function (a) { a.addEventListener("click", function () { nav.classList.remove("open"); }); });
  $("#yr").textContent = new Date().getFullYear();
  var toTop = $("#toTop");
  window.addEventListener("scroll", function () { toTop.classList.toggle("show", window.scrollY > 600); }, { passive: true });
  toTop.addEventListener("click", function () { window.scrollTo({ top: 0, behavior: "smooth" }); });

  /* ---------- Marquee: duplicate tags for a seamless loop ---------- */
  var track = $("#mqTrack");
  if (track) track.innerHTML += track.innerHTML;

  /* ---------- Payment tabs ---------- */
  var tabM = $("#tabMobile"), tabC = $("#tabCard"), paneM = $("#paneMobile"), paneC = $("#paneCard");
  var method = "mobile";
  function setTab(m) {
    method = m;
    tabM.setAttribute("aria-selected", m === "mobile");
    tabC.setAttribute("aria-selected", m === "card");
    paneM.classList.toggle("active", m === "mobile");
    paneC.classList.toggle("active", m === "card");
    status("");
  }
  tabM.addEventListener("click", function () { setTab("mobile"); });
  tabC.addEventListener("click", function () { setTab("card"); });

  var statusEl = $("#payStatus");
  function status(msg, type) {
    statusEl.className = "status" + (msg ? " show " + (type || "info") : "");
    statusEl.textContent = msg || "";
  }
  function setErr(id, msg) { $(id).textContent = msg || ""; }

  /* ---------- Validation helpers ---------- */
  function normalisePhone(v) {
    var d = String(v).replace(/\D/g, "");
    if (d.indexOf("254") === 0) d = d.slice(3);
    if (d.charAt(0) === "0") d = d.slice(1);
    return /^[17]\d{8}$/.test(d) ? "254" + d : null;
  }
  function luhn(num) {
    var sum = 0, alt = false;
    for (var i = num.length - 1; i >= 0; i--) {
      var n = +num.charAt(i);
      if (alt) { n *= 2; if (n > 9) n -= 9; }
      sum += n; alt = !alt;
    }
    return sum % 10 === 0;
  }
  function validExpiry(v) {
    var m = /^(\d{2})\/(\d{2})$/.exec(v);
    if (!m) return false;
    var mo = +m[1], yr = 2000 + +m[2], now = new Date();
    return mo >= 1 && mo <= 12 && (yr > now.getFullYear() || (yr === now.getFullYear() && mo >= now.getMonth() + 1));
  }

  /* input formatting */
  $("#cardNumber").addEventListener("input", function (e) {
    var d = e.target.value.replace(/\D/g, "").slice(0, 19);
    e.target.value = d.replace(/(.{4})/g, "$1 ").trim();
  });
  $("#cardExp").addEventListener("input", function (e) {
    var d = e.target.value.replace(/\D/g, "").slice(0, 4);
    e.target.value = d.length > 2 ? d.slice(0, 2) + "/" + d.slice(2) : d;
  });
  $("#cardCvv").addEventListener("input", function (e) { e.target.value = e.target.value.replace(/\D/g, "").slice(0, 4); });
  $("#payPhone").addEventListener("input", function (e) { e.target.value = e.target.value.replace(/[^\d ]/g, ""); });

  /* ---------- Backend calls ---------- */
  function postJSON(url, body) {
    return fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })
      .then(function (r) { if (!r.ok) throw new Error("Server error " + r.status); return r.json(); });
  }
  function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

  /* Poll the backend for the final result of a payment. */
  function pollStatus(id) {
    if (!CONFIG.payments.statusEndpoint) return Promise.resolve({ state: "PENDING" });
    var tries = 0;
    function once() {
      return fetch(CONFIG.payments.statusEndpoint + encodeURIComponent(id))
        .then(function (r) { return r.json(); })
        .then(function (s) {
          if (s.state === "PAID" || s.state === "FAILED") return s;
          if (++tries > 20) return { state: "PENDING" };
          return sleep(3000).then(once);
        });
    }
    return once();
  }

  /*
   * Card tokenisation hook. For PCI compliance, raw card numbers should go straight to your
   * payment gateway (hosted fields / their JS SDK), which returns a one-time token.
   * Replace the body of this function with your gateway's SDK call.
   */
  function tokenizeCard(card) {
    if (window.BebejaikGateway && typeof window.BebejaikGateway.tokenize === "function") {
      return window.BebejaikGateway.tokenize(card);
    }
    return Promise.resolve("demo-token"); // demo mode only
  }

  function order() {
    return {
      service: $("#payService").value,
      reference: $("#payRef").value.trim(),
      amount: Math.round(+$("#payAmount").value),
      currency: CONFIG.payments.currency
    };
  }

  /* ---------- Submit ---------- */
  $("#payForm").addEventListener("submit", function (e) {
    e.preventDefault();
    status(""); setErr("#errAmount"); setErr("#errPhone"); setErr("#errCard");

    var o = order(), ok = true;
    if (!(o.amount > 0)) { setErr("#errAmount", "Enter a valid amount."); ok = false; }

    var btn, job;
    if (method === "mobile") {
      var phone = normalisePhone($("#payPhone").value);
      if (!phone) { setErr("#errPhone", "Enter a valid Kenyan number, e.g. 712 345 678."); ok = false; }
      if (!ok) return;
      btn = $("#btnMobile");
      o.phone = phone;
      status("Sending a payment prompt to +" + phone + "…");
      job = CONFIG.payments.mobileEndpoint
        ? postJSON(CONFIG.payments.mobileEndpoint, o)
        : sleep(1200).then(function () { return { id: "DEMO-" + Date.now() }; });
      job = job.then(function (res) {
        status("Check your phone and enter your PIN to approve KES " + o.amount.toLocaleString() + ".", "info");
        return pollStatus(res.id).then(function (s) {
          if (s.state === "PAID") status("Payment received. Thank you!", "ok");
          else if (s.state === "FAILED") status("The payment was not completed. You can try again.", "err");
          else if (!CONFIG.payments.mobileEndpoint) status("DEMO MODE: no real prompt was sent. Connect your backend endpoint in scripts.js.", "info");
        });
      });
    } else {
      var num = $("#cardNumber").value.replace(/\s/g, ""), name = $("#cardName").value.trim();
      var exp = $("#cardExp").value, cvv = $("#cardCvv").value;
      if (!name || num.length < 13 || !luhn(num)) { setErr("#errCard", "Check the name and card number."); ok = false; }
      else if (!validExpiry(exp)) { setErr("#errCard", "Enter a valid expiry date (MM/YY)."); ok = false; }
      else if (!/^\d{3,4}$/.test(cvv)) { setErr("#errCard", "Enter the 3 or 4 digit CVV."); ok = false; }
      if (!ok) return;
      btn = $("#btnCard");
      status("Processing card payment…");
      job = tokenizeCard({ name: name, number: num, exp: exp, cvv: cvv })
        .then(function (token) {
          return CONFIG.payments.cardEndpoint
            ? postJSON(CONFIG.payments.cardEndpoint, Object.assign({ token: token }, o))
            : sleep(1200).then(function () { return { id: "DEMO-" + Date.now() }; });
        })
        .then(function (res) { return pollStatus(res.id); })
        .then(function (s) {
          if (s.state === "FAILED") status("The card was declined. Please try another card.", "err");
          else if (!CONFIG.payments.cardEndpoint) status("DEMO MODE: no card was charged. Connect your backend endpoint in scripts.js.", "info");
          else status("Payment received. Thank you!", "ok");
        });
      ["#cardNumber", "#cardCvv", "#cardExp"].forEach(function (s) { $(s).value = ""; });
    }
    btn.disabled = true;
    job.catch(function () { status("Something went wrong. Please try again or contact us on WhatsApp.", "err"); })
       .then(function () { btn.disabled = false; });
  });

  /* ---------- Contact form -> WhatsApp ---------- */
  $("#contactForm").addEventListener("submit", function (e) {
    e.preventDefault();
    var name = $("#cName").value.trim(), msg = $("#cMsg").value.trim();
    if (!name) { $("#errContact").textContent = "Please enter your name."; return; }
    $("#errContact").textContent = "";
    var lines = [
      "Hello Bebejaik Consulting Systems,",
      "Name: " + name,
      $("#cCompany").value.trim() && "Company: " + $("#cCompany").value.trim(),
      $("#cEmail").value.trim() && "Email: " + $("#cEmail").value.trim(),
      $("#cPhone").value.trim() && "Phone: " + $("#cPhone").value.trim(),
      "Service: " + $("#cNeed").value,
      msg && "Message: " + msg
    ].filter(Boolean);
    window.open(waUrl(lines.join("\n")), "_blank", "noopener");
  });
})();