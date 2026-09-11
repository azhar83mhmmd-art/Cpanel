(async function init() {
  const me = await fetchMe();
  if (!me) return;
  if (me.role !== "admin_web") {
    window.location.href = "/dashboard";
    return;
  }

  const body = document.getElementById("plBody");
  const empty = document.getElementById("plEmpty");
  const res = await fetch("/api/admin/panel-logs");
  const panels = await res.json();

  if (!panels.length) {
    body.innerHTML = "";
    empty.style.display = "block";
    return;
  }
  empty.style.display = "none";

  const badgeClass = { success: "badge-success", failed: "badge-failed", processing: "badge-processing" };
  const badgeText = { success: "Berhasil", failed: "Gagal", processing: "Diproses" };

  body.innerHTML = panels.map((p, i) => `
    <tr>
      <td>${escapeHtml(p.user)}</td>
      <td><span class="badge badge-role">${p.role.replace("_", " ")}</span></td>
      <td>${escapeHtml(p.panel_name)}</td>
      <td>${escapeHtml(p.ram)}</td>
      <td>
        ${p.panel_password ? `
          <span class="mono">${escapeHtml(p.pterodactyl_username)}</span> /
          <span class="mono" id="pw-${i}">••••••••</span>
          <button class="copy-btn" onclick="togglePw(${i}, '${escapeHtml(p.panel_password)}')">Lihat</button>
        ` : "-"}
      </td>
      <td><span class="badge ${badgeClass[p.status] || ""}">${badgeText[p.status] || p.status}</span></td>
      <td>${fmtDate(p.created_at)}</td>
      <td>${p.panel_url ? `<a href="${escapeHtml(p.panel_url)}" target="_blank" style="color:var(--primary-2);">Buka</a>` : "-"}</td>
    </tr>
  `).join("");
})();

function togglePw(i, pw) {
  const el = document.getElementById(`pw-${i}`);
  el.textContent = el.textContent === "••••••••" ? pw : "••••••••";
}
