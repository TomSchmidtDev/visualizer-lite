# Synology NAS — Visualizer Lite Installation

Two installation methods are available. **Method 1 (Task Scheduler)** requires no SSH and works entirely through the Synology DSM web interface. **Method 2 (SSH)** is the classic command-line approach.

---

## Method 1: Task Scheduler (no SSH required)

This method is inspired by [Marius Bogdan Luca's Watchtower install guide](https://mariushosting.com/synology-30-second-watchtower-install-using-task-scheduler-docker/) and works entirely inside DSM.

### Step 1 — Create the data folder in File Station

Open **File Station**, navigate to the `docker` shared folder, and create the following folder structure:

```
docker/
└── visualizer-lite/
    └── data/
```

Create the `visualizer-lite` folder first, then open it and create a `data` subfolder inside.

![File Station — docker folders](screenshots/syno-1-file-station-docker-folders.png)

### Step 2 — Create a new Triggered Task

Open **Control Panel → Task Scheduler**, then click **Create → Triggered Task → User-defined Script**.

In the **General** tab:
- **Task:** `Install visualizer-lite`
- **User:** `root`
- **Enabled:** leave **unchecked** (this is a one-time setup task, not a recurring schedule)

![Create Task — General settings](screenshots/syno-2-create-task-install-visualizer-lite-root.jpeg)

### Step 3 — Enter the install script

Switch to the **Task Settings** tab and paste the following into the **User-defined script** field:

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

Replace `your-password` with a strong password of your choice.

Optionally, enable **Send run details by email** and enter your address — useful to confirm the task ran successfully.

![Task Settings — Custom Script](screenshots/syno-3-docker-task-custom-script-settings.png)

Click **OK**. DSM will ask you to confirm with your DSM account password.

![DSM password confirmation](screenshots/syno-4-root-password.jpeg)

### Step 4 — Run the task

Back in the Task Scheduler list, right-click the **Install visualizer-lite** task and select **Run**.

![Task Manager — Run](screenshots/syno-5-task-manager-run-visualizer-lite.jpeg)

DSM will pull the image from GitHub Container Registry and start the container. This may take a minute on the first run.

Open `http://<NAS-IP>:3000` in your browser. Log in with the password you set.

---

## Method 2: SSH / Command Line

If you prefer the classic approach, SSH into your NAS and run the commands directly.

### Step 1 — Create the data directory

```bash
sudo mkdir -p /volume1/docker/visualizer-lite/data
```

### Step 2 — Start the container

```bash
sudo docker run -d \
  --name visualizer-lite \
  --restart unless-stopped \
  -p 3000:3000 \
  -v /volume1/docker/visualizer-lite/data:/data \
  -e VL_SESSION_SECRET="$(openssl rand -base64 48)" \
  -e VL_PASSWORD="your-password" \
  ghcr.io/tomschmidtdev/visualizer-lite:latest
```

Replace `your-password` with a strong password of your choice.

Open `http://<NAS-IP>:3000` in your browser.

---

## Parameter reference

| Parameter | What to change |
|---|---|
| `-v /volume1/docker/visualizer-lite/data:/data` | The path **left of the colon** is where data is stored on your NAS. The `/data` on the right must stay as-is. |
| `VL_SESSION_SECRET` | A long random string used to sign login sessions. Generated automatically by `openssl rand -base64 48`. **Keep it consistent** — changing it logs out all active sessions. |
| `VL_PASSWORD` | Your login password. Can be changed later in the app settings. |
| `-p 3000:3000` | The port used to access the app (left side). Change to e.g. `-p 8080:3000` if port 3000 is already in use. |

---

## HTTPS (optional)

If you need HTTPS (e.g. for external access), you have two options:

**Option A — Synology Reverse Proxy (recommended)**
Use *Control Panel → Login Portal → Advanced → Reverse Proxy* to handle HTTPS externally. The container runs on plain HTTP internally — no changes to the install script needed.

**Option B — Mount a certificate directly**
Add a certificate volume and change the port:

```bash
sudo docker run -d \
  --name visualizer-lite \
  --restart unless-stopped \
  -p 3443:3000 \
  -v /volume1/docker/visualizer-lite/data:/data \
  -v /volume1/docker/visualizer-lite/certs:/certs:ro \
  -e VL_SESSION_SECRET="$(openssl rand -base64 48)" \
  -e VL_PASSWORD="your-password" \
  ghcr.io/tomschmidtdev/visualizer-lite:latest
```

Place your certificate files at:
```
/volume1/docker/visualizer-lite/certs/
├── fullchain.pem
└── privkey.pem
```

Export the DSM certificate via *Control Panel → Security → Certificate → Export*, then:
```bash
cat cert.pem chain.pem > fullchain.pem
```

---

## Updating

To update to the latest version:

```bash
docker pull ghcr.io/tomschmidtdev/visualizer-lite:latest
docker stop visualizer-lite
docker rm visualizer-lite
# Re-run the docker run command from the install step
```

Your data in `/volume1/docker/visualizer-lite/data` is preserved across updates.

---

← [Back to main README](../README.md)
