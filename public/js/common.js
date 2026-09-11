function showToast(message, type = "success") {
  const wrap = document.getElementById("toastWrap");
  if (!wrap) return;
  const el = document.createElement("div");
  el.className = `toast ${type}`;
  el.textContent = message;
  wrap.appendChild(el);
  setTimeout(() => el.remove(), 3500);
}

async function fetchMe() {
  const res = await fetch("/api/auth/me");
  if (!res.ok) {
    window.location.href = "/login";
    return null;
  }
  return res.json();
}

function setupLogout() {
  const btn = document.getElementById("logoutBtn");
  if (!btn) return;
  btn.addEventListener("click", async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    window.location.href = "/login";
  });
}

function setupHamburger() {
  const hb = document.getElementById("hamburger");
  const sidebar = document.getElementById("sidebar");
  if (!hb || !sidebar) return;
  hb.addEventListener("click", () => sidebar.classList.toggle("open"));
}

function setupTabs() {
  const tabBtns = document.querySelectorAll(".tab-btn");
  const navLinks = document.querySelectorAll(".nav-link[data-tab]");

  function activate(tab) {
    document.querySelectorAll(".tab-btn").forEach((b) => b.classList.toggle("active", b.dataset.tab === tab));
    document.querySelectorAll(".nav-link[data-tab]").forEach((b) => b.classList.toggle("active", b.dataset.tab === tab));
    document.querySelectorAll(".tab-panel").forEach((p) => p.classList.toggle("active", p.id === `tab-${tab}`));
    if (tab === "riwayat" && typeof window.loadRiwayat === "function") window.loadRiwayat();
  }

  tabBtns.forEach((b) => b.addEventListener("click", () => activate(b.dataset.tab)));
  navLinks.forEach((b) => b.addEventListener("click", () => activate(b.dataset.tab)));
}

function copyText(text) {
  navigator.clipboard.writeText(text);
  showToast("Disalin ke clipboard", "success");
}

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, (m) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[m]));
}

function fmtDate(iso) {
  const d = new Date(iso);
  return d.toLocaleString("id-ID", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

// Format "10 September 2026, 10:43:42 WIB" — dipakai untuk pesan WhatsApp
function formatWIB(date = new Date()) {
  const months = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Jakarta",
    year: "numeric", month: "numeric", day: "numeric",
    hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false,
  }).formatToParts(date);
  const get = (type) => parts.find((p) => p.type === type).value;
  const day = get("day");
  const month = months[parseInt(get("month"), 10) - 1];
  const year = get("year");
  let hour = get("hour");
  if (hour === "24") hour = "00";
  const minute = get("minute");
  const second = get("second");
  return `${day} ${month} ${year}, ${hour}:${minute}:${second} WIB`;
}

setupLogout();
setupHamburger();
