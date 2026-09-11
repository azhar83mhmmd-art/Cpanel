(async function init() {
  const me = await fetchMe();
  if (!me) return;
  if (me.role !== "admin_panel") {
    window.location.href = "/dashboard";
    return;
  }

  const res = await fetch("/api/panels");
  const panels = await res.json();

  document.getElementById("statTotal").textContent = panels.length;
  document.getElementById("statSuccess").textContent = panels.filter((p) => p.status === "success").length;
  document.getElementById("statFailed").textContent = panels.filter((p) => p.status === "failed").length;

  const body = document.getElementById("riwayatBody");
  const empty = document.getElementById("riwayatEmpty");

  if (!panels.length) {
    body.innerHTML = "";
    empty.style.display = "block";
    return;
  }

  const badgeClass = { success: "badge-success", failed: "badge-failed", processing: "badge-processing" };
  const badgeText = { success: "Berhasil", failed: "Gagal", processing: "Diproses" };

  body.innerHTML = panels.map((p) => `
    <tr>
      <td>${escapeHtml(p.panel_name)}</td>
      <td>${escapeHtml(p.ram)}</td>
      <td><span class="badge ${badgeClass[p.status] || ""}">${badgeText[p.status] || p.status}</span></td>
      <td>${fmtDate(p.created_at)}</td>
      <td>${p.panel_url ? `<a href="${escapeHtml(p.panel_url)}" target="_blank" style="color:var(--primary-2);">Buka</a>` : "-"}</td>
    </tr>
  `).join("");
})();
