const fs=require('fs'),path=require('path');const {createCanvas}=require('@napi-rs/canvas');
const {renderWelcome}=require('../src/image');const {loadConfig}=require('../src/config');
const fetcher=async()=>{const c=createCanvas(256,256),x=c.getContext('2d');const g=x.createLinearGradient(0,0,256,256);
g.addColorStop(0,'#ff6b6b');g.addColorStop(.5,'#feca57');g.addColorStop(1,'#48dbfb');x.fillStyle=g;x.fillRect(0,0,256,256);
x.fillStyle='#ffe0bd';x.beginPath();x.arc(128,110,55,0,7);x.fill();x.beginPath();x.arc(128,260,95,0,7);x.fill();
x.fillStyle='#222';x.beginPath();x.arc(108,105,7,0,7);x.arc(148,105,7,0,7);x.fill();return c.toBuffer('image/png');};
(async()=>{const cfg=loadConfig();for(const [f,n] of [['sample-welcome.png','Amir'],['sample-welcome-long.png','Alexander The Extremely Long Display Name Collector 🎨']])
fs.writeFileSync(path.join(__dirname,'..',f),await renderWelcome({displayName:n,memberCount:1234,avatarUrls:['x'],config:cfg.image,fetcher}));console.log('ok')})();
