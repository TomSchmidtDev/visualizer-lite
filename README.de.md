# Visualizer Lite

Selbst gehostete Espresso-Shot-Verwaltung für die [Decent Espresso DE1](https://decentespresso.com/).  
Jeden Shot erfassen — manuell hochladen, per DE1-Plugin oder direkt von der Maschine importieren.
Extraktionskurven analysieren, Geschmack bewerten und Muster in der Shot-Historie erkennen.

| | | |
|---|---|---|
| ✦ Shot-Liste mit Suche & Filter | ✦ Extraktionskurven (Druck, Flow, Gewicht) | ✦ Tasting Notes & Genussbewertung |
| ✦ Manueller .shot-Datei-Upload | ✦ Automatischer Upload per DE1-Plugin | ✦ DE1-Direktimport via HTTP |
| ✦ Einzelner Docker-Container, SQLite | ✦ Dark / Light Theme · DE + EN | ✦ ZIP-Datenexport |

<table>
  <tr>
    <td align="center" width="33%">
      <img src="docs/screenshots/shot-list.png" alt="Shot-Liste" />
      <br/><sub><b>Shot-Liste</b></sub>
    </td>
    <td align="center" width="33%">
      <img src="docs/screenshots/shot-detail.png" alt="Extraktionskurven" />
      <br/><sub><b>Extraktionskurven</b></sub>
    </td>
    <td align="center" width="33%">
      <img src="docs/screenshots/settings.png" alt="Einstellungen &amp; Import" />
      <br/><sub><b>Einstellungen &amp; Import</b></sub>
    </td>
  </tr>
</table>

---

## Schnellstart

Kein Build nötig — einfach das veröffentlichte Image aus der GitHub Container Registry verwenden.

**HTTP (lokales Netzwerk):**
```bash
docker run -d \
  --name visualizer-lite \
  --restart unless-stopped \
  -p 3000:3000 \
  -v /volume1/docker/visualizer-lite/data:/data \
  -e VL_SESSION_SECRET="$(openssl rand -base64 48)" \
  -e VL_PASSWORD="dein-passwort" \
  ghcr.io/tomschmidtdev/visualizer-lite:latest
```

**macOS / Windows — HTTP (lokale Nutzung):**

macOS (Terminal):
```bash
docker run -d \
  --name visualizer-lite \
  --restart unless-stopped \
  -p 3000:3000 \
  -v "$HOME/visualizer-lite-data:/data" \
  -e VL_SESSION_SECRET="$(openssl rand -base64 48)" \
  -e VL_PASSWORD="dein-passwort" \
  ghcr.io/tomschmidtdev/visualizer-lite:latest
```

Windows (PowerShell):
```powershell
docker run -d `
  --name visualizer-lite `
  --restart unless-stopped `
  -p 3000:3000 `
  -v "$env:USERPROFILE\visualizer-lite-data:/data" `
  -e "VL_SESSION_SECRET=beliebigen-langen-zufallsstring-hier-eintragen" `
  -e "VL_PASSWORD=dein-passwort" `
  ghcr.io/tomschmidtdev/visualizer-lite:latest
```

Danach im Browser öffnen: http://localhost:3000

---

**HTTPS (mit Zertifikaten):**
```bash
docker run -d \
  --name visualizer-lite \
  --restart unless-stopped \
  -p 3443:3000 \
  -v /volume1/docker/visualizer-lite/data:/data \
  -v /volume1/docker/visualizer-lite/certs:/certs:ro \
  -e VL_SESSION_SECRET="$(openssl rand -base64 48)" \
  -e VL_PASSWORD="dein-passwort" \
  ghcr.io/tomschmidtdev/visualizer-lite:latest
```

---

## Build & Deployment

> Nur nötig, wenn das Image selbst gebaut werden soll (z.B. für lokale Entwicklung oder einen Fork).

### 1. Docker-Image bauen

Auf dem Entwickler-Rechner:

```bash
# Für lokale Nutzung (natives Platform)
docker build -t visualizer-lite:local .

# Für Synology NAS oder andere x86_64/amd64-Geräte (Cross-Compile von Apple Silicon)
docker build --platform linux/amd64 -t visualizer-lite:nas .
docker save visualizer-lite:nas | gzip > visualizer-lite.tar.gz
```

### 2. Übertragen und auf dem NAS laden

```bash
# Übertragen
scp visualizer-lite.tar.gz admin@<NAS-IP>:/volume1/docker/

# Auf dem NAS (via SSH)
docker load < /volume1/docker/visualizer-lite.tar.gz
mkdir -p /volume1/docker/visualizer-lite/data/files
chown -R 1000:1000 /volume1/docker/visualizer-lite/data
```

### 3. Container starten

```bash
docker run -d \
  --name visualizer-lite \
  --restart unless-stopped \
  -p 3000:3000 \
  -v /volume1/docker/visualizer-lite/data:/data \
  -e VL_SESSION_SECRET="$(openssl rand -base64 48)" \
  -e VL_PASSWORD="dein-passwort" \
  visualizer-lite:nas
```

---

## HTTP vs. HTTPS

| | HTTP | HTTPS |
|---|---|---|
| Zertifikat erforderlich | Nein | Ja |
| Geeignet für | Nur lokales Netzwerk | Internet / externer Zugriff |
| Port | 3000 | 3443 (oder beliebig) |

### HTTPS-Setup (optional)

Ein Zertifikatsverzeichnis mounten — die App aktiviert HTTPS automatisch:

```bash
docker run -d \
  --name visualizer-lite \
  --restart unless-stopped \
  -p 3443:3000 \
  -v /volume1/docker/visualizer-lite/data:/data \
  -v /volume1/docker/visualizer-lite/certs:/certs:ro \
  -e VL_SESSION_SECRET="$(openssl rand -base64 48)" \
  -e VL_PASSWORD="dein-passwort" \
  visualizer-lite:nas
```

Zertifikatsdateien ablegen unter:
```
/volume1/docker/visualizer-lite/certs/
├── fullchain.pem
└── privkey.pem
```

> **Synology-Tipp:** Zertifikat über *Systemsteuerung → Sicherheit → Zertifikat → Exportieren* herunterladen, dann `cat cert.pem chain.pem > fullchain.pem`.  
> Alternativ den eingebauten Reverse Proxy nutzen (*Systemsteuerung → Anmeldeportal → Erweitert*) – dann läuft der Container nur auf HTTP, HTTPS übernimmt Synology.

---

## Umgebungsvariablen

| Variable | Standard | Beschreibung |
|---|---|---|
| `VL_SESSION_SECRET` | — | **Pflicht.** Zufälliger String ≥ 32 Zeichen |
| `VL_PASSWORD` | — | Initiales Login-Passwort |
| `VL_USERNAME` | `admin` | Initialer Benutzername |
| `DATA_DIR` | `/data` | Datenbank und Shot-Dateien |
| `PORT` | `3000` | Listening-Port |
| `CERT_PATH` | `/certs/fullchain.pem` | TLS-Zertifikat (HTTPS aktiv, wenn vorhanden) |
| `KEY_PATH` | `/certs/privkey.pem` | Privater TLS-Schlüssel |

---

## DE1-Plugin

Den Ordner `de1app/de1plus/plugins/visualizer_upload/` nach `/de1plus/plugins/visualizer_upload/` auf das DE1-Tablet kopieren und die DE1-App neu starten.

**Plugin-Einstellungen:**

| Einstellung | HTTP (lokales Netzwerk) | HTTPS (externer Zugriff) |
|---|---|---|
| Visualizer URL | `http://192.168.1.100:3000` | `https://meine-domain.de:3443` |
| Protokoll | Kein Zertifikat erforderlich | Gültiges TLS-Zertifikat notwendig |
| Empfehlung | Nur Heimnetzwerk | Internet-erreichbare Installation |

- `http://` mit interner IP-Adresse verwenden für einfachen lokalen Zugriff ohne Zertifikate.
- `https://` mit Domain-Namen verwenden, wenn die Instanz aus dem Internet erreichbar ist.
- Das Plugin zeigt eine Warnung, wenn eine HTTP-URL konfiguriert wird (unsicher über das Internet).

---

## Entwicklung

```bash
# Installation
npm install
cd packages/api && npx prisma migrate dev

# Terminal 1 — API (Port 3000)
cd packages/api
VL_SESSION_SECRET="dev-secret-must-be-at-least-32-chars!" \
VL_PASSWORD=test \
npm run dev

# Terminal 2 — Web (Port 5173)
cd packages/web && npm run dev

# Tests
cd packages/api && npx vitest run
```
