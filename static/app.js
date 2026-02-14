/* ===========================
   Mailamator Frontend
   Single-Page Application

   Note on XSS safety: All user-provided data is escaped via escapeHtml()
   before being inserted into the DOM. The escapeHtml() function uses
   textContent assignment to safely encode special characters.
   =========================== */

(function () {
  "use strict";

  // ==========================================
  // API Module
  // ==========================================
  const api = {
    async request(method, url, body) {
      const opts = {
        method,
        headers: {},
      };
      if (body) {
        opts.headers["Content-Type"] = "application/json";
        opts.body = JSON.stringify(body);
      }
      const res = await fetch(url, opts);
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Request failed (" + res.status + ")");
      }
      return data;
    },

    // Accounts
    listAccounts() {
      return this.request("GET", "/api/accounts");
    },
    createAccount(name, apiKey, cloudflareToken) {
      const body = { name: name, api_key: apiKey };
      if (cloudflareToken) body.cloudflare_token = cloudflareToken;
      return this.request("POST", "/api/accounts", body);
    },
    deleteAccount(id) {
      return this.request("DELETE", "/api/accounts/" + id);
    },

    // Domains
    listDomains(accountId) {
      return this.request("GET", "/api/domains?account_id=" + accountId);
    },
    addDomain(accountId, domainName) {
      return this.request("POST", "/api/domains", {
        account_id: accountId,
        domain_name: domainName,
      });
    },
    checkDns(accountId, domainName) {
      return this.request("POST", "/api/domains/check-dns", {
        account_id: accountId,
        domain_name: domainName,
      });
    },
    pushCloudflare(accountId, domainName) {
      return this.request("POST", "/api/domains/push-cloudflare", {
        account_id: accountId,
        domain_name: domainName,
      });
    },

    // Users
    listUsers(accountId, domain) {
      var url = "/api/users?account_id=" + accountId;
      if (domain) url += "&domain=" + encodeURIComponent(domain);
      return this.request("GET", url);
    },
    createUsers(accountId, domainName, usernames) {
      return this.request("POST", "/api/users", {
        account_id: accountId,
        domain_name: domainName,
        usernames: usernames,
      });
    },
    getMailSettings() {
      return this.request("GET", "/api/users/mail-settings");
    },

    // History
    getHistory(query) {
      var q = query ? "?q=" + encodeURIComponent(query) : "";
      return this.request("GET", "/api/history" + q);
    },
  };

  // ==========================================
  // State
  // ==========================================
  var state = {
    accounts: [],
    activeAccountId: null,
    currentTab: "settings",
    domains: [],
    lastDomainResult: null,
    lastUsersResult: null,
  };

  // ==========================================
  // Utility Helpers
  // ==========================================

  function $(selector) {
    return document.querySelector(selector);
  }

  function $$(selector) {
    return document.querySelectorAll(selector);
  }

  function show(el) {
    if (typeof el === "string") el = $(el);
    if (el) el.hidden = false;
  }

  function hide(el) {
    if (typeof el === "string") el = $(el);
    if (el) el.hidden = true;
  }

  function escapeHtml(str) {
    if (str == null) return "";
    var div = document.createElement("div");
    div.textContent = String(str);
    return div.childNodes[0] ? div.childNodes[0].nodeValue.replace(/"/g, "&quot;").replace(/'/g, "&#39;") : "";
  }

  function formatDate(dateStr) {
    if (!dateStr) return "";
    var d = new Date(dateStr);
    if (isNaN(d.getTime())) return String(dateStr);
    return d.toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  function showToast(message) {
    var toast = $(".toast");
    if (!toast) {
      toast = document.createElement("div");
      toast.className = "toast";
      document.body.appendChild(toast);
    }
    toast.textContent = message;
    toast.classList.add("visible");
    setTimeout(function () {
      toast.classList.remove("visible");
    }, 2000);
  }

  function showGlobalError(message) {
    var el = $("#global-error");
    var msgEl = $("#global-error-message");
    msgEl.textContent = message;
    show(el);
  }

  function hideGlobalError() {
    hide("#global-error");
  }

  function setStatusMsg(containerId, message, type) {
    var el = $(containerId);
    if (!el) return;
    if (!message) {
      clearChildren(el);
      return;
    }
    clearChildren(el);
    var div = document.createElement("div");
    div.className = "status-msg " + (type || "");
    div.textContent = message;
    el.appendChild(div);
  }

  function clearChildren(el) {
    while (el.firstChild) {
      el.removeChild(el.firstChild);
    }
  }

  function debounce(fn, ms) {
    var timer;
    return function () {
      var self = this;
      var args = arguments;
      clearTimeout(timer);
      timer = setTimeout(function () {
        fn.apply(self, args);
      }, ms);
    };
  }

  function getActiveAccount() {
    if (!state.activeAccountId) return null;
    for (var i = 0; i < state.accounts.length; i++) {
      if (state.accounts[i].id === state.activeAccountId) return state.accounts[i];
    }
    return null;
  }

  function downloadTextFile(filename, content) {
    var blob = new Blob([content], { type: "text/plain" });
    var url = URL.createObjectURL(blob);
    var a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  // Safe DOM builders -- these create elements without innerHTML
  function createTextEl(tag, text, className) {
    var el = document.createElement(tag);
    if (text != null) el.textContent = text;
    if (className) el.className = className;
    return el;
  }

  function createEl(tag, attrs, children) {
    var el = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (k) {
        if (k === "className") {
          el.className = attrs[k];
        } else if (k.indexOf("data-") === 0 || k === "title" || k === "type" || k === "href" || k === "target" || k === "rel" || k === "value" || k === "placeholder" || k === "disabled") {
          el.setAttribute(k, attrs[k]);
        } else if (k === "ariaLabel") {
          el.setAttribute("aria-label", attrs[k]);
        } else if (k === "ariaSelected") {
          el.setAttribute("aria-selected", attrs[k]);
        } else if (k === "ariaBusy") {
          el.setAttribute("aria-busy", attrs[k]);
        }
      });
    }
    if (children) {
      if (!Array.isArray(children)) children = [children];
      children.forEach(function (child) {
        if (typeof child === "string") {
          el.appendChild(document.createTextNode(child));
        } else if (child) {
          el.appendChild(child);
        }
      });
    }
    return el;
  }

  // ==========================================
  // Router Module
  // ==========================================
  var router = {
    init: function () {
      var self = this;
      $$.call(null, ".tab-btn").forEach(function (btn) {
        btn.addEventListener("click", function () {
          self.navigate(btn.dataset.tab);
        });
      });
    },

    navigate: function (tab) {
      state.currentTab = tab;

      $$(".tab-btn").forEach(function (btn) {
        btn.setAttribute("aria-selected", btn.dataset.tab === tab ? "true" : "false");
      });

      $$("[role=tabpanel]").forEach(function (section) {
        section.hidden = section.id !== "page-" + tab;
      });

      switch (tab) {
        case "settings":
          settings.load();
          break;
        case "domains":
          domains.load();
          break;
        case "users":
          users.load();
          break;
        case "history":
          historyModule.load();
          break;
      }
    },
  };

  // ==========================================
  // Account Switcher
  // ==========================================
  var accountSwitcher = {
    init: function () {
      var sel = $("#account-switcher");
      sel.addEventListener("change", function () {
        var val = parseInt(sel.value, 10);
        state.activeAccountId = val || null;
        router.navigate(state.currentTab);
      });
    },

    render: function () {
      var sel = $("#account-switcher");
      clearChildren(sel);

      if (state.accounts.length === 0) {
        sel.appendChild(createEl("option", { value: "" }, "No accounts"));
        state.activeAccountId = null;
        return;
      }

      state.accounts.forEach(function (a) {
        var opt = createEl("option", { value: String(a.id) }, a.name);
        if (a.id === state.activeAccountId) opt.selected = true;
        sel.appendChild(opt);
      });

      // If active account is no longer in the list, pick the first one
      var found = false;
      for (var i = 0; i < state.accounts.length; i++) {
        if (state.accounts[i].id === state.activeAccountId) { found = true; break; }
      }
      if (!state.activeAccountId || !found) {
        state.activeAccountId = state.accounts[0].id;
        sel.value = String(state.activeAccountId);
      }
    },
  };

  // ==========================================
  // Settings Module
  // ==========================================
  var settings = {
    init: function () {
      var self = this;
      var form = $("#form-add-account");
      form.addEventListener("submit", async function (e) {
        e.preventDefault();
        var fd = new FormData(form);
        var name = fd.get("name").trim();
        var apiKey = fd.get("api_key").trim();
        var cfToken = fd.get("cloudflare_token").trim();

        if (!name || !apiKey) {
          setStatusMsg("#settings-add-status", "Name and API key are required.", "error");
          return;
        }

        var btn = form.querySelector("button[type=submit]");
        btn.setAttribute("aria-busy", "true");
        btn.disabled = true;
        setStatusMsg("#settings-add-status", "");

        try {
          await api.createAccount(name, apiKey, cfToken || null);
          form.reset();
          setStatusMsg("#settings-add-status", "Account added successfully.", "success");
          await loadAccounts();
          if (state.accounts.length === 1) {
            router.navigate("domains");
          } else {
            self.renderList();
          }
        } catch (err) {
          setStatusMsg("#settings-add-status", err.message, "error");
        } finally {
          btn.removeAttribute("aria-busy");
          btn.disabled = false;
        }
      });
    },

    load: function () {
      this.renderList();
    },

    renderList: function () {
      var self = this;
      var container = $("#accounts-list");
      clearChildren(container);

      if (state.accounts.length === 0) {
        container.appendChild(
          createTextEl("div", "No accounts configured. Add one above.", "empty-state")
        );
        return;
      }

      state.accounts.forEach(function (a) {
        var item = createEl("div", { className: "account-item", "data-id": String(a.id) });

        var info = createEl("div", { className: "account-info" });
        info.appendChild(createTextEl("span", a.name, "account-name"));

        var badge = createTextEl(
          "span",
          "CF: " + (a.has_cloudflare ? "Yes" : "No"),
          "badge " + (a.has_cloudflare ? "badge-yes" : "badge-no")
        );
        info.appendChild(badge);
        item.appendChild(info);

        var delBtn = createEl("button", {
          type: "button",
          className: "btn-delete",
          "data-id": String(a.id),
          ariaLabel: "Delete account " + a.name,
        }, "Delete");

        delBtn.addEventListener("click", async function () {
          var account = getActiveAccount();
          var acct = null;
          for (var j = 0; j < state.accounts.length; j++) {
            if (state.accounts[j].id === a.id) { acct = state.accounts[j]; break; }
          }
          if (!confirm('Delete account "' + (acct ? acct.name : a.id) + '"? This cannot be undone.')) {
            return;
          }
          delBtn.setAttribute("aria-busy", "true");
          delBtn.disabled = true;
          try {
            await api.deleteAccount(a.id);
            await loadAccounts();
            self.renderList();
            if (state.activeAccountId === a.id) {
              state.activeAccountId = state.accounts.length ? state.accounts[0].id : null;
              accountSwitcher.render();
            }
          } catch (err) {
            showGlobalError(err.message);
          }
        });

        item.appendChild(delBtn);
        container.appendChild(item);
      });
    },
  };

  // ==========================================
  // Domains Module
  // ==========================================
  var domains = {
    init: function () {
      var self = this;
      var form = $("#form-add-domain");
      form.addEventListener("submit", async function (e) {
        e.preventDefault();
        if (!state.activeAccountId) {
          setStatusMsg("#domain-add-status", "Select an account first.", "error");
          return;
        }

        var domainName = form.domain_name.value.trim();
        if (!domainName) return;

        var btn = form.querySelector("button[type=submit]");
        btn.setAttribute("aria-busy", "true");
        btn.disabled = true;
        setStatusMsg("#domain-add-status", "");
        hide("#domain-result-card");

        try {
          var result = await api.addDomain(state.activeAccountId, domainName);
          state.lastDomainResult = result;
          form.reset();
          setStatusMsg("#domain-add-status", "Domain added successfully.", "success");
          self.renderResultCard(result);
          await self.fetchDomains();
          self.renderList();
        } catch (err) {
          setStatusMsg("#domain-add-status", err.message, "error");
        } finally {
          btn.removeAttribute("aria-busy");
          btn.disabled = false;
        }
      });

      // Download zone file button
      $("#btn-download-zone").addEventListener("click", function () {
        if (!state.lastDomainResult) return;
        var r = state.lastDomainResult;
        downloadTextFile(r.domain + "-dns.txt", r.zone_file);
      });

      // Push to Cloudflare button
      $("#btn-push-cloudflare").addEventListener("click", async function () {
        if (!state.lastDomainResult || !state.activeAccountId) return;
        var btn = $("#btn-push-cloudflare");
        btn.setAttribute("aria-busy", "true");
        btn.disabled = true;
        try {
          await api.pushCloudflare(state.activeAccountId, state.lastDomainResult.domain);
          showToast("DNS records pushed to Cloudflare.");
        } catch (err) {
          showGlobalError(err.message);
        } finally {
          btn.removeAttribute("aria-busy");
          btn.disabled = false;
        }
      });
    },

    load: async function () {
      if (!state.activeAccountId) {
        var dl = $("#domains-list");
        clearChildren(dl);
        dl.appendChild(createTextEl("div", "Select an account to view domains.", "empty-state"));
        return;
      }
      show("#domains-loading");
      try {
        await this.fetchDomains();
        this.renderList();
      } catch (err) {
        showGlobalError(err.message);
      } finally {
        hide("#domains-loading");
      }
    },

    fetchDomains: async function () {
      var result = await api.listDomains(state.activeAccountId);
      state.domains = Array.isArray(result) ? result : [];
    },

    renderResultCard: function (result) {
      show("#domain-result-card");
      $("#domain-result-name").textContent = result.domain;

      var tbody = $("#domain-dns-records");
      clearChildren(tbody);

      result.dns_records.forEach(function (r) {
        var tr = document.createElement("tr");

        var tdType = document.createElement("td");
        tdType.textContent = r.type;
        tr.appendChild(tdType);

        var tdName = document.createElement("td");
        var codeName = document.createElement("code");
        codeName.textContent = r.name;
        tdName.appendChild(codeName);
        tr.appendChild(tdName);

        var tdValue = document.createElement("td");
        var codeValue = document.createElement("code");
        codeValue.textContent = r.value;
        tdValue.appendChild(codeValue);
        tr.appendChild(tdValue);

        var tdPriority = document.createElement("td");
        tdPriority.textContent = r.priority != null ? String(r.priority) : "";
        tr.appendChild(tdPriority);

        tbody.appendChild(tr);
      });

      // Show/hide Cloudflare button based on account config
      var account = getActiveAccount();
      if (account && account.has_cloudflare) {
        show("#btn-push-cloudflare");
      } else {
        hide("#btn-push-cloudflare");
      }
    },

    renderList: function () {
      var self = this;
      var container = $("#domains-list");
      clearChildren(container);

      if (!state.domains || state.domains.length === 0) {
        container.appendChild(
          createTextEl("div", "No domains found for this account.", "empty-state")
        );
        return;
      }

      state.domains.forEach(function (d) {
        var name = typeof d === "string" ? d : d.name;
        var valid = typeof d === "object" && d.dnsSummary ? d.dnsSummary.valid : null;

        var item = createEl("div", { className: "domain-item", "data-domain": name });

        var info = createEl("div", { className: "domain-info" });

        if (valid !== null) {
          var dot = document.createElement("span");
          dot.className = "status-dot " + (valid ? "valid" : "invalid");
          dot.title = "DNS " + (valid ? "valid" : "invalid");
          info.appendChild(dot);
        }

        info.appendChild(createTextEl("span", name, "domain-name"));
        item.appendChild(info);

        var actions = createEl("div", { className: "domain-actions" });
        var checkBtn = createEl("button", {
          type: "button",
          className: "btn-check-dns secondary outline btn-sm",
          "data-domain": name,
        }, "Check DNS");

        checkBtn.addEventListener("click", async function () {
          checkBtn.setAttribute("aria-busy", "true");
          checkBtn.disabled = true;
          try {
            var result = await api.checkDns(state.activeAccountId, name);
            showToast(result.message || "DNS check triggered.");
            await self.fetchDomains();
            self.renderList();
          } catch (err) {
            showGlobalError(err.message);
          } finally {
            checkBtn.removeAttribute("aria-busy");
            checkBtn.disabled = false;
          }
        });

        actions.appendChild(checkBtn);
        item.appendChild(actions);
        container.appendChild(item);
      });

      // Also update the domain pickers on the Users page
      users.updateDomainPickers();
    },
  };

  // ==========================================
  // Users Module
  // ==========================================
  var users = {
    init: function () {
      var self = this;
      var form = $("#form-add-users");
      form.addEventListener("submit", async function (e) {
        e.preventDefault();
        if (!state.activeAccountId) {
          setStatusMsg("#users-add-status", "Select an account first.", "error");
          return;
        }

        var domainName = form.domain_name.value;
        var usernamesRaw = form.usernames.value.trim();
        if (!domainName || !usernamesRaw) {
          setStatusMsg("#users-add-status", "Select a domain and enter at least one username.", "error");
          return;
        }

        var usernames = usernamesRaw.split("\n").map(function (u) { return u.trim(); }).filter(function (u) { return u.length > 0; });

        if (usernames.length === 0) {
          setStatusMsg("#users-add-status", "Enter at least one username.", "error");
          return;
        }

        var btn = form.querySelector("button[type=submit]");
        btn.setAttribute("aria-busy", "true");
        btn.disabled = true;
        setStatusMsg("#users-add-status", "");
        hide("#users-result-card");

        try {
          var result = await api.createUsers(state.activeAccountId, domainName, usernames);
          state.lastUsersResult = result;
          form.usernames.value = "";
          setStatusMsg("#users-add-status", result.users.length + " user(s) created.", "success");
          self.renderResultCard(result);
          self.renderMailSettings(result.mail_settings);
          self.loadUserList();
        } catch (err) {
          setStatusMsg("#users-add-status", err.message, "error");
        } finally {
          btn.removeAttribute("aria-busy");
          btn.disabled = false;
        }
      });

      // Copy all credentials button
      $("#btn-copy-credentials").addEventListener("click", function () {
        if (!state.lastUsersResult) return;
        var lines = state.lastUsersResult.users.map(function (u) {
          return "Email: " + u.email + "\nPassword: " + u.password + "\nWebmail: " + u.webmail_url;
        });
        var text = lines.join("\n\n");
        navigator.clipboard.writeText(text).then(
          function () { showToast("Credentials copied to clipboard."); },
          function () { showGlobalError("Failed to copy to clipboard."); }
        );
      });

      // User list domain picker change
      $("#users-list-domain-picker").addEventListener("change", function () {
        self.loadUserList();
      });
    },

    load: async function () {
      if (!state.activeAccountId) {
        var ul = $("#users-list");
        clearChildren(ul);
        ul.appendChild(createTextEl("div", "Select an account to view users.", "empty-state"));
        return;
      }

      // Make sure we have domains loaded
      if (!Array.isArray(state.domains) || state.domains.length === 0) {
        try {
          await domains.fetchDomains();
        } catch (err) {
          // Domains might fail; that is fine for this page
        }
      }

      this.updateDomainPickers();
      this.loadMailSettingsSection();
      this.loadUserList();
    },

    updateDomainPickers: function () {
      var domainNames = state.domains.map(function (d) {
        return typeof d === "string" ? d : d.name;
      });

      [$("#users-domain-picker"), $("#users-list-domain-picker")].forEach(function (sel) {
        if (!sel) return;
        var current = sel.value;
        clearChildren(sel);
        sel.appendChild(createEl("option", { value: "" }, "Select a domain"));
        domainNames.forEach(function (name) {
          var opt = createEl("option", { value: name }, name);
          if (name === current) opt.selected = true;
          sel.appendChild(opt);
        });
      });
    },

    renderResultCard: function (result) {
      show("#users-result-card");
      var tbody = $("#users-created-table");
      clearChildren(tbody);

      result.users.forEach(function (u) {
        var tr = document.createElement("tr");

        var tdEmail = document.createElement("td");
        var codeEmail = document.createElement("code");
        codeEmail.textContent = u.email;
        tdEmail.appendChild(codeEmail);
        tr.appendChild(tdEmail);

        var tdPassword = document.createElement("td");
        var pwSpan = document.createElement("span");
        pwSpan.className = "password-cell password-hidden";
        pwSpan.setAttribute("data-password", u.password);
        pwSpan.setAttribute("data-revealed", "false");
        pwSpan.title = "Click to reveal";
        pwSpan.textContent = "\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022";
        pwSpan.addEventListener("click", function () {
          togglePasswordReveal(pwSpan);
        });
        tdPassword.appendChild(pwSpan);
        tr.appendChild(tdPassword);

        var tdWebmail = document.createElement("td");
        var link = createEl("a", { href: u.webmail_url, target: "_blank", rel: "noopener" }, "Open Webmail");
        tdWebmail.appendChild(link);
        tr.appendChild(tdWebmail);

        tbody.appendChild(tr);
      });
    },

    renderMailSettings: function (ms) {
      if (!ms) return;
      var content = $("#mail-settings-content");
      clearChildren(content);
      var grid = createEl("div", { className: "mail-settings-grid" });
      grid.appendChild(buildMailSettingCard("IMAP", ms.imap));
      grid.appendChild(buildMailSettingCard("SMTP", ms.smtp));
      grid.appendChild(buildMailSettingCard("SMTP (Alt)", ms.smtp_alt));
      content.appendChild(grid);
    },

    loadMailSettingsSection: async function () {
      try {
        var ms = await api.getMailSettings();
        this.renderMailSettings(ms);
      } catch (err) {
        // Non-critical, ignore
      }
    },

    loadUserList: async function () {
      var domain = $("#users-list-domain-picker").value;
      var container = $("#users-list");

      if (!state.activeAccountId) {
        clearChildren(container);
        container.appendChild(createTextEl("div", "Select an account.", "empty-state"));
        return;
      }

      if (!domain) {
        clearChildren(container);
        container.appendChild(createTextEl("div", "Select a domain to see its users.", "empty-state"));
        return;
      }

      show("#users-loading");
      try {
        var userList = await api.listUsers(state.activeAccountId, domain);
        hide("#users-loading");

        clearChildren(container);

        if (!userList || userList.length === 0) {
          container.appendChild(createTextEl("div", "No users found for this domain.", "empty-state"));
          return;
        }

        var listDiv = createEl("div", { className: "user-list" });
        userList.forEach(function (email) {
          listDiv.appendChild(createTextEl("span", email, "user-chip"));
        });
        container.appendChild(listDiv);
      } catch (err) {
        hide("#users-loading");
        clearChildren(container);
        container.appendChild(createTextEl("div", err.message, "status-msg error"));
      }
    },
  };

  // Helper: build a mail setting card using DOM methods
  function buildMailSettingCard(label, config) {
    if (!config) return document.createTextNode("");
    var card = createEl("div", { className: "mail-setting-card" });
    card.appendChild(createTextEl("h4", label));

    var dl = document.createElement("dl");

    var dtServer = document.createElement("dt");
    dtServer.textContent = "Server";
    dl.appendChild(dtServer);
    var ddServer = document.createElement("dd");
    ddServer.textContent = config.server;
    dl.appendChild(ddServer);

    var dtPort = document.createElement("dt");
    dtPort.textContent = "Port";
    dl.appendChild(dtPort);
    var ddPort = document.createElement("dd");
    ddPort.textContent = String(config.port);
    dl.appendChild(ddPort);

    var dtSec = document.createElement("dt");
    dtSec.textContent = "Security";
    dl.appendChild(dtSec);
    var ddSec = document.createElement("dd");
    ddSec.textContent = config.security;
    dl.appendChild(ddSec);

    card.appendChild(dl);
    return card;
  }

  // Helper: toggle password visibility
  function togglePasswordReveal(cell) {
    var revealed = cell.getAttribute("data-revealed") === "true";
    if (revealed) {
      cell.textContent = "\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022";
      cell.setAttribute("data-revealed", "false");
      cell.classList.add("password-hidden");
      cell.title = "Click to reveal";
    } else {
      cell.textContent = cell.getAttribute("data-password");
      cell.setAttribute("data-revealed", "true");
      cell.classList.remove("password-hidden");
      cell.title = "Click to hide";
    }
  }

  // ==========================================
  // History Module
  // ==========================================
  var historyModule = {
    init: function () {
      var self = this;
      var searchInput = $("#history-search");
      searchInput.addEventListener("input", debounce(function () {
        self.search(searchInput.value.trim());
      }, 350));
    },

    load: async function () {
      await this.search("");
    },

    search: async function (query) {
      show("#history-loading");
      hide("#history-users-empty");
      hide("#history-domains-empty");

      try {
        var data = await api.getHistory(query);
        hide("#history-loading");
        this.renderUsers(data.users || []);
        this.renderDomains(data.domains || []);
      } catch (err) {
        hide("#history-loading");
        showGlobalError(err.message);
      }
    },

    renderUsers: function (userList) {
      var tbody = $("#history-users-table");
      var empty = $("#history-users-empty");

      clearChildren(tbody);

      if (userList.length === 0) {
        show(empty);
        return;
      }

      hide(empty);
      userList.forEach(function (u) {
        var tr = document.createElement("tr");

        var tdEmail = document.createElement("td");
        var codeEmail = document.createElement("code");
        codeEmail.textContent = u.email;
        tdEmail.appendChild(codeEmail);
        tr.appendChild(tdEmail);

        var tdPassword = document.createElement("td");
        var pwSpan = document.createElement("span");
        pwSpan.className = "password-cell password-hidden";
        pwSpan.setAttribute("data-password", u.password);
        pwSpan.setAttribute("data-revealed", "false");
        pwSpan.title = "Click to reveal";
        pwSpan.textContent = "\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022";
        pwSpan.addEventListener("click", function () {
          togglePasswordReveal(pwSpan);
        });
        tdPassword.appendChild(pwSpan);
        tr.appendChild(tdPassword);

        var tdDomain = document.createElement("td");
        tdDomain.textContent = u.domain;
        tr.appendChild(tdDomain);

        var tdAccount = document.createElement("td");
        tdAccount.textContent = u.account;
        tr.appendChild(tdAccount);

        var tdDate = document.createElement("td");
        tdDate.textContent = formatDate(u.created_at);
        tr.appendChild(tdDate);

        tbody.appendChild(tr);
      });
    },

    renderDomains: function (domainList) {
      var tbody = $("#history-domains-table");
      var empty = $("#history-domains-empty");

      clearChildren(tbody);

      if (domainList.length === 0) {
        show(empty);
        return;
      }

      hide(empty);
      domainList.forEach(function (d) {
        var tr = document.createElement("tr");

        var tdName = document.createElement("td");
        var codeName = document.createElement("code");
        codeName.textContent = d.name;
        tdName.appendChild(codeName);
        tr.appendChild(tdName);

        var tdAccount = document.createElement("td");
        tdAccount.textContent = d.account;
        tr.appendChild(tdAccount);

        var tdDate = document.createElement("td");
        tdDate.textContent = formatDate(d.created_at);
        tr.appendChild(tdDate);

        tbody.appendChild(tr);
      });
    },
  };

  // ==========================================
  // Global Account Loading
  // ==========================================
  async function loadAccounts() {
    try {
      state.accounts = await api.listAccounts();
      accountSwitcher.render();
    } catch (err) {
      showGlobalError("Failed to load accounts: " + err.message);
    }
  }

  // ==========================================
  // Initialization
  // ==========================================
  async function init() {
    // Dismiss global error on close click
    $(".alert-close").addEventListener("click", hideGlobalError);

    // Initialize all modules
    router.init();
    accountSwitcher.init();
    settings.init();
    domains.init();
    users.init();
    historyModule.init();

    // Load accounts
    show("#settings-loading");
    await loadAccounts();
    hide("#settings-loading");

    // Choose initial tab: Settings if no accounts, Domains otherwise
    var initialTab = state.accounts.length === 0 ? "settings" : "domains";
    router.navigate(initialTab);
  }

  // Boot when DOM is ready
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
