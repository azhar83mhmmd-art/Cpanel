const WA_ADMIN_NUMBER = "6282357961890"; // 082357961890 dalam format internasional

const waModal = document.getElementById("waModal");
const openWaRequest = document.getElementById("openWaRequest");
const cancelWaRequest = document.getElementById("cancelWaRequest");
const waForm = document.getElementById("waForm");

openWaRequest.addEventListener("click", (e) => {
  e.preventDefault();
  waModal.classList.add("show");
});

cancelWaRequest.addEventListener("click", () => {
  waModal.classList.remove("show");
});

waModal.addEventListener("click", (e) => {
  if (e.target === waModal) waModal.classList.remove("show");
});

waForm.addEventListener("submit", (e) => {
  e.preventDefault();

  const nama = document.getElementById("waName").value.trim();
  const username = document.getElementById("waUsername").value.trim();
  const role = document.getElementById("waRole").value;
  const waktu = formatWIB();

  const message = `🔐 PERMINTAAN AKSES LOGIN WEB

Halo Admin,

Saya ingin mengajukan permintaan akses untuk dapat login ke website Pterodactyl Panel Manager.

📋 Detail Permintaan
• Nama: ${nama}
• Username yang diinginkan: ${username}
• Role: ${role}
• Waktu Pengajuan: ${waktu}
• Status: Menunggu Persetujuan

Saya memahami bahwa akses akan diberikan sesuai dengan role yang ditentukan oleh Admin dan saya bersedia mengikuti seluruh ketentuan penggunaan website.

Mohon Admin dapat memeriksa dan memberikan akses apabila permintaan saya disetujui.

Terima kasih atas perhatian dan waktunya.

━━━━━━━━━━━━━━━━━━
Pterodactyl Panel Manager`;

  const url = `https://wa.me/${WA_ADMIN_NUMBER}?text=${encodeURIComponent(message)}`;
  window.open(url, "_blank");
  waModal.classList.remove("show");
  waForm.reset();
});
