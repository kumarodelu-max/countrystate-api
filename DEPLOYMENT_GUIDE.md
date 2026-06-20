# CountryState API - AWS EC2 Deployment Guide

This document serves as a complete, step-by-step reference guide for deploying the CountryState Node.js API to an AWS Ubuntu Server.

---

## ⚡ Quick Server Management (Cheat Sheet)

If you have just updated code locally and want to push it to your live server, follow these 3 steps:

### 1. Connect to AWS via SSH
Open `cmd` (Command Prompt) in the folder where your `csc-key.pem` file is located, and run:
```cmd
ssh -i "csc-key.pem" ubuntu@15.207.82.84
```
*(Type `yes` if it asks if you want to continue connecting).*

### 2. Pull Latest Code from GitHub
Once you are logged into the AWS server, navigate to the project folder and pull the latest code:
```bash
cd /var/www/countrstate
git pull origin master
```

### 3. Restart the API Server (Important)
Because PM2 process names can vary depending on how you originally started it, you should always check the name of your running process first:

```bash
# A. View all running processes and find your API's name under the "name" column
pm2 list

# B. Restart that exact process name (e.g. if it is named 'server' or 'app')
pm2 restart <YOUR-PROCESS-NAME>
```

#### Troubleshooting PM2
If you ever accidentally start two processes for the same API, you might get a port conflict. Run `pm2 list` to check. 
If you see duplicates, delete the wrong one by running:
```bash
pm2 delete <WRONG-PROCESS-NAME>
pm2 save
```

---

## 🛠️ Phase 1: Infrastructure Setup (AWS & DNS)

### 1. Domain Configuration (Namecheap)
* Domain `countrystatecityapp.in` registered.
* Two **A Records** added pointing `@` and `www` to the AWS Elastic IP (`15.207.82.84`).

### 2. AWS EC2 Server
* Launched a **`t3.micro` Ubuntu Server** (Asia Pacific - Mumbai).
* **Security Groups:** Opened Port 22 (SSH), Port 80 (HTTP), and Port 443 (HTTPS) to the public internet.
* **Elastic IP:** `15.207.82.84` allocated and attached.
* Generated and downloaded the private key file (`csc-key.pem`).

---

## 🛠️ Phase 2: Server Provisioning (Ubuntu)

Connect to the server via SSH using your `.pem` key, then install the core engine:

### 1. PostgreSQL Database
```bash
sudo apt update
sudo apt install postgresql postgresql-contrib
```
*Login and create the production user and database:*
```bash
sudo -u postgres psql
```
```sql
CREATE USER cs_admin WITH PASSWORD 'CountryStateProd@2026!';
CREATE DATABASE countrystate OWNER cs_admin;
\q
```

### 2. Install Node.js (v22), Redis, and PM2
```bash
# Node.js 22 LTS
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt install -y nodejs

# Redis (for Rate Limiting)
sudo apt install -y redis-server

# PM2 (Process Manager)
sudo npm install -g pm2
```

---

## 📦 Phase 3: Code Deployment

### 1. Secure Local Code (On Windows)
Before pushing code, ensure sensitive files are ignored. Create a `.gitignore` file containing:
```text
node_modules/
.env
```

### 2. Push to GitHub
Create an empty repository on GitHub, then link and push:
```bash
git init
git add .
git commit -m "Initial production commit"
git remote add origin https://github.com/kumarodelu-max/countrystate-api.git
git push -u origin master
```

### 3. Pull to AWS Server
On the AWS Terminal, download the code and install Linux dependencies:
```bash
git clone https://github.com/kumarodelu-max/countrystate-api.git
cd countrystate-api
npm install
```

---

## ⚙️ Phase 4: Production Configuration

### 1. The Environment File (.env)
Since the `.env` was ignored by Git, manually create it on the server:
```bash
nano .env
```
*Paste production details:*
```env
PORT=3000
DB_HOST=127.0.0.1
DB_USER=cs_admin
DB_PASSWORD=CountryStateProd@2026!
DB_NAME=countrystate
REDIS_ENABLED=true
REDIS_HOST=127.0.0.1
JWT_SECRET=super_secret_production_key_123
TURNSTILE_SECRET_KEY=1x0000000000000000000000000000000AA
```

### 2. Seed the Database
Run the schema creation and data fetching script:
```bash
npm run db:seed
```

### 3. Start the Server (PM2)
```bash
pm2 start server.js --name "countrystate-api"
pm2 save
```

---

## 🌐 Phase 5: Reverse Proxy (Nginx)

To map port 80 (public internet) to port 3000 (Node app):

### 1. Install & Configure Nginx
```bash
sudo apt install -y nginx
sudo nano /etc/nginx/sites-available/default
```

### 2. Nginx Configuration Block
*Delete everything in the default file and paste this:*
```nginx
server {
    listen 80;
    server_name countrystatecityapp.in www.countrystatecityapp.in;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}
```

### 3. Restart Nginx
```bash
sudo systemctl restart nginx
```
*The API is now live at `http://countrystatecityapp.in`!*

---
*(Note: To add SSL/HTTPS in the future, install Certbot and run `sudo certbot --nginx -d countrystatecityapp.in`)*
