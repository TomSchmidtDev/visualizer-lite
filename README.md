# Visualizer Lite

Self-hosted Espresso-Shot-Verwaltung für die [Decent Espresso DE1](https://decentespresso.com/).  
Shots können manuell hochgeladen oder direkt von der Maschine importiert werden. Das Web-Frontend zeigt Extraktionskurven, Metadaten und Notizen.

```
┌──────────────────────────────────────┐
│  Browser  →  React SPA (Vite)        │
│                ↓                     │
│           Fastify API + SQLite       │
│                ↓                     │
│         /data/files/*.shot           │
└──────────────────────────────────────┘
```

---

## Inhaltsverzeichnis

1. [Voraussetzungen](#1-voraussetzungen)
2. [Umgebungsvariablen](#2-umgebungsvariablen)
3. [Lokaler Betrieb (Entwickler-Rechner)](#3-lokaler-betrieb-entwickler-rechner)
4. [NAS-Deployment (Synology DS720+ und andere x86\_64-Geräte)](#4-nas-deployment-synology-ds720-und-andere-x86_64-geräte)
5. [HTTPS / TLS](#5-https--tls)
6. [DE1-Plugin (Tablet)](#6-de1-plugin-tablet)
7. [Entwicklung](#7-entwicklung)

---

## 1. Voraussetzungen

| Tool | Version | Zweck |
|------|---------|-------|
| Docker Desktop | ≥ 4.x | Build & Run lokal |
| docker buildx | mitgeliefert | Cross-Platform-Build für NAS |
| Node.js | 22 | Nur für lokale Entwicklung ohne Docker |
| SSH-Zugang | — | Für NAS-Deployment per CLI |

---

## 2. Umgebungsvariablen

| Variable | Pflicht | Standard | Beschreibung |
|----------|---------|----------|--------------|
| `VL_SESSION_SECRET` | **ja** | — | Zufälliger String ≥ 32 Zeichen für Session-Signierung |
| `VL_PASSWORD` | empfohlen | — | Initiales Login-Passwort (beim ersten Start gesetzt) |
| `VL_USERNAME` | nein | `admin` | Initialer Benutzername |
| `DATA_DIR` | nein | `/data` | Verzeichnis für Datenbank und Shot-Dateien |
| `PORT` | nein | `3000` | Listening-Port |
| `HOST` | nein | `0.0.0.0` | Bind-Adresse |
| `CERT_PATH` | nein | `/certs/fullchain.pem` | Pfad zum TLS-Zertifikat (HTTPS aktiv wenn Datei vorhanden) |
| `KEY_PATH` | nein | `/certs/privkey.pem` | Pfad zum privaten TLS-Schlüssel |

> **Wichtig:** `VL_SESSION_SECRET` muss ein langer, zufälliger String sein.  
> Generieren mit: `openssl rand -base64 48`

---

## 3. Lokaler Betrieb (Entwickler-Rechner)

### Image bauen

```bash
# Im Projektverzeichnis
docker build -t visualizer-lite:local .
```

### Datenverzeichnis anlegen

```bash
mkdir -p ~/visualizer-data/files
```

### Container starten

```bash
docker run -d \
  --name visualizer-lite \
  --restart unless-stopped \
  -p 3000:3000 \
  -v ~/visualizer-data:/data \
  -e VL_SESSION_SECRET="$(openssl rand -base64 48)" \
  -e VL_PASSWORD="meinPasswort" \
  -e VL_USERNAME="admin" \
  visualizer-lite:local
```

Die App ist danach unter **http://localhost:3000** erreichbar.

### Container-Logs ansehen

```bash
docker logs -f visualizer-lite
```

### Container stoppen / entfernen

```bash
docker stop visualizer-lite
docker rm visualizer-lite
```

### Mit HTTPS lokal (optional, selbstsigniertes Zertifikat)

```bash
mkdir -p ~/visualizer-certs
# Selbstsigniertes Zertifikat erzeugen (nur für Testzwecke)
openssl req -x509 -newkey rsa:4096 -keyout ~/visualizer-certs/privkey.pem \
  -out ~/visualizer-certs/fullchain.pem -days 365 -nodes \
  -subj "/CN=localhost"

docker run -d \
  --name visualizer-lite \
  -p 3443:3000 \
  -v ~/visualizer-data:/data \
  -v ~/visualizer-certs:/certs:ro \
  -e VL_SESSION_SECRET="$(openssl rand -base64 48)" \
  -e VL_PASSWORD="meinPasswort" \
  visualizer-lite:local
```

App dann unter **https://localhost:3443** (Browser-Warnung wegen selbstsigniertem Zertifikat).

---

## 4. NAS-Deployment (Synology DS720+ und andere x86\_64-Geräte)

> Die Synology DS720+ verwendet einen **Intel Celeron J4125 (x86\_64 / amd64)**.  
> Ein Mac mit Apple Silicon (M1/M2/M3/M4) baut nativ für **arm64** — das Image muss  
> explizit für **linux/amd64** gebaut werden.

### 4.1 Voraussetzungen NAS

- DSM 7.x mit installiertem **Container Manager** (Package Center)
- SSH-Zugang aktiviert: *Systemsteuerung → Terminal & SNMP → SSH-Dienst aktivieren*
- Ausreichend freier Speicher auf Volume 1 (≥ 500 MB für Image + Daten)

---

### 4.2 Image für amd64 bauen (Cross-Compile)

```bash
# 1. Buildx-Builder einmalig anlegen (falls noch nicht vorhanden)
docker buildx create --name multiarch --use
docker buildx inspect --bootstrap

# 2. Image für linux/amd64 bauen und lokal als tar exportieren
docker buildx build \
  --platform linux/amd64 \
  --output type=docker,dest=visualizer-lite-nas.tar \
  -t visualizer-lite:nas \
  .
```

> Das `.tar`-Archiv enthält das vollständige Image (~300–400 MB unkomprimiert).

```bash
# 3. Komprimieren (spart ~60–70 % Übertragungsgröße)
gzip visualizer-lite-nas.tar
# Ergebnis: visualizer-lite-nas.tar.gz
```

---

### 4.3 Image auf das NAS übertragen

Ersetze `admin` und `192.168.1.100` durch deinen NAS-Benutzernamen und die IP-Adresse.

```bash
scp visualizer-lite-nas.tar.gz admin@192.168.1.100:/volume1/docker/
```

Alternativ mit `rsync` (Fortschrittsanzeige, Wiederaufnahme bei Abbruch):

```bash
rsync -avz --progress \
  visualizer-lite-nas.tar.gz \
  admin@192.168.1.100:/volume1/docker/
```

---

### 4.4 Verzeichnisse auf dem NAS anlegen

Über SSH auf dem NAS:

```bash
ssh admin@192.168.1.100

# Datenverzeichnis
sudo mkdir -p /volume1/docker/visualizer-lite/data/files

# Zertifikatsverzeichnis (nur bei direktem TLS, sonst weglassen)
sudo mkdir -p /volume1/docker/visualizer-lite/certs

# Berechtigungen setzen (Container läuft als node, uid 1000)
sudo chown -R 1000:1000 /volume1/docker/visualizer-lite/data
```

**Verzeichnisstruktur auf dem NAS:**

```
/volume1/docker/visualizer-lite/
├── data/
│   ├── visualizer.db          ← SQLite-Datenbank (automatisch erstellt)
│   └── files/
│       ├── 2024/
│       │   └── 05/
│       │       └── <sha256>.shot
│       └── ...
└── certs/                     ← optional, nur bei direktem TLS
    ├── fullchain.pem
    └── privkey.pem
```

---

### 4.5 Image laden

```bash
# Auf dem NAS (via SSH)
docker load < /volume1/docker/visualizer-lite-nas.tar.gz

# Image prüfen
docker images | grep visualizer-lite
```

---

### 4.6 Container starten

```bash
# Session-Secret einmalig generieren und notieren
openssl rand -base64 48
# Beispielausgabe: dK3mP9xQ2rV...  ← diesen Wert in den Befehl unten eintragen

docker run -d \
  --name visualizer-lite \
  --restart unless-stopped \
  -p 3000:3000 \
  -v /volume1/docker/visualizer-lite/data:/data \
  -e VL_SESSION_SECRET="HIER_DEN_GENERIERTEN_SECRET_EINTRAGEN" \
  -e VL_PASSWORD="meinSicheresPasswort" \
  -e VL_USERNAME="admin" \
  visualizer-lite:nas
```

Die App ist danach unter **http://\<NAS-IP\>:3000** erreichbar.

```bash
# Logs prüfen
docker logs -f visualizer-lite
```

---

### 4.7 Container Manager GUI (Alternative zu SSH)

Statt der CLI kann das Image auch über die grafische Oberfläche geladen werden:

1. **Container Manager** öffnen → *Registrierung → Importieren*
2. `visualizer-lite-nas.tar.gz` auswählen → Image wird importiert
3. *Image → visualizer-lite:nas → Ausführen*
4. Einstellungen:
   - **Port:** Host `3000` → Container `3000`
   - **Volumes:** `/volume1/docker/visualizer-lite/data` → `/data`
   - **Umgebungsvariablen:** (siehe Tabelle in Abschnitt 2)

---

### 4.8 Container nach Update ersetzen

Wenn ein neues Image verfügbar ist:

```bash
# 1. Auf Entwickler-Rechner: neues Image bauen und exportieren (wie 4.2/4.3)

# 2. Auf dem NAS:
docker stop visualizer-lite
docker rm visualizer-lite
docker load < /volume1/docker/visualizer-lite-nas.tar.gz

# 3. Container mit identischen Parametern neu starten (wie 4.6)
docker run -d ...
```

> Die Daten in `/volume1/docker/visualizer-lite/data` bleiben erhalten,  
> da sie im Volume gemountet sind.

---

## 5. HTTPS / TLS

### Option A: Synology Reverse Proxy (empfohlen)

Die einfachste Lösung — Synology übernimmt Let's Encrypt-Zertifikate und HTTPS-Terminierung:

1. **Control Panel → Login Portal → Erweitert → Reverse Proxy → Erstellen**
2. Einstellungen:
   - **Quellprotokoll:** HTTPS, Port 443 (oder ein anderer externer Port)
   - **Zielprotokoll:** HTTP, Ziel: `localhost`, Port: `3000`
3. Unter **Control Panel → Sicherheit → Zertifikat** ein Let's Encrypt-Zertifikat für die Domain anlegen
4. Das Zertifikat dem Reverse-Proxy-Eintrag zuweisen

Der Container selbst läuft nur auf HTTP — kein Cert-Mount nötig.

---

### Option B: TLS direkt im Container

Wenn der Container HTTPS ohne vorgelagerten Proxy bereitstellen soll:

#### Zertifikat auf das NAS übertragen

```bash
# Vom Entwickler-Rechner (z. B. nach Ausstellung via certbot)
scp /etc/letsencrypt/live/meine-domain.de/fullchain.pem \
    admin@192.168.1.100:/volume1/docker/visualizer-lite/certs/

scp /etc/letsencrypt/live/meine-domain.de/privkey.pem \
    admin@192.168.1.100:/volume1/docker/visualizer-lite/certs/

# Berechtigungen setzen (lesbar für Container-User uid 1000)
sudo chmod 640 /volume1/docker/visualizer-lite/certs/privkey.pem
sudo chown 1000:1000 /volume1/docker/visualizer-lite/certs/*.pem
```

#### Synology eigene Zertifikate verwenden

Synology speichert seine Zertifikate (inkl. Let's Encrypt) in DSM und ermöglicht den Export:

1. **Control Panel → Sicherheit → Zertifikat → Exportieren**
2. Die heruntergeladene `.zip` enthält `cert.pem`, `chain.pem`, `privkey.pem`
3. `cert.pem` + `chain.pem` zu `fullchain.pem` zusammenführen:
   ```bash
   cat cert.pem chain.pem > fullchain.pem
   ```
4. Beide Dateien nach `/volume1/docker/visualizer-lite/certs/` kopieren

#### Container mit TLS starten

```bash
docker run -d \
  --name visualizer-lite \
  --restart unless-stopped \
  -p 3443:3000 \
  -v /volume1/docker/visualizer-lite/data:/data \
  -v /volume1/docker/visualizer-lite/certs:/certs:ro \
  -e VL_SESSION_SECRET="HIER_DEN_GENERIERTEN_SECRET_EINTRAGEN" \
  -e VL_PASSWORD="meinSicheresPasswort" \
  visualizer-lite:nas
```

Die App erkennt das Zertifikat automatisch (`/certs/fullchain.pem` vorhanden → HTTPS aktiv).  
Erreichbar unter **https://\<NAS-IP-oder-Domain\>:3443**.

> **Zertifikat erneuern:** Nach Erneuerung des Zertifikats die neuen `.pem`-Dateien  
> ins Verzeichnis kopieren und den Container neu starten: `docker restart visualizer-lite`

---

## 6. DE1-Plugin (Tablet)

Das Tcl-Plugin im Verzeichnis `de1app/de1plus/plugins/visualizer_upload/` ermöglicht  
den automatischen Upload von Shots direkt vom DE1-Tablet.

### Installation

1. Den Ordner `visualizer_upload` auf den DE1-Tablet kopieren:  
   `de1app/de1plus/plugins/visualizer_upload/` → `/userdata/de1plus/plugins/visualizer_upload/`
2. DE1-App neu starten
3. In den Plugin-Einstellungen konfigurieren:
   - **Visualizer URL:** `meine-domain.de` oder `192.168.1.100:3000`
   - **Username / Password:** Login-Daten des Visualizer-Lite-Accounts
   - **Auto-Upload:** aktivieren für automatischen Upload nach jedem Shot

Der QR-Code in den Settings öffnet den zuletzt hochgeladenen Shot im Browser.

---

## 7. Entwicklung

### Setup

```bash
git clone <repo-url>
cd visualizer-lite
npm install
cd packages/api && npx prisma migrate dev
```

### Lokaler Dev-Server (Hot Reload)

```bash
# Terminal 1 — API (Port 3000)
cd packages/api
VL_SESSION_SECRET="dev-secret-must-be-at-least-32-chars!" \
VL_PASSWORD=test \
npm run dev

# Terminal 2 — Web (Port 5173, proxied to API)
cd packages/web
npm run dev
```

Oder mit Docker Compose:

```bash
docker compose -f docker-compose.dev.yml up
```

### Tests

```bash
cd packages/api
npx vitest run
```

### TypeScript-Check

```bash
cd packages/web && npx tsc --noEmit
cd packages/api && npx tsc --noEmit
```
