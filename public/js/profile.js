(async function init() {
  const me = await fetchMe();
  if (!me) return;

  document.getElementById("roleTag").textContent = me.role.replace("_", " ").toUpperCase();
  const backMap = { reseller: "/dashboard", admin_panel: "/dashboard", admin_web: "/web-admin" };
  document.getElementById("backLink").addEventListener("click", () => {
    window.location.href = backMap[me.role] || "/";
  });

  document.getElementById("infoBox").innerHTML = `
    <div class="row"><span>Username</span><span>${escapeHtml(me.username)}</span></div>
    <div class="row"><span>Role</span><span>${escapeHtml(me.role)}</span></div>
    <div class="row"><span>Status</span><span>${escapeHtml(me.status)}</span></div>
    <div class="row"><span>Dibuat</span><span>${fmtDate(me.created_at)}</span></div>
    <div class="row"><span>Login Terakhir</span><span>${me.last_login ? fmtDate(me.last_login) : "-"}</span></div>
  `;
})();

document.getElementById("passForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const newPass = document.getElementById("newPass").value;
  const confirmPass = document.getElementById("confirmPass").value;

  if (newPass !== confirmPass) {
    showToast("Konfirmasi password tidak cocok.", "error");
    return;
  }

  const btn = document.getElementById("passBtn");
  btn.disabled = true;
  const btnOriginal = btn.innerHTML;
  btn.innerHTML = "Menyimpan...";

  try {
    const res = await fetch("/api/auth/change-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ new_password: newPass }),
    });
    const data = await res.json();
    if (!res.ok) {
      showToast(data.error || "Gagal mengubah password.", "error");
      return;
    }
    showToast("Password berhasil diubah.", "success");
    document.getElementById("passForm").reset();
  } finally {
    btn.disabled = false;
    btn.innerHTML = btnOriginal;
  }
});
