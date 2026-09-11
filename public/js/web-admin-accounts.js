let deleteTargetId = null;

(async function init() {
  const me = await fetchMe();
  if (!me) return;
  if (me.role !== "admin_web") {
    window.location.href = "/dashboard";
    return;
  }
  loadAccounts();
})();

async function loadAccounts() {
  const body = document.getElementById("accBody");
  const empty = document.getElementById("accEmpty");
  const res = await fetch("/api/admin/accounts");
  const accounts = await res.json();

  if (!accounts.length) {
    body.innerHTML = "";
    empty.style.display = "block";
    return;
  }
  empty.style.display = "none";

  body.innerHTML = accounts.map((a) => `
    <tr>
      <td>${escapeHtml(a.username)}</td>
      <td><span class="badge badge-role">${a.role.replace("_", " ")}</span></td>
      <td><span class="badge ${a.status === "active" ? "badge-active" : "badge-disabled"}">${a.status === "active" ? "Aktif" : "Nonaktif"}</span></td>
      <td>${fmtDate(a.created_at)}</td>
      <td>${a.last_login ? fmtDate(a.last_login) : "-"}</td>
      <td style="white-space:nowrap;">
        <button class="copy-btn" onclick="toggleStatus('${a.id}', '${a.status}')">${a.status === "active" ? "Nonaktifkan" : "Aktifkan"}</button>
        <button class="copy-btn" style="color:#f87171;" onclick="openDeleteModal('${a.id}', '${escapeHtml(a.username)}')">Hapus</button>
      </td>
    </tr>
  `).join("");
}

async function toggleStatus(id, currentStatus) {
  const newStatus = currentStatus === "active" ? "disabled" : "active";
  const res = await fetch(`/api/admin/accounts/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ status: newStatus }),
  });
  if (res.ok) {
    showToast("Status akun diperbarui.", "success");
    loadAccounts();
  } else {
    showToast("Gagal memperbarui status.", "error");
  }
}

function openDeleteModal(id, username) {
  deleteTargetId = id;
  document.getElementById("deleteText").textContent = `Akun "${username}" akan dihapus permanen.`;
  document.getElementById("deleteModal").classList.add("show");
}
document.getElementById("cancelDelete").addEventListener("click", () => {
  document.getElementById("deleteModal").classList.remove("show");
});
document.getElementById("confirmDelete").addEventListener("click", async () => {
  const res = await fetch(`/api/admin/accounts/${deleteTargetId}`, { method: "DELETE" });
  document.getElementById("deleteModal").classList.remove("show");
  if (res.ok) {
    showToast("Akun dihapus.", "success");
    loadAccounts();
  } else {
    showToast("Gagal menghapus akun.", "error");
  }
});

// modal create
const createModal = document.getElementById("createModal");
document.getElementById("openCreateModal").addEventListener("click", () => {
  document.getElementById("accResultBox").style.display = "none";
  document.getElementById("createAccForm").reset();
  document.getElementById("manualPassField").style.display = "none";
  createModal.classList.add("show");
});
document.getElementById("cancelCreateAcc").addEventListener("click", () => createModal.classList.remove("show"));

document.getElementById("accMode").addEventListener("change", (e) => {
  document.getElementById("manualPassField").style.display = e.target.value === "manual" ? "block" : "none";
});

document.getElementById("createAccForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const username = document.getElementById("accUsername").value.trim();
  const role = document.getElementById("accRole").value;
  const mode = document.getElementById("accMode").value;
  const password = document.getElementById("accPassword").value;

  const btn = document.getElementById("createAccBtn");
  btn.disabled = true;
  const btnOriginal = btn.innerHTML;
  btn.innerHTML = "Membuat...";

  try {
    const res = await fetch("/api/admin/accounts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, role, mode, password }),
    });
    const data = await res.json();
    if (!res.ok) {
      showToast(data.error || "Gagal membuat akun.", "error");
      return;
    }
    const box = document.getElementById("accResultBox");
    box.style.display = "block";

    const roleDisplay = data.role.replace(/_/g, " ");
    const waMessage = `┏━⬣❏「 AKUN LOGIN BERHASIL DIBUAT 」❏
│
│➥ Website  : ${window.location.origin}
│➥ Username : ${data.username}
│➥ Password : ${data.password}
│➥ Role     : ${roleDisplay}
│➥ Dibuat   : ${formatWIB()}
│➥ Status   : AKTIF
│
┗━━━━━━━━━━━━━━━━━━⬣

🔐 INFORMASI AKSES
Silakan gunakan username dan password di atas untuk login ke website.

⚠️ KEAMANAN
• Jangan bagikan akun kepada orang lain.
• Jangan membagikan password ke pihak yang tidak dipercaya.
• Gunakan akses sesuai role yang diberikan.
• Jika mengalami masalah login, hubungi Administrator.

— Pterodactyl Panel Manager`;

    box.innerHTML = `
      <div class="row"><span>Username</span><span class="mono">${escapeHtml(data.username)}</span></div>
      <div class="row"><span>Password</span><span class="mono">${escapeHtml(data.password)}</span></div>
      <div class="row"><span>Role</span><span>${escapeHtml(roleDisplay)}</span></div>
      <pre id="waMessagePre" style="white-space:pre-wrap; word-break:break-word; font-family:var(--font-mono); font-size:11.5px; color:var(--text-dim); background:var(--surface-2); border:1px solid var(--border); border-radius:10px; padding:13px; margin-top:13px; line-height:1.55;">${escapeHtml(waMessage)}</pre>
      <button class="copy-btn" style="margin-top:10px;" id="copyWaMsgBtn">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="8" y="8" width="12" height="12" rx="2"/><path d="M4 16V5a1 1 0 0 1 1-1h11"/></svg>
        Salin Pesan
      </button>
    `;
    document.getElementById("copyWaMsgBtn").addEventListener("click", () => copyText(waMessage));

    loadAccounts();
    showToast("Akun berhasil dibuat!", "success");
  } finally {
    btn.disabled = false;
    btn.innerHTML = btnOriginal;
  }
});
