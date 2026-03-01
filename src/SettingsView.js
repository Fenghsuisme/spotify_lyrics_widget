import React, { useState, useEffect } from 'react';
const { ipcRenderer } = window.require('electron');

export default function SettingsView() {
  const [fontSize, setFontSize] = useState(24);
  const [windowWidth, setWindowWidth] = useState(460);
  const [idleOpacity, setIdleOpacity] = useState(0.8);
  const [isLocked, setIsLocked] = useState(true);
  const [isVisible, setIsVisible] = useState(true);

  useEffect(() => {
    ipcRenderer.send('update-style', {
      fontSize,
      windowWidth,
      idleOpacity,
      isLocked,
      isVisible
    });
  }, [fontSize, windowWidth, idleOpacity, isLocked, isVisible]);

  const containerStyle = {
    padding: '20px', backgroundColor: '#282828', color: 'white',
    height: '100vh', display: 'flex', flexDirection: 'column', gap: '15px',
    fontFamily: 'sans-serif', border: '1px solid #444'
  };
  const labelStyle = { display: 'flex', justifyContent: 'space-between', marginBottom: '5px', fontSize: '13px', color: '#ccc' };
  const inputStyle = { width: '100%', accentColor: '#1DB954', cursor: 'pointer' };

  return (
    <div style={containerStyle}>
      <h3 style={{ margin: 0, color: '#1DB954', textAlign: 'center' }}>Setting</h3>
      
      {/* 1. 字體大小 */}
      <div>
        <div style={labelStyle}><span>字體大小</span><span>{fontSize}px</span></div>
        <input type="range" min="12" max="48" value={fontSize} onChange={(e) => setFontSize(Number(e.target.value))} style={inputStyle} />
      </div>

      {/* 2. 視窗寬度 */}
      <div>
        <div style={labelStyle}><span>視窗寬度</span><span>{windowWidth}px</span></div>
        <input type="range" min="300" max="800" value={windowWidth} onChange={(e) => setWindowWidth(Number(e.target.value))} style={inputStyle} />
      </div>

      {/* 3. ✨ 閒置透明度 */}
      <div>
        <div style={labelStyle}><span>閒置透明度</span><span>{Math.round(idleOpacity * 100)}%</span></div>
        <input 
          type="range" min="0" max="1" step="0.1" 
          value={idleOpacity} 
          onChange={(e) => setIdleOpacity(Number(e.target.value))} 
          style={inputStyle} 
        />
        <div style={{ fontSize: '10px', color: '#666', marginTop: '2px' }}>
            {idleOpacity === 0 ? "完全隱形" : (idleOpacity === 1 ? "永遠顯示" : "滑鼠移開後變淡")}
        </div>
      </div>

      <hr style={{ borderColor: '#444', width: '100%' }} />

      {/* 4. 鎖定位置 */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ fontSize: '14px' }}>Position Lock</span>
        <div 
          onClick={() => setIsLocked(!isLocked)}
          style={{
            width: '40px', height: '20px', borderRadius: '10px',
            backgroundColor: isLocked ? '#1DB954' : '#555',
            position: 'relative', cursor: 'pointer', transition: 'background 0.3s'
          }}
        >
          <div style={{
            width: '16px', height: '16px', borderRadius: '50%', background: 'white',
            position: 'absolute', top: '2px', left: isLocked ? '22px' : '2px', transition: 'left 0.3s'
          }} />
        </div>
      </div>

      {/* 5. 開關 */}
      <button 
        onClick={() => setIsVisible(!isVisible)}
        style={{
          padding: '8px', borderRadius: '4px', border: 'none',
          backgroundColor: isVisible ? '#e74c3c' : '#1DB954',
          color: 'white', cursor: 'pointer', fontWeight: 'bold', marginTop: '10px'
        }}
      >
        {isVisible ? "隱藏歌詞" : "顯示歌詞"}
      </button>

      <div style={{ marginTop: 'auto', textAlign: 'center', fontSize: '11px', color: '#666' }}>
        右鍵點選圖示可完全關閉程式
      </div>
    </div>
  );
}