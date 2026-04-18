export async function onRequest(context) {
  const url = new URL(context.request.url);
  const params = url.searchParams.toString();

  const SCRIPT_URL = "https://script.google.com/macros/s/AKfycbyZIHyg--KvVfDVfOXt18kjvKReOU8lzilAqAYLEvuJO-ZpSMcsOKTl023ZOTtBg9Dc/exec";

  const response = await fetch(`${SCRIPT_URL}?${params}`, {
    redirect: "follow"
  });

  const data = await response.text();

  return new Response(data, {
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*"
    }
  });
}
