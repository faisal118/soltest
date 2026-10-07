export const icons = {
  cross: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M12 2v4m0 12v4M2 12h4m12 0h4"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="1"/></svg>',
  arrow: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M4 12h15m-6-6 6 6-6 6"/></svg>',
  pin: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M19 10c0 5-7 11-7 11S5 15 5 10a7 7 0 1 1 14 0Z"/><circle cx="12" cy="10" r="2.5"/></svg>',
  sun: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="12" cy="12" r="4"/><path d="M12 1v3m0 16v3M1 12h3m16 0h3M4 4l2 2m12 12 2 2M4 20l2-2M18 6l2-2"/></svg>',
  sound: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M4 9v6h4l5 4V5L8 9H4Zm12-1a6 6 0 0 1 0 8m3-11a10 10 0 0 1 0 14"/></svg>',
  gear: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="m10 3-1 3-3 1-3-1-1 4 2 2-1 3 3 3 3-1 2 3 4-1 1-3 3-1 2-4-3-2 1-3-3-3-3 1Z"/><circle cx="12" cy="12" r="3"/></svg>',
  shield: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M12 3 4 6v6c0 5 8 9 8 9s8-4 8-9V6l-8-3Z"/><path d="m8 12 3 3 5-6"/></svg>',
  close: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="m6 6 12 12M18 6 6 18"/></svg>',
};

export function createUI() {
  document.querySelector<HTMLDivElement>('#app')!.innerHTML = `
    <div class="cinematic-vignette"></div>
    <div class="menu-shade" id="menu-shade"></div>
    <header class="topbar" id="topbar">
      <a class="brand" href="#" aria-label="Kabul Recon home" id="home">
        <span class="brand-symbol"><svg viewBox="0 0 35 38" fill="none"><path d="M4 3h7v12L24 3h9L18 18l16 17H23L11 22v13H4V3Z" fill="currentColor"/><path d="M0 0h8M0 0v8M35 38h-8m8 0v-8" stroke="currentColor" stroke-width="1"/></svg></span>
        <span class="brand-name">KABUL<span>RECON</span></span><span class="brand-separator"></span><span class="edition">URBAN OPERATIONS<br><strong>VOL. 01 / AFGHANISTAN</strong></span>
      </a>
      <nav class="main-nav" aria-label="Main navigation"><button class="nav-button active" id="nav-operation">THE OPERATION</button><button class="nav-button" id="nav-guide">FIELD GUIDE <span>↗</span></button><button class="nav-button" id="nav-settings">${icons.gear} SETTINGS</button></nav>
      <button class="audio-button" id="audio-toggle" aria-label="Enable audio" title="Toggle audio">${icons.sound}<span id="audio-label">SOUND OFF</span></button>
    </header>
    <main class="main-menu" id="main-menu">
      <div class="hero-eyebrow"><span class="line"></span> A CITY. A MISSION. YOUR MOVE.</div>
      <h1>KABUL<span>RECON<span class="title-dot">.</span></span></h1>
      <div class="operation-title"><span class="operation-line"></span> OPERATION FIRST LIGHT <span class="operation-number">/ 001</span></div>
      <p class="hero-description">Beneath the mountains. Beyond the ordinary.<br>Step into the streets of Kabul in an immersive<br class="desktop-break"> first-person urban operation.</p>
      <div class="mode-tabs" role="tablist" aria-label="Game mode"><button class="mode-tab active" id="mode-mission" role="tab" aria-selected="true">${icons.cross} THE OPERATION <span class="tab-dot"></span></button><button class="mode-tab" id="mode-explore" role="tab" aria-selected="false">${icons.pin} FREE ROAM</button></div>
      <div class="mission-brief"><div class="brief-icon">${icons.shield}</div><div><span class="small-label" id="brief-label">YOUR OBJECTIVE</span><p id="brief-text">Locate and neutralize 6 rogue drones.<br>Secure the district. Return to extraction.</p></div><span class="brief-index">01—06</span></div>
      <button class="deploy-button" id="deploy"><span class="deploy-icon">${icons.cross}</span><span id="deploy-label">DEPLOY TO KABUL</span>${icons.arrow}</button>
      <div class="deploy-footnote"><span class="status-dot"></span> SINGLE PLAYER <span class="footnote-divider">/</span> NO DOWNLOAD REQUIRED</div>
      <div class="quick-controls"><span><kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> MOVE</span><span><svg viewBox="0 0 18 24" fill="none" stroke="currentColor"><rect x="3" y="2" width="12" height="19" rx="6"/><path d="M9 2v7m-6 0h12"/></svg> LOOK & SHOOT</span><span><kbd>ESC</kbd> PAUSE</span></div>
    </main>
    <aside class="location-info" id="location-info"><div class="live-badge"><span class="status-dot"></span> LIVE ENVIRONMENT</div><div class="location-name">${icons.pin}<div>KABUL, AFGHANISTAN<span>34°33′ N &nbsp; 69°12′ E &nbsp; / &nbsp; 1,790 M</span></div></div><div class="weather">${icons.sun}<span>07:42 AM <i></i> 22°C <i></i> CLEAR SKIES</span></div></aside>
    <div class="district-tag" id="district-tag"><span class="vertical-rule"></span><div><span class="small-label">YOUR AREA OF OPERATIONS</span><strong>SHAHR-E NAW DISTRICT</strong><span class="district-detail">KABUL-INSPIRED URBAN ENVIRONMENT</span></div><span class="district-coordinate">SECTOR<br><strong>04</strong></span></div>
    <div class="compass" id="compass"><span class="compass-bearing" id="bearing">N</span><div class="compass-ruler">240 <i></i> 270 <i></i> 300 <i></i> <b>N</b> <i></i> 30 <i></i> 60 <i></i> 90</div><div class="compass-pointer">▾</div></div>
    <div class="crosshair" id="crosshair"><i></i><i></i><i></i><i></i><span></span></div><div id="hitmarker" class="hitmarker">×</div>
    <div class="damage-overlay" id="damage-overlay"></div>
    <div id="objective-marker" class="objective-marker"><span>◇</span><strong id="marker-distance">28 M</strong></div>
    <section class="game-hud" id="game-hud" hidden>
      <div class="hud-left"><div class="hud-location">${icons.pin} SHAHR-E NAW <span>SECTOR 04</span></div><div class="objective-panel"><div class="objective-heading"><span class="status-dot"></span> <span id="objective-heading">OPERATION FIRST LIGHT</span><span id="mission-timer">00:00</span></div><p id="objective-text">Neutralize the rogue drones</p><div class="objective-progress"><span id="objective-count">00 / 06</span><div class="progress-track"><div id="objective-fill"></div></div></div></div><div class="health-panel">${icons.shield}<span id="health">100</span><div class="health-track"><div id="health-fill"></div></div><span class="small-label">HEALTH</span></div></div>
      <div class="hud-right"><div class="weapon-name">M4A1 <span>5.56 × 45 MM</span></div><div class="ammo-count"><span id="ammo">30</span><span class="ammo-divider">/</span><span id="reserve">120</span></div><div class="fire-mode"><span class="status-dot"></span> AUTO <span> <kbd>R</kbd> RELOAD</span></div></div>
      <div class="hud-bottom"><span><kbd>M</kbd> TACTICAL MAP</span><span><kbd>SHIFT</kbd> SPRINT</span><span><kbd>SPACE</kbd> JUMP</span><span><kbd>ESC</kbd> PAUSE</span></div>
    </section>
    <div class="notification" id="notification" role="status"></div><div id="interaction" class="interaction" hidden><kbd>E</kbd> RESUPPLY AMMUNITION</div>
    <footer class="footer" id="footer"><div><span class="footer-live-dot"></span> BUILT IN THREE.JS <span class="footer-sep">/</span> REAL-TIME 3D</div><div class="footer-center">A DIFFERENT PERSPECTIVE.</div><div>EXPERIENCE V.1.0 <span class="footer-sep">/</span> <span id="fps">60</span> FPS</div></footer>
    <div class="modal-backdrop" id="modal" hidden><section class="modal-card" role="dialog" aria-modal="true" aria-labelledby="modal-title"><button class="modal-close" id="modal-close" aria-label="Close dialog">${icons.close}</button><div class="hero-eyebrow"><span class="line"></span> KABUL RECON / FIELD SYSTEMS</div><h2 id="modal-title">FIELD GUIDE</h2><div id="modal-content"></div></section></div>
    <div class="result-screen" id="result" hidden><div class="result-card"><span class="hero-eyebrow" id="result-eyebrow">OPERATION COMPLETE</span><div class="result-emblem">${icons.shield}</div><h2 id="result-title">DISTRICT SECURED.</h2><p id="result-description">The skies are clear. Your operation is complete.</p><div class="result-stats"><div><span id="result-kills">6 / 6</span><small>DRONES NEUTRALIZED</small></div><div><span id="result-time">00:00</span><small>OPERATION TIME</small></div><div><span id="result-accuracy">100%</span><small>ACCURACY</small></div></div><button class="deploy-button" id="restart"><span>RETURN TO BRIEFING</span>${icons.arrow}</button></div></div>
    <div class="loading" id="loading"><div class="loading-mark">K<span>R</span></div><span>ESTABLISHING THE ENVIRONMENT</span><div class="loading-line"></div></div>
  `;
}

export const guideContent = `
  <p class="modal-intro">Know the streets. Stay on the move.</p>
  <div class="guide-grid">
    <div><kbd>W A S D</kbd><span>Move through the district</span></div><div><kbd>MOUSE</kbd><span>Look around</span></div>
    <div><kbd>LEFT CLICK</kbd><span>Fire your M4A1</span></div><div><kbd>RIGHT CLICK</kbd><span>Aim down sights</span></div>
    <div><kbd>SHIFT</kbd><span>Sprint</span></div><div><kbd>SPACE</kbd><span>Jump</span></div>
    <div><kbd>R</kbd><span>Reload magazine</span></div><div><kbd>M</kbd><span>Open tactical map</span></div>
    <div><kbd>E</kbd><span>Resupply at insertion point</span></div><div><kbd>ESC</kbd><span>Pause / release cursor</span></div>
  </div>
  <div class="guide-note">${icons.cross}<p><strong>THE OPERATION</strong>Follow the amber markers. Destroy all six rogue drones, then return to your insertion point to extract. Keep moving to evade incoming fire. Health slowly recovers when you’re out of danger.</p></div>
  <p class="setting-note">Desktop keyboard and mouse recommended. The game captures your cursor while playing. The environment is a fictionalized Kabul-inspired district, not a map-accurate reproduction of present-day Kabul.</p>
`;
