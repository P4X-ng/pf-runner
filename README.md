# ff — tiny Fabric runner (symbol-free DSL)

This is a single-file **Fabric** runner that keeps the tiny DSL we built for pyinfra, but executes
directly over SSH with streaming output and fewer CLI quirks.

- One file: `ff.py` (CLI + DSL runtime)
- Symbol-free DSL: `shell`, `packages install/remove`, `service start/stop/enable/disable/restart`, `directory`, `copy`
- Task metadata: `describe` shows up in `ff list`
- Project split: `include` other `.pf` files from `Pfyfile.pf`
- Host args: `env=prod`, `hosts=user@ip:port,...`, repeatable `host=...`
- Parallel SSH across hosts, with prefixed live output

## Install

```bash
pip install "fabric>=3.2,<4"
```

## Quickstart

```bash
chmod +x ff.py

./ff.py list
./ff.py env=prod update
./ff.py hosts=ubuntu@10.0.0.5:22,punk@10.4.4.4:24 bootstrap
./ff.py host=ubuntu@10.0.0.5:22 host=punk@10.4.4.4:24 web
```

## DSL

```text
task web
  describe Install & start nginx
  packages install nginx
  copy ./nginx.conf /etc/nginx/nginx.conf mode=0644
  service enable nginx
  service start nginx
end
```

Verbs:
- `shell <command...>` (respects `sudo=true` / `sudo_user=...`)
- `packages install <name...>` / `packages remove <name...>` (apt-based)
- `service start|stop|enable|disable|restart <name>`
- `directory <path> [mode=0755]`
- `copy <local> <remote> [mode=0644] [user=...] [group=...]`
- `describe <one line>` (inside task; for `list`)
- Top-level: `include path.pf` (outside tasks)

## Hosts & Environments

```bash
./ff.py env=prod update
./ff.py hosts=ubuntu@10.0.0.5:22,punk@10.4.4.4:24 web
./ff.py host=ubuntu@10.0.0.5:22 host=punk@10.4.4.4:24 sudo=true upgrade
```

Define env aliases in the script (`ENV_MAP`):

```python
ENV_MAP = {
  "local": ["@local"],
  "prod": ["ubuntu@10.0.0.5:22", "punk@10.4.4.4:24"],
  "staging": "staging@10.1.2.3:22,staging@10.1.2.4:22",
}
```

## Notes

- Uses your SSH agent/keys. You can also rely on `~/.ssh/config` for host/user/port defaults.
- `sudo=true` runs commands under `sudo`. `sudo_user=alice` uses `sudo -u alice`.
- Parallelism is limited to min(32, number of hosts). Adjust easily in the code.
- The `packages` verb assumes **apt**; you can extend for `dnf`, `pacman`, etc.
- Local runs use `/bin/sh -c` via Python's subprocess when target is `@local`.

## Sample Pfyfile.pf

```text
include "base.pf"
include web.pf

task db
  describe Install PostgreSQL and start service
  packages install postgresql
  service enable postgresql
  service start postgresql
end
```

Have fun!
