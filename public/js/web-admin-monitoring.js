const actionLabel = {
  login: "Login",
  logout: "Logout",
  create_panel: "Buat Panel",
  create_account: "Buat Akun",
  update_account: "Update Akun",
  delete_account: "Hapus Akun",
};

async function loadLogs() {
  const body = document.getElementById("logBody");
  const empty = document.getElementById("logEmpty");
  body.innerHTML = `<tr><td colspan="6"><div class="skeleton" style="height:16px;"></div></td></tr>`;

  const params = new URLSearchParams();
  const user = document.getElementById("fUser").value.trim();
  const role = document.getElementById("fRole").value;
  const action = document.getElementById("fAction").value;
  const date = document.getElementById("fDate").value.trim();
  if (user) params.set("user", user);
  if (role) params.set("role", role);
  if (action) params.set("action", action);
  if (date) params.set("date", date);

  const res = await fetch(`/api/admin/monitoring?${params.toString()}`);
  const logs = await res.json();

  if (!logs.length) {
    body.innerHTML = "";
    empty.style.display = "block";
    return;
  }
  empty.style.display = "none";

  body.innerHTML = logs.map((l) => `
    <tr>
      <td>${fmtDate(l.created_at)}</td>
      <td>${escapeHtml(l.username || "-")}</td>
      <td><span class="badge badge-role">${(l.role || "-").replace("_", " ")}</span></td>
      <td>${actionLabel[l.action] || l.action}</td>
      <td style="max-width:220px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${escapeHtml(JSON.stringify(l.metadata || {}))}</td>
      <td>${escapeHtml(l.ip_address || "-")}</td>
    </tr>
  `).join("");
}

(async function init() {
  const me = await fetchMe();
  if (!me) return;
  if (me.role !== "admin_web") {
    window.location.href = "/dashboard";
    return;
  }
  loadLogs();

  document.getElementById("fUser").addEventListener("input", debounce(loadLogs, 350));
  document.getElementById("fRole").addEventListener("change", loadLogs);
  document.getElementById("fAction").addEventListener("change", loadLogs);
  document.getElementById("fDate").addEventListener("input", debounce(loadLogs, 350));
})();

function debounce(fn, delay) {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), delay);
  };
}
