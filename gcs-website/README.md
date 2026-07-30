# Graphite & Charcoal Studio Website

## How to deploy on GitHub Pages

### Step 1 — Create a GitHub account
Go to github.com and sign up if you don't have an account.

### Step 2 — Create a new repository
- Click the + icon → New repository
- Name it: `gcs-website` (or anything you like)
- Set it to **Public**
- Click Create repository

### Step 3 — Upload the files
- Click **uploading an existing file**
- Drag and drop `index.html` from this folder
- Click **Commit changes**

### Step 4 — Enable GitHub Pages
- Go to repository Settings
- Scroll to **Pages** in the left sidebar
- Under Source select **Deploy from a branch**
- Branch: **main** / Folder: **/ (root)**
- Click Save

### Step 5 — Your website is live!
GitHub will give you a URL like:
`https://yourusername.github.io/gcs-website`

This usually takes 2 to 5 minutes to go live.

---

## Video library password
Default password: **gcs2026**

To change it, open index.html, find this line near the bottom:
```
const PASSWORD = "gcs2026";
```
Replace `gcs2026` with your new password and re-upload the file.

---

## To add a new episode
Open index.html, find the video library section and copy an existing ep-card block.
Update the YouTube embed URL, episode number and title.
Re-upload to GitHub.

---

## Custom domain (optional)
If you want graphiteandcharcoalstudio.com instead of the github.io URL,
buy the domain from GoDaddy or Namecheap (~Rs 800/year) and follow
GitHub Pages custom domain instructions.

How to add new youtube link :

<div class="ep-card" onclick="openPlayer('YOUR_YOUTUBE_ID','Episode 08','Your Episode Title Here')">
  <div class="ep-thumb">
    <img class="ep-thumb-img" src="https://img.youtube.com/vi/YOUR_YOUTUBE_ID/mqdefault.jpg" alt="EP08 thumbnail"/>
    <div class="ep-thumb-overlay"><div class="ep-play-btn"><svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg></div></div>
    <span class="ep-badge">EP 08</span>
  </div>
  <div class="ep-body"><p class="ep-num">Episode 08</p><p class="ep-title">Your Episode Title Here</p></div>
</div>

Just replace two things:

YOUR_YOUTUBE_ID — the part after youtu.be/ in your video link. For example if the link is https://youtu.be/abc123xyz then the ID is abc123xyz
Your Episode Title Here — your episode title

The thumbnail pulls automatically from YouTube — no image upload needed.
