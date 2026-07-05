import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import LyricsView from './LyricsView';
import SettingsView from './SettingsView';

// main.js 開視窗時用 hash 區分：#/lyrics 是歌詞浮窗、#/settings 是設定面板
const isSettings = window.location.hash.includes('settings');

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(isSettings ? <SettingsView /> : <LyricsView />);
