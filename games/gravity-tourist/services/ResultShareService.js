import { firebaseAuthentication, firebaseDatabase } from '../../../shared/firebase-connection.js';
import { uploadImage } from '../../../shared/cloudinary-media-service.js';
import { addDoc, collection, doc, getDoc, serverTimestamp, setDoc, Timestamp } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';
import { resolveDisplayName } from '../../../shared/user-identity.js';

const GAME_URL = new URL('./', location.href).href;
const conversationId = (a, b) => [a, b].sort().join('_');
const formatTime = seconds => `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`;

export class ResultShareService {
  constructor(sourceCanvas) { this.sourceCanvas = sourceCanvas; this.file = null; this.objectUrl = ''; this.uploadPromise = null; this.result = null; }

  async prepare(run, reason, achievement = {}) {
    this.disposePreview(); this.uploadPromise = null; this.result = { ...run, reason, achievement, shareKind:'run' };
    const card = document.createElement('canvas'); card.width = 1200; card.height = 630;
    const ctx = card.getContext('2d', { alpha: false });
    const sourceRatio = this.sourceCanvas.width / this.sourceCanvas.height, targetRatio = card.width / card.height;
    let sx = 0, sy = 0, sw = this.sourceCanvas.width, sh = this.sourceCanvas.height;
    if (sourceRatio > targetRatio) { sw = sh * targetRatio; sx = (this.sourceCanvas.width - sw) / 2; }
    else { sh = sw / targetRatio; sy = (this.sourceCanvas.height - sh) / 2; }
    ctx.drawImage(this.sourceCanvas, sx, sy, sw, sh, 0, 0, card.width, card.height);
    const shade = ctx.createLinearGradient(0, 0, 1200, 630); shade.addColorStop(0, 'rgba(1,7,22,.96)'); shade.addColorStop(.52, 'rgba(2,9,28,.42)'); shade.addColorStop(1, 'rgba(2,7,20,.78)'); ctx.fillStyle = shade; ctx.fillRect(0, 0, 1200, 630);
    ctx.strokeStyle = '#55dfff'; ctx.lineWidth = 3; ctx.strokeRect(28, 28, 1144, 574);
    ctx.fillStyle = '#67f5c7'; ctx.font = '800 22px monospace'; ctx.fillText('VHHT ARCADE // FLIGHT RECORD', 70, 86);
    ctx.fillStyle = '#f7f9ff'; ctx.font = 'italic 900 68px Arial'; ctx.fillText('GRAVITY TOURIST', 68, 166);
    ctx.fillStyle = '#7deaff'; ctx.font = '800 20px monospace'; ctx.fillText('JUST VISITING · DESTINATION EARTH', 72, 204);
    const achievementLabel = achievement.rank > 0 && achievement.rank <= 3 ? `GLOBAL TOP ${achievement.rank}` : achievement.isNewBest ? 'NEW PERSONAL RECORD' : '';
    if (achievementLabel) { const gradient=ctx.createLinearGradient(820,70,1130,140);gradient.addColorStop(0,achievement.rank===1?'#ffcf4a':'#9c63ff');gradient.addColorStop(1,'#ff4ca6');ctx.fillStyle=gradient;ctx.fillRect(815,70,313,72);ctx.strokeStyle='#fff8';ctx.strokeRect(815,70,313,72);ctx.fillStyle='#07101f';ctx.textAlign='center';ctx.font='900 25px Arial';ctx.fillText(achievementLabel,971,115);ctx.textAlign='left'; }
    ctx.fillStyle = '#ffffff'; ctx.font = '900 112px Arial'; ctx.fillText(Number(run.score || 0).toLocaleString('en-US'), 66, 350);
    ctx.fillStyle = '#95a9c9'; ctx.font = '800 19px monospace'; ctx.fillText('RUN SCORE', 72, 388);
    const stats = [['ASSISTS', run.approaches], ['PERFECT', run.perfect], ['BEST COMBO', `×${1 + Number(run.bestCombo || 0) * .25}`], ['FLIGHT TIME', formatTime(run.elapsed || 0)]];
    stats.forEach(([label, value], index) => { const x = 72 + index * 245; ctx.fillStyle = '#6f87aa'; ctx.font = '800 15px monospace'; ctx.fillText(label, x, 478); ctx.fillStyle = '#f7f9ff'; ctx.font = '900 30px Arial'; ctx.fillText(String(value), x, 520); });
    ctx.fillStyle = '#ff7b91'; ctx.font = '800 16px monospace'; ctx.fillText(String(reason || 'RUN TERMINATED'), 72, 575);
    ctx.textAlign = 'right'; ctx.fillStyle = '#67f5c7'; ctx.fillText('CAN YOU BEAT THIS RUN?', 1128, 575); ctx.textAlign = 'left';
    return this.createFile(card,'gravity-tourist-run');
  }

  async prepareLeaderboard(entry, totalPlayers = 0) {
    this.disposePreview();this.uploadPromise=null;this.result={...entry,score:Number(entry?.highScore||0),approaches:Number(entry?.highestApproach||0),elapsed:Number(entry?.longestSurvival||0),shareKind:'ranking',totalPlayers};
    const card=document.createElement('canvas');card.width=1200;card.height=630;const ctx=card.getContext('2d',{alpha:false});
    const background=ctx.createRadialGradient(860,170,20,600,330,720);background.addColorStop(0,'#243e9b');background.addColorStop(.45,'#071a43');background.addColorStop(1,'#020611');ctx.fillStyle=background;ctx.fillRect(0,0,1200,630);
    for(let i=0;i<90;i++){const x=(i*173)%1160+20,y=(i*97)%590+20,r=i%11===0?2.2:.8;ctx.fillStyle=i%7===0?'#74eaff':'#ffffff99';ctx.beginPath();ctx.arc(x,y,r,0,Math.PI*2);ctx.fill();}
    ctx.strokeStyle='#54dcff';ctx.lineWidth=3;ctx.strokeRect(28,28,1144,574);ctx.fillStyle='#6ff2d0';ctx.font='800 21px monospace';ctx.fillText('VHHT ARCADE // GLOBAL RANKING',70,84);ctx.fillStyle='#fff';ctx.font='italic 900 64px Arial';ctx.fillText('GRAVITY TOURIST',68,158);
    const rank=Number(entry?.rank||0);ctx.fillStyle=rank===1?'#ffd452':rank<=3&&rank>0?'#dbb6ff':'#72e9ff';ctx.font='900 190px Arial';ctx.fillText(rank?`#${rank}`:'#—',68,390);ctx.fillStyle='#91a9ca';ctx.font='800 18px monospace';ctx.fillText(`CURRENT POSITION · ${totalPlayers||'—'} RANKED PLAYERS`,75,430);
    const stats=[['PERSONAL BEST',Number(entry?.highScore||0).toLocaleString('en-US')],['BEST APPROACH',entry?.highestApproach||0],['LONGEST FLIGHT',formatTime(entry?.longestSurvival||0)]];stats.forEach(([label,value],index)=>{const x=620+index*180;ctx.fillStyle='#7891b7';ctx.font='800 14px monospace';ctx.fillText(label,x,300);ctx.fillStyle='#fff';ctx.font='900 27px Arial';ctx.fillText(String(value),x,342);});ctx.fillStyle='#62f1d1';ctx.font='800 17px monospace';ctx.fillText('MY JOURNEY SO FAR',620,230);ctx.fillStyle='#a6b7d1';ctx.font='700 17px Arial';ctx.fillText('Every flight writes a better route to Earth.',620,392);ctx.fillStyle='#fff';ctx.font='900 21px Arial';ctx.fillText('CAN YOU TAKE MY POSITION?',620,456);
    return this.createFile(card,'gravity-tourist-ranking');
  }

  async createFile(canvas,prefix){const blob=await new Promise((resolve,reject)=>canvas.toBlob(value=>value?resolve(value):reject(new Error('Không thể tạo ảnh kết quả.')),'image/webp',.9));this.file=new File([blob],`${prefix}-${Date.now()}.webp`,{type:'image/webp'});this.objectUrl=URL.createObjectURL(this.file);return{file:this.file,url:this.objectUrl};}
  text() { const run = this.result || {}; if(run.shareKind==='ranking')return `Tôi hiện đang xếp hạng #${run.rank||'—'} trong Gravity Tourist, với kỷ lục ${Number(run.highScore||0).toLocaleString('vi-VN')} điểm. Bạn có thể vượt vị trí này không?`;const achievement=run.achievement||{},prefix=achievement.rank>0&&achievement.rank<=3?`Tôi vừa vươn lên TOP ${achievement.rank} toàn cầu! `:achievement.isNewBest?'Tôi vừa phá kỷ lục cá nhân! ':'';return `${prefix}Tôi đạt ${Number(run.score || 0).toLocaleString('vi-VN')} điểm trong Gravity Tourist với ${run.approaches || 0} gravity assists và sống sót ${formatTime(run.elapsed || 0)}. Bạn có vượt qua được không?`; }
  requireUser() { const user = firebaseAuthentication.currentUser; if (!user) throw new Error('Bạn cần đăng nhập VHHT để chia sẻ kết quả.'); return user; }
  async upload() { if (!this.file) throw new Error('Ảnh kết quả chưa sẵn sàng.'); if (!this.uploadPromise) this.uploadPromise = uploadImage(this.file).catch(error => { this.uploadPromise = null; throw error; }); return this.uploadPromise; }
  metadata() { const run = this.result || {}; return { gameId: 'gravity-tourist', shareKind:run.shareKind||'run', rank:Number(run.rank||run.achievement?.rank||0), isNewBest:Boolean(run.achievement?.isNewBest), score: Number(run.score || run.highScore || 0), approaches: Number(run.approaches || 0), perfect: Number(run.perfect || 0), bestCombo: Number(run.bestCombo || 0), elapsed: Number(run.elapsed || 0), reason: run.reason || '', gameUrl: GAME_URL }; }

  async friends() {
    const user = this.requireUser(), snapshot = await getDoc(doc(firebaseDatabase, 'users', user.uid)), ids = (snapshot.data()?.friends || []).map(value => typeof value === 'string' ? value : value?.uid || value?.id || value?.userId || value?.friendId).filter(Boolean);
    const profiles = await Promise.all(ids.map(id => getDoc(doc(firebaseDatabase, 'users', id))));
    return profiles.filter(item => item.exists()).map(item => ({ id: item.id, ...item.data(), name: resolveDisplayName(item.data()) }));
  }

  async post(customContent = '') {
    const user = this.requireUser(), [profileSnapshot, media] = await Promise.all([getDoc(doc(firebaseDatabase, 'users', user.uid)), this.upload()]), profile = profileSnapshot.data() || {}, text = this.text();
    const reference = await addDoc(collection(firebaseDatabase, 'posts'), { authorId:user.uid, authorEmail:user.email, authorDisplayName:resolveDisplayName(profile,user), authorAvatar:profile.photoURL||profile.profileImage||'', authorRole:profile.role||'user', content:String(customContent||text).trim(), attachedImage:media.mediaUrl, attachedImages:[{url:media.mediaUrl,type:'image',publicId:media.mediaPublicId}], mediaType:'image', mediaUrl:media.mediaUrl, mediaPublicId:media.mediaPublicId, mediaFormat:media.mediaFormat, mediaBytes:media.mediaBytes, mediaWidth:media.mediaWidth, mediaHeight:media.mediaHeight, privacy:'public', gameResult:this.metadata(), createdAt:serverTimestamp(), reactions:{}, commentCount:0 });
    return reference.id;
  }

  async note(customContent = '') {
    const user = this.requireUser(), [profileSnapshot, media] = await Promise.all([getDoc(doc(firebaseDatabase, 'users', user.uid)), this.upload()]), friends = (profileSnapshot.data()?.friends || []).map(value => typeof value === 'string' ? value : value?.uid || value?.id || value?.userId || value?.friendId).filter(Boolean);
    await setDoc(doc(firebaseDatabase, 'messengerNotes', user.uid), { authorId:user.uid, content:String(customContent||`Gravity Tourist · ${Number(this.result.score || 0).toLocaleString('vi-VN')} điểm`).trim().slice(0,160), mediaUrl:media.mediaUrl, mediaType:'image', gameResult:this.metadata(), createdAt:serverTimestamp(), expiresAt:Timestamp.fromMillis(Date.now()+86400000), visibleTo:friends });
  }

  async message(friendId, customContent = '') {
    const user = this.requireUser(), friends = await this.friends(); if (!friends.some(friend => friend.id === friendId)) throw new Error('Chỉ có thể gửi thử thách cho bạn bè.');
    const media = await this.upload(), id = conversationId(user.uid, friendId), content = String(customContent||this.text()).trim();
    await setDoc(doc(firebaseDatabase, 'conversations', id), { members:[user.uid,friendId], lastMessageAt:serverTimestamp(), updatedAt:serverTimestamp() }, { merge:true });
    await addDoc(collection(firebaseDatabase, 'conversations', id, 'messages'), { senderId:user.uid, recipientId:friendId, content, mediaUrl:media.mediaUrl, mediaType:'image', mediaPublicId:media.mediaPublicId, gameResult:this.metadata(), createdAt:serverTimestamp(), readAt:null });
    await addDoc(collection(firebaseDatabase, 'messageNotifications'), { recipientId:friendId, senderId:user.uid, conversationId:id, isRead:false, createdAt:serverTimestamp() });
  }

  async nativeShare() { if (!navigator.share) throw new Error('Trình duyệt này chưa hỗ trợ bảng chia sẻ hệ thống.'); const data = { title:'Gravity Tourist · VHHT', text:this.text(), url:GAME_URL, files:[this.file] }; if (!navigator.canShare?.({files:data.files})) delete data.files; await navigator.share(data); }
  download() { const link = document.createElement('a'); link.href = this.objectUrl; link.download = this.file.name; link.click(); }
  disposePreview() { if (this.objectUrl) URL.revokeObjectURL(this.objectUrl); this.objectUrl = ''; }
}
