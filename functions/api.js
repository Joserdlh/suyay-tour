// Cloudflare Pages Function — /api
// Reemplaza por completo la integración anterior con Google Sheets/Apps Script.
// Maneja: ?accion=verificar_disponibilidad  y  ?accion=crear_reserva
//
// Envío de correo con Resend (resend.com), usando el dominio propio verificado
// suyaytour.com — remitente: reservas@suyaytour.com
//
// Variables de entorno necesarias (Cloudflare Pages → Settings → Environment variables):
//   RESEND_API_KEY   → tu API key de Resend (resend.com → API Keys), empieza con "re_"
//   RESEND_DEST_EMAIL → correo donde quieres recibir cada reserva
//
// Si RESEND_API_KEY no está configurada, la reserva se sigue creando con normalidad
// (no se cae la función), simplemente no se envía el correo.
//
// MULTI-IDIOMA: el correo INTERNO (para el negocio) siempre se envía en español,
// sin importar el idioma del cliente. El correo de CONFIRMACIÓN AL CLIENTE se envía
// en español, inglés o portugués según el parámetro "lang" que mande el formulario
// (?lang=es | en | pt). Si no llega ese parámetro, se asume español.

const TOURS = {
  CityTourLima: {
    hora: "08:15 AM",
    nombre: { es: "City Tour Lima Premium", en: "City Tour Lima Premium", pt: "City Tour Lima Premium" }
  },
  Gastronomico: {
    hora: "09:00 AM",
    nombre: { es: "Tour Gastronómico", en: "Gastronomic Tour", pt: "Tour Gastronômico" }
  },
  ExperienciaNocturna: {
    hora: "02:45 PM",
    nombre: { es: "Lima Nocturna Premium", en: "Lima By Night Premium", pt: "Lima Noturna Premium" }
  },
  Traslados: {
    hora: "Según vuelo / hotel",
    nombre: { es: "Traslados Privados Premium", en: "Private Premium Transfers", pt: "Traslados Privados Premium" }
  }
};

const WHATSAPP_MANAGER = "51925585680";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type"
};

// Textos del correo de confirmación al cliente, por idioma.
const I18N = {
  es: {
    asunto: "Tu reserva en Suyay Tour — ",
    titulo: "¡Gracias por tu reserva, ",
    intro: "Recibimos tu solicitud en <strong>Suyay Tour</strong>. Aquí tienes el resumen de tu reserva:",
    labelTour: "Tour",
    labelTipo: "Tipo de traslado",
    labelFecha: "Fecha",
    labelHora: "Hora de inicio",
    labelPersonas: "Personas",
    labelPrecio: "Precio total",
    labelPago: "Método de pago",
    labelCodigo: "Código de reserva",
    cierre: "En breve nos pondremos en contacto contigo por WhatsApp o correo para confirmar la disponibilidad y coordinar el pago. Si tienes cualquier duda, escríbenos al +51 925 585 680.",
    footer: "Este correo se generó automáticamente al completar tu reserva en suyaytour.com."
  },
  en: {
    asunto: "Your booking at Suyay Tour — ",
    titulo: "Thank you for your booking, ",
    intro: "We received your request at <strong>Suyay Tour</strong>. Here's a summary of your booking:",
    labelTour: "Tour",
    labelTipo: "Transfer type",
    labelFecha: "Date",
    labelHora: "Start time",
    labelPersonas: "People",
    labelPrecio: "Total price",
    labelPago: "Payment method",
    labelCodigo: "Booking code",
    cierre: "We'll be in touch shortly via WhatsApp or email to confirm availability and coordinate payment. If you have any questions, message us at +51 925 585 680.",
    footer: "This email was generated automatically when you completed your booking at suyaytour.com."
  },
  pt: {
    asunto: "Sua reserva na Suyay Tour — ",
    titulo: "Obrigado pela sua reserva, ",
    intro: "Recebemos sua solicitação na <strong>Suyay Tour</strong>. Aqui está o resumo da sua reserva:",
    labelTour: "Tour",
    labelTipo: "Tipo de traslado",
    labelFecha: "Data",
    labelHora: "Horário de início",
    labelPersonas: "Pessoas",
    labelPrecio: "Preço total",
    labelPago: "Forma de pagamento",
    labelCodigo: "Código de reserva",
    cierre: "Em breve entraremos em contato com você por WhatsApp ou e-mail para confirmar a disponibilidade e combinar o pagamento. Se tiver alguma dúvida, escreva para +51 925 585 680.",
    footer: "Este e-mail foi gerado automaticamente ao concluir sua reserva em suyaytour.com."
  }
};

function idiomaValido(lang) {
  return (lang === "en" || lang === "pt") ? lang : "es";
}

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

// Correo INTERNO para el negocio — siempre en español, sin importar el idioma del cliente.
async function enviarCorreoReserva(env, data) {
  var apiKey = env.RESEND_API_KEY;
  var destino = env.RESEND_DEST_EMAIL;
  var remitente = "Suyay Tour <reservas@suyaytour.com>";
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
    ["Idioma del cliente", (data.lang || "es").toUpperCase()],
    ["Código de reserva", data.codigo]
  ].filter(Boolean);

  var filasHtml = filas.map(function(f) {
    return '<tr><td style="padding:6px 12px;font-weight:700;color:#333;border-bottom:1px solid #eee;">' + f[0] + '</td>' +
           '<td style="padding:6px 12px;color:#555;border-bottom:1px solid #eee;">' + f[1] + '</td></tr>';
  }).join("");

  var html =
    '<div style="font-family:Arial,sans-serif;max-width:520px;margin:0 auto;">' +
    '<h2 style="color:#e8520a;">Nueva reserva — Suyay Tour</h2>' +
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

// Correo de confirmación para el CLIENTE — en español, inglés o portugués según data.lang.
async function enviarCorreoCliente(env, data) {
  var apiKey = env.RESEND_API_KEY;
  var remitente = "Suyay Tour <reservas@suyaytour.com>";
  if (!apiKey || !data.correo) {
    return { enviado: false, motivo: "Falta RESEND_API_KEY o el correo del cliente." };
  }

  var t = I18N[idiomaValido(data.lang)];

  var filas = [
    [t.labelTour, data.tourNombre],
    data.tipo ? [t.labelTipo, data.tipo] : null,
    [t.labelFecha, data.fecha],
    [t.labelHora, data.horaInicio],
    [t.labelPersonas, String(data.personas)],
    data.precioTotal ? [t.labelPrecio, "$" + data.precioTotal] : null,
    [t.labelPago, data.metodoPago || "—"],
    [t.labelCodigo, data.codigo]
  ].filter(Boolean);

  var filasHtml = filas.map(function(f) {
    return '<tr><td style="padding:6px 12px;font-weight:700;color:#333;border-bottom:1px solid #eee;">' + f[0] + '</td>' +
           '<td style="padding:6px 12px;color:#555;border-bottom:1px solid #eee;">' + f[1] + '</td></tr>';
  }).join("");

  var html =
    '<div style="font-family:Arial,sans-serif;max-width:520px;margin:0 auto;">' +
    '<h2 style="color:#e8520a;">' + t.titulo + (data.nombre || "") + '!</h2>' +
    '<p style="color:#444;font-size:14px;line-height:1.6;">' + t.intro + '</p>' +
    '<table style="width:100%;border-collapse:collapse;margin:16px 0;">' + filasHtml + '</table>' +
    '<p style="color:#444;font-size:14px;line-height:1.6;">' + t.cierre + '</p>' +
    '<p style="margin-top:20px;font-size:12px;color:#999;">' + t.footer + '</p>' +
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
        to: [data.correo],
        reply_to: "suyaytour@gmail.com",
        subject: t.asunto + data.codigo,
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
      const lang        = idiomaValido(params.get("lang"));

      if (!TOURS[tour]) {
        return jsonResponse({ ok: false, error: "Tour no reconocido: " + tour }, 400);
      }
      if (!fecha || !personas || !nombre || !correo || !whatsapp) {
        return jsonResponse({ ok: false, error: "Faltan datos obligatorios para crear la reserva." }, 400);
      }

      const codigo = generarCodigo();
      const infoTour = TOURS[tour];
      const nombreTourCliente = infoTour.nombre[lang];
      const nombreTourInterno = infoTour.nombre.es;

      // El correo interno del negocio siempre va en español, con el nombre del tour en español.
      const correoResultado = await enviarCorreoReserva(env, {
        tourNombre: nombreTourInterno,
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
        lang: lang,
        codigo: codigo
      });

      // Correo de confirmación para el cliente, en su idioma (independiente del correo interno;
      // si uno falla no afecta al otro, y la reserva queda registrada de todas formas).
      const correoClienteResultado = await enviarCorreoCliente(env, {
        tourNombre: nombreTourCliente,
        tipo: tipo,
        fecha: fecha,
        horaInicio: infoTour.hora,
        personas: personas,
        precioTotal: precioTotal,
        metodoPago: metodoPago,
        nombre: nombre,
        correo: correo,
        lang: lang,
        codigo: codigo
      });

      return jsonResponse({
        ok: true,
        codigo: codigo,
        fecha: fecha,
        hora_inicio: infoTour.hora,
        tour_nombre: nombreTourCliente,
        personas: personas,
        whatsapp_manager: WHATSAPP_MANAGER,
        correo_enviado: correoResultado.enviado,
        correo_motivo: correoResultado.enviado ? undefined : correoResultado.motivo,
        correo_cliente_enviado: correoClienteResultado.enviado,
        correo_cliente_motivo: correoClienteResultado.enviado ? undefined : correoClienteResultado.motivo
      });
    }

    return jsonResponse({ ok: false, error: "Acción no reconocida: " + accion }, 400);

  } catch (err) {
    return jsonResponse({ ok: false, error: err.message }, 500);
  }
}
