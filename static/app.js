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
      var text = await res.text();
      var data;
      try {
        data = JSON.parse(text);
      } catch (e) {
        throw new Error(text || "Request failed (" + res.status + ")");
      }
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
    updateAccount(id, data) {
      return this.request("PATCH", "/api/accounts/" + id, data);
    },
    deleteAccount(id) {
      return this.request("DELETE", "/api/accounts/" + id);
    },

    // Domains
    listDomains(accountId) {
      return this.request("GET", "/api/domains?account_id=" + accountId);
    },
    prepareDomain(accountId, domainName) {
      return this.request("POST", "/api/domains/prepare", {
        account_id: accountId,
        domain_name: domainName,
      });
    },
    registerDomain(accountId, domainName) {
      return this.request("POST", "/api/domains/register", {
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

    // Users - password reset
    resetPassword(accountId, email) {
      return this.request("POST", "/api/users/reset-password", {
        account_id: accountId,
        email: email,
      });
    },

    // Routing
    listRoutingRules(accountId, domain) {
      var url = "/api/routing?account_id=" + accountId;
      if (domain) url += "&domain=" + encodeURIComponent(domain);
      return this.request("GET", url);
    },
    createRoutingRule(accountId, domainName, matchUser, targetAddresses, prefix, catchall) {
      return this.request("POST", "/api/routing", {
        account_id: accountId,
        domain_name: domainName,
        match_user: matchUser,
        target_addresses: targetAddresses,
        prefix: prefix,
        catchall: catchall,
      });
    },
    deleteRoutingRule(accountId, ruleId) {
      return this.request("DELETE", "/api/routing/" + ruleId + "?account_id=" + accountId);
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

  // Safe DOM builders
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
  // Password Cell Helpers
  // ==========================================

  function buildPasswordCell(password) {
    var wrapper = createEl("span", { className: "password-cell password-hidden" });
    wrapper.setAttribute("data-password", password);
    wrapper.setAttribute("data-revealed", "false");
    wrapper.title = "Click to reveal";
    wrapper.textContent = "\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022";
    wrapper.addEventListener("click", function () {
      if (wrapper.getAttribute("data-revealed") === "true") return;
      revealPassword(wrapper);
    });
    return wrapper;
  }

  function hidePassword(cell) {
    cell.setAttribute("data-revealed", "false");
    cell.classList.add("password-hidden");
    cell.title = "Click to reveal";
    clearChildren(cell);
    cell.textContent = "\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022";
  }

  function revealPassword(cell) {
    cell.setAttribute("data-revealed", "true");
    cell.classList.remove("password-hidden");
    cell.title = "";
    clearChildren(cell);

    var textSpan = document.createElement("span");
    textSpan.className = "password-text";
    textSpan.textContent = cell.getAttribute("data-password");
    cell.appendChild(textSpan);

    var copyBtn = document.createElement("button");
    copyBtn.className = "btn-copy-pw";
    copyBtn.title = "Copy password";
    copyBtn.type = "button";
    copyBtn.textContent = "Copy";
    copyBtn.addEventListener("click", function (e) {
      e.stopPropagation();
      navigator.clipboard.writeText(cell.getAttribute("data-password")).then(
        function () { showToast("Password copied."); },
        function () { showGlobalError("Failed to copy."); }
      );
      hidePassword(cell);
    });
    cell.appendChild(copyBtn);

    // Close when clicking anywhere else
    function onOutsideClick(e) {
      if (!cell.contains(e.target)) {
        hidePassword(cell);
        document.removeEventListener("click", onOutsideClick, true);
      }
    }
    // Delay listener so the current click doesn't immediately close it
    setTimeout(function () {
      document.addEventListener("click", onOutsideClick, true);
    }, 0);
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
        case "routing":
          routing.load();
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
      // Collapse "Add New Account" if accounts already exist
      var details = document.getElementById("add-account-details");
      if (details) {
        details.open = state.accounts.length === 0;
      }
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
        var wrapper = document.createElement("div");

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

        var actions = createEl("div", { className: "account-actions" });

        var editBtn = createEl("button", {
          type: "button",
          className: "btn-edit",
          ariaLabel: "Edit account " + a.name,
        }, "Edit");

        editBtn.addEventListener("click", function () {
          var existing = container.querySelector(".account-edit-form");
          if (existing) existing.remove();
          var form = self.buildEditForm(a, wrapper);
          wrapper.appendChild(form);
        });

        actions.appendChild(editBtn);

        var delBtn = createEl("button", {
          type: "button",
          className: "btn-delete",
          "data-id": String(a.id),
          ariaLabel: "Delete account " + a.name,
        }, "Delete");

        delBtn.addEventListener("click", async function () {
          if (!confirm('Delete account "' + a.name + '"? This cannot be undone.')) {
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

        actions.appendChild(delBtn);
        item.appendChild(actions);
        wrapper.appendChild(item);
        container.appendChild(wrapper);
      });
    },

    buildEditForm: function (account, wrapper) {
      var self = this;
      var form = createEl("div", { className: "account-edit-form" });

      var nameLabel = document.createElement("label");
      nameLabel.textContent = "Account Name";
      var nameInput = document.createElement("input");
      nameInput.type = "text";
      nameInput.value = account.name;
      nameInput.placeholder = "Account name";
      nameLabel.appendChild(nameInput);
      form.appendChild(nameLabel);

      var keyLabel = document.createElement("label");
      keyLabel.textContent = "Purelymail API Key ";
      var keySmall = document.createElement("small");
      keySmall.textContent = "(leave blank to keep current)";
      keyLabel.appendChild(keySmall);
      var keyInput = document.createElement("input");
      keyInput.type = "password";
      keyInput.placeholder = "New API key";
      keyLabel.appendChild(keyInput);
      form.appendChild(keyLabel);

      var cfLabel = document.createElement("label");
      cfLabel.textContent = "Cloudflare Token ";
      var cfSmall = document.createElement("small");
      cfSmall.textContent = "(leave blank to keep current)";
      cfLabel.appendChild(cfSmall);
      var cfInput = document.createElement("input");
      cfInput.type = "password";
      cfInput.placeholder = "New Cloudflare token";
      cfLabel.appendChild(cfInput);
      form.appendChild(cfLabel);

      var hint = createEl("div", { className: "field-hint" });
      hint.textContent = "Your domain must use Cloudflare\u2019s nameservers for DNS push to work. Add your domain to Cloudflare and update your registrar\u2019s nameservers first.";
      form.appendChild(hint);

      var editActions = createEl("div", { className: "edit-actions" });

      var saveBtn = document.createElement("button");
      saveBtn.className = "primary";
      saveBtn.textContent = "Save";
      saveBtn.addEventListener("click", async function () {
        var data = {};
        var newName = nameInput.value.trim();
        var newKey = keyInput.value.trim();
        var newCf = cfInput.value.trim();

        if (newName && newName !== account.name) data.name = newName;
        if (newKey) data.api_key = newKey;
        if (newCf) data.cloudflare_token = newCf;

        if (Object.keys(data).length === 0) {
          form.remove();
          return;
        }

        saveBtn.setAttribute("aria-busy", "true");
        saveBtn.disabled = true;
        try {
          await api.updateAccount(account.id, data);
          await loadAccounts();
          self.renderList();
          showToast("Account updated.");
        } catch (err) {
          showGlobalError(err.message);
          saveBtn.removeAttribute("aria-busy");
          saveBtn.disabled = false;
        }
      });

      var cancelBtn = document.createElement("button");
      cancelBtn.className = "secondary";
      cancelBtn.textContent = "Cancel";
      cancelBtn.addEventListener("click", function () {
        form.remove();
      });

      editActions.appendChild(saveBtn);
      editActions.appendChild(cancelBtn);
      form.appendChild(editActions);

      return form;
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
          var result = await api.prepareDomain(state.activeAccountId, domainName);
          state.lastDomainResult = result;
          form.reset();
          setStatusMsg("#domain-add-status", "Set up the DNS records below, then click \u201cRegister on Purelymail\u201d.", "info");
          self.renderResultCard(result);
        } catch (err) {
          setStatusMsg("#domain-add-status", err.message, "error");
        } finally {
          btn.removeAttribute("aria-busy");
          btn.disabled = false;
        }
      });

      $("#btn-download-zone").addEventListener("click", function () {
        if (!state.lastDomainResult) return;
        var r = state.lastDomainResult;
        downloadTextFile(r.domain + "-dns.txt", r.zone_file);
      });

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

      $("#btn-register-purelymail").addEventListener("click", async function () {
        if (!state.lastDomainResult || !state.activeAccountId) return;
        var btn = $("#btn-register-purelymail");
        btn.setAttribute("aria-busy", "true");
        btn.disabled = true;
        setStatusMsg("#domain-register-status", "");
        try {
          await api.registerDomain(state.activeAccountId, state.lastDomainResult.domain);
          setStatusMsg("#domain-register-status", "Domain registered on Purelymail successfully!", "success");
          btn.disabled = true;
          btn.textContent = "Registered";
          await self.fetchDomains();
          self.renderList();
        } catch (err) {
          setStatusMsg("#domain-register-status", "Registration failed: " + err.message + ". Make sure DNS records are set up and have propagated, then try again.", "error");
          btn.disabled = false;
        } finally {
          btn.removeAttribute("aria-busy");
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

      users.updateDomainPickers();
      routing.updateDomainPickers();
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
        tdPassword.appendChild(buildPasswordCell(u.password));
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

        var wrapper = createEl("div", { className: "table-wrapper" });
        var table = document.createElement("table");
        var thead = document.createElement("thead");
        var headerRow = document.createElement("tr");
        ["Email", "Password", "Webmail", "Created", ""].forEach(function (h) {
          headerRow.appendChild(createTextEl("th", h));
        });
        thead.appendChild(headerRow);
        table.appendChild(thead);

        var tbody = document.createElement("tbody");
        userList.forEach(function (u) {
          var tr = document.createElement("tr");

          var tdEmail = document.createElement("td");
          var codeEmail = document.createElement("code");
          codeEmail.textContent = u.email || u;
          tdEmail.appendChild(codeEmail);
          tr.appendChild(tdEmail);

          var tdPassword = document.createElement("td");
          if (u.password) {
            tdPassword.appendChild(buildPasswordCell(u.password));
          } else {
            tdPassword.textContent = "\u2014";
          }
          tr.appendChild(tdPassword);

          var tdWebmail = document.createElement("td");
          var link = createEl("a", { href: "https://purelymail.com/webmail", target: "_blank", rel: "noopener" }, "Open");
          tdWebmail.appendChild(link);
          tr.appendChild(tdWebmail);

          var tdDate = document.createElement("td");
          tdDate.textContent = u.created_at ? formatDate(u.created_at) : "\u2014";
          tr.appendChild(tdDate);

          var tdActions = document.createElement("td");
          var email = u.email || u;
          var resetBtn = createEl("button", {
            type: "button",
            className: "btn-edit btn-sm",
          }, "Reset PW");
          resetBtn.addEventListener("click", async function () {
            if (!confirm("Reset password for " + email + "?")) return;
            resetBtn.setAttribute("aria-busy", "true");
            resetBtn.disabled = true;
            try {
              var result = await api.resetPassword(state.activeAccountId, email);
              // Update the password cell in this row
              clearChildren(tdPassword);
              tdPassword.appendChild(buildPasswordCell(result.password));
              revealPassword(tdPassword.querySelector(".password-cell"));
              showToast("Password reset for " + email);
            } catch (err) {
              showGlobalError(err.message);
            } finally {
              resetBtn.removeAttribute("aria-busy");
              resetBtn.disabled = false;
            }
          });
          tdActions.appendChild(resetBtn);
          tr.appendChild(tdActions);

          tbody.appendChild(tr);
        });
        table.appendChild(tbody);
        wrapper.appendChild(table);
        container.appendChild(wrapper);
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

  // ==========================================
  // Routing Module
  // ==========================================
  var routing = {
    init: function () {
      var self = this;
      var form = $("#form-add-routing");
      var matchTypeSelect = $("#routing-match-type");

      // Toggle match_user field visibility based on match type
      matchTypeSelect.addEventListener("change", function () {
        var label = $("#routing-match-user-label");
        if (matchTypeSelect.value === "catchall") {
          label.hidden = true;
        } else {
          label.hidden = false;
        }
      });

      form.addEventListener("submit", async function (e) {
        e.preventDefault();
        if (!state.activeAccountId) {
          setStatusMsg("#routing-add-status", "Select an account first.", "error");
          return;
        }

        var domainName = form.domain_name.value;
        var matchType = matchTypeSelect.value;
        var matchUser = form.match_user.value.trim();
        var targetsRaw = form.target_addresses.value.trim();

        if (!domainName || !targetsRaw) {
          setStatusMsg("#routing-add-status", "Select a domain and enter at least one target address.", "error");
          return;
        }

        if (matchType !== "catchall" && !matchUser) {
          setStatusMsg("#routing-add-status", "Enter a match user for exact/prefix rules.", "error");
          return;
        }

        var targets = targetsRaw.split("\n").map(function (t) { return t.trim(); }).filter(function (t) { return t.length > 0; });

        var btn = form.querySelector("button[type=submit]");
        btn.setAttribute("aria-busy", "true");
        btn.disabled = true;
        setStatusMsg("#routing-add-status", "");

        try {
          await api.createRoutingRule(
            state.activeAccountId,
            domainName,
            matchType === "catchall" ? "" : matchUser,
            targets,
            matchType === "prefix",
            matchType === "catchall"
          );
          form.match_user.value = "";
          form.target_addresses.value = "";
          setStatusMsg("#routing-add-status", "Routing rule created.", "success");
          self.loadRules();
        } catch (err) {
          setStatusMsg("#routing-add-status", err.message, "error");
        } finally {
          btn.removeAttribute("aria-busy");
          btn.disabled = false;
        }
      });

      $("#routing-list-domain-picker").addEventListener("change", function () {
        self.loadRules();
      });
    },

    load: async function () {
      if (!state.activeAccountId) {
        var rl = $("#routing-list");
        clearChildren(rl);
        rl.appendChild(createTextEl("div", "Select an account to view routing rules.", "empty-state"));
        return;
      }

      if (!Array.isArray(state.domains) || state.domains.length === 0) {
        try {
          await domains.fetchDomains();
        } catch (err) {
          // ok
        }
      }

      this.updateDomainPickers();
      this.loadRules();
    },

    updateDomainPickers: function () {
      var domainNames = state.domains.map(function (d) {
        return typeof d === "string" ? d : d.name;
      });

      [$("#routing-domain-picker"), $("#routing-list-domain-picker")].forEach(function (sel, idx) {
        if (!sel) return;
        var current = sel.value;
        clearChildren(sel);
        sel.appendChild(createEl("option", { value: "" }, idx === 0 ? "Select a domain" : "All domains"));
        domainNames.forEach(function (name) {
          var opt = createEl("option", { value: name }, name);
          if (name === current) opt.selected = true;
          sel.appendChild(opt);
        });
      });
    },

    loadRules: async function () {
      var domain = $("#routing-list-domain-picker").value;
      var container = $("#routing-list");

      if (!state.activeAccountId) {
        clearChildren(container);
        container.appendChild(createTextEl("div", "Select an account.", "empty-state"));
        return;
      }

      show("#routing-loading");
      try {
        var rules = await api.listRoutingRules(state.activeAccountId, domain || null);
        hide("#routing-loading");
        this.renderRules(rules, container);
      } catch (err) {
        hide("#routing-loading");
        clearChildren(container);
        container.appendChild(createTextEl("div", err.message, "status-msg error"));
      }
    },

    renderRules: function (rules, container) {
      var self = this;
      clearChildren(container);

      if (!rules || rules.length === 0) {
        container.appendChild(createTextEl("div", "No routing rules found.", "empty-state"));
        return;
      }

      var wrapper = createEl("div", { className: "table-wrapper" });
      var table = document.createElement("table");
      var thead = document.createElement("thead");
      var headerRow = document.createElement("tr");
      ["Domain", "Match", "Type", "Forward To", ""].forEach(function (h) {
        headerRow.appendChild(createTextEl("th", h));
      });
      thead.appendChild(headerRow);
      table.appendChild(thead);

      var tbody = document.createElement("tbody");
      rules.forEach(function (r) {
        var tr = document.createElement("tr");

        var tdDomain = document.createElement("td");
        var codeDomain = document.createElement("code");
        codeDomain.textContent = r.domainName;
        tdDomain.appendChild(codeDomain);
        tr.appendChild(tdDomain);

        var tdMatch = document.createElement("td");
        if (r.catchall) {
          tdMatch.textContent = "*";
        } else {
          var codeMatch = document.createElement("code");
          codeMatch.textContent = r.matchUser + (r.prefix ? "*" : "");
          tdMatch.appendChild(codeMatch);
        }
        tr.appendChild(tdMatch);

        var tdType = document.createElement("td");
        var typeLabel = r.catchall ? "Catch-all" : (r.prefix ? "Prefix" : "Exact");
        tdType.appendChild(createTextEl("span", typeLabel, "badge " + (r.catchall ? "badge-no" : "badge-yes")));
        tr.appendChild(tdType);

        var tdTargets = document.createElement("td");
        r.targetAddresses.forEach(function (addr, i) {
          if (i > 0) tdTargets.appendChild(document.createTextNode(", "));
          var code = document.createElement("code");
          code.textContent = addr;
          tdTargets.appendChild(code);
        });
        tr.appendChild(tdTargets);

        var tdActions = document.createElement("td");
        var editBtn = createEl("button", {
          type: "button",
          className: "btn-edit btn-sm",
        }, "Edit");
        editBtn.addEventListener("click", function () {
          self.showEditRow(tr, r, tbody);
        });
        tdActions.appendChild(editBtn);

        var delBtn = createEl("button", {
          type: "button",
          className: "btn-delete btn-sm",
        }, "Delete");
        delBtn.addEventListener("click", async function () {
          if (!confirm("Delete this routing rule?")) return;
          delBtn.setAttribute("aria-busy", "true");
          delBtn.disabled = true;
          try {
            await api.deleteRoutingRule(state.activeAccountId, r.id);
            showToast("Rule deleted.");
            self.loadRules();
          } catch (err) {
            showGlobalError(err.message);
            delBtn.removeAttribute("aria-busy");
            delBtn.disabled = false;
          }
        });
        tdActions.appendChild(delBtn);
        tr.appendChild(tdActions);

        tbody.appendChild(tr);
      });

      table.appendChild(tbody);
      wrapper.appendChild(table);
      container.appendChild(wrapper);
    },

    showEditRow: function (displayRow, rule, tbody) {
      var self = this;

      // Remove any existing edit row
      var existing = tbody.querySelector(".routing-edit-row");
      if (existing) existing.remove();

      var editRow = document.createElement("tr");
      editRow.className = "routing-edit-row";

      // Domain (read-only)
      var tdDomain = document.createElement("td");
      tdDomain.appendChild(createTextEl("code", rule.domainName));
      editRow.appendChild(tdDomain);

      // Match user input
      var tdMatch = document.createElement("td");
      var matchInput = createEl("input", {
        type: "text",
        value: rule.catchall ? "" : rule.matchUser,
        placeholder: "user",
      });
      if (rule.catchall) matchInput.disabled = true;
      tdMatch.appendChild(matchInput);
      editRow.appendChild(tdMatch);

      // Type selector
      var tdType = document.createElement("td");
      var typeSelect = document.createElement("select");
      [["exact", "Exact"], ["prefix", "Prefix"], ["catchall", "Catch-all"]].forEach(function (opt) {
        var o = createEl("option", { value: opt[0] }, opt[1]);
        if (rule.catchall && opt[0] === "catchall") o.selected = true;
        else if (rule.prefix && !rule.catchall && opt[0] === "prefix") o.selected = true;
        else if (!rule.prefix && !rule.catchall && opt[0] === "exact") o.selected = true;
        typeSelect.appendChild(o);
      });
      typeSelect.addEventListener("change", function () {
        matchInput.disabled = typeSelect.value === "catchall";
        if (typeSelect.value === "catchall") matchInput.value = "";
      });
      tdType.appendChild(typeSelect);
      editRow.appendChild(tdType);

      // Target addresses textarea
      var tdTargets = document.createElement("td");
      var targetsArea = document.createElement("textarea");
      targetsArea.value = rule.targetAddresses.join("\n");
      tdTargets.appendChild(targetsArea);
      editRow.appendChild(tdTargets);

      // Action buttons
      var tdActions = document.createElement("td");
      var actions = createEl("div", { className: "routing-edit-actions" });

      var saveBtn = createEl("button", {
        type: "button",
        className: "btn-sm primary",
      }, "Save");
      saveBtn.addEventListener("click", async function () {
        var matchType = typeSelect.value;
        var matchUser = matchInput.value.trim();
        var targets = targetsArea.value.trim().split("\n").map(function (t) { return t.trim(); }).filter(function (t) { return t.length > 0; });

        if (targets.length === 0) {
          showGlobalError("Enter at least one target address.");
          return;
        }
        if (matchType !== "catchall" && !matchUser) {
          showGlobalError("Enter a match user for exact/prefix rules.");
          return;
        }

        saveBtn.setAttribute("aria-busy", "true");
        saveBtn.disabled = true;
        cancelBtn.disabled = true;

        try {
          // Create new rule first (safe: old rule still exists if this fails)
          await api.createRoutingRule(
            state.activeAccountId,
            rule.domainName,
            matchType === "catchall" ? "" : matchUser,
            targets,
            matchType === "prefix",
            matchType === "catchall"
          );
          // New rule created successfully, now delete the old one
          try {
            await api.deleteRoutingRule(state.activeAccountId, rule.id);
          } catch (delErr) {
            // Old rule couldn't be deleted but new one exists — warn user
            showGlobalError("Rule updated, but the old rule could not be removed: " + delErr.message);
          }
          showToast("Rule updated.");
          self.loadRules();
        } catch (err) {
          showGlobalError(err.message);
          saveBtn.removeAttribute("aria-busy");
          saveBtn.disabled = false;
          cancelBtn.disabled = false;
        }
      });
      actions.appendChild(saveBtn);

      var cancelBtn = createEl("button", {
        type: "button",
        className: "secondary btn-sm",
      }, "Cancel");
      cancelBtn.addEventListener("click", function () {
        editRow.remove();
      });
      actions.appendChild(cancelBtn);

      tdActions.appendChild(actions);
      editRow.appendChild(tdActions);

      // Insert edit row right after the display row
      displayRow.insertAdjacentElement("afterend", editRow);
    },
  };

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
        tdPassword.appendChild(buildPasswordCell(u.password));
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
  // Theme Module
  // ==========================================
  var theme = {
    init: function () {
      var self = this;
      this.updateIcon();
      var btn = $("#theme-toggle");
      if (btn) {
        btn.addEventListener("click", function () {
          self.toggle();
        });
      }
    },

    toggle: function () {
      var current = document.documentElement.getAttribute("data-theme");
      var next = current === "dark" ? "light" : "dark";
      document.documentElement.setAttribute("data-theme", next);
      localStorage.setItem("mailamator-theme", next);
      this.updateIcon();
    },

    updateIcon: function () {
      var btn = $("#theme-toggle");
      if (!btn) return;
      var isDark = document.documentElement.getAttribute("data-theme") === "dark";
      btn.textContent = isDark ? "\u2600\uFE0F" : "\uD83C\uDF19";
      btn.title = isDark ? "Switch to light mode" : "Switch to dark mode";
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
    theme.init();

    $(".alert-close").addEventListener("click", hideGlobalError);

    router.init();
    accountSwitcher.init();
    settings.init();
    domains.init();
    users.init();
    routing.init();
    historyModule.init();

    show("#settings-loading");
    await loadAccounts();
    hide("#settings-loading");

    var initialTab = state.accounts.length === 0 ? "settings" : "domains";
    router.navigate(initialTab);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
