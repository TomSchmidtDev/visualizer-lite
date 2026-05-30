# Visualizer Lite

Self-hosted espresso shot manager for the [Decent Espresso DE1](https://decentespresso.com/).  
Track every shot — upload manually, via the DE1 plugin, or import directly from the machine.
Analyse extraction curves, rate taste, and find patterns across your history.

| | | |
|---|---|---|
| ✦ Shot list with search & filter | ✦ Extraction curves (pressure, flow, weight) | ✦ Tasting notes & enjoyment score |
| ✦ Manual .shot file upload | ✦ Auto-upload via DE1 plugin | ✦ DE1 direct import via HTTP |
| ✦ Single Docker container, SQLite | ✦ Dark / light theme · DE + EN | ✦ ZIP data export |
| ✦ **Shot comparison** — overlay or split two shots' extraction curves | | |

<table>
  <tr>
    <td align="center" width="33%">
      <img src="docs/screenshots/shot-list.png" alt="Shot List" />
      <br/><sub><b>Shot List</b></sub>
    </td>
    <td align="center" width="33%">
      <img src="docs/screenshots/shot-detail.png" alt="Extraction Curves" />
      <br/><sub><b>Extraction Curves</b></sub>
    </td>
    <td align="center" width="33%">
      <img src="docs/screenshots/settings.png" alt="Settings &amp; Import" />
      <br/><sub><b>Settings &amp; Import</b></sub>
    </td>
  </tr>
  <tr>
    <td align="center" width="50%" colspan="2">
      <img src="docs/screenshots/shot-comparison-overlaid.png" alt="Shot Comparison — Overlaid" />
      <br/><sub><b>Shot Comparison — Overlaid Curves</b></sub>
    </td>
    <td align="center" width="50%">
      <img src="docs/screenshots/shot-comparison-split.png" alt="Shot Comparison — Split View" />
      <br/><sub><b>Shot Comparison — Split View</b></sub>
    </td>
  </tr>
</table>

---

## Quick Start

No build required — use the published image from GitHub Container Registry.

**HTTP (local network):**
```bash
docker run -d \
  --name visualizer-lite \
  --restart unless-stopped \
  -p 3000:3000 \
  -v /volume1/docker/visualizer-lite/data:/data \
  -e VL_SESSION_SECRET="$(openssl rand -base64 48)" \
  -e VL_PASSWORD="your-password" \
  ghcr.io/tomschmidtdev/visualizer-lite:latest
```

**macOS / Windows — HTTP (local use):**

macOS (Terminal):
```bash
docker run -d \
  --name visualizer-lite \
  --restart unless-stopped \
  -p 3000:3000 \
  -v "$HOME/visualizer-lite-data:/data" \
  -e VL_SESSION_SECRET="$(openssl rand -base64 48)" \
  -e VL_PASSWORD="your-password" \
  ghcr.io/tomschmidtdev/visualizer-lite:latest
```

Windows (PowerShell):
```powershell
docker run -d `
  --name visualizer-lite `
  --restart unless-stopped `
  -p 3000:3000 `
  -v "$env:USERPROFILE\visualizer-lite-data:/data" `
  -e "VL_SESSION_SECRET=insert-any-long-random-string-here" `
  -e "VL_PASSWORD=your-password" `
  ghcr.io/tomschmidtdev/visualizer-lite:latest
```

Open http://localhost:3000 in your browser.

---

**HTTPS (with certificates):**
```bash
docker run -d \
  --name visualizer-lite \
  --restart unless-stopped \
  -p 3443:3000 \
  -v /volume1/docker/visualizer-lite/data:/data \
  -v /volume1/docker/visualizer-lite/certs:/certs:ro \
  -e VL_SESSION_SECRET="$(openssl rand -base64 48)" \
  -e VL_PASSWORD="your-password" \
  ghcr.io/tomschmidtdev/visualizer-lite:latest
```

---

## Build & Deploy

> Only needed if you want to build the image yourself (e.g. for local development or a fork).

### 1. Build the Docker image

On your development machine:

```bash
# For local use (native platform)
docker build -t visualizer-lite:local .

# For Synology NAS or any other x86_64/amd64 device (cross-compile from Apple Silicon)
docker build --platform linux/amd64 -t visualizer-lite:nas .
docker save visualizer-lite:nas | gzip > visualizer-lite.tar.gz
```

### 2. Transfer and load on the NAS

```bash
# Transfer
scp visualizer-lite.tar.gz admin@<NAS-IP>:/volume1/docker/

# On the NAS (via SSH)
docker load < /volume1/docker/visualizer-lite.tar.gz
mkdir -p /volume1/docker/visualizer-lite/data/files
chown -R 1000:1000 /volume1/docker/visualizer-lite/data
```

### 3. Start the container

```bash
docker run -d \
  --name visualizer-lite \
  --restart unless-stopped \
  -p 3000:3000 \
  -v /volume1/docker/visualizer-lite/data:/data \
  -e VL_SESSION_SECRET="$(openssl rand -base64 48)" \
  -e VL_PASSWORD="your-password" \
  visualizer-lite:nas
```

---

## HTTP vs. HTTPS

| | HTTP | HTTPS |
|---|---|---|
| Certificate required | No | Yes |
| Suitable for | Local network only | Internet / external access |
| Port | 3000 | 3443 (or any) |

### HTTPS setup (optional)

Mount a certificate directory and the app activates HTTPS automatically:

```bash
docker run -d \
  --name visualizer-lite \
  --restart unless-stopped \
  -p 3443:3000 \
  -v /volume1/docker/visualizer-lite/data:/data \
  -v /volume1/docker/visualizer-lite/certs:/certs:ro \
  -e VL_SESSION_SECRET="$(openssl rand -base64 48)" \
  -e VL_PASSWORD="your-password" \
  visualizer-lite:nas
```

Place your certificate files at:
```
/volume1/docker/visualizer-lite/certs/
├── fullchain.pem
└── privkey.pem
```

> **Synology tip:** Export the DSM certificate via *Control Panel → Security → Certificate → Export*, then `cat cert.pem chain.pem > fullchain.pem`.  
> Alternatively use Synology's built-in Reverse Proxy (*Control Panel → Login Portal → Advanced*) to handle HTTPS externally and run the container on plain HTTP.

---

## Environment Variables

| Variable | Default | Description |
|---|---|---|
| `VL_SESSION_SECRET` | — | **Required.** Random string ≥ 32 chars |
| `VL_PASSWORD` | — | Initial login password |
| `VL_USERNAME` | `admin` | Initial username |
| `DATA_DIR` | `/data` | Database and shot file storage |
| `PORT` | `3000` | Listening port |
| `CERT_PATH` | `/certs/fullchain.pem` | TLS certificate (HTTPS active when present) |
| `KEY_PATH` | `/certs/privkey.pem` | TLS private key |

---

## DE1 Plugin

Copy `de1app/de1plus/plugins/visualizer_upload/` to `/de1plus/plugins/visualizer_upload/` on the DE1 tablet, then restart the DE1 app.

**Plugin settings:**

| Setting | HTTP (local network) | HTTPS (external access) |
|---|---|---|
| Visualizer URL | `http://192.168.1.100:3000` | `https://my-domain.com:3443` |
| Protocol | No certificate needed | Valid TLS certificate required |
| Recommendation | Home use only | Internet-accessible setup |

- Use `http://` with an internal IP address for simple local-network access without certificates.
- Use `https://` with a domain name when the instance is reachable from the internet.
- The plugin shows a warning if you configure an HTTP URL (insecure over the internet).

---

## Development

```bash
# Install
npm install
cd packages/api && npx prisma migrate dev

# Terminal 1 — API (port 3000)
cd packages/api
VL_SESSION_SECRET="dev-secret-must-be-at-least-32-chars!" \
VL_PASSWORD=test \
npm run dev

# Terminal 2 — Web (port 5173)
cd packages/web && npm run dev

# Tests
cd packages/api && npx vitest run
```
