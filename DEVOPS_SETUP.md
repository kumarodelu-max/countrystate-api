# GitHub Actions DevOps Setup Guide

To allow GitHub Actions to automatically deploy your code to your AWS server, you need to securely give GitHub your AWS SSH Key and Server IP. GitHub stores these in a highly secure vault called **GitHub Secrets**.

Follow these exact steps once we finish adding the Docker files to your project.

---

### Step 1: Open Your GitHub Repository Settings
1. Go to your repository on GitHub (`kumarodelu-max/countrystate-api`).
2. Click on the **Settings** tab at the top.
3. On the left sidebar, scroll down and click on **Secrets and variables**, then click **Actions**.
4. Click the green button that says **New repository secret**.

---

### Step 2: Add Your AWS Host IP
1. **Name:** Type exactly `AWS_HOST`
2. **Secret:** Type your AWS Public IP: `15.207.82.84`
3. Click **Add secret**.

---

### Step 3: Add Your SSH Username
1. Click **New repository secret** again.
2. **Name:** Type exactly `AWS_USERNAME`
3. **Secret:** Type `ubuntu`
4. Click **Add secret**.

---

### Step 4: Add Your Private `.pem` Key
1. Click **New repository secret** one last time.
2. **Name:** Type exactly `AWS_PRIVATE_KEY`
3. **Secret:** You need to paste the ENTIRE contents of your `csc-key.pem` file here.
   - *How to get the contents:* Open your `csc-key.pem` file in Notepad. Press `Ctrl + A` to select everything, then `Ctrl + C` to copy.
   - It should start with `-----BEGIN RSA PRIVATE KEY-----` and end with `-----END RSA PRIVATE KEY-----`.
   - Paste all of that into the Secret box.
4. Click **Add secret**.

---

### Step 5: Test the Automation!
Once those 3 secrets are added, you are completely done! 
From now on, whenever you type `git push` on your computer, GitHub Actions will automatically read these secrets, securely log into your AWS server in the background, and restart your Dockerized application!
