const { app, BrowserWindow, ipcMain, screen, shell, Tray, Menu, nativeImage } = require('electron');
const SpotifyWebApi = require('spotify-web-api-node');
const express = require('express');
const axios = require('axios');
const path = require('path');
const log = require('electron-log');
app.commandLine.appendSwitch('remote-debugging-port', '9222');

const isPackaged = app.isPackaged;

const spotifyApi = new SpotifyWebApi({
  clientId: 'f0ada2f6a44e476892571219416c1e50',
  clientSecret: '5b12477b77424122abeec8cabdf08a50',
  redirectUri: 'http://127.0.0.1:8888/callback'
});  

log.info('App starting... Packaged:', isPackaged);

let lyricsWindow;
let settingsWindow;
let tray = null;
let currentTrackId = null;

// --- 歌詞獲取邏輯 ---
async function fetchLyrics(trackName, artistName, durationMs) {
    try {
      const cleanArtist = artistName.split(',')[0].trim();
      const cleanTrack = trackName.replace(/\(.*\)|-.*|feat\..*/i, '').trim();
      log.info(`正在搜尋歌詞: ${cleanTrack} - ${cleanArtist}`);
      
      const url = `https://lrclib.net/api/get`;
      const response = await axios.get(url, {
        params: { artist_name: cleanArtist, track_name: cleanTrack, duration: durationMs / 1000 }
      });
      return response.data.syncedLyrics || response.data.plainLyrics || "找不到歌詞";
    } catch (error) { 
      log.error('歌詞搜尋失敗:', error.message);
      return "歌詞搜尋失敗"; 
    }
}

// --- Spotify 授權伺服器 ---
function startAuthServer() {
    const server = express();
    server.get('/callback', (req, res) => {
      const code = req.query.code;
      if (!code) return res.send('Error: No code');
      spotifyApi.authorizationCodeGrant(code).then(data => {
        spotifyApi.setAccessToken(data.body['access_token']);
        spotifyApi.setRefreshToken(data.body['refresh_token']);
        res.send('Login Success! You can close this window.');
        log.info('Spotify 登入成功！');
        
        setInterval(checkCurrentSong, 1000);
        setInterval(refreshAccessToken, (data.body['expires_in'] / 2) * 1000);
      }).catch(err => log.error('登入錯誤:', err));
    });
    server.listen(8888, '127.0.0.1');
}

function refreshAccessToken() {
    spotifyApi.refreshAccessToken().then(data => {
      spotifyApi.setAccessToken(data.body['access_token']);
      log.info('Token 已刷新');
    }).catch(err => log.error('刷新 Token 失敗', err));
}

function checkCurrentSong() {
  if (!lyricsWindow) return;
  spotifyApi.getMyCurrentPlayingTrack().then(async (data) => {
    if (data.body && data.body.item) {
      const item = data.body.item;
      const songInfo = {
        title: item.name,
        artist: item.artists.map(a => a.name).join(', '),
        isPlaying: data.body.is_playing,
        progressMs: data.body.progress_ms,
      };
      lyricsWindow.webContents.send('update-song', songInfo);
      if (item.id !== currentTrackId) {
        currentTrackId = item.id;
        log.info(`換歌: ${songInfo.title}`);
        lyricsWindow.webContents.send('update-lyrics', ""); 
        const lyrics = await fetchLyrics(item.name, songInfo.artist, item.duration_ms);
        lyricsWindow.webContents.send('update-lyrics', lyrics);
      }
    }
  }).catch(err => {});
}

// --- 視窗建立邏輯 ---

function createLyricsWindow() {
  const { width, height } = screen.getPrimaryDisplay().workAreaSize;
  lyricsWindow = new BrowserWindow({
    width: 600, height: 150, x: Math.round((width - 600) / 2), y: height - 200,
    frame: false, transparent: true, alwaysOnTop: true, hasShadow: false,
    resizable: true, show: false,
    webPreferences: { 
        nodeIntegration: true, 
        contextIsolation: false,
        webSecurity: false 
    }
  });

  if (isPackaged) {
    lyricsWindow.loadFile(path.join(__dirname, 'build', 'index.html'), { hash: 'lyrics' });
  } else {
    lyricsWindow.loadURL('http://127.0.0.1:3000#/lyrics');
  }

  lyricsWindow.setIgnoreMouseEvents(true, { forward: true });

  lyricsWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  lyricsWindow.once('ready-to-show', () => lyricsWindow.show());
}

function createSettingsWindow() {
  settingsWindow = new BrowserWindow({
    width: 300,
    height: 440,
    show: false,
    frame: false,
    resizable: false,
    alwaysOnTop: true,
    webPreferences: { 
        nodeIntegration: true, 
        contextIsolation: false 
    },
  });

  if (isPackaged) {
    settingsWindow.loadFile(path.join(__dirname, 'build', 'index.html'), { hash: 'settings' });
  } else {
    settingsWindow.loadURL('http://127.0.0.1:3000#/settings');
  }

  settingsWindow.on('blur', () => {
    settingsWindow.hide();
  });
}

function createTray() {
  const iconPath = !isPackaged 
    ? path.join(__dirname, 'public/icon.png')
    : path.join(process.resourcesPath, 'icon.png');
    
  let icon = nativeImage.createEmpty();
  try {
     icon = nativeImage.createFromPath(iconPath).resize({ width: 18, height: 18 });
  } catch (e) { log.error("Icon loading failed"); }

  tray = new Tray(icon);
  tray.setToolTip('Spotify Lyrics Widget');
  tray.on('click', (event, bounds) => {
    const { x, y } = bounds;
    const { height, width } = settingsWindow.getBounds();
    if (settingsWindow.isVisible()) {
      settingsWindow.hide();
    } else {
      const yPosition = process.platform === 'darwin' ? y : y - height;
      settingsWindow.setBounds({
        x: Math.round(x - width / 2),
        y: Math.round(yPosition + 30),
        width, height
      });
      settingsWindow.show();
    }
  });
  tray.on('right-click', () => {
    const contextMenu = Menu.buildFromTemplate([{ label: 'Quit', click: () => app.quit() }]);
    tray.popUpContextMenu(contextMenu);
  });
}

// --- IPC 監聽 ---
ipcMain.on('update-style', (event, style) => {
  if (lyricsWindow) {
    lyricsWindow.webContents.send('apply-style', style);
    if (style.windowWidth) {
      const currentSize = lyricsWindow.getSize();
      lyricsWindow.setSize(Math.round(style.windowWidth), currentSize[1]);
    }
  }
});

ipcMain.on('set-mouse-ignore', (event, ignore, options) => {
    if (lyricsWindow) {
        const forward = options && options.forward;
        lyricsWindow.setIgnoreMouseEvents(ignore, { forward: !!forward });
    }
});

app.whenReady().then(() => {
  createLyricsWindow();
  createSettingsWindow();
  createTray();
  startAuthServer();
  if (app.dock) app.dock.hide();
  const authorizeURL = spotifyApi.createAuthorizeURL(['user-read-currently-playing', 'user-read-playback-state']);
  shell.openExternal(authorizeURL);
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});