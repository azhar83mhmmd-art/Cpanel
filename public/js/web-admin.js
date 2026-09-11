function simpleBarChart(container, dataObj, colorVar = "--primary") {
  const entries = Object.entries(dataObj);
  if (!entries.length) {
    container.innerHTML = `<div class="empty-state" style="padding:16px 0;">Belum ada data.</div>`;
    return;
  }
  const max = Math.max(...entries.map(([, v]) => v));
  container.innerHTML = entries.map(([label, value]) => `
    <div style="margin-bottom:10px;">
      <div style="display:flex; justify-content:space-between; font-size:12.5px; color:var(--text-dim); margin-bottom:4px;">
        <span>${escapeHtml(label)}</span><span>${value}</span>
      </div>
      <div style="background:var(--bg-alt); border-radius:6px; overflow:hidden; height:8px;">
        <div style="width:${(value / max) * 100}%; height:100%; background:var(${colorVar});"></div>
      </div>
    </div>
  `).join("");
}

(async function init() {
  const me = await fetchMe();
  if (!me) return;
  if (me.role !== "admin_web") {
    window.location.href = "/dashboard";
    return;
  }

  const res = await fetch("/api/admin/stats");
  const s = await res.json();

  document.getElementById("s1").textContent = s.total_reseller;
  document.getElementById("s2").textContent = s.total_admin_panel;
  document.getElementById("s3").textContent = s.total_panel;
  document.getElementById("s4").textContent = s.panel_hari_ini;
  document.getElementById("s5").textContent = s.panel_berhasil;
  document.getElementById("s6").textContent = s.panel_gagal;
  document.getElementById("s7").textContent = s.user_aktif;

  simpleBarChart(document.getElementById("ramChart"), s.chart_per_ram, "--primary");
  simpleBarChart(document.getElementById("roleChart"), s.chart_per_role, "--primary-2");
})();
