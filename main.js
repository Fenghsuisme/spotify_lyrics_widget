const { app, BrowserWindow, ipcMain, screen, shell, Tray, Menu, nativeImage } = require('electron');
const SpotifyWebApi = require('spotify-web-api-node');
const express = require('express');
const axios = require('axios');
const path = require('path');
const log = require('electron-log');
const OpenCC = require('opencc-js');
require('dotenv').config({ path: path.join(__dirname, '.env') });
app.commandLine.appendSwitch('remote-debugging-port', '9222');

const toTraditional = OpenCC.Converter({ from: 'cn', to: 'tw' });
const LYRICS_TIMEOUT = 8000;

const isPackaged = app.isPackaged;

const spotifyApi = new SpotifyWebApi({
  clientId: process.env.SPOTIFY_CLIENT_ID,
  clientSecret: process.env.SPOTIFY_CLIENT_SECRET,
  redirectUri: process.env.SPOTIFY_REDIRECT_URI || 'http://127.0.0.1:8888/callback'
});  

log.info('App starting... Packaged:', isPackaged);

let lyricsWindow;
let settingsWindow;
let tray = null;
let currentTrackId = null;

// --- 歌詞獲取邏輯 ---
function pickBestSearchResult(results, durationSec) {
  if (!Array.isArray(results) || results.length === 0) return null;
  const pool = results.filter(r => r.syncedLyrics);
  if (pool.length === 0) return null;
  pool.sort((a, b) => Math.abs((a.duration || 0) - durationSec) - Math.abs((b.duration || 0) - durationSec));
  const best = pool[0];
  // 時長差超過 10 秒很可能是同名的另一首歌（或不同版本），同步歌詞會整個對不上
  if (Math.abs((best.duration || 0) - durationSec) > 10) return null;
  return best.syncedLyrics;
}

// --- 第二來源：網易雲音樂（中文歌覆蓋率高）---
function pickBestNeteaseSong(songs, artist, durationMs) {
  if (!Array.isArray(songs) || songs.length === 0) return null;
  const artistLower = artist.toLowerCase();
  const scored = songs
    .map(song => {
      const durDiff = Math.abs((song.duration || 0) - durationMs);
      const artistMatch = (song.artists || []).some(a => {
        const name = (a.name || '').toLowerCase();
        return name.includes(artistLower) || artistLower.includes(name);
      });
      return { song, durDiff, artistMatch };
    })
    // 歌手對得上允許 10 秒誤差；對不上就要求時長幾乎一致，避免抓到翻唱
    .filter(x => x.durDiff <= 10000 && (x.artistMatch || x.durDiff <= 3000));
  scored.sort((a, b) => (b.artistMatch - a.artistMatch) || (a.durDiff - b.durDiff));
  return scored.length > 0 ? scored[0].song : null;
}

async function fetchNeteaseLyrics(trackName, cleanTrack, primaryArtist, durationMs) {
  const headers = { Referer: 'https://music.163.com', 'User-Agent': 'Mozilla/5.0' };
  const queries = [`${trackName} ${primaryArtist}`, `${cleanTrack} ${primaryArtist}`, cleanTrack];
  for (const q of [...new Set(queries)]) {
    try {
      const { data } = await axios.get('https://music.163.com/api/search/get', {
        params: { s: q, type: 1, limit: 10 }, headers, timeout: LYRICS_TIMEOUT
      });
      const best = pickBestNeteaseSong(data.result && data.result.songs, primaryArtist, durationMs);
      if (!best) continue;
      const lyricRes = await axios.get('https://music.163.com/api/song/lyric', {
        params: { id: best.id, lv: 1, tv: -1 }, headers, timeout: LYRICS_TIMEOUT
      });
      const lrc = lyricRes.data && lyricRes.data.lrc && lyricRes.data.lrc.lyric;
      if (lrc && /\[\d{2}:\d{2}/.test(lrc)) {
        log.info(`歌詞命中 (網易雲): ${best.name} - ${(best.artists || []).map(a => a.name).join(', ')}`);
        return toTraditional(lrc);
      }
    } catch (error) {
      // 逾時或查無結果就換下一組關鍵字
    }
  }
  return null;
}

async function fetchLyrics(trackName, artistName, durationMs) {
    const durationSec = Math.round(durationMs / 1000);
    const primaryArtist = artistName.split(',')[0].trim();
    const cleanTrack = (trackName
      .replace(/\s*[\(\[（【].*?[\)\]）】]/g, '')
      .replace(/\s+-\s+.*$/, '')
      .replace(/\s*feat\..*$/i, '')
      .trim()) || trackName;

    const attempts = [
      { type: 'get', track: trackName, artist: primaryArtist, duration: durationSec },
      { type: 'get', track: cleanTrack, artist: primaryArtist, duration: durationSec },
      { type: 'get', track: cleanTrack, artist: primaryArtist },
      { type: 'search', params: { track_name: trackName, artist_name: primaryArtist } },
      { type: 'search', params: { track_name: cleanTrack, artist_name: primaryArtist } },
      { type: 'search', params: { q: `${cleanTrack} ${primaryArtist}` } },
    ];

    // 沒有時間軸的純文字歌詞顯示不出來，留到最後不得已才用
    let plainFallback = null;

    for (const attempt of attempts) {
      try {
        if (attempt.type === 'get') {
          const params = { track_name: attempt.track, artist_name: attempt.artist };
          if (attempt.duration) params.duration = attempt.duration;
          const { data } = await axios.get('https://lrclib.net/api/get', { params, timeout: LYRICS_TIMEOUT });
          if (data.syncedLyrics) {
            log.info(`歌詞命中 (get): ${attempt.track} - ${attempt.artist}`);
            return data.syncedLyrics;
          }
          if (data.plainLyrics && !plainFallback) plainFallback = data.plainLyrics;
        } else {
          const { data } = await axios.get('https://lrclib.net/api/search', { params: attempt.params, timeout: LYRICS_TIMEOUT });
          const lyrics = pickBestSearchResult(data, durationSec);
          if (lyrics) {
            log.info(`歌詞命中 (search): ${JSON.stringify(attempt.params)}`);
            return lyrics;
          }
        }
      } catch (error) {
        // 404 或網路錯誤都直接換下一招
      }
    }

    const neteaseLyrics = await fetchNeteaseLyrics(trackName, cleanTrack, primaryArtist, durationMs);
    if (neteaseLyrics) return neteaseLyrics;

    if (plainFallback) return plainFallback;
    log.info(`所有搜尋方式都找不到歌詞: ${trackName} - ${primaryArtist}`);
    return "找不到歌詞";
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
  const requestStart = Date.now();
  spotifyApi.getMyCurrentPlayingTrack().then(async (data) => {
    if (data.body && data.body.item) {
      const item = data.body.item;
      // progress_ms 是伺服器產生回應當下的進度，等我們收到時已經過了約半個往返延遲
      const latencyComp = data.body.is_playing ? (Date.now() - requestStart) / 2 : 0;
      const songInfo = {
        title: item.name,
        artist: item.artists.map(a => a.name).join(', '),
        isPlaying: data.body.is_playing,
        progressMs: data.body.progress_ms + latencyComp,
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