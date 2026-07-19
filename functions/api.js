// Cloudflare Pages Function — /api
// Reemplaza por completo la integración anterior con Google Sheets/Apps Script.
// Maneja: ?accion=verificar_disponibilidad  y  ?accion=crear_reserva
//
// Envío de correo con Resend (resend.com), usando su remitente de prueba
// "onboarding@resend.dev" — no requiere dominio propio verificado.
// Cuando compres un dominio, se puede verificar en Resend y cambiar el remitente
// por uno propio (ej. reservas@tudominio.com) sin tocar el resto del código.
//
// Variables de entorno necesarias (Cloudflare Pages → Settings → Environment variables):
//   RESEND_API_KEY   → tu API key de Resend (resend.com → API Keys), empieza con "re_"
//   RESEND_DEST_EMAIL → correo donde quieres recibir cada reserva
//
// Si RESEND_API_KEY no está configurada, la reserva se sigue creando con normalidad
// (no se cae la función), simplemente no se envía el correo.

const TOURS = {
  CityTourLima:        { nombre: "City Tour Lima Premium",         hora: "08:00 AM" },
  Cieneguilla:          { nombre: "Cieneguilla Premium Experience", hora: "09:00 AM" },
  ExperienciaNocturna:  { nombre: "Experiencia Nocturna Premium",   hora: "05:25 PM" },
  Traslados:            { nombre: "Traslados Privados Premium",     hora: "Según vuelo / hotel" }
};

const WHATSAPP_MANAGER = "51925585680";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type"
};

function jsonResponse(obj, status) {
  return new Response(JSON.stringify(obj), {
    status: status || 200,
    headers: Object.assign({ "Content-Type": "application/json; charset=utf-8" }, CORS_HEADERS)
  });
}

function generarCodigo() {
  var chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // sin 0/O/1/I para evitar confusiones
  var out = "";
  for (var i = 0; i < 6; i++) out += chars[Math.floor(Math.random() * chars.length)];
  return "SUYAY-" + out;
}

async function enviarCorreoReserva(env, data) {
  var apiKey = env.RESEND_API_KEY;
  var destino = env.RESEND_DEST_EMAIL;
  var remitente = "Suyay Peru Travel <onboarding@resend.dev>";
  if (!apiKey || !destino) {
    return { enviado: false, motivo: "Faltan variables de entorno de Resend (RESEND_API_KEY / RESEND_DEST_EMAIL)." };
  }

  var filas = [
    ["Tour", data.tourNombre],
    data.tipo ? ["Tipo de traslado", data.tipo] : null,
    ["Fecha", data.fecha],
    ["Personas (total)", String(data.personas)],
    data.adultos   ? ["Adultos (12-99 años)", String(data.adultos)]   : null,
    data.joven811  ? ["Jóvenes (8-11 años)", String(data.joven811)]   : null,
    data.joven47   ? ["Niños (4-7 años)", String(data.joven47)]       : null,
    data.bebes     ? ["Bebés (0-3 años)", String(data.bebes)]         : null,
    data.precioTotal ? ["Precio total", "$" + data.precioTotal] : null,
    ["Método de pago", data.metodoPago || "No especificado"],
    ["Nombre", data.nombre],
    ["Correo", data.correo],
    ["WhatsApp", data.whatsapp],
    ["Código de reserva", data.codigo]
  ].filter(Boolean);

  var filasHtml = filas.map(function(f) {
    return '<tr><td style="padding:6px 12px;font-weight:700;color:#333;border-bottom:1px solid #eee;">' + f[0] + '</td>' +
           '<td style="padding:6px 12px;color:#555;border-bottom:1px solid #eee;">' + f[1] + '</td></tr>';
  }).join("");

  var html =
    '<div style="font-family:Arial,sans-serif;max-width:520px;margin:0 auto;">' +
    '<h2 style="color:#e8520a;">Nueva reserva — Suyay Peru Travel</h2>' +
    '<table style="width:100%;border-collapse:collapse;">' + filasHtml + '</table>' +
    '<p style="margin-top:20px;font-size:12px;color:#999;">Este correo se generó automáticamente cuando el cliente completó el formulario de reserva en la web.</p>' +
    '</div>';

  try {
    var resp = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": "Bearer " + apiKey
      },
      body: JSON.stringify({
        from: remitente,
        to: [destino],
        reply_to: data.correo || undefined,
        subject: "Nueva reserva: " + data.tourNombre + " — " + data.codigo,
        html: html
      })
    });
    if (!resp.ok) {
      var errText = await resp.text();
      return { enviado: false, motivo: "Resend respondió " + resp.status + ": " + errText };
    }
    return { enviado: true };
  } catch (err) {
    return { enviado: false, motivo: err.message };
  }
}

export async function onRequest(context) {
  const { request, env } = context;

  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }

  const url = new URL(request.url);
  const params = url.searchParams;
  const accion = params.get("accion");

  try {
    if (accion === "verificar_disponibilidad") {
      const tour = params.get("tour");
      const fecha = params.get("fecha");
      const personas = params.get("personas");

      if (!TOURS[tour]) {
        return jsonResponse({ ok: false, error: "Tour no reconocido: " + tour }, 400);
      }
      if (!fecha || !personas) {
        return jsonResponse({ ok: false, error: "Faltan parámetros (fecha, personas)." }, 400);
      }

      // Por ahora no hay control real de cupos — siempre se marca como disponible.
      // El dueño resuelve manualmente cualquier choque de fechas al recibir el correo/WhatsApp.
      return jsonResponse({ ok: true, disponible: true });
    }

    if (accion === "crear_reserva") {
      const tour     = params.get("tour");
      const fecha    = params.get("fecha");
      const personas = params.get("personas");
      const nombre   = params.get("nombre");
      const correo   = params.get("correo");
      const whatsapp = params.get("whatsapp");
      const tipo     = params.get("tipo"); // solo lo envía Traslados.html
      const metodoPago  = params.get("metodo_pago");
      const adultos     = params.get("adultos");
      const joven811    = params.get("joven811");
      const joven47     = params.get("joven47");
      const bebes       = params.get("bebes");
      const precioTotal = params.get("precio_total");

      if (!TOURS[tour]) {
        return jsonResponse({ ok: false, error: "Tour no reconocido: " + tour }, 400);
      }
      if (!fecha || !personas || !nombre || !correo || !whatsapp) {
        return jsonResponse({ ok: false, error: "Faltan datos obligatorios para crear la reserva." }, 400);
      }

      const codigo = generarCodigo();
      const infoTour = TOURS[tour];

      const correoResultado = await enviarCorreoReserva(env, {
        tourNombre: infoTour.nombre,
        tipo: tipo,
        fecha: fecha,
        personas: personas,
        adultos: adultos,
        joven811: joven811,
        joven47: joven47,
        bebes: bebes,
        precioTotal: precioTotal,
        metodoPago: metodoPago,
        nombre: nombre,
        correo: correo,
        whatsapp: whatsapp,
        codigo: codigo
      });

      return jsonResponse({
        ok: true,
        codigo: codigo,
        expira_en_horas: 2,
        fecha: fecha,
        hora_inicio: infoTour.hora,
        tour_nombre: infoTour.nombre,
        personas: personas,
        whatsapp_manager: WHATSAPP_MANAGER,
        correo_enviado: correoResultado.enviado,
        correo_motivo: correoResultado.enviado ? undefined : correoResultado.motivo
      });
    }

    return jsonResponse({ ok: false, error: "Acción no reconocida: " + accion }, 400);

  } catch (err) {
    return jsonResponse({ ok: false, error: err.message }, 500);
  }
}
