# Accesos de Juan Pablo (Sistemas)

**Armado el 17/10/2026.** JS decidió que Juan Pablo tenga acceso a todo, igual que él: el repo, Vercel, Supabase, Railway y los servicios que usa la app. Esta lista es para hacerla entre los dos, servicio por servicio, tildando lo que ya quedó.

**La regla:** cada uno entra con su propia cuenta y con 2FA. La cuenta de JS no se comparte nunca. Así queda registrado quién hizo qué, y si un día hay que sacar a alguien, no se toca la cuenta del otro.

---

## 1. GitHub

Hoy el repo está en la cuenta personal de JS (`Joacostepa/AndamiosOS`). En un repo personal no se puede hacer admin a otra persona, por eso se pasa a una organización.

- [ ] Juan Pablo tiene su cuenta de GitHub con 2FA activado.
- [ ] JS crea una organización (el plan gratis alcanza), por ejemplo `andamiosbuenosaires`.
- [ ] JS transfiere el repo a la organización: repo → Settings → General → Transfer ownership.
- [ ] JS invita a Juan Pablo a la organización como **Owner**.
- [ ] En cada clon, se actualiza el remote: `git remote set-url origin https://github.com/<organización>/AndamiosOS.git`. GitHub redirige la URL vieja un tiempo, pero no hay que depender de eso.
- [ ] Vercel: se instala la app de GitHub de Vercel en la organización y se reconecta el repo (Project → Settings → Git). Para comprobarlo, se hace un push y se mira que arranque el deploy.
- [ ] (Recomendado) Regla en `main`: PR obligatorio y sin force-push, con JS y Juan Pablo en la lista de quienes pueden saltearla. No es por desconfianza: así un push apurado no llega a producción sin querer.

## 2. Vercel

Proyecto `andamios-os`. **Un push a `main` es un deploy a producción.** Los crons están en `vercel.json` (informes de obra, alertas, geocodificación, permisos, personal de Odoo, dirección) y usan `CRON_SECRET`.

- [ ] El team está en plan **Pro**. Hobby no deja sumar miembros, y en Pro cada asiento se paga.
- [ ] Team Settings → Members → invitar a Juan Pablo como **Owner**.
- [ ] Juan Pablo instala la CLI y vincula el proyecto: `npm i -g vercel`, `vercel login`, `vercel link` (el team de ABA, proyecto `andamios-os`).
- [ ] `vercel env pull .env.local` baja las variables del entorno Development. Hay que compararlas con `.env.example` y completar las que falten con lo que esté en la bóveda (punto 6).

## 3. Supabase

**Hay una sola base, y es la de producción.** Todo lo que se corra contra ella toca datos reales.

- [ ] Organization → Team → invitar a Juan Pablo como **Owner**.
- [ ] Juan Pablo instala la CLI, corre `supabase login` con su propio token y después `supabase link --project-ref <ref>`. El ref está en la URL del panel y en `NEXT_PUBLIC_SUPABASE_URL`.
- [ ] La contraseña de la base y `SUPABASE_DB_URL` van a la bóveda.
- Las migraciones de este repo se aplican así: `node --env-file=.env.local scripts/apply-migration.mjs supabase/migrations/<archivo>.sql`. Se van numerando por fecha en `supabase/migrations/`.

## 4. Railway

En el repo no hay nada de Railway.

- [ ] Workspace → Settings → Members → invitar a Juan Pablo como **Admin**.
- [ ] Anotar acá qué corre en Railway: ____________________

## 5. Los servicios que usa la app

Cada uno se maneja aparte. Las variables están explicadas en `.env.example`.

| Servicio | Para qué | Qué hacer | Variables |
|---|---|---|---|
| [ ] **Odoo** | Clientes, CRM, cotizaciones, facturación, flota | Un usuario admin propio para Juan Pablo. El usuario de integración de la app sigue aparte | `ODOO_*` |
| [ ] **Meta Business** | El WhatsApp de clientes (Tomás) | Sumarlo como admin del Business Manager | `WHATSAPP_*` |
| [ ] **Slack** | Avisos en los canales del equipo | Sumarlo como colaborador de la app que genera los webhooks | `SLACK_WEBHOOK_*` |
| [ ] **Google Cloud** | Mapas, geocodificación y tiempos de manejo | Rol Owner en el proyecto | `NEXT_PUBLIC_GOOGLE_MAPS_KEY`, `GOOGLE_MAPS_API_KEY` |
| [ ] **Anthropic Console** | La IA de cotizaciones, cómputos, el asistente y Tomás | Invitarlo como admin a la organización | `ANTHROPIC_API_KEY` |
| [ ] **ElevenLabs** | La voz del asistente y el saludo de Tomás | Invitarlo al workspace | `ELEVENLABS_*` |
| [ ] **Telegram** | El bot de la Hoja del día | El bot es de una sola cuenta de Telegram y no se comparte. Alcanza con el token | `TELEGRAM_*` |
| [ ] **AFIP / ARCA** | Facturación electrónica | El certificado está atado al CUIT. Si Juan Pablo tiene que renovarlo, darlo de alta en el Administrador de Relaciones | `AFIP_*` |
| [ ] **Dominio y DNS** | La dirección de la app | Anotar dónde está registrado y sumarlo: ____________ | — |

## 6. Los secretos

- [ ] Una bóveda compartida (Bitwarden o 1Password) con:
  - el `.env.local` completo;
  - `robot/.env.robot`;
  - la contraseña de la base de Supabase;
  - los accesos a cada servicio de la tabla.
- [ ] Nada de esto se manda por WhatsApp ni por mail.

## 7. El robot de TAD

Corre en la Mac de JS como LaunchAgent (`robot/instalar-launchd.sh`) con `npm run robot:tad`, que lee `.env.local` y `robot/.env.robot`. Si esa Mac se apaga o se duerme, el robot para y la pantalla de permisos lo avisa.

- [ ] Decidir dónde queda: en la Mac de JS como hasta ahora, en una máquina de Juan Pablo o en un servidor (por ejemplo, Railway). Ojo con dejar dos robots corriendo a la vez.

## 8. El primer día de Juan Pablo

```sh
git clone https://github.com/<organización>/AndamiosOS.git
cd AndamiosOS
npm install
vercel link
vercel env pull .env.local   # y completar con la bóveda
npm run dev
npm test
```

- Node 22 (JS usa 22.16).
- **Leer `AGENTS.md` antes que nada:** el Next.js de este proyecto tiene cambios que rompen lo que uno conoce. Las guías están en `node_modules/next/dist/docs/`.
- Cada módulo tiene su estado en `docs/<módulo>/handoff.md`. Ahí está el contexto de lo que se hizo y por qué.
- Si usa Claude Code, `CLAUDE.md` y `AGENTS.md` están en el repo y le llegan solos. La carpeta `.claude/` y la memoria de Claude quedan en la máquina de cada uno y no se comparten.
- **Cómo trabajamos:** una rama por cambio, después un PR, se prueba en la vista previa que arma Vercel y se hace el merge a `main`, que es producción.

## 9. Si algún día deja de trabajar en ABA

- [ ] Sacarlo de GitHub, Vercel, Supabase, Railway y de cada servicio de la tabla.
- [ ] Rotar las claves que tuvo:
  - de Supabase: la service role y la contraseña de la base;
  - las secretas de la app: `ODOO_API_KEY`, `ODOO_SYNC_SECRET`, `CRON_SECRET`;
  - los tokens de WhatsApp y Telegram, y los webhooks de Slack;
  - las claves de Anthropic, ElevenLabs y Google.
