# DaMark — магазин и админка

Node 22, Fastify, SQLite (better-sqlite3), React 19 + Vite. Один процесс,
одна база-файл; фото хранятся только как WebP в трёх размерах.

```sh
npm install
npm test                    # API-тесты (Telegram и Новая почта подменены)
npm run build               # dist/web + dist/server
npm run user -- add anna "Анна" owner
npm start                   # http://localhost:8810
```

Для разработки: `npm run dev:server` и `npm run dev:web` (http://localhost:5173).

| Папка | Что |
| --- | --- |
| `server/src` | API, заказы, Новая почта, Telegram-бот, финансы, резервные копии |
| `server/test` | тесты API |
| `web/src/shop` | витрина |
| `web/src/admin` | админка |

Как это стоит на сервере — `../deploy/README.md`.
