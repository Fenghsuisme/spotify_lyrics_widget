import React, { useState, useEffect, useRef } from 'react';
const { ipcRenderer } = window.require('electron');

export default function LyricsView() {
  const [currentSong, setCurrentSong] = useState({ title: "等待播放...", artist: "" });
  const [parsedLyrics, setParsedLyrics] = useState([]);
  const [rawLyrics, setRawLyrics] = useState("");
  const [currentTime, setCurrentTime] = useState(0);
  const [isHovered, setIsHovered] = useState(false);
  
  const [translateY, setTranslateY] = useState(0);
  const lineRefs = useRef([]); 
  const containerRef = useRef(null); 

  const [settings, setSettings] = useState({
    fontSize: 24,
    isLocked: true, 
    isVisible: true,
    idleOpacity: 0.3
  });

  const parseLyrics = (lyricsText) => {
    if (!lyricsText) return [];
    return lyricsText.split('\n').map(line => {
      const match = line.match(/\[(\d{2}):(\d{2})\.?(\d{2,3})?\](.*)/);
      if (match) {
        const minutes = parseInt(match[1]);
        const seconds = parseInt(match[2]);
        const milliseconds = match[3] ? parseInt(match[3]) : 0;
        return { time: minutes * 60 + seconds + milliseconds / 1000, text: match[4].trim() };
      }
      return null;
    }).filter(item => item !== null);
  };

  useEffect(() => {
    ipcRenderer.on('update-song', (event, songData) => {
      setCurrentSong(songData);
      if (songData.progressMs !== undefined) {
        const serverTime = songData.progressMs / 1000;
        setCurrentTime(prevTime => Math.abs(serverTime - prevTime) > 1.5 ? serverTime : prevTime);
      }
    });

    ipcRenderer.on('update-lyrics', (event, newLyrics) => {
      if (!newLyrics || newLyrics === "") {
        setRawLyrics("");
        setParsedLyrics([]);
        setTranslateY(0);
      } else {
        setRawLyrics(newLyrics);
        setParsedLyrics(parseLyrics(newLyrics));
      }
    });

    ipcRenderer.on('apply-style', (event, newStyle) => {
      setSettings(prev => ({ ...prev, ...newStyle }));
    });
    
    ipcRenderer.on('mouse-ignore-reply', () => {}); 

    return () => ipcRenderer.removeAllListeners('update-song');
  }, []);

  useEffect(() => {
    if (settings.isLocked) {
      ipcRenderer.send('set-mouse-ignore', true, { forward: true });
    } else {
      ipcRenderer.send('set-mouse-ignore', false);
    }
  }, [settings.isLocked]);

  useEffect(() => {
    let interval;
    if (currentSong.isPlaying) {
      interval = setInterval(() => setCurrentTime(prev => prev + 0.1), 100);
    }
    return () => clearInterval(interval);
  }, [currentSong.isPlaying]);

  const activeIndex = parsedLyrics.findIndex(line => line.time > currentTime) - 1;
  const safeIndex = activeIndex < 0 ? 0 : activeIndex;

  useEffect(() => {
    const activeLine = lineRefs.current[safeIndex];
    const container = containerRef.current;

    if (activeLine && container) {
      // 1. 取得這行歌詞的高度 (會隨字體大小變動)
      const lineHeight = activeLine.clientHeight;
      // 2. 取得這行歌詞距離清單頂端的位置
      const lineTop = activeLine.offsetTop;
      // 3. 取得容器的可視高度
      const containerHeight = container.clientHeight;

      // 🧮 公式：要把這行歌詞置中，應該往上捲多少？
      // 目標位置 = (歌詞頂端位置) - (容器一半高度) + (歌詞一半高度)
      // 這樣歌詞的中心點，就會對齊容器的中心點
      const targetTranslateY = lineTop - (containerHeight / 2) + (lineHeight / 2);

      setTranslateY(targetTranslateY);
    }
  }, [safeIndex, parsedLyrics, settings.fontSize]);
  if (!settings.isVisible) return null;

  const currentOpacity = (isHovered || !settings.isLocked) ? 1 : settings.idleOpacity;

  return (
    <div 
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      style={{
        width: '100%',
        height: '100vh',
        backgroundColor: !settings.isLocked ? 'rgba(0, 0, 0, 0.5)' : 'transparent',
        border: !settings.isLocked ? '2px dashed #1DB954' : 'none',
        display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center',
        userSelect: 'none',
        WebkitAppRegion: !settings.isLocked ? 'drag' : 'no-drag',
        cursor: !settings.isLocked ? 'move' : 'default',
        overflow: 'hidden',
        opacity: currentOpacity, 
        transition: 'opacity 0.3s ease, background-color 0.3s'
      }}
    >
      <div style={{ textAlign: 'center', display: 'flex', flexDirection: 'column', gap: '4px', width: '100%' }}>
        
        {/* 歌名 */}
        <div style={{ 
          fontSize: '12px', color: '#ddd', marginBottom: '8px',
          opacity: isHovered ? 1 : 0, transition: 'opacity 0.3s',
          position: 'absolute', top: '10px', width: '100%', left: 0
        }}>
          {currentSong.title} - {currentSong.artist}
        </div>

        {/* 歌詞容器 */}
        <div 
          ref={containerRef}
          style={{ 
            height: '4em', 
            fontSize: `${settings.fontSize}px`,
            
            overflow: 'hidden', 
            position: 'relative',
            width: '100%',
            maskImage: 'linear-gradient(to bottom, transparent 0%, black 10%, black 90%, transparent 100%)',
            marginTop: '10px'
          }}
        >
          {/* 捲動清單 */}
          <div style={{
            transform: `translateY(-${translateY}px)`, 
            transition: 'transform 0.5s cubic-bezier(0.25, 1, 0.5, 1)',
            width: '100%',
          }}>
            {parsedLyrics.length > 0 ? (
              parsedLyrics.map((line, index) => {
                const isActive = index === safeIndex;
                const isNext = index === safeIndex + 1;
                
                return (
                  <div 
                    key={index}
                    ref={el => lineRefs.current[index] = el}
                    style={{
                      fontSize: isActive ? '1em' : '0.6em', 
                      lineHeight: '1.5',
                      padding: '0.2em 0',
                      
                      color: isActive ? '#1DB954' : (isNext ? 'rgba(255, 255, 255, 0.6)' : 'rgba(255, 255, 255, 0)'),
                      fontWeight: isActive ? 'bold' : 'normal',
                      textShadow: isActive || isNext ? '0px 2px 4px rgba(0,0,0,0.9)' : 'none',
                      transition: 'all 0.5s ease',
                      opacity: isActive || isNext ? 1 : 0,
                      transform: isActive ? 'scale(1.05)' : 'scale(1)',
                      filter: isActive ? 'blur(0px)' : (isNext ? 'blur(0px)' : 'blur(2px)')
                    }}
                  >
                    {line.text}
                  </div>
                );
              })
            ) : (
              <div style={{ fontSize: '1em', color: '#1DB954', fontWeight: 'bold', marginTop: '1.5em' }}>
                {rawLyrics ? "..." : ""}
              </div>
            )}
          </div>
        </div>

      </div>
    </div>
  );
}