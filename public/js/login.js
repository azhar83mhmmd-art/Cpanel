const form = document.getElementById("loginForm");
const errorBox = document.getElementById("errorBox");
const errorText = document.getElementById("errorText");
const submitBtn = document.getElementById("submitBtn");
const submitText = document.getElementById("submitText");
const togglePass = document.getElementById("togglePass");
const eyeIcon = document.getElementById("eyeIcon");
const passInput = document.getElementById("password");

const EYE = '<path d="M2 12s3.5-6.5 10-6.5S22 12 22 12s-3.5 6.5-10 6.5S2 12 2 12Z"/><circle cx="12" cy="12" r="2.7"/>';
const EYE_OFF = '<path d="M3 3l18 18"/><path d="M10.6 5.7A10.6 10.6 0 0 1 12 5.5c6.5 0 10 6.5 10 6.5a15.6 15.6 0 0 1-3.4 4.2M6.7 6.7C4 8.4 2 12 2 12s3.5 6.5 10 6.5c1.4 0 2.6-.3 3.7-.8"/><path d="M9.5 10a2.7 2.7 0 0 0 3.9 3.7"/>';

togglePass.addEventListener("click", () => {
  const isPass = passInput.type === "password";
  passInput.type = isPass ? "text" : "password";
  eyeIcon.innerHTML = isPass ? EYE_OFF : EYE;
  togglePass.setAttribute("aria-label", isPass ? "Sembunyikan password" : "Tampilkan password");
});

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  errorBox.classList.remove("show");
  submitBtn.disabled = true;
  submitText.textContent = "MEMPROSES...";

  const usernameInput = document.getElementById("username");
  const username = usernameInput.value.trim();
  const password = passInput.value;

  // Jangan mengosongkan input saat request gagal. Nilai tetap tersedia agar
  // user cukup memperbaiki kesalahan tanpa mengetik ulang.
  submitBtn.setAttribute("aria-busy", "true");

  try {
    const res = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password }),
    });
    const data = await res.json();

    if (!res.ok) {
      errorText.textContent = data.error || "Login gagal.";
      errorBox.classList.add("show");
      submitBtn.disabled = false;
      submitBtn.setAttribute("aria-busy", "false");
      submitText.textContent = "MASUK";
      return;
    }

    // Kredensial tidak pernah disimpan ke localStorage/sessionStorage.
    // Setelah login sukses, biarkan browser berpindah ke halaman tujuan.
    submitBtn.setAttribute("aria-busy", "false");
    window.location.replace(data.redirect);
  } catch (err) {
    errorText.textContent = "Tidak dapat terhubung ke server.";
    errorBox.classList.add("show");
    submitBtn.disabled = false;
    submitBtn.setAttribute("aria-busy", "false");
    submitText.textContent = "MASUK";
  }
});
