# Сервер mcr: damark.net и new.damark.net

Оба сайта стоят на том же сервере, что и daon.pl (204.168.243.140, nginx).
Все команды — на сервере, под root, в папке с репозиторием:

```sh
cd ~/damark && git pull
```

## damark.net — мультиссылка

Статическая страница из `link/`. Обновить после изменений:

```sh
sh deploy/publish.sh
```

Первая установка: `sh deploy/setup.sh http`, затем `cert`, `https`, `renew`
(см. комментарии в `setup.sh`). Проверка сервера: `sh deploy/check.sh`,
безопасность: `sh deploy/audit.sh`.

## new.damark.net — магазин с админкой (закрыт паролем)

Приложение из `app/`: Node 22 + SQLite, своя служба `damark` на порту 8810,
nginx впереди. Для daon.pl ничего не меняется: у магазина свой Node в
`/opt/damark/node`, служба ограничена 700 МБ памяти.

| Где | Что |
| --- | --- |
| `/opt/damark/current` | текущая версия (последние три лежат в `releases/`) |
| `/var/lib/damark/db` | база данных |
| `/var/lib/damark/media` | фото (WebP, три размера) |
| `/var/lib/damark/backups` | копии за 14 ночей (база + фото) |
| `/etc/damark/app.env` | настройки службы |

### Первая установка

1. GoDaddy → DNS → добавить запись **A**, имя `new`, значение `204.168.243.140`.
2. Если certbot не стоит: `apt install -y certbot`.
3. На сервере:

   ```sh
   sh deploy/app.sh setup      # пользователь, Node 22, папки, служба, пароль сайта
   sh deploy/app.sh cert       # когда new.damark.net уже указывает на сервер
   sh deploy/app.sh https
   sh deploy/app.sh publish    # сборка, тесты, запуск
   sh deploy/app.sh user add anna "Анна" owner
   ```

   `setup` печатает пароль сайта (логин `damark`) — его вводят один раз в
   браузере, пока магазин закрыт. `user add` печатает пароль Анны для входа
   в админку: https://new.damark.net/admin.

### Обновление

```sh
cd ~/damark && git pull && sh deploy/app.sh publish
```

`publish` собирает новую версию, прогоняет тесты, переключает и проверяет,
что она отвечает. Если нет — возвращает предыдущую и показывает лог.

### Полезное

```sh
sh deploy/app.sh status                 # работает ли, размер фото и базы
sh deploy/app.sh user list              # сотрудники
sh deploy/app.sh user password anna     # новый пароль, если забыли
sh deploy/app.sh password               # новый пароль сайта
journalctl -u damark -f                 # лог в реальном времени
```

### Резервные копии

Каждую ночь около 3:30 по Киеву: база (онлайн-копия SQLite) и фото
(жёсткие ссылки — место не удваивают). Хранятся 14 дней на этом же диске:
спасают от ошибки в админке, но не от поломки сервера. Восстановить базу:

```sh
systemctl stop damark
cp /var/lib/damark/backups/2026-10-30/damark.sqlite /var/lib/damark/db/damark.sqlite
rm -f /var/lib/damark/db/damark.sqlite-wal /var/lib/damark/db/damark.sqlite-shm
chown damark:damark /var/lib/damark/db/damark.sqlite
systemctl start damark
```

## Доступ для Claude (автоматическая работа)

Отдельный пользователь `claude` со своим ключом: его можно отключить в
любой момент, не трогая ваш вход, а в `/var/log/auth.log` видно, что
делал именно он.

На сервере, под root:

```sh
adduser --disabled-password --gecos "" claude
echo 'claude ALL=(ALL) NOPASSWD:ALL' > /etc/sudoers.d/claude && chmod 440 /etc/sudoers.d/claude
install -d -m 700 -o claude -g claude /home/claude/.ssh
ssh-keygen -q -t ed25519 -N '' -C claude-code -f /root/claude_key
install -m 600 -o claude -g claude /root/claude_key.pub /home/claude/.ssh/authorized_keys
base64 -w0 /root/claude_key; echo
```

Последняя команда печатает ключ одной строкой. Его кладут в настройки
окружения Claude Code (не в чат) переменной `MCR_SSH_KEY`, затем удаляют с
сервера: `rm /root/claude_key /root/claude_key.pub`. В сессии Claude
запускает `sh deploy/agent-ssh.sh`.

Отключить доступ: `rm /home/claude/.ssh/authorized_keys` (или
`deluser --remove-home claude && rm /etc/sudoers.d/claude`).
