// /api/decap-auth/callback → exchange code→token, deliver to parent
export async function onRequest({ request, env }) {
  const url = new URL(request.url);
  const clientId = env.GITHUB_CLIENT_ID;
  const clientSecret = env.GITHUB_CLIENT_SECRET;
  if (!clientId || !clientSecret) return miniHtml("Missing GITHUB_CLIENT_ID/SECRET", true);

  const code = url.searchParams.get("code") || "";
  const returned = url.searchParams.get("state") || "";
  const cookie = (request.headers.get("Cookie")||"").split(";").map(s=>s.trim()).find(s=>s.startsWith("decap_state="));
  const saved = cookie ? cookie.split("=")[1] : "";
  if (!code) return miniHtml("Missing ?code", true);

  if (!saved || saved !== returned) {
    const h = new Headers({ "content-type": "text/html; charset=utf-8" });
    h.append("Set-Cookie", "decap_state=; Path=/api/decap-auth; Max-Age=0; Secure; HttpOnly; SameSite=Lax");
    return new Response(`<!doctype html><p>Invalid OAuth state</p>`, { status: 400, headers: h });
  }

  const targetBase = (env.OAUTH_REDIRECT_BASE || url.origin).replace(/\/$/, "");
  const res = await fetch("https://github.com/login/oauth/access_token", {
    method: "POST",
    headers: { Accept: "application/json" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      code,
      redirect_uri: `${targetBase}/api/decap-auth/callback`,
      state: returned,
    }),
  });

  const h = new Headers({ "content-type": "text/html; charset=utf-8" });
  h.append("Set-Cookie", "decap_state=; Path=/api/decap-auth; Max-Age=0; Secure; HttpOnly; SameSite=Lax");

  if (!res.ok) {
    const t = await res.text();
    return new Response(`<!doctype html><p>Token exchange failed: ${t}</p>`, { status: 502, headers: h });
  }
  const data = await res.json();
  const token = data.access_token;
  const err = data.error_description || data.error;
  if (!token) return new Response(`<!doctype html><p>OAuth error: ${err || "No access_token"}</p>`, { status: 400, headers: h });

  // ✅ Robust delivery: write to localStorage *and* postMessage, then close.
  const payload = `authorization:github:success:${JSON.stringify({ token })}`;
  return new Response(`<!doctype html><meta charset="utf-8"><title>Decap OAuth</title>
<body>
<script>
try {
  // 1) Persist for the parent via same-origin storage
  var u = { token: ${JSON.stringify(token)} };
  try {
    localStorage.setItem('decap-cms-user', JSON.stringify(u));
    localStorage.setItem('netlify-cms-user', JSON.stringify(u));
  } catch (e) {}

  // 2) Also postMessage (Decap’s built-in listener)
  var msg = ${JSON.stringify(payload)};
  try { window.opener && window.opener.postMessage(msg, "*"); } catch (e) {}

  // 3) Give parent a tick, then close
  setTimeout(function(){ window.close(); }, 300);
} catch (e) {
  document.body.innerText = "Login complete. You can close this window.";
  var a=document.createElement('a'); a.href='/admin/'; a.innerText='Back to admin';
  document.body.appendChild(document.createElement('br')); document.body.appendChild(a);
}
</script>
</body>`, { headers: h });
}

function miniHtml(m){ return new Response(`<!doctype html><p>${m}</p>`, { headers:{ "content-type":"text/html; charset=utf-8" } }); }
