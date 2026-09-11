(async function init() {
  const me = await fetchMe();
  if (!me) return;
  if (me.role !== "admin_web") {
    window.location.href = "/dashboard";
    return;
  }
  loadSettings();
})();

async function loadSettings() {
  const res = await fetch("/api/admin/settings");
  const s = await res.json();

  document.getElementById("domain").value = s.domain || "";
  document.getElementById("ptla").value = s.ptla || "";
  document.getElementById("ptlc").value = s.ptlc || "";

  const box = document.getElementById("statusBox");
  box.innerHTML = `
    <div class="row"><span>Domain</span><span>${s.domain ? escapeHtml(s.domain) : "— belum diatur —"}</span></div>
    <div class="row"><span>PTLA</span><span>${s.ptla ? "✅ Terpasang" : "❌ Belum diatur"}</span></div>
    <div class="row"><span>PTLC</span><span>${s.ptlc ? "✅ Terpasang" : "⚠️ Belum diatur"}</span></div>
    <div class="row"><span>Terakhir diubah</span><span>${s.updated_at ? fmtDate(s.updated_at) : "-"}</span></div>
    <div class="row"><span>Oleh</span><span>${escapeHtml(s.updated_by || "-")}</span></div>
  `;
}

document.getElementById("settingsForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const domain = document.getElementById("domain").value.trim();
  const ptla = document.getElementById("ptla").value.trim();
  const ptlc = document.getElementById("ptlc").value.trim();

  const btn = document.getElementById("saveBtn");
  btn.disabled = true;
  btn.querySelector("svg") && (btn.querySelector("svg").style.display = "none");
  const originalHTML = btn.innerHTML;
  btn.innerHTML = "Menyimpan...";

  try {
    const res = await fetch("/api/admin/settings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ domain, ptla, ptlc }),
    });
    const data = await res.json();
    if (!res.ok) {
      showToast(data.error || "Gagal menyimpan pengaturan.", "error");
      return;
    }
    showToast("Pengaturan disimpan & langsung aktif.", "success");
    loadSettings();
  } finally {
    btn.disabled = false;
    btn.innerHTML = originalHTML;
  }
});

document.getElementById("testBtn").addEventListener("click", async () => {
  const btn = document.getElementById("testBtn");
  const originalHTML = btn.innerHTML;
  btn.disabled = true;
  btn.innerHTML = "Menguji...";
  try {
    const res = await fetch("/api/admin/settings/test", { method: "POST" });
    const data = await res.json();
    showToast(data.message || data.error, res.ok ? "success" : "error");
  } finally {
    btn.disabled = false;
    btn.innerHTML = originalHTML;
  }
});
