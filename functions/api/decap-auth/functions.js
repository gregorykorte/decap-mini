// Decap ↔ GitHub OAuth (Cloudflare Pages Functions)
// Works on a single normalized host defined by OAUTH_REDIRECT_BASE
// Env: GITHUB_CLIENT_ID, GITHUB_CLIENT_SECRET, OAUTH_REDIRECT_BASE, OAUTH_SCOPE

export async function onRequest(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const basePath = "/api/decap-auth";
  const sub = url.pathname.slice(basePath.length) || "/";

  try {
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders(request) });
    }
    if (sub === "/auth")   return authHandler(request, url, env);
    if (sub === "/callback") return callbackHandler(request, url, env);
    if (sub === "/" || sub === "") return new Response("OK", { headers: { "content-type": "text/plain" } });
    return new Response("Not found", { status: 404 });
  } catch (e) {
    console.error("decap-auth error:", e);
    return new Response("Internal error: " + (e?.message || String(e)), { status: 500, headers: { "content-type": "text/plain; charset=utf-8" } });
  }
}

function corsHeaders(req) {
  const origin = req.headers.get("Origin") || "*";
  return {
    "Access-Control-Allow-Origin": origin,
    Vary: "Origin",
    "Access-Control-Allow-Methods": "GET,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type,Authorization",
  };
}

function randState() {
  const a = new Uint8Array(16);
  crypto.getRandomValues(a);
  return Array.from(a, b => b.toString(16).padStart(2, "0")).join("");
}

function getCookie(req, name) {
  const str = req.headers.get("Cookie") || "";
  for (const part of str.split(";")) {
    const [k, ...rest] = part.trim().split("=");
    if (k === name) return rest.join("=");
  }
  return "";
}

function setCookie(name, value, opts = {}) {
  const { path = "/api/decap-auth", maxAge, sameSite = "Lax", httpOnly = true, secure = true } = opts;
  const bits = [`${name}=${value}`, `Path=${path}`, `SameSite=${sameSite}`];
  if (secure) bits.push("Secure");
  if (httpOnly) bits.push("HttpOnly");
  if (typeof maxAge === "number") bits.push(`Max-Age=${maxAge}`);
  return bits.join("; ");
}
function clearCookie(name) {
  return `${name}=; Path=/api/decap-auth; Max-Age=0; Secure; HttpOnly; SameSite=Lax`;
}

async function authHandler(request, url, env) {
  const clientId = env.GITHUB_CLIENT_ID;
  if (!clientId) return new Response("Missing GITHUB_CLIENT_ID", { status: 500 });

  const targetBase = (env.OAUTH_REDIRECT_BASE || url.origin).replace(/\/$/, "");
  // Normalize: if called on a different host, bounce first (no cookie yet)
  if (url.origin !== targetBase) {
    const bounce = new URL(`${targetBase}/api/decap-auth/auth`);
    for (const [k, v] of url.searchParams) bounce.searchParams.set(k, v);
    return new Response(null, { status: 302, headers: { Location: bounce.toString(), ...corsHeaders(request) } });
  }

  const state = randState();
  const gh = new URL("https://github.com/login/oauth/authorize");
  gh.searchParams.set("client_id", clientId);
  gh.searchParams.set("redirect_uri", `${targetBase}/api/decap-auth/callback`);
  gh.searchParams.set("scope", env.OAUTH_SCOPE || "public_repo");
  gh.searchParams.set("state", state);
  gh.searchParams.set("allow_signup", "false");

  // IMPORTANT: set the cookie on the same 302 response that redirects to GitHub
  const headers = new Headers({ Location: gh.toString(), ...corsHeaders(request) });
  headers.append("Set-Cookie", setCookie("decap_state", state, { maxAge: 300 }));
  return new Response(null, { status: 302, headers });
}

async function callbackHandler(request, url, env) {
  const clientId = env.GITHUB_CLIENT_ID;
  const clientSecret = env.GITHUB_CLIENT_SECRET;
  if (!clientId || !clientSecret) return miniHtml("Missing GITHUB_CLIENT_ID/SECRET", true);

  const code = url.searchParams.get("code") || "";
  const returnedState = url.searchParams.get("state") || "";
  const savedState = getCookie(request, "decap_state") || "";
  if (!code) return miniHtml("Missing ?code", true);
  if (!savedState || savedState !== returnedState) {
    const headers = new Headers({ "content-type": "text/html; charset=utf-8" });
    headers.append("Set-Cookie", clearCookie("decap_state"));
    return new Response(htmlError("Invalid OAuth state"), { status: 400, headers });
  }

  const targetBase = (env.OAUTH_REDIRECT_BASE || url.origin).replace(/\/$/, "");
  const tokenRes = await fetch("https://github.com/login/oauth/access_token", {
    method: "POST",
    headers: { Accept: "application/json" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      code,
      redirect_uri: `${targetBase}/api/decap-auth/callback`,
      state: returnedState,
    }),
  });

  const headers = new Headers({ "content-type": "text/html; charset=utf-8" });
  headers.append("Set-Cookie", clearCookie("decap_state"));

  if (!tokenRes.ok) {
    const t = await tokenRes.text();
    return new Response(htmlError("Token exchange failed: " + t), { status: 502, headers });
  }

  const data = await tokenRes.json();
  const token = data.access_token;
  const err = data.error_description || data.error;
  if (!token) {
    return new Response(htmlError("OAuth error: " + (err || "No access_token")), { status: 400, headers });
  }

  const payload = `authorization:github:success:${JSON.stringify({ token })}`;
  return new Response(htmlPostMessage(payload), { status: 200, headers });
}

function htmlError(message) {
  const esc = s => String(s).replace(/[<>&'"]/g, c => ({'<':'&lt;','>':'&gt;','&':'&amp;',"'":'&#39;'}[c]));
  return `<!doctype html><meta charset="utf-8"><title>Decap OAuth Error</title>
<body>
<p>${esc(message)}</p>
<p><a href="/admin/">Back to admin</a></p>
<script>try{window.opener&&window.opener.postMessage("authorization:github:error:${esc(message)}","*")}catch(e){}</script>
</body>`;
}
function htmlPostMessage(payload) {
  return `<!doctype html><meta charset="utf-8"><title>Decap OAuth</title>
<body>
<script>
  try {
    window.opener && window.opener.postMessage(${JSON.stringify(payload)}, "*");
    setTimeout(() => window.close(), 300);
  } catch (e) {
    document.body.innerText = "Login complete. You can close this window.";
    var a=document.createElement('a'); a.href='/admin/'; a.innerText='Back to admin';
    document.body.appendChild(document.createElement('br')); document.body.appendChild(a);
  }
</script>
</body>`;
}
