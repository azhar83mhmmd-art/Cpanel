// Seluruh komunikasi ke Pterodactyl Application API terpusat di sini.
// Frontend TIDAK PERNAH menyentuh credential PTLA/PTLC.
// Domain/PTLA/PTLC dibaca real-time dari utils/settings.js.

const axios = require("axios");
const settings = require("../utils/settings");

async function client() {
  const cfg = await settings.getConfig();
  if (!cfg.domain || !cfg.ptla) {
    const err = new Error("Domain / PTLA Pterodactyl belum diatur.");
    err.code = "PTERODACTYL_NOT_CONFIGURED";
    throw err;
  }
  let domain = String(cfg.domain || '').trim().replace(/\/+$/, '');
  if (!/^https?:\/\//i.test(domain)) {
    const err = new Error('Domain Pterodactyl harus diawali http:// atau https://.');
    err.code = 'PTERODACTYL_INVALID_DOMAIN';
    throw err;
  }
  return axios.create({
    baseURL: `${domain}/api/application`, 
    headers: {
      Authorization: `Bearer ${cfg.ptla}`,
      "Content-Type": "application/json",
      Accept: "Application/vnd.pterodactyl.v1+json",
    },
    timeout: 20000,
  });
}

async function getDomain() {
  return (await settings.getConfig()).domain;
}

function ramToLimits(ram) {
  if (ram === "unlimited") {
    return { memory: 0, disk: 0, cpu: 0, swap: 0, io: 500 };
  }
  const gb = parseInt(ram, 10);
  return {
    memory: gb * 1024,
    disk: gb * 1024,
    cpu: gb * 40,
    swap: 0,
    io: 500,
  };
}

async function testConnection() {
  const res = await (await client()).get("/nodes");
  return res.status === 200;
}

async function createUser({ username, email, password }) {
  const res = await (await client()).post("/users", {
    username,
    email,
    first_name: username,
    last_name: "Panel",
    password,
  });
  return res.data.attributes;
}

// Ambil Nest/Egg/Location yang benar dari panel jika ID di .env tidak valid.
// Ini membuat auto-create tetap bekerja setelah admin hanya mengisi Domain + PTLA.
async function resolveResources() {
  const api = await client();

  let nestId = null;
  let nests;
  try {
    const nestRes = await api.get("/nests", { params: { per_page: 100 } });
    nests = nestRes.data.data || [];
  } catch (err) {
    throw err;
  }

  if (!nests.length) throw new Error("Pterodactyl tidak memiliki Nest.");

  // Pilih Nest pertama yang memiliki Egg yang benar-benar dapat dipakai.
  // Sebelumnya kode selalu mengambil Egg pertama dari Nest pertama, yang sering
  // membuat create server gagal pada panel yang memiliki beberapa Nest/Egg.
  let selected = null;
  for (const nest of nests) {
    const id = Number(nest.attributes.id);
    try {
      const eggRes = await api.get(`/nests/${id}/eggs`, {
        params: { include: "variables", per_page: 100 },
      });
      const eggs = eggRes.data.data || [];
      const egg = eggs.find((item) => {
        const a = item.attributes || {};
        return !!a.docker_image && !!a.startup;
      });
      if (egg) {
        selected = { nestId: id, nest, egg };
        break;
      }
    } catch (_) {
      // Lanjut ke Nest berikutnya. Error final akan diberikan jika tidak ada Egg valid.
    }
  }

  if (!selected) {
    throw new Error("Tidak ditemukan Nest/Egg Pterodactyl yang memiliki Docker Image dan Startup yang valid.");
  }

  nestId = selected.nestId;
  const egg = selected.egg;

  const locationRes = await api.get("/locations", { params: { per_page: 100 } });
  const locations = locationRes.data.data || [];
  let location = locations[0];
  if (!location) throw new Error("Pterodactyl tidak memiliki Location.");

  const eggAttr = egg.attributes;
  const variables = Array.isArray(eggAttr.relationships?.variables?.data)
    ? eggAttr.relationships.variables.data
    : [];

  // Environment default diambil otomatis dari Egg. Tidak membutuhkan konfigurasi Nest/Egg/Location manual.
  const environment = {};
  for (const item of variables) {
    const v = item.attributes || {};
    if (v.env_variable) {
      // Pterodactyl mengharapkan seluruh variabel Egg dikirim. Gunakan default
      // Egg bila tersedia; string kosong tetap dikirim agar validasi API konsisten.
      environment[v.env_variable] = v.default_value ?? "";
    }
  }
  return {
    nestId,
    eggId: Number(eggAttr.id),
    locationId: Number(location.attributes.id),
    dockerImage: process.env.PTERODACTYL_DOCKER_IMAGE || eggAttr.docker_image,
    startup: process.env.PTERODACTYL_STARTUP || eggAttr.startup,
    environment,
    nestName: nests.find((n) => Number(n.attributes.id) === nestId)?.attributes.name,
    eggName: eggAttr.name,
    locationName: location.attributes.short || location.attributes.long || location.attributes.name,
  };
}

async function createServer({ name, userId, ram }) {
  const limits = ramToLimits(ram);
  const resources = await resolveResources();

  const payload = {
    name,
    user: userId,
    nest: resources.nestId,
    egg: resources.eggId,
    docker_image: resources.dockerImage,
    startup: resources.startup,
    environment: resources.environment,
    limits: {
      memory: limits.memory,
      swap: limits.swap,
      disk: limits.disk,
      io: limits.io,
      cpu: limits.cpu,
    },
    feature_limits: { databases: 1, backups: 1, allocations: 1 },
    deploy: {
      locations: [resources.locationId],
      dedicated_ip: false,
      port_range: [],
    },
    start_on_completion: true,
  };

  if (!payload.docker_image || !payload.startup) {
    const err = new Error("Docker image atau startup Egg belum tersedia.");
    err.code = "PTERODACTYL_EGG_CONFIG_INVALID";
    throw err;
  }

  try {
    const res = await (await client()).post("/servers", payload);
    return res.data.attributes;
  } catch (err) {
    // Simpan konteks agar server.js bisa menampilkan penyebab 422 dari Pterodactyl.
    err.pteroResources = resources;
    throw err;
  }
}

module.exports = { testConnection, createUser, createServer, ramToLimits, getDomain, resolveResources };
