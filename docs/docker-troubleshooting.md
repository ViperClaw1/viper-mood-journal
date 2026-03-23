# Docker troubleshooting (mood-journal)

## `input/output error` on `containerd-mount…` or export fails

**Cause:** Docker Desktop (Linux VM + containerd) couldn’t create temp dirs or write layers. On Windows this is very often **the system disk (C:) is full** or the **Docker virtual disk** is full/corrupt.

You may also see Docker Desktop crash with:

`write …\AppData\Local\Docker\log\vm\init.log: There is not enough space on the disk.`

**Fix (do in order):**

1. **Free space on `C:`** — aim for several GB free (Docker builds and images need headroom).
2. **Quit Docker Desktop**, free space, **start Docker Desktop again**.
3. Reclaim Docker disk usage (PowerShell, Docker running):

   ```powershell
   docker system df
   docker builder prune -af
   docker image prune -af
   docker system prune -af --volumes
   ```

   `--volumes` removes unused volumes (e.g. old Postgres data). Omit it if you must keep DB volumes.

4. If it still fails: **Docker Desktop → Troubleshoot → Clean / Purge data** or **Reset to factory defaults** (wipes images/containers; backup what you need).

5. **WSL2 backend:** if `C:` has space but Docker still breaks, the ext4.vhdx can be huge. From elevated PowerShell:

   ```powershell
   wsl --shutdown
   ```

   Then in Docker Desktop: **Settings → Resources → Disk image location** / move disk, or follow Microsoft docs to compact the WSL VHD (advanced).

## Rebuild backend after code changes

From repo root (`d:\mood-journal`):

```powershell
docker compose build --no-cache backend
docker compose up -d
```

If the engine was unhealthy, fix disk/daemon first — no amount of compose changes fixes a full disk.

## Environment variables

Copy [`.env.example`](../.env.example) to `backend/.env` and fill values. Compose loads `backend/.env` and overrides `DATABASE_URL` for the backend container. Full Railway/production variable list: [deployment.md](./deployment.md).
