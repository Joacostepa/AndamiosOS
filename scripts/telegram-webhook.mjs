// Registra el webhook del bot de la Hoja del día en Telegram (setWebhook), con el secreto
// que la ruta valida (X-Telegram-Bot-Api-Secret-Token). Ver src/lib/hoja-dia/telegram.ts.
//
// Antes: crear el bot con @BotFather (/newbot), y cargar en Vercel (y en .env.local):
//   TELEGRAM_BOT_TOKEN       el token que da BotFather
//   TELEGRAM_BOT_USERNAME    el usuario del bot, sin @ (si falta, la app lo pide con getMe)
//   TELEGRAM_WEBHOOK_SECRET  generar con: openssl rand -hex 32  (sólo [A-Za-z0-9_-])
//
// Correr (una vez, y cada vez que cambie el dominio o el secreto):
//   node --env-file=.env.local scripts/telegram-webhook.mjs https://andamios-os.vercel.app
//   node --env-file=.env.local scripts/telegram-webhook.mjs --info      (ver cómo quedó)
//   node --env-file=.env.local scripts/telegram-webhook.mjs --borrar    (dejar de recibir)
//
// Sólo recibe mensajes (para /start <código>) y botones (callback_query).

const token = process.env.TELEGRAM_BOT_TOKEN;
const secreto = process.env.TELEGRAM_WEBHOOK_SECRET;
if (!token) { console.error("Falta TELEGRAM_BOT_TOKEN"); process.exit(1); }
const api = (m, body) => fetch(`https://api.telegram.org/bot${token}/${m}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body ?? {}) }).then((r) => r.json());

if (process.argv.includes("--info")) {
  console.log(await api("getMe"));
  console.log(await api("getWebhookInfo"));
  process.exit(0);
}
if (process.argv.includes("--borrar")) {
  console.log(await api("deleteWebhook", { drop_pending_updates: false }));
  process.exit(0);
}
const base = process.argv.slice(2).find((a) => a.startsWith("https://")) ?? process.env.NEXT_PUBLIC_APP_URL;
if (!base?.startsWith("https://")) { console.error("Pasá el dominio público con https:// (Telegram no acepta http)"); process.exit(1); }
if (!secreto || !/^[A-Za-z0-9_-]{1,256}$/.test(secreto)) { console.error("Falta TELEGRAM_WEBHOOK_SECRET (sólo letras, números, _ y -)"); process.exit(1); }
const url = `${base.replace(/\/$/, "")}/api/telegram/webhook`;
const r = await api("setWebhook", { url, secret_token: secreto, allowed_updates: ["message", "callback_query"], drop_pending_updates: false });
console.log(r.ok ? `✓ Webhook registrado: ${url}` : `✗ ${r.description}`);
console.log(await api("getWebhookInfo"));
