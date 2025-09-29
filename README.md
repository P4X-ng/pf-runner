# pf — tiny Fabric runner (symbol-free DSL)

Single-file **Fabric** runner with a tiny, readable DSL, parallel SSH, and live output.

- One file: `pf.py`
- Symbol-free DSL: `shell`, `packages install/remove`, `service start/stop/enable/disable/restart`, `directory`, `copy`
- Task metadata: `describe` shows in `pf list`
- Project split: `include` other `.pf` files from `Pfyfile.pf`
- Per-task params: `pf run-tls tls_cert=... port=9443` → use `$tls_cert`, `$port` in DSL
- **Per-task env**: line `env KEY=VAL KEY2=VAL2` applies to the rest of the task
- Host args: `env=prod`, `hosts=user@ip:port,...`, repeatable `host=...`

## Install

```bash
pip install "fabric>=3.2,<4"
chmod +x pf.py
```

## Quickstart

```bash
pf list
pf env=prod update
pf hosts=ubuntu@10.0.0.5:22,punk@10.4.4.4:24 run-tls tls_cert=$PWD/certs/server.crt tls_key=$PWD/certs/server.key port=9443
```

## DSL

```text
task run-tls
  describe Start packetfs-infinity with Hypercorn TLS
  env tls_cert=$PWD/certs/server.crt tls_key=$PWD/certs/server.key port=9443
  shell podman run --rm \
       -p $port:9443 \
       -v $tls_cert:/certs/server.crt:ro \
       -v $tls_key:/certs/server.key:ro \
       packetfs/pfs-infinity:latest
end
```

- `$VAR` / `${VAR}` are interpolated from (in order): **task params** → **task env** → **process env**.
- On remote hosts: `env` is translated to `export VAR=...;` before each command.
- Locally: variables are provided via the process environment.

## Includes

Top-level in `Pfyfile.pf`:

```text
include "base.pf"
include web.pf
```

## Environments & Hosts

```bash
pf env=prod update
pf env=prod env=staging run
pf hosts=ubuntu@10.0.0.5:22,punk@10.4.4.4:24 down
pf host=ubuntu@10.0.0.5:22 sudo=true upgrade
```

Define env aliases in `ENV_MAP` at the top of `pf.py`:

```python
ENV_MAP = {
  "local": ["@local"],
  "prod": ["ubuntu@10.0.0.5:22", "punk@10.4.4.4:24"],
  "staging": "staging@10.1.2.3:22,staging@10.1.2.4:22",
}
```

## Project Structure

This project uses a modular task organization:

- `Pfyfile.pf` - Main configuration with includes for all task categories
- `Pfyfile.dev.pf` - Development tasks (setup, lint, test, symlink)
- `Pfyfile.tests.pf` - Testing tasks (basic, integration, docs)
- `Pfyfile.builds.pf` - Build and release tasks (validate, package, install)
- `Pfyfile.cleanup.pf` - Cleanup and maintenance tasks
- `base.pf`, `web.pf`, `test.pf` - Core functionality examples
- `scripts/` - Helper scripts (following no-long-commands rule)

## Quick Start Commands

```bash
# Complete project setup
./pf.py setup

# Validate everything works
./pf.py validate

# Run basic functionality tests
./pf.py test-basic

# Clean up project
./pf.py clean-all
```

## Notes

- Uses your SSH agent/keys and `~/.ssh/config` if present
- `packages` assumes **apt**; easy to extend to `dnf`, `pacman`, etc.
- Parallelism: min(32, number of hosts). Tweak in code.
- Follows PODMAN > Docker rule - use `podman_install` instead of `docker_install`
- Helper scripts in `scripts/` directory keep pf files clean and readable
