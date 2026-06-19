function json(res, status, payload){
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
  return res.status(status).json(payload);
}

function getEnv(){
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;
  const password = process.env.ADMIN_PASSWORD;

  if(!url || !key){
    throw new Error("Chybí SUPABASE_URL nebo SUPABASE_SECRET_KEY ve Vercelu.");
  }

  return {
    url: url.replace(/\/$/, ""),
    key,
    password
  };
}

function isAuthorized(req, adminPassword){
  if(!adminPassword) return false;

  const headerPassword = req.headers["x-admin-password"];
  if(headerPassword && String(headerPassword) === String(adminPassword)) return true;

  const bodyPassword = getBody(req)?.password;
  if(bodyPassword && String(bodyPassword) === String(adminPassword)) return true;

  return false;
}

function sanitizeText(value, max = 3000){
  if(value === undefined || value === null) return "";
  return String(value).trim().slice(0, max);
}

function toBool(value){
  if(value === true) return true;
  if(value === false) return false;
  const normalized = String(value ?? "").toLowerCase().trim();
  return normalized === "true" || normalized === "1" || normalized === "ano" || normalized === "on";
}


function getBody(req){
  if(!req.body) return {};

  if(typeof req.body === "string"){
    try{
      return JSON.parse(req.body);
    }catch{
      return {};
    }
  }

  return req.body;
}

function normalizeReference(input = {}){
  return {
    name: sanitizeText(input.name, 120),
    location: sanitizeText(input.location, 160),
    category: sanitizeText(input.category, 160),
    review: sanitizeText(input.review, 3000),
    visible: input.visible === undefined ? true : toBool(input.visible)
  };
}

function validateReference(data){
  const errors = [];
  if(!data.name) errors.push("Vyplňte jméno klienta.");
  if(!data.category) errors.push("Vyplňte typ zakázky.");
  if(!data.review) errors.push("Vyplňte text reference.");
  return errors;
}

async function supabaseRequest(path, options = {}){
  const { url, key } = getEnv();

  const response = await fetch(`${url}/rest/v1/${path}`, {
    ...options,
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
      Prefer: "return=representation",
      ...(options.headers || {})
    }
  });

  const text = await response.text();
  let data = null;

  try{
    data = text ? JSON.parse(text) : null;
  }catch{
    data = text;
  }

  if(!response.ok){
    const message = typeof data === "object" && data?.message ? data.message : `Supabase chyba ${response.status}`;
    throw new Error(message);
  }

  return data;
}

export default async function handler(req, res){
  try{
    const { password } = getEnv();

    if(req.method === "GET"){
      const admin = isAuthorized(req, password);
      const query = admin
        ? "references?select=id,name,location,category,review,visible,created_at&order=created_at.desc.nullslast,id.desc"
        : "references?select=id,name,location,category,review,visible,created_at&visible=eq.true&order=created_at.desc.nullslast,id.desc";

      const data = await supabaseRequest(query, { method: "GET" });
      return json(res, 200, { ok: true, items: data || [] });
    }

    if(req.method === "POST"){
      if(!isAuthorized(req, password)){
        return json(res, 401, { ok: false, message: "Neplatné heslo." });
      }

      const body = getBody(req);
      const item = normalizeReference(body);
      const errors = validateReference(item);

      if(errors.length){
        return json(res, 400, { ok: false, message: errors.join(" ") });
      }

      const data = await supabaseRequest("references", {
        method: "POST",
        body: JSON.stringify({
          ...item,
          created_at: new Date().toISOString()
        })
      });

      return json(res, 200, { ok: true, item: Array.isArray(data) ? data[0] : data });
    }

    if(req.method === "PUT"){
      if(!isAuthorized(req, password)){
        return json(res, 401, { ok: false, message: "Neplatné heslo." });
      }

      const body = getBody(req);
      const id = Number(body?.id);
      if(!id){
        return json(res, 400, { ok: false, message: "Chybí ID reference." });
      }

      const item = normalizeReference(body);
      const errors = validateReference(item);

      if(errors.length){
        return json(res, 400, { ok: false, message: errors.join(" ") });
      }

      const data = await supabaseRequest(`references?id=eq.${encodeURIComponent(id)}`, {
        method: "PATCH",
        body: JSON.stringify(item)
      });

      return json(res, 200, { ok: true, item: Array.isArray(data) ? data[0] : data });
    }

    if(req.method === "DELETE"){
      if(!isAuthorized(req, password)){
        return json(res, 401, { ok: false, message: "Neplatné heslo." });
      }

      const body = getBody(req);
      const id = Number(body?.id || req.query?.id);
      if(!id){
        return json(res, 400, { ok: false, message: "Chybí ID reference." });
      }

      await supabaseRequest(`references?id=eq.${encodeURIComponent(id)}`, {
        method: "DELETE"
      });

      return json(res, 200, { ok: true });
    }

    res.setHeader("Allow", "GET, POST, PUT, DELETE");
    return json(res, 405, { ok: false, message: "Metoda není povolena." });
  }catch(error){
    return json(res, 500, {
      ok: false,
      message: "Reference se nepodařilo zpracovat.",
      detail: error.message
    });
  }
}
