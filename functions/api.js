export async function onRequest(context) {
  const url = new URL(context.request.url);
  const params = url.searchParams.toString();

  const SCRIPT_URL = "https://script.google.com/macros/s/AKfycbyZIHyg--KvVfDVfOXt18kjvKReOU8lzilAqAYLEvuJO-ZpSMcsOKTl023ZOTtBg9Dc/exec";

  try {
    const response = await fetch(`${SCRIPT_URL}?${params}`, {
      redirect: "follow",
      headers: { "Accept": "application/json" }
    });

    const text = await response.text();

    return new Response(text, {
      status: 200,
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type"
      }
    });

  } catch (err) {
    return new Response(JSON.stringify({ ok: false, error: err.message }), {
      status: 500,
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Access-Control-Allow-Origin": "*"
      }
    });
  }
}
