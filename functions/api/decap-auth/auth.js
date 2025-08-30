// /api/decap-auth/auth → redirect to GitHub and set state cookie
export async function onRequest({ request, env }) {
  const url = new URL(request.url);
  const targetBase = (env.OAUTH_REDIRECT_BASE || url.origin).replace(/\/$/, "");
  // If we were called on a different host, bounce there first so cookie+callback share an origin.
  if (url.origin !== targetBase) {
    const bounce = new URL(`${targetBase}/api/decap-auth/auth`);
    for (const [k, v] of url.searchParams) bounce.searchParams.set(k, v);
    return new Response(null, { status: 302, headers: { Location: bounce.toString(), ...corsHeaders(request) } });
  }

  const clientId = env.GITHUB_CLIENT_ID;
  if (!clientId) return new Response("Missing GITHUB_CLIENT_ID", { status: 500 });

  const state = randState();
  const scope = env.OAUTH_SCOPE || "public_repo"; // use "repo" if your repo is private
  const gh = new URL("https://github.com/login/oauth/authorize");
  gh.searchParams.set("client_id", clientId);
  gh.searchParams.set("redirect_uri", `${targetBase}/api/decap-auth/callback`);
  gh.searchParams.set("scope", scope);
  gh.searchParams.set("state", state);
  gh.searchParams.set("allow_signup", "false");

  // IMPORTANT: set cookie on the SAME 302 response we send to GitHub
  const headers = new Headers({ Location: gh.toString(), ...corsHeaders(request) });
  headers.append("Set-Cookie", setCookie("decap_state", state, { maxAge: 300 }));
  return new Response(null, { status: 302, headers });
}

function randState() {
  const a = new Uint8Array(16); crypto.getRandomValues(a);
  return Array.from(a, b => b.toString(16).padStart(2, "0")).join("");
}
function setCookie(name, value, { path="/api/decap-auth", maxAge, sameSite="Lax", httpOnly=true, secure=true }={}) {
  const bits = [`${name}=${value}`, `Path=${path}`, `SameSite=${sameSite}`];
  if (secure) bits.push("Secure"); if (httpOnly) bits.push("HttpOnly");
  if (typeof maxAge === "number") bits.push(`Max-Age=${maxAge}`);
  return bits.join("; ");
}
function corsHeaders(req) {
  const origin = req.headers.get("Origin") || "*";
  return { "Access-Control-Allow-Origin": origin, "Vary": "Origin",
           "Access-Control-Allow-Methods": "GET,OPTIONS",
           "Access-Control-Allow-Headers": "Content-Type,Authorization" };
}
