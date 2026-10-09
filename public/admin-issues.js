(function (root) {
  "use strict";
  const escape = (value) =>
    String(value ?? "").replace(
      /[&<>"']/g,
      (char) =>
        ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&#39;",
        })[char],
    );
  const date = (value) =>
    value ? new Date(value).toLocaleString() : "Unknown";
  const uuid = /^[a-f\d-]{36}$/i;
  function summary(issue, includeButton = true) {
    return `<article class="card" style="margin-bottom:12px;padding:16px;overflow-wrap:anywhere">
      <div style="display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap"><strong>${escape(issue.event)}</strong><span>${escape(issue.severity)} · ${escape(issue.status)}</span></div>
      <p>${escape(issue.stage)} · ${escape(issue.release)} · ${escape(issue.market)} · ${Number(issue.occurrences) || 0} occurrences</p>
      <p>First: ${escape(date(issue.first_seen))}<br>Last: ${escape(date(issue.last_seen))}<br>Notification: ${escape(issue.notification_status)}</p>
      ${includeButton ? `<button class="btn-secondary" data-issue-id="${escape(issue.id)}">View evidence</button>` : ""}
    </article>`;
  }
  function healthView(health) {
    if (!health || health.error)
      return '<p role="status">Monitoring health is unavailable.</p>';
    const today = health.budgets?.[0] || {};
    const sweepLate =
      !today.sweep_at || Date.now() - Date.parse(today.sweep_at) > 15 * 60000;
    const cleanupLate =
      !today.cleanup_at ||
      Date.now() - Date.parse(today.cleanup_at) > 90 * 60000;
    return `<details><summary>Monitoring health${sweepLate || cleanupLate || today.cleanup_backlog || health.failedNotifications ? ": attention needed" : ""}</summary>
      <p>${Number(health.groups)} groups · ${Number(health.flows)} flows · ${Number(health.receipts)} receipts<br>
      ${(Number(health.payloadBytes || 0) / 1048576).toFixed(2)} MiB evidence · ${(Number(health.physicalBytes || 0) / 1048576).toFixed(2)} MiB including indexes<br>
      ${Number(today.suppressed || 0)} suppressed ? ${Number(today.client_dropped || 0)} dropped from local queues · ${Number(health.pending || 0)} pending notifications ? ${Number(health.failedNotifications || 0)} failed deliveries<br>
      Emails reserved: ${Number(today.emails || 0)}/20 · Sentry attempts: ${Number(today.sentry || 0)}/100<br>
      Sweep: ${escape(date(today.sweep_at))}${sweepLate ? " (overdue)" : ""}<br>
      Cleanup: ${escape(date(today.cleanup_at))}${cleanupLate ? " (overdue)" : ""} · Backlog: ${Number(today.cleanup_backlog || 0)}</p></details>`;
  }
  async function render(container, filter = {}) {
    if (
      !filter.userId &&
      !filter.clientId &&
      new URL(root.location.href).searchParams.get("source") === "customers"
    )
      return renderCustomerReports(container, filter.cursor);
    const params = new URLSearchParams({
      action: "issues",
      status: filter.status || "open",
    });
    if (filter.userId) params.set("user_id", filter.userId);
    if (filter.clientId) params.set("client_id", filter.clientId);
    if (filter.cursor) params.set("cursor", filter.cursor);
    const data = await root.fetchAPI(`/api/admin?${params}`, { force: true });
    container.innerHTML = `<div class="view-brief"><h2>${filter.userId ? "Recent issues for this user" : filter.clientId ? "Recent issues for this browser" : "Issues"}</h2>
      <p>${data.processingPaused ? "Incident collection and alerts are paused. " : ""}Last 24 hours. ${filter.clientId ? "Browser correlation is unverified." : "Detected failures and explicit listing-tool reports."}</p>
      ${!filter.userId && !filter.clientId ? '<p><a class="btn-secondary" href="/admin/reports?source=customers">Customer reports</a></p>' : ""}
      <label>Status <select class="filter-input" data-issue-status><option value="open">Open and acknowledged</option><option value="resolved">Resolved</option><option value="all">All</option></select></label>
      <button class="btn-secondary" data-issue-refresh>Refresh</button>${!filter.userId && !filter.clientId ? healthView(data.health) : ""}</div>
      <div data-issue-list>${(data.issues || []).map((issue) => summary(issue)).join("") || '<p class="empty-state">No issues match this view.</p>'}</div>
      ${data.nextCursor ? '<button class="btn-secondary" data-issue-next>Next 50</button>' : ""}`;
    const select = container.querySelector("[data-issue-status]");
    select.value = filter.status || "open";
    const reload = (next) =>
      render(container, next).catch((error) =>
        root.openModal("Issues unavailable", `<p>${escape(error.message)}</p>`),
      );
    select.addEventListener("change", () =>
      reload({ ...filter, status: select.value, cursor: null }),
    );
    container
      .querySelector("[data-issue-refresh]")
      .addEventListener("click", () => reload({ ...filter, cursor: null }));
    container
      .querySelector("[data-issue-next]")
      ?.addEventListener("click", () =>
        reload({ ...filter, cursor: data.nextCursor }),
      );
    for (const button of container.querySelectorAll("[data-issue-id]"))
      button.addEventListener("click", () => detail(button.dataset.issueId));
    if (!filter.userId && !filter.clientId && !filter.cursor) {
      const incident = new URL(root.location.href).searchParams.get("incident");
      if (incident && uuid.test(incident)) await detail(incident);
    }
  }
  async function renderCustomerReports(container, cursor) {
    const params = new URLSearchParams({ action: "customer-reports" });
    if (cursor) params.set("cursor", cursor);
    const data = await root.fetchAPI(`/api/admin?${params}`, { force: true });
    container.innerHTML = `<div class="view-brief"><h2>Customer reports</h2>
      <p>Feedback from the Report an issue button in the listing tools. Saved separately from temporary error evidence.</p>
      <p><a class="btn-secondary" href="/admin/reports">Issues</a> <button class="btn-secondary" data-report-refresh>Refresh</button></p></div>
      ${
        (data.reports || [])
          .map(
            (
              report,
            ) => `<article class="card" style="margin-bottom:12px;padding:16px;overflow-wrap:anywhere">
        <strong>${escape(String(report.category).replace(/_/g, " "))}</strong>
        <p>${escape(date(report.createdAt))}<br>${escape(report.userEmail || (report.userId ? "Account linked" : "No verified account"))}<br>Version ${escape(report.extensionVersion)}${report.photoCount == null ? "" : ` · ${Number(report.photoCount)} photos`}</p>
        <p style="white-space:pre-wrap">${escape(report.message)}</p>
        <div style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn-secondary" data-report-id="${escape(report.id)}">View report</button>
        ${report.userId && uuid.test(report.userId) ? `<button class="btn-secondary" data-report-account="${escape(report.userId)}">Account</button> <button class="btn-secondary" data-report-logs="${escape(report.userId)}">Account logs</button>` : ""}</div>
      </article>`,
          )
          .join("") || '<p class="empty-state">No saved customer reports.</p>'
      }
      ${data.nextCursor ? '<button class="btn-secondary" data-report-next>Next 50</button>' : ""}`;
    const reload = (next) =>
      renderCustomerReports(container, next).catch((error) =>
        root.openModal(
          "Customer reports unavailable",
          `<p>${escape(error.message)}</p>`,
        ),
      );
    container
      .querySelector("[data-report-refresh]")
      .addEventListener("click", () => reload());
    container
      .querySelector("[data-report-next]")
      ?.addEventListener("click", () => reload(data.nextCursor));
    for (const button of container.querySelectorAll("[data-report-id]"))
      button.addEventListener("click", () => {
        if (uuid.test(button.dataset.reportId))
          root.showLogDetails(button.dataset.reportId);
      });
    for (const button of container.querySelectorAll("[data-report-account]"))
      button.addEventListener("click", () =>
        root.openAccountForIssue(button.dataset.reportAccount),
      );
    for (const button of container.querySelectorAll("[data-report-logs]"))
      button.addEventListener("click", () =>
        root.openLogsForUser(button.dataset.reportLogs, "", "all"),
      );
  }
  async function detail(id) {
    try {
      if (!uuid.test(id)) return;
      const data = await root.fetchAPI(
        `/api/admin?action=issue-detail&id=${encodeURIComponent(id)}`,
        { force: true },
      );
      if (data.customerReportId && uuid.test(data.customerReportId))
        return root.showLogDetails(data.customerReportId);
      const issue = data.issue;
      root.openModal(
        "Issue details",
        `<div id="issue-detail-content">${summary(issue, false)}
        <div style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn-secondary" data-state="acknowledged">Acknowledge</button><button class="btn-secondary" data-state="resolved">Resolve</button><button class="btn-secondary" data-state="open">Reopen</button></div>
        <p>${escape(issue.notification_error || "")}</p><h3>Evidence</h3>
        ${(issue.examples || []).map((example) => `<section class="card" style="padding:12px;margin:12px 0"><p>${escape(date(example.occurredAt))} · ${example.identityVerified ? "Verified identity" : example.trustedSource ? "Server context" : "Unverified correlation"} · ${escape(example.source)}</p><pre style="white-space:pre-wrap;overflow-wrap:anywhere">${escape(JSON.stringify(example.context, null, 2))}</pre></section>`).join("") || "<p>Diagnostic evidence has expired.</p>"}
        <h3>Related operations</h3>${data.moreOperations ? "<p>Showing the 50 most recent operations. Use account logs for older activity.</p>" : ""}${(data.operations || []).map((operation) => `<section class="card" style="padding:12px;margin:12px 0"><p>${escape(operation.operation_id)}<br>${escape(operation.stage)} · ${escape(date(operation.updated_at))}</p><pre style="white-space:pre-wrap">${escape(JSON.stringify(operation.progress, null, 2))}</pre>${operation.user_id ? `<button class="btn-secondary" data-user-logs="${escape(operation.user_id)}">Account logs</button> <button class="btn-secondary" data-user-account="${escape(operation.user_id)}">Account</button>` : ""}</section>`).join("") || "<p>No linked operation.</p>"}</div>`,
      );
      const container = document.getElementById("issue-detail-content");
      for (const button of container.querySelectorAll("[data-user-account]"))
        button.addEventListener("click", () =>
          root.openAccountForIssue(button.dataset.userAccount),
        );
      for (const button of container.querySelectorAll("[data-state]"))
        button.addEventListener("click", async () => {
          button.disabled = true;
          try {
            await root.fetchAPI("/api/admin?action=issue-state", {
              method: "POST",
              body: JSON.stringify({ id, status: button.dataset.state }),
            });
            await detail(id);
          } catch (error) {
            root.openModal("Update failed", `<p>${escape(error.message)}</p>`);
          }
        });
      for (const button of container.querySelectorAll("[data-user-logs]"))
        button.addEventListener("click", () =>
          root.openLogsForUser(button.dataset.userLogs, "", "all"),
        );
    } catch (error) {
      root.openModal("Issue unavailable", `<p>${escape(error.message)}</p>`);
    }
  }
  async function openUser(userId) {
    root.openModal(
      "Recent issues",
      '<div id="user-recent-issues">Loading recent issues...</div>',
    );
    await render(document.getElementById("user-recent-issues"), {
      userId,
      status: "all",
    });
  }
  async function openClient(clientId) {
    root.openModal(
      "Recent browser issues",
      '<div id="user-recent-issues">Loading recent issues...</div>',
    );
    await render(document.getElementById("user-recent-issues"), {
      clientId,
      status: "all",
    });
  }
  root.AutoListerIssues = { render, detail, openUser, openClient, summary };
})(globalThis);
