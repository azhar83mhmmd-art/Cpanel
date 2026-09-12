// Semua komunikasi Pterodactyl Application API terpusat di sini.
// Credential PTLA/PTLC tidak pernah dikirim ke browser.
const axios = require("axios");
const settings = require("../utils/settings");

let resourceCache = null;
let resourceCacheAt = 0;
const RESOURCE_CACHE_MS = 5 * 60 * 1000;

function normalizeApiError(err) {
  const status = err?.response?.status;
  const details = Array.isArray(err?.response?.data?.errors)
    ? err.response.data.errors.map((e) => {
        const field = Array.isArray(e.source?.field) ? e.source.field.join('.') : (e.source?.field || '');
        const text = e.detail || e.code || 'Request ditolak';
        return field ? `${field}: ${text}` : text;
      }).filter(Boolean)
    : [];
  err.pteroDetail = details.join(" | ") || err?.response?.data?.message || err?.message || "Request gagal.";
  err.pteroStatus = status || null;
  return err;
}

async function client() {
  const cfg = await settings.getConfig();
  if (!cfg.domain || !cfg.ptla) {
    const err = new Error("Domain / PTLA Pterodactyl belum diatur.");
    err.code = "PTERODACTYL_NOT_CONFIGURED";
    throw err;
  }

  const domain = String(cfg.domain).trim().replace(/\/+$/, "");
  if (!/^https?:\/\//i.test(domain)) {
    const err = new Error("Domain Pterodactyl harus diawali http:// atau https://.");
    err.code = "PTERODACTYL_INVALID_DOMAIN";
    throw err;
  }

  return axios.create({
    baseURL: `${domain}/api/application`,
    headers: {
      Authorization: `Bearer ${cfg.ptla}`,
      "Content-Type": "application/json",
      Accept: "Application/vnd.pterodactyl.v1+json",
    },
    // Shorter timeouts prevent a Vercel function from hanging until the
    // platform kills it. The frontend receives a useful timeout error instead.
    timeout: Number(process.env.PTERODACTYL_TIMEOUT_MS || 10000),
    validateStatus: (status) => status >= 200 && status < 300,
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
  if (!Number.isFinite(gb) || gb < 1) throw new Error("RAM tidak valid.");
  return {
    memory: gb * 1024,
    disk: gb * 1024,
    cpu: gb * 40,
    swap: 0,
    io: 500,
  };
}

function clearResourceCache() {
  resourceCache = null;
  resourceCacheAt = 0;
}

async function testConnection() {
  try {
    const api = await client();
    const res = await api.get("/nodes", { params: { per_page: 1 } });
    return res.status === 200;
  } catch (err) {
    throw normalizeApiError(err);
  }
}

async function createUser({ username, email, password }) {
  try {
    const res = await (await client()).post("/users", {
      username,
      email,
      first_name: username,
      last_name: "Panel",
      password,
    });
    return res.data.attributes;
  } catch (err) {
    throw normalizeApiError(err);
  }
}

async function deleteUser(userId) {
  try {
    await (await client()).delete(`/users/${userId}`);
    return true;
  } catch (err) {
    // Cleanup is best-effort. The original create error is more important.
    return false;
  }
}

async function resolveResources({ force = false } = {}) {
  if (!force && resourceCache && (Date.now() - resourceCacheAt) < RESOURCE_CACHE_MS) {
    return resourceCache;
  }

  const api = await client();
  try {
    // One request gets all nests instead of requesting every nest's eggs one by one.
    const [nestsRes, locationsRes] = await Promise.all([
      api.get("/nests", { params: { include: "eggs", per_page: 100 } }),
      api.get("/locations", { params: { per_page: 100 } }),
    ]);

    const nests = nestsRes.data.data || [];
    const locations = locationsRes.data.data || [];
    if (!nests.length) throw new Error("Pterodactyl tidak memiliki Nest.");
    if (!locations.length) throw new Error("Pterodactyl tidak memiliki Location.");

    let selected = null;
    for (const nest of nests) {
      const eggs = nest.attributes?.relationships?.eggs?.data || [];
      const egg = eggs.find((item) => {
        const a = item.attributes || {};
        return !!a.docker_image && !!a.startup;
      });
      if (egg) {
        selected = { nest, egg };
        break;
      }
    }

    // Some Pterodactyl versions do not expose nested egg attributes in the
    // nests response. Fall back to a bounded concurrent search.
    if (!selected) {
      const candidates = nests.slice(0, 20);
      const results = await Promise.allSettled(candidates.map(async (nest) => {
        const id = Number(nest.attributes.id);
        const response = await api.get(`/nests/${id}/eggs`, {
          params: { include: "variables", per_page: 100 },
        });
        return { nest, eggs: response.data.data || [] };
      }));
      for (const result of results) {
        if (result.status !== "fulfilled") continue;
        const egg = result.value.eggs.find((item) => {
          const a = item.attributes || {};
          return !!a.docker_image && !!a.startup;
        });
        if (egg) {
          selected = { nest: result.value.nest, egg };
          break;
        }
      }
    }

    if (!selected) {
      throw new Error("Tidak ditemukan Nest/Egg Pterodactyl yang memiliki Docker Image dan Startup yang valid.");
    }

    const nestId = Number(selected.nest.attributes.id);
    const eggId = Number(selected.egg.attributes.id);
    let egg = selected.egg;

    // Fetch the selected egg with variables explicitly. This avoids sending an
    // incomplete environment object on panels where nests?include=eggs omits it.
    try {
      const eggRes = await api.get(`/nests/${nestId}/eggs/${eggId}`, {
        params: { include: "variables" },
      });
      egg = eggRes.data;
    } catch (_) {
      // The egg from the first response is still usable if it already contains variables.
    }

    const eggAttr = egg.attributes || {};
    const variables = Array.isArray(eggAttr.relationships?.variables?.data)
      ? eggAttr.relationships.variables.data
      : [];
    const environment = {};
    for (const item of variables) {
      const v = item.attributes || {};
      if (v.env_variable) environment[v.env_variable] = v.default_value ?? "";
    }

    const result = {
      nestId,
      eggId,
      locationId: Number(locations[0].attributes.id),
      dockerImage: process.env.PTERODACTYL_DOCKER_IMAGE || eggAttr.docker_image,
      startup: process.env.PTERODACTYL_STARTUP || eggAttr.startup,
      environment,
      nestName: selected.nest.attributes.name,
      eggName: eggAttr.name,
      locationName: locations[0].attributes.short || locations[0].attributes.long || locations[0].attributes.name,
    };

    if (!result.dockerImage || !result.startup) {
      const err = new Error("Docker image atau startup Egg belum tersedia.");
      err.code = "PTERODACTYL_EGG_CONFIG_INVALID";
      throw err;
    }

    resourceCache = result;
    resourceCacheAt = Date.now();
    return result;
  } catch (err) {
    throw normalizeApiError(err);
  }
}

async function findServer({ userId, name }) {
  try {
    const api = await client();
    const params = { per_page: 50 };
    if (userId) params["filter[user]"] = String(userId);
    if (name) params["filter[name]"] = String(name);
    const res = await api.get("/servers", { params });
    const rows = res.data.data || [];
    return rows.map((item) => item.attributes).filter(Boolean);
  } catch (err) {
    throw normalizeApiError(err);
  }
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

  try {
    const res = await (await client()).post("/servers", payload);
    return res.data.attributes;
  } catch (err) {
    err.pteroResources = resources;
    throw normalizeApiError(err);
  }
}

module.exports = {
  testConnection,
  createUser,
  deleteUser,
  createServer,
  findServer,
  ramToLimits,
  getDomain,
  resolveResources,
  clearResourceCache,
};
