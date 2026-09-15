# Публикация DSU Debate на VPS (Caddy + Node + PostgreSQL)

Как превратить локальный запуск (`docs/LOCAL_HOSTING.md`) в сайт, доступный из
интернета: фронтенд и API на одном домене, realtime-голосование через
WebSocket, база — PostgreSQL на том же сервере, HTTPS автоматически.

---

## 0. Сначала — безопасность (2 минуты, обязательно)

Доступ по паролю `root@IP` — это худший вариант из возможных: пароль
передаётся в чатах, а `root` даёт полный контроль над машиной.

1. **Смените пароль**, который вам передали. Он уже попал в историю переписки:
   ```bash
   ssh -p 51387 root@153.52.117.244
   passwd
   ```
2. **Перейдите на SSH-ключ** и закройте вход по паролю:
   ```bash
   # на своей машине
   ssh-keygen -t ed25519
   ssh-copy-id -p 51387 root@153.52.117.244
   # на сервере, после проверки что вход по ключу работает
   sed -i 's/^#\?PasswordAuthentication.*/PasswordAuthentication no/' /etc/ssh/sshd_config
   systemctl reload ssh
   ```
   Не закрывайте текущую сессию, пока не убедитесь, что вход по ключу работает.
3. **Секреты приложения** (пароль БД, JWT, пароль админа) не должны попадать в
   git: они живут в `/etc/dsu-debate/backend.env` (права `600`), а не в репозитории.
4. Убедитесь, что сервер действительно ваш/друга и вы имеете право им
   распоряжаться: на чужой машине чужие данные и чужая ответственность.

---

## 1. Схема того, что получится

```
                    интернет
                       │
             ┌─────────▼──────────┐
             │  Caddy  :80 / :443 │  ← HTTPS-сертификат Let's Encrypt сам
             └─────────┬──────────┘
      ┌────────────────┼─────────────────────┐
      │ /              │ /api/*              │ /socket.io/*
      ▼                ▼                     ▼
  статика         reverse_proxy        reverse_proxy (+WebSocket)
  /var/www/            └──────────┬──────────┘
  dsu-debate/dist                 ▼
                        Node.js  127.0.0.1:4000
                        (systemd: dsu-debate-backend)
                                  │
                                  ▼
                        PostgreSQL 127.0.0.1:5432
                        база dsu_debate
```

Почему именно так:

* **Один origin для всего.** Фронтенд по умолчанию обращается к API по
  относительному пути `/api`, а к Socket.io — по `window.location.origin`
  (`src/api/httpClient.ts`, `src/lib/socket.ts`). Если сайт и API отдаёт Caddy
  с одного домена, ничего перенастраивать не нужно — обычная сборка
  `npm run build` работает как есть. Режим `build:live` с полными адресами
  `http://127.0.0.1:4000` нужен только для VS Code Live Server и здесь не нужен.
* **Caddy, а не nginx** — потому что сам получает и продлевает сертификат и
  сам пробрасывает WebSocket: конфигурация на 30 строк вместо виртхостов,
  `certbot`, `proxy_http_version 1.1` и `Upgrade`-заголовков.
* **Системный PostgreSQL, а не встроенный.** Встроенный
  `embedded-postgres` (`backend/.localdb`) удобен на своём ноутбуке; на сервере
  лучше обычный кластер под управлением systemd — его обновляет apt, к нему
  применим `pg_dump`/WAL-архив, и он не зависит от жизненного цикла процесса
  Node. Достаточно задать `DATABASE_URL` — и приложение само не станет
  запускать встроенную БД (`backend/src/config/database.ts`).
* **Backend слушает только 127.0.0.1.** Наружу торчит один Caddy; порт 4000
  закрыт firewall'ом.

---

## 2. Домен (можно пропустить, но лучше не надо)

Без домена сайт будет по `http://<IP>` — без HTTPS, с предупреждением браузера.
С доменом Caddy сам получит сертификат.

1. Купите/возьмите домен (например на reg.ru, cloudflare, namecheap).
2. Создайте **A-запись**: `debate.ваш-домен` → `153.52.117.244`, TTL 300.
3. Дождитесь, пока запись разойдётся: `dig +short debate.ваш-домен` должен
   вернуть IP сервера.
4. Убедитесь, что у хостера открыты порты **80 и 443** (и в firewall VPS, и в
   панели провайдера, если там есть security group).

---

## 3. Установка в одну команду

В репозитории уже лежат готовые файлы:

| Файл | Зачем |
| --- | --- |
| `deploy/setup.sh` | ставит Node/PostgreSQL/Caddy, создаёт БД, конфиги, сервисы |
| `deploy/Caddyfile` | шаблон конфига Caddy (статика + прокси `/api`, `/socket.io`) |
| `deploy/dsu-debate-backend.service` | systemd-юнит backend'а |
| `deploy/backend.env.example` | шаблон production-переменных backend'а |
| `deploy/deploy.sh` | публикация обновлений с вашей машины |

### 3.1. Положить код на сервер

Вариант А — через git (проще всего обновлять):

```bash
ssh -p 51387 root@153.52.117.244
git clone https://github.com/Athariyah/DSU-Debate.git /opt/dsu-debate
```
Для приватного репозитория нужен токен:
`git clone https://<TOKEN>@github.com/Athariyah/DSU-Debate.git /opt/dsu-debate`

Вариант Б — с вашей машины, без git:

```bash
DEPLOY_SSH=root@153.52.117.244 DEPLOY_PORT=51387 \
  APP_DIR=/opt/dsu-debate bash deploy/deploy.sh
```

### 3.2. Запустить настройку

```bash
ssh -p 51387 root@153.52.117.244
cd /opt/dsu-debate

sudo SITE_DOMAIN=debate.ваш-домен \
     ADMIN_EMAIL=you@example.com \
     ADMIN_PASSWORD='ВашСильныйПароль' \
     bash deploy/setup.sh
```

Без домена — просто `sudo ADMIN_EMAIL=... ADMIN_PASSWORD=... bash deploy/setup.sh`
(скрипт сам подставит `http://<IP>`).

Скрипт идемпотентен: повторный запуск не переустанавливает пакеты и **не
перетирает** `/etc/dsu-debate/backend.env` — сгенерированные секреты
сохраняются. Пересобрать код принудительно: `FORCE_BUILD=1`.

### 3.3. Проверить

```bash
systemctl status dsu-debate-backend caddy --no-pager
curl http://127.0.0.1:4000/api/health/ready      # {"status":"ready","database":"ok"}
curl -I  http://127.0.0.1/                       # 200, content-type: text/html
```

Затем откройте в браузере:

* `https://debate.ваш-домен/` — сайт, зрители голосуют отсюда;
* `https://debate.ваш-домен/admin` — вход по `ADMIN_EMAIL` / `ADMIN_PASSWORD`;
* `https://debate.ваш-домен/api/health/ready` — живость API и БД.

---

## 4. Обновления

```bash
# с вашей машины
DEPLOY_SSH=root@153.52.117.244 DEPLOY_PORT=51387 bash deploy/deploy.sh
```

или вручную на сервере:

```bash
cd /opt/dsu-debate && git pull
(cd backend && npm ci && npm run build)
npm ci && npm run build
cp -a dist/. /var/www/dsu-debate/dist/
systemctl restart dsu-debate-backend
```

Миграции БД применяются автоматически при старте backend'а
(`runMigrations()` в `backend/src/server.ts`) — отдельный шаг не нужен.

---

## 5. Резервные копии базы

Раз в сутки в 03:30, хранить 14 дней:

```bash
cat >/etc/cron.d/dsu-backup <<'EOF'
30 3 * * * postgres pg_dump -d dsu_debate | gzip > /var/backups/dsu_debate_$(date +\%F).sql.gz
40 3 * * * postgres find /var/backups -name 'dsu_debate_*.sql.gz' -mtime +14 -delete
EOF
```

Восстановление:

```bash
gunzip -c /var/backups/dsu_debate_2026-09-15.sql.gz | sudo -u postgres psql -d dsu_debate
```

Копии стоит забирать и **за пределы сервера** — например
`scp -P 51387 root@IP:/var/backups/dsu_debate_*.sql.gz ./backups/`.

---

## 6. Что где лежит

| Что | Где |
| --- | --- |
| Код | `/opt/dsu-debate` |
| Секреты и настройки backend'а | `/etc/dsu-debate/backend.env` (root, 600) |
| Конфиг Caddy | `/etc/caddy/Caddyfile` |
| Отдаваемая статика | `/var/www/dsu-debate/dist/index.html` |
| systemd-юнит | `/etc/systemd/system/dsu-debate-backend.service` |
| Логи backend'а | `journalctl -u dsu-debate-backend -f` |
| Логи Caddy | `journalctl -u caddy -f`, `/var/log/caddy/dsu-debate.access.log` |
| Данные БД | `/var/lib/postgresql/<версия>/main` |

Полезные команды:

```bash
sudo nano /etc/dsu-debate/backend.env && sudo systemctl restart dsu-debate-backend
caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile && systemctl reload caddy
sudo -u postgres psql -d dsu_debate -c '\dt'
```

---

## 7. Требования production-режима (почему backend может не стартовать)

При `NODE_ENV=production` backend проверяет настройки **до** подключения к БД и
падает с понятной ошибкой (`backend/src/config/env.ts`):

| Проверка | Что должно быть |
| --- | --- |
| `JWT_SECRET` | уникальный, ≥ 32 символов (`openssl rand -hex 32`) |
| `CORS_ORIGIN` | задан явно, не `*`; это origin сайта, например `https://debate.ваш-домен` |
| `COOKIE_SECURE` | `true` |
| `ADMIN_EMAIL` / `ADMIN_PASSWORD` | не `admin@dsu.local` / `ChangeMe123!` |
| `ADMIN_REGISTRATION_KEY` | не `local-registration-key` |

Отдельно: если сайт открыт по `http://` (без домена), cookie с флагом `Secure`
браузер отбросит. Вход в админку при этом работает — фронтенд хранит JWT в
`localStorage` и шлёт его в заголовке `Authorization`.

В паролях (`ADMIN_PASSWORD`) избегайте `#`, `$`, `%` и пробелов: файл
`/etc/dsu-debate/backend.env` читают и dotenv, и systemd `EnvironmentFile=`, и
спецсимволы они трактуют по-разному. Автогенерируемые секреты — шестнадцатеричные
и этого не касаются.

---

## 8. Если что-то не так

| Симптом | Куда смотреть |
| --- | --- |
| Сайт не открывается снаружи | `ss -tlnp \| grep -E ':80\|:443'`; открыты ли 80/443 у провайдера; `ufw status` |
| `502 Bad Gateway` | backend не жив: `journalctl -u dsu-debate-backend -n 50` |
| `ERR_CERT_*` / нет HTTPS | A-запись домена указывает не на этот IP; закрыт порт 80 (без него Let's Encrypt не подтвердит владение) |
| Страница есть, данные не грузятся | `CORS_ORIGIN` не совпадает с адресом в адресной строке; в логах backend'а строка `[cors] отклонён запрос с источником ...` |
| Голосование не обновляется в реальном времени | `/socket.io/` не доходит до backend'а; в DevTools → Network → WS должно быть `101 Switching Protocols` |
| `connect ECONNREFUSED 127.0.0.1:5432` | PostgreSQL не запущен: `systemctl status postgresql` |
| Забыли пароль админа | см. «Сброс пароля админа» ниже |

**Сброс пароля админа.** CLI-утилиты backend'а читают `backend/.env`, а не
systemd-файл, поэтому настройки нужно подгрузить явно:

```bash
sudo bash -c 'set -a; . /etc/dsu-debate/backend.env; set +a;
  cd /opt/dsu-debate/backend && npm run admin:list'

sudo bash -c 'set -a; . /etc/dsu-debate/backend.env; set +a;
  cd /opt/dsu-debate/backend && npm run admin:reset --
  --email=you@example.com --password=НовыйПароль1'
```

Без подгрузки переменных утилита решит, что внешней БД нет, и попробует поднять
встроенный PostgreSQL вместо того, чтобы пойти в настоящую базу.

---

## 9. Совсем без скриптов (минимальный ручной вариант)

Если хочется понимать каждое действие:

```bash
# 1. Софт
apt update && apt install -y curl gnupg postgresql
curl -fsSL https://deb.nodesource.com/setup_22.x | bash - && apt install -y nodejs
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' > /etc/apt/sources.list.d/caddy-stable.list
apt update && apt install -y caddy

# 2. База
sudo -u postgres psql -c "CREATE ROLE dsu LOGIN PASSWORD 'ПридумайтеПароль'"
sudo -u postgres psql -c "CREATE DATABASE dsu_debate OWNER dsu"

# 3. Код и сборка
git clone https://github.com/Athariyah/DSU-Debate.git /opt/dsu-debate && cd /opt/dsu-debate
(cd backend && npm ci && npm run build) && npm ci && npm run build

# 4. Настройки: см. deploy/backend.env.example -> /etc/dsu-debate/backend.env
# 5. Конфиг:   см. deploy/Caddyfile          -> /etc/caddy/Caddyfile
# 6. Сервис:   см. deploy/dsu-debate-backend.service -> /etc/systemd/system/
systemctl daemon-reload && systemctl enable --now dsu-debate-backend && systemctl reload caddy
```
