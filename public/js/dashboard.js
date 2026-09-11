let ME = null;
let PANELS = [];
let PANELS_LOADED = false;
let PENDING_CREATE = null; // { name, ram, limits } menunggu konfirmasi
let LAST_SUCCESS = null;   // data hasil create sukses, hanya di memori (tidak disimpan)
let selectedRam = "";      // nilai RAM dari custom dropdown

// =====================================================================
// INIT
// =====================================================================
(async function init() {
  ME = await fetchMe();
  if (!ME) return;

  document.getElementById("welcomeText").textContent = `Selamat datang, ${ME.username}`;
  document.getElementById("roleTag").textContent = ME.role.replace("_", " ").toUpperCase();
  if (ME.role === "admin_panel") {
    document.getElementById("adminPanelLink").style.display = "flex";
  }
  setupTabs();
  setupQuickActions();
  setupCreateForm();
  setupConfirmModal();
  setupSuccessModal();
  setupDetailModal();
  setupRiwayatToolbar();

  await loadPanels();
  renderStats();
  renderTerbaru();
})();

// =====================================================================
// RESOURCE HELPER — meniru formula ramToLimits() di services/pterodactyl.js
// (RAM 1GB = CPU 40%, Disk 1024MB, linear per GB). Hanya untuk PREVIEW
// tampilan. Nilai final tetap dihitung & dipatuhi oleh backend/Pterodactyl
// saat request create dikirim; frontend tidak pernah mengirim CPU/Disk manual.
// =====================================================================
function computeLimits(ram) {
  if (ram === "unlimited") {
    return { ramLabel: "Unlimited", cpuLabel: "Unlimited", diskLabel: "Unlimited" };
  }
  const gb = parseInt(ram, 10);
  if (!gb) return { ramLabel: "-", cpuLabel: "-", diskLabel: "-" };
  return {
    ramLabel: `${gb} GB`,
    cpuLabel: `${gb * 40}%`,
    diskLabel: `${gb * 1024} MB`,
  };
}

// =====================================================================
// DATA PANEL (dipakai bersama: statistik, panel terbaru, riwayat)
// =====================================================================
async function loadPanels() {
  try {
    const res = await fetch("/api/panels");
    if (!res.ok) throw new Error("gagal memuat");
    PANELS = await res.json();
  } catch {
    PANELS = [];
    showToast("Gagal memuat data panel.", "error");
  }
  PANELS_LOADED = true;
}

function renderStats() {
  document.getElementById("statTotal").textContent = PANELS.length;
  document.getElementById("statAktif").textContent = PANELS.filter((p) => p.status === "success").length;
  document.getElementById("statProses").textContent = PANELS.filter((p) => p.status === "processing").length;
  document.getElementById("statGagal").textContent = PANELS.filter((p) => p.status === "failed").length;
}

const STATUS_BADGE_CLASS = { success: "badge-success", failed: "badge-failed", processing: "badge-processing" };
const STATUS_BADGE_TEXT = { success: "Aktif", failed: "Gagal", processing: "Diproses" };

function statusBadgeHtml(status) {
  const cls = STATUS_BADGE_CLASS[status] || "";
  const text = STATUS_BADGE_TEXT[status] || status;
  return `<span class="badge ${cls}"><span class="dot"></span>${escapeHtml(text)}</span>`;
}

// =====================================================================
// PANEL TERBARU
// =====================================================================
function renderTerbaru() {
  const wrap = document.getElementById("terbaruList");
  const items = PANELS.slice(0, 3);

  if (!items.length) {
    wrap.innerHTML = `
      <div class="section-empty" style="padding:30px 10px;">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12l3-7h12l3 7"/><path d="M3 12v6a1 1 0 0 0 1 1h16a1 1 0 0 0 1-1v-6"/><path d="M3 12h5.5a2.5 2.5 0 0 0 5 0H21"/></svg>
        Belum ada panel yang dibuat.<br />Buat panel pertama Anda untuk mulai menggunakan layanan.
      </div>`;
    return;
  }

  wrap.innerHTML = items.map((p) => {
    const lim = computeLimits(p.ram);
    return `
      <div class="panel-card">
        <div class="pc-top">
          <div class="pc-name">${escapeHtml(p.panel_name)}</div>
          ${statusBadgeHtml(p.status)}
        </div>
        <div class="pc-meta">${escapeHtml(lim.ramLabel)} · ${escapeHtml(lim.cpuLabel)} CPU · ${escapeHtml(lim.diskLabel)}</div>
        <div class="pc-date">Dibuat ${fmtDate(p.created_at)}</div>
        <div class="pc-actions">
          <button type="button" class="btn btn-secondary btn-sm" onclick="openDetailModal('${p.id}')">Detail</button>
          ${p.panel_url ? `<a class="btn btn-secondary btn-sm" href="${escapeHtml(p.panel_url)}" target="_blank" rel="noopener">Buka Panel</a>` : ""}
        </div>
      </div>`;
  }).join("");
}

// =====================================================================
// QUICK ACTIONS — reuse logika tab yang sudah ada di common.js (setupTabs)
// =====================================================================
function setupQuickActions() {
  document.querySelectorAll(".quick-action-btn[data-tab]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const target = document.querySelector(`.tab-btn[data-tab="${btn.dataset.tab}"]`);
      if (target) target.click();
    });
  });
}

// =====================================================================
// FORM BUAT PANEL — submit membuka modal konfirmasi (tidak langsung create)
// =====================================================================
function setupCreateForm() {
  const form = document.getElementById("createForm");
  setupRamDropdown();

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const name = document.getElementById("panelName").value.trim();
    if (!name) { showToast("Nama panel wajib diisi.", "error"); return; }
    if (!selectedRam) { showToast("Pilih RAM terlebih dahulu.", "error"); return; }

    hideCreateError();
    PENDING_CREATE = { name, ram: selectedRam };
    openConfirmModal(name, selectedRam);
  });

  document.getElementById("createRetryBtn").addEventListener("click", () => {
    hideCreateError();
    const name = document.getElementById("panelName").value.trim();
    if (!name || !selectedRam) return;
    PENDING_CREATE = { name, ram: selectedRam };
    openConfirmModal(name, selectedRam);
  });
}

// Dropdown RAM kustom — menggantikan <select> native supaya tampil konsisten
// di semua browser/HP (Android Chrome merender <select> pakai UI OS, bukan tema web).
function setupRamDropdown() {
  const wrap = document.getElementById("ramCustomSelect");
  const trigger = document.getElementById("ramTrigger");
  const triggerLabel = document.getElementById("ramTriggerLabel");
  const panel = document.getElementById("ramPanel");
  const options = panel.querySelectorAll(".custom-select-option");

  function closePanel() {
    panel.classList.remove("open");
    trigger.classList.remove("open");
    trigger.setAttribute("aria-expanded", "false");
  }
  function openPanel() {
    panel.classList.add("open");
    trigger.classList.add("open");
    trigger.setAttribute("aria-expanded", "true");
  }
  function choose(opt) {
    selectedRam = opt.dataset.value;
    triggerLabel.textContent = opt.querySelector("span").textContent;
    triggerLabel.classList.remove("placeholder");
    options.forEach((o) => o.classList.toggle("selected", o === opt));
    closePanel();
    updateResourcePreview(selectedRam);
  }

  trigger.addEventListener("click", () => {
    panel.classList.contains("open") ? closePanel() : openPanel();
  });

  options.forEach((opt) => {
    opt.addEventListener("click", () => choose(opt));
    opt.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        choose(opt);
      }
    });
  });

  document.addEventListener("click", (e) => {
    if (!wrap.contains(e.target)) closePanel();
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closePanel();
  });
}

function updateResourcePreview(ram) {
  const previewCard = document.getElementById("resourcePreviewCard");
  if (!ram) {
    previewCard.style.display = "none";
    return;
  }
  const lim = computeLimits(ram);
  document.getElementById("prevRam").textContent = lim.ramLabel;
  document.getElementById("prevCpu").textContent = lim.cpuLabel;
  document.getElementById("prevDisk").textContent = lim.diskLabel;
  previewCard.style.display = "block";
}

function resetCreateForm() {
  document.getElementById("createForm").reset();
  selectedRam = "";
  const triggerLabel = document.getElementById("ramTriggerLabel");
  triggerLabel.textContent = "-- Pilih RAM --";
  triggerLabel.classList.add("placeholder");
  document.querySelectorAll("#ramPanel .custom-select-option").forEach((o) => o.classList.remove("selected"));
  document.getElementById("resourcePreviewCard").style.display = "none";
}

function showCreateError(message) {
  document.getElementById("createErrorMsg").textContent = message;
  document.getElementById("createErrorCard").style.display = "block";
}
function hideCreateError() {
  document.getElementById("createErrorCard").style.display = "none";
}

// =====================================================================
// MODAL KONFIRMASI + LOADING
// =====================================================================
function setupConfirmModal() {
  document.getElementById("confirmCancelBtn").addEventListener("click", closeConfirmModal);
  document.getElementById("confirmSubmitBtn").addEventListener("click", submitCreatePanel);
}

function openConfirmModal(name, ram) {
  const lim = computeLimits(ram);
  document.getElementById("confirmName").textContent = name;
  document.getElementById("confirmRam").textContent = lim.ramLabel;
  document.getElementById("confirmCpu").textContent = lim.cpuLabel;
  document.getElementById("confirmDisk").textContent = lim.diskLabel;

  document.getElementById("confirmContent").style.display = "block";
  document.getElementById("loadingContent").style.display = "none";
  document.getElementById("confirmModal").classList.add("show");
}

function closeConfirmModal() {
  document.getElementById("confirmModal").classList.remove("show");
  PENDING_CREATE = null;
}

async function submitCreatePanel() {
  if (!PENDING_CREATE) return;
  const { name, ram } = PENDING_CREATE;

  document.getElementById("confirmContent").style.display = "none";
  document.getElementById("loadingContent").style.display = "block";
  document.getElementById("loadingStatusText").textContent = "Membuat panel...";

  const createBtn = document.getElementById("createBtn");
  createBtn.disabled = true;

  try {
    const res = await fetch("/api/panels/create", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, ram }),
    });
    const data = await res.json();

    if (!res.ok) {
      closeConfirmModal();
      const msg = data.error || "Gagal membuat panel. Silakan coba lagi.";
      showCreateError(msg);
      showToast(msg, "error");
      return;
    }

    const p = data.panel;
    LAST_SUCCESS = p;
    closeConfirmModal();
    resetCreateForm();
    openSuccessModal(p);
    showToast("Panel berhasil dibuat!", "success");

    await loadPanels();
    renderStats();
    renderTerbaru();
    renderRiwayat();
  } catch (err) {
    closeConfirmModal();
    const msg = "Tidak dapat terhubung ke server.";
    showCreateError(msg);
    showToast(msg, "error");
  } finally {
    createBtn.disabled = false;
    PENDING_CREATE = null;
  }
}

// =====================================================================
// MODAL SUKSES
// =====================================================================
const EYE_ICON = '<path d="M2 12s3.5-6.5 10-6.5S22 12 22 12s-3.5 6.5-10 6.5S2 12 2 12Z"/><circle cx="12" cy="12" r="2.7"/>';
const EYE_OFF_ICON = '<path d="M3 3l18 18"/><path d="M10.6 5.7A10.6 10.6 0 0 1 12 5.5c6.5 0 10 6.5 10 6.5a15.6 15.6 0 0 1-3.4 4.2M6.7 6.7C4 8.4 2 12 2 12s3.5 6.5 10 6.5c1.4 0 2.6-.3 3.7-.8"/><path d="M9.5 10a2.7 2.7 0 0 0 3.9 3.7"/>';

function setupSuccessModal() {
  document.getElementById("toggleSuccPass").addEventListener("click", () => {
    const el = document.getElementById("succPass");
    const eyeIcon = document.getElementById("succEyeIcon");
    const isHidden = el.dataset.hidden !== "false";
    el.textContent = isHidden ? (LAST_SUCCESS?.password || "") : "••••••••";
    el.dataset.hidden = isHidden ? "false" : "true";
    eyeIcon.innerHTML = isHidden ? EYE_OFF_ICON : EYE_ICON;
  });

  document.getElementById("succCopyBtn").addEventListener("click", () => {
    if (!LAST_SUCCESS) return;
    const lim = computeLimits(LAST_SUCCESS.ram);
    const text = [
      `Nama Panel: ${LAST_SUCCESS.name}`,
      `Username: ${LAST_SUCCESS.username}`,
      `Password: ${LAST_SUCCESS.password}`,
      `RAM: ${lim.ramLabel}`,
      `CPU: ${lim.cpuLabel}`,
      `Disk: ${lim.diskLabel}`,
      `Panel URL: ${LAST_SUCCESS.panel_url || "-"}`,
    ].join("\n");
    copyText(text);
  });

  document.getElementById("succCloseBtn").addEventListener("click", closeSuccessModal);
}

function openSuccessModal(p) {
  const lim = computeLimits(p.ram);
  document.getElementById("succName").textContent = p.name;
  document.getElementById("succUser").textContent = p.username;
  const passEl = document.getElementById("succPass");
  passEl.textContent = "••••••••";
  passEl.dataset.hidden = "true";
  document.getElementById("succEyeIcon").innerHTML = EYE_ICON;
  document.getElementById("succRam").textContent = lim.ramLabel;
  document.getElementById("succCpu").textContent = lim.cpuLabel;
  document.getElementById("succDisk").textContent = lim.diskLabel;

  const openBtn = document.getElementById("succOpenBtn");
  if (p.panel_url) {
    openBtn.href = p.panel_url;
    openBtn.style.display = "inline-flex";
  } else {
    openBtn.style.display = "none";
  }

  document.getElementById("successModal").classList.add("show");
}

function closeSuccessModal() {
  document.getElementById("successModal").classList.remove("show");
  // Password tidak disimpan permanen — bersihkan dari memori setelah modal ditutup.
  LAST_SUCCESS = null;
}

// =====================================================================
// RIWAYAT PANEL — search, filter, sort (client-side dari data /api/panels)
// =====================================================================
function setupRiwayatToolbar() {
  document.getElementById("riwayatSearch").addEventListener("input", renderRiwayat);
  document.getElementById("riwayatFilter").addEventListener("change", renderRiwayat);
  document.getElementById("riwayatSort").addEventListener("change", renderRiwayat);
}

function getFilteredPanels() {
  const search = document.getElementById("riwayatSearch").value.trim().toLowerCase();
  const filter = document.getElementById("riwayatFilter").value;
  const sort = document.getElementById("riwayatSort").value;

  let list = PANELS.slice();
  if (search) list = list.filter((p) => p.panel_name.toLowerCase().includes(search));
  if (filter) list = list.filter((p) => p.status === filter);

  list.sort((a, b) => {
    const diff = new Date(b.created_at) - new Date(a.created_at);
    return sort === "terlama" ? -diff : diff;
  });
  return list;
}

window.loadRiwayat = async function loadRiwayat() {
  if (!PANELS_LOADED) await loadPanels();
  renderRiwayat();
};

function renderRiwayat() {
  const body = document.getElementById("riwayatBody");
  const cardsWrap = document.getElementById("riwayatCards");
  const empty = document.getElementById("riwayatEmpty");
  const noMatch = document.getElementById("riwayatNoMatch");

  if (!PANELS.length) {
    body.innerHTML = "";
    cardsWrap.innerHTML = "";
    empty.style.display = "block";
    noMatch.style.display = "none";
    return;
  }
  empty.style.display = "none";

  const list = getFilteredPanels();
  if (!list.length) {
    body.innerHTML = "";
    cardsWrap.innerHTML = "";
    noMatch.style.display = "block";
    return;
  }
  noMatch.style.display = "none";

  body.innerHTML = list.map((p) => {
    const lim = computeLimits(p.ram);
    return `
      <tr>
        <td>${escapeHtml(p.panel_name)}</td>
        <td>${escapeHtml(lim.ramLabel)}</td>
        <td>${statusBadgeHtml(p.status)}</td>
        <td>${fmtDate(p.created_at)}</td>
        <td>
          <div style="display:flex; gap:6px; flex-wrap:wrap;">
            <button type="button" class="btn btn-secondary btn-sm" onclick="openDetailModal('${p.id}')">Detail</button>
            ${p.panel_url ? `<a class="btn btn-secondary btn-sm" href="${escapeHtml(p.panel_url)}" target="_blank" rel="noopener">Buka</a>` : ""}
          </div>
        </td>
      </tr>`;
  }).join("");

  cardsWrap.innerHTML = list.map((p) => {
    const lim = computeLimits(p.ram);
    return `
      <div class="panel-card">
        <div class="pc-top">
          <div class="pc-name">${escapeHtml(p.panel_name)}</div>
          ${statusBadgeHtml(p.status)}
        </div>
        <div class="pc-meta">${escapeHtml(lim.ramLabel)} · ${escapeHtml(lim.cpuLabel)} CPU · ${escapeHtml(lim.diskLabel)}</div>
        <div class="pc-date">Dibuat ${fmtDate(p.created_at)}</div>
        <div class="pc-actions">
          <button type="button" class="btn btn-secondary btn-sm" onclick="openDetailModal('${p.id}')">Detail</button>
          ${p.panel_url ? `<a class="btn btn-secondary btn-sm" href="${escapeHtml(p.panel_url)}" target="_blank" rel="noopener">Buka Panel</a>` : ""}
        </div>
      </div>`;
  }).join("");
}

// =====================================================================
// MODAL DETAIL PANEL
// =====================================================================
function setupDetailModal() {
  document.getElementById("detCloseBtn").addEventListener("click", () => {
    document.getElementById("detailModal").classList.remove("show");
  });
  document.getElementById("detCopyBtn").addEventListener("click", () => {
    const p = window._currentDetailPanel;
    if (!p) return;
    const lim = computeLimits(p.ram);
    const text = [
      `Nama Panel: ${p.panel_name}`,
      `Status: ${STATUS_BADGE_TEXT[p.status] || p.status}`,
      `RAM: ${lim.ramLabel}`,
      `CPU: ${lim.cpuLabel}`,
      `Disk: ${lim.diskLabel}`,
      `Dibuat: ${fmtDate(p.created_at)}`,
      `Panel URL: ${p.panel_url || "-"}`,
    ].join("\n");
    copyText(text);
  });
}

window.openDetailModal = function openDetailModal(id) {
  const p = PANELS.find((x) => x.id === id);
  if (!p) return;
  window._currentDetailPanel = p;

  const lim = computeLimits(p.ram);
  document.getElementById("detName").textContent = p.panel_name;
  document.getElementById("detStatus").innerHTML = statusBadgeHtml(p.status);
  document.getElementById("detRam").textContent = lim.ramLabel;
  document.getElementById("detCpu").textContent = lim.cpuLabel;
  document.getElementById("detDisk").textContent = lim.diskLabel;
  document.getElementById("detDate").textContent = fmtDate(p.created_at);

  const errMsg = document.getElementById("detErrorMsg");
  if (p.status === "failed" && p.error_message) {
    errMsg.textContent = p.error_message;
    errMsg.style.display = "block";
  } else {
    errMsg.style.display = "none";
  }

  const openBtn = document.getElementById("detOpenBtn");
  if (p.panel_url) {
    openBtn.href = p.panel_url;
    openBtn.style.display = "inline-flex";
  } else {
    openBtn.style.display = "none";
  }

  document.getElementById("detailModal").classList.add("show");
};
