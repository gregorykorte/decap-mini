// /api/decap-auth/callback → exchange code→token, postMessage it back
export async function onRequest({ request, env }) {
  const url = new URL(request.url);
  const clientId = env.GITHUB_CLIENT_ID;
  const clientSecret = env.GITHUB_CLIENT_SECRET;
  if (!clientId || !clientSecret) return miniHtml("Missing GITHUB_CLIENT_ID/SECRET", true);

  const code = url.searchParams.get("code") || "";
  const returned = url.searchParams.get("state") || "";
  const saved = getCookie(request, "decap_state") || "";
  if (!code) return miniHtml("Missing ?code", true);

  if (!saved || saved !== returned) {
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
      state: returned,
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
  if (!token) return new Response(htmlError("OAuth error: " + (err || "No access_token")), { status: 400, headers });

  const payload = `authorization:github:success:${JSON.stringify({ token })}`;
  return new Response(htmlPostMessage(payload), { status: 200, headers });
}

function getCookie(req, name) {
  const str = req.headers.get("Cookie") || "";
  for (const part of str.split(";")) {
    const [k, ...rest] = part.trim().split("=");
    if (k === name) return rest.join("=");
  } return "";
}
function clearCookie(name) {
  return `${name}=; Path=/api/decap-auth; Max-Age=0; Secure; HttpOnly; SameSite=Lax`;
}
function htmlError(message) {
  const esc = s => String(s).replace(/[<>&'"]/g, c => ({'<':'&lt;','>':'&gt;','&':'&amp;',"'":'&#39;'}[c]));
  return `<!doctype html><meta charset="utf-8"><title>Decap OAuth Error</title>
<body>
<p>${esc(message)}</p><p><a href="/admin/">Back to admin</a></p>
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
