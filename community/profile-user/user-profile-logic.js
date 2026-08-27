import { firebaseAuthentication, firebaseDatabase } from "../../shared/firebase-connection.js";
import { doc, getDoc, getDocs, setDoc, updateDoc, deleteDoc, addDoc, collection, query, where, orderBy, onSnapshot, arrayUnion, arrayRemove, serverTimestamp, Timestamp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { onAuthStateChanged, updateProfile } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { startPresenceTracking } from "../../shared/presence-handler.js";
import { acceptFriendship, repairFriendship, getFriendshipState, removeFriendship } from "../../shared/friendship-service.js";
import { resolveDisplayName, isGeneratedDisplayName } from "../../shared/user-identity.js";
import { soundManager, playUiSound } from "../../shared/audio/sound-manager.js?v=6";
import { getDefaultAvatarUrl, resolveAvatarUrl, applyAvatarFallback } from "../../shared/default-avatar.js";
import { clearNoteReactions, listenNoteReactions, NOTE_REACTIONS, setNoteReaction } from "../../shared/note-reactions.js";
startPresenceTracking();
import("./profile-enhancements.js?v=profile-media-viewer-23").catch(error=>{
  console.error("Không thể khởi tạo công cụ hồ sơ",error);
  const toastElement=document.getElementById("cosmic-toast");
  if(toastElement){toastElement.textContent=`Lỗi công cụ chỉnh ảnh: ${error?.message||"Không xác định"}`;toastElement.classList.add("visible")}
});

const $ = id => document.getElementById(id);
const DEFAULT_AVATAR = getDefaultAvatarUrl({uid:"vhht-member",displayName:"VHHT"});
const fields = { displayName: $("profile-display-name-input"), biography: $("profile-biography-input"), birthday: $("profile-birthday-input"), gender: $("profile-gender-input"), location: $("profile-location-input"), work: $("profile-work-input") };
const birthdayDisplay = $("profile-birthday-display");
const isoToBirthday=value=>{const match=String(value||"").match(/^(\d{4})-(\d{2})-(\d{2})$/);return match?`${match[3]}/${match[2]}/${match[1]}`:""};
const birthdayToIso=value=>{const match=String(value||"").match(/^(\d{2})\/(\d{2})\/(\d{4})$/);if(!match)return"";const [,day,month,year]=match,probe=new Date(`${year}-${month}-${day}T00:00:00`);return probe.getFullYear()===Number(year)&&probe.getMonth()+1===Number(month)&&probe.getDate()===Number(day)?`${year}-${month}-${day}`:""};
function syncBirthdayDisplay(){if(birthdayDisplay)birthdayDisplay.value=isoToBirthday(fields.birthday?.value)}
birthdayDisplay?.addEventListener("input",()=>{const digits=birthdayDisplay.value.replace(/\D/g,"").slice(0,8);birthdayDisplay.value=[digits.slice(0,2),digits.slice(2,4),digits.slice(4,8)].filter(Boolean).join("/");const iso=birthdayToIso(birthdayDisplay.value);if(iso)fields.birthday.value=iso;else if(!birthdayDisplay.value)fields.birthday.value=""});
birthdayDisplay?.addEventListener("blur",()=>{if(birthdayDisplay.value&&!birthdayToIso(birthdayDisplay.value)){birthdayDisplay.setCustomValidity("Hãy nhập ngày hợp lệ theo định dạng dd/mm/yyyy");birthdayDisplay.reportValidity()}else birthdayDisplay.setCustomValidity("")});
fields.birthday?.addEventListener("change",syncBirthdayDisplay);
$("profile-birthday-picker")?.addEventListener("click",()=>{try{if(fields.birthday.showPicker)fields.birthday.showPicker();else fields.birthday.click()}catch{fields.birthday.click()}});
let viewer = null, profileId = null, profileData = {}, stopProfileRealtime = null, stopProfileNoteRealtime = null, stopProfileNoteReactions = null, profileNoteExpiryTimer = null, currentProfileNote = null;
const MEMBER_ID_ALPHABET="ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
function createMemberId(){const bytes=new Uint8Array(8);crypto.getRandomValues(bytes);const token=Array.from(bytes,value=>MEMBER_ID_ALPHABET[value%MEMBER_ID_ALPHABET.length]).join("");return `VHHT-${token.slice(0,4)}-${token.slice(4)}`}
async function ensurePrivateMemberId(){
  if(profileData.memberId)return profileData.memberId;
  const users=await getDocs(collection(firebaseDatabase,"users"));
  const used=new Set(users.docs.map(item=>String(item.data().memberId||"").toUpperCase()).filter(Boolean));
  let memberId="";
  for(let attempt=0;attempt<8&&!memberId;attempt+=1){const candidate=createMemberId();if(!used.has(candidate))memberId=candidate}
  if(!memberId)throw new Error("Không thể tạo ID thành viên duy nhất");
  await setDoc(doc(firebaseDatabase,"users",viewer.uid),{memberId,memberIdCreatedAt:serverTimestamp()},{merge:true});
  profileData.memberId=memberId;
  return memberId;
}
let selectedPostFiles=[];
const relationshipId=value=>typeof value==="string"?value:(value?.uid||value?.id||value?.userId||value?.friendId||"");
const relationshipIds=values=>[...new Set((Array.isArray(values)?values:[]).map(relationshipId).filter(Boolean))];

function syncProfileDisplayName(value){
  const heading=$("profile-name-heading"),name=String(value||"Thành viên VHHT").trim()||"Thành viên VHHT";
  if(!heading)return;
  heading.textContent=name;
  heading.title=name;
  const length=Array.from(name).length;
  heading.classList.toggle("is-long-name",length>20);
  heading.classList.toggle("is-very-long-name",length>32);
}

function ensureProfilePresentation(){
  const introduction=document.querySelector(".profile-grid > .profile-card:first-child"),account=document.querySelector(".account-info"),composer=$("profile-composer");
  document.querySelectorAll("#profile-post-privacy option").forEach(option=>{option.textContent=option.textContent.replace(/^[🌐👥🔒]\s*/u,"")});
  const decorate=(card,icon)=>{const heading=card?.querySelector(":scope > h2");if(!heading||heading.querySelector(".profile-section-title"))return;const text=[...heading.childNodes].find(node=>node.nodeType===Node.TEXT_NODE&&node.textContent.trim());const label=(text?.textContent||"").trim();text?.remove();const title=document.createElement("span");title.className="profile-section-title";title.innerHTML=`<i class="fa-solid ${icon}"></i><span></span>`;title.querySelector("span").textContent=label;heading.prepend(title)};
  decorate(introduction,"fa-address-card");decorate(account,"fa-shield-halved");
  if(composer&&!composer.querySelector(".profile-composer-title")){const title=document.createElement("div");title.className="profile-composer-title";title.innerHTML='<span><i class="fa-solid fa-satellite-dish"></i> Tạo bài viết</span><small>Chia sẻ một tín hiệu mới</small>';composer.prepend(title)}
  const avatarWrap=document.querySelector(".avatar-wrap");
  if(avatarWrap&&!$("profile-note-bubble")){const note=document.createElement("button");note.id="profile-note-bubble";note.className="profile-note-bubble";note.type="button";note.hidden=true;note.setAttribute("aria-label","Xem đầy đủ ghi chú");note.innerHTML="<span></span>";avatarWrap.prepend(note)}
  if(!$("profile-note-detail-dialog")){const dialog=document.createElement("dialog");dialog.id="profile-note-detail-dialog";dialog.className="profile-note-detail-dialog";dialog.innerHTML='<button type="button" aria-label="Đóng"><i class="fa-solid fa-xmark"></i></button><small><i class="fa-solid fa-clock"></i> Ghi chú trong 24 giờ</small><p id="profile-note-detail-content"></p>';document.body.appendChild(dialog);dialog.querySelector("button").onclick=()=>dialog.close();dialog.onclick=event=>{if(event.target===dialog)dialog.close()}}
}

function ensureProfileNoteEditor(){
  const dialog=$("profile-note-detail-dialog");
  if(!dialog||$("profile-note-editor"))return;
  dialog.innerHTML=`
    <header class="profile-note-dialog-header">
      <div><small><i class="fa-solid fa-clock"></i> Ghi chú trong 24 giờ</small><strong id="profile-note-dialog-title">Ghi chú</strong></div>
      <button type="button" data-close-note aria-label="Đóng"><i class="fa-solid fa-xmark"></i></button>
    </header>
    <p id="profile-note-detail-content"></p>
    <section class="profile-note-reactions" id="profile-note-reactions" hidden>
      <div class="profile-note-reaction-picker" id="profile-note-reaction-picker" aria-label="Thả cảm xúc cho ghi chú"></div>
      <button type="button" class="profile-note-reaction-summary" id="profile-note-reaction-summary" hidden></button>
      <div class="profile-note-reaction-list" id="profile-note-reaction-list" hidden></div>
    </section>
    <form id="profile-note-editor" hidden>
      <label for="profile-note-editor-input">Bạn đang nghĩ gì?</label>
      <textarea id="profile-note-editor-input" maxlength="160" rows="3" placeholder="Chia sẻ một ghi chú ngắn với bạn bè..."></textarea>
      <div class="profile-note-editor-meta"><span><i class="fa-regular fa-clock"></i> Tự xóa sau 24 giờ</span><output id="profile-note-editor-count">0/160</output></div>
      <div class="profile-note-editor-actions"><button type="button" id="profile-note-delete-button">Xóa ghi chú</button><button type="submit"><i class="fa-solid fa-paper-plane"></i> Chia sẻ</button></div>
    </form>`;
  dialog.querySelector("[data-close-note]").onclick=()=>dialog.close();
  dialog.onclick=event=>{if(event.target===dialog)dialog.close()};
  const editorInput=$("profile-note-editor-input");
  editorInput.addEventListener("input",()=>{$("profile-note-editor-count").textContent=`${editorInput.value.length}/160`});
  $("profile-note-editor").onsubmit=saveProfileNote;
  $("profile-note-delete-button").onclick=deleteProfileNote;
  Object.entries(NOTE_REACTIONS).forEach(([type,[emoji,label]])=>{const button=document.createElement("button");button.type="button";button.dataset.noteReaction=type;button.title=label;button.setAttribute("aria-label",label);button.textContent=emoji;button.onclick=()=>saveProfileNoteReaction(type);$("profile-note-reaction-picker").appendChild(button)});
}

function noteTimeMillis(value){return typeof value?.toMillis==="function"?value.toMillis():value?.seconds?value.seconds*1000:0}
function profileNoteFingerprint(note){return `${profileId}:${noteTimeMillis(note?.createdAt)}:${String(note?.content||"")}`}
function isProfileNoteSeen(note){return localStorage.getItem(`vhht_note_seen_${profileId}`)===profileNoteFingerprint(note)}
function syncProfileNoteRing(active,note=currentProfileNote){const wrap=document.querySelector(".avatar-wrap");if(!wrap)return;wrap.classList.toggle("has-active-note",active);wrap.classList.toggle("note-seen",active&&isProfileNoteSeen(note))}
function markProfileNoteSeen(){if(!currentProfileNote)return;localStorage.setItem(`vhht_note_seen_${profileId}`,profileNoteFingerprint(currentProfileNote));syncProfileNoteRing(true,currentProfileNote)}

function renderProfileNoteBubble(){
  ensureProfilePresentation();
  const bubble=$("profile-note-bubble");
  if(!bubble||!viewer)return;
  const content=String(currentProfileNote?.content||"").trim();
  const active=Boolean(content&&noteTimeMillis(currentProfileNote?.expiresAt)>Date.now());
  const isOwner=profileId===viewer.uid;
  if(!active&&!isOwner){bubble.hidden=true;bubble.onclick=null;return}
  bubble.hidden=false;
  bubble.classList.toggle("is-placeholder",!active);
  bubble.querySelector("span").textContent=active?content:"Bạn đang nghĩ gì?";
  bubble.title=active?(isOwner?"Xem hoặc chỉnh sửa ghi chú":"Xem ghi chú"):"Tạo ghi chú mới";
  bubble.setAttribute("aria-label",bubble.title);
  bubble.onclick=()=>openProfileNoteDialog(isOwner);
}

function showOwnProfileNotePlaceholder(){
  const bubble=$("profile-note-bubble");
  if(!bubble||!viewer||profileId!==viewer.uid)return;
  currentProfileNote=null;
  syncProfileNoteRing(false,null);
  bubble.hidden=false;
  bubble.classList.add("is-placeholder");
  bubble.querySelector("span").textContent="Bạn đang nghĩ gì?";
  bubble.title="Tạo ghi chú mới";
  bubble.setAttribute("aria-label","Tạo ghi chú mới");
  bubble.onclick=()=>openProfileNoteDialog(true);
}

function openProfileNoteDialog(editMode=false){
  const dialog=$("profile-note-detail-dialog"),editor=$("profile-note-editor"),detail=$("profile-note-detail-content"),reply=$("profile-note-reply-form");
  if(!dialog)return;
  const isOwner=profileId===viewer?.uid;
  const content=String(currentProfileNote?.content||"").trim();
  if(content)markProfileNoteSeen();
  $("profile-note-dialog-title").textContent=isOwner?(content?"Chỉnh sửa ghi chú":"Tạo ghi chú mới"):"Ghi chú của thành viên";
  detail.textContent=content;
  detail.hidden=isOwner&&editMode;
  if(editor){
    editor.hidden=!(isOwner&&editMode);
    const input=$("profile-note-editor-input");
    input.value=content;
    $("profile-note-editor-count").textContent=`${input.value.length}/160`;
    $("profile-note-delete-button").hidden=!content;
    if(!editor.hidden)requestAnimationFrame(()=>input.focus());
  }
  if(reply)reply.hidden=isOwner||!content;
  renderProfileNoteReactions(isOwner,Boolean(content));
  if(!dialog.open)dialog.showModal();
}

async function saveProfileNoteReaction(type){
  if(!viewer||profileId===viewer.uid||!currentProfileNote)return;
  const buttons=[...document.querySelectorAll("[data-note-reaction]")],active=buttons.find(button=>button.classList.contains("is-active"))?.dataset.noteReaction;
  buttons.forEach(button=>button.disabled=true);
  try{
    const next=active===type?null:type;
    await setNoteReaction(firebaseDatabase,profileId,viewer.uid,next);
    buttons.forEach(button=>button.classList.toggle("is-active",button.dataset.noteReaction===next));
    toast(next?`Đã thả ${NOTE_REACTIONS[next][0]} cho ghi chú`:"Đã gỡ cảm xúc");
  }catch(error){console.error(error);toast("Không thể cập nhật cảm xúc ghi chú")}
  finally{buttons.forEach(button=>button.disabled=false)}
}

async function renderProfileNoteReactionList(reactions){
  const list=$("profile-note-reaction-list"),summary=$("profile-note-reaction-summary");
  if(!list||!summary)return;
  const counts=reactions.reduce((result,item)=>{result[item.type]=(result[item.type]||0)+1;return result},{}),icons=Object.entries(counts).sort((a,b)=>b[1]-a[1]).slice(0,3).map(([type])=>NOTE_REACTIONS[type]?.[0]||"").join("");
  summary.hidden=false;summary.innerHTML=`<span>${icons||"♡"}</span><strong>${reactions.length}</strong><small>${reactions.length?"cảm xúc":"Chưa có cảm xúc"}</small>`;
  const people=await Promise.all(reactions.map(async reaction=>{try{const snapshot=await getDoc(doc(firebaseDatabase,"users",reaction.reactorId));return{...reaction,profile:snapshot.data()||{}}}catch{return{...reaction,profile:{}}}}));
  list.replaceChildren();
  people.forEach(({reactorId,type,profile})=>{const name=resolveDisplayName(profile),row=document.createElement("div");row.innerHTML='<img alt=""><span><strong></strong><small></small></span><b></b>';const image=row.querySelector("img");image.src=resolveAvatarUrl(profile.photoURL||profile.profileImage,{uid:reactorId,displayName:name});applyAvatarFallback(image,{uid:reactorId,displayName:name});row.querySelector("strong").textContent=name;row.querySelector("small").textContent=NOTE_REACTIONS[type]?.[1]||"Cảm xúc";row.querySelector("b").textContent=NOTE_REACTIONS[type]?.[0]||"♡";list.appendChild(row)});
}

async function renderProfileNoteReactions(isOwner,hasContent){
  const section=$("profile-note-reactions"),picker=$("profile-note-reaction-picker"),summary=$("profile-note-reaction-summary"),list=$("profile-note-reaction-list");
  stopProfileNoteReactions?.();stopProfileNoteReactions=null;
  if(!section)return;
  section.hidden=!hasContent;picker.hidden=isOwner;summary.hidden=!isOwner;list.hidden=true;
  if(!hasContent)return;
  if(isOwner){
    summary.onclick=()=>{list.hidden=!list.hidden;summary.setAttribute("aria-expanded",String(!list.hidden))};
    stopProfileNoteReactions=listenNoteReactions(firebaseDatabase,profileId,reactions=>renderProfileNoteReactionList(reactions),error=>console.warn("Không thể tải cảm xúc ghi chú",error));
  }else{
    try{const snapshot=await getDoc(doc(firebaseDatabase,"messengerNotes",profileId,"reactions",viewer.uid)),active=snapshot.data()?.type;document.querySelectorAll("[data-note-reaction]").forEach(button=>button.classList.toggle("is-active",button.dataset.noteReaction===active))}catch(error){console.warn("Không thể tải cảm xúc của bạn",error)}
  }
}

async function saveProfileNote(event){
  event.preventDefault();
  if(!viewer||profileId!==viewer.uid)return;
  const input=$("profile-note-editor-input"),content=input.value.trim(),submit=event.currentTarget.querySelector('button[type="submit"]');
  if(!content){input.focus();return}
  submit.disabled=true;
  try{
    const friendIds=relationshipIds(profileData.friends).filter(uid=>uid!==viewer.uid);
    await clearNoteReactions(firebaseDatabase,viewer.uid);
    await setDoc(doc(firebaseDatabase,"messengerNotes",viewer.uid),{
      authorId:viewer.uid,
      content,
      createdAt:serverTimestamp(),
      expiresAt:Timestamp.fromMillis(Date.now()+24*60*60*1000),
      visibleTo:friendIds
    });
    $("profile-note-detail-dialog").close();
    toast("Ghi chú đã được chia sẻ với bạn bè");
  }catch(error){
    console.error("Không thể lưu ghi chú hồ sơ",error);
    toast(error?.code==="permission-denied"?"Firebase đang từ chối quyền lưu ghi chú":"Không thể lưu ghi chú. Vui lòng thử lại.");
  }finally{submit.disabled=false}
}

async function deleteProfileNote(){
  if(!viewer||profileId!==viewer.uid||!currentProfileNote)return;
  const button=$("profile-note-delete-button");button.disabled=true;
  try{await clearNoteReactions(firebaseDatabase,viewer.uid);await deleteDoc(doc(firebaseDatabase,"messengerNotes",viewer.uid));$("profile-note-detail-dialog").close();toast("Đã xóa ghi chú")}
  catch(error){console.error(error);toast("Không thể xóa ghi chú")}
  finally{button.disabled=false}
}

function enhanceProfileNoteReply(){
  const dialog=$("profile-note-detail-dialog");if(!dialog||$("profile-note-reply-form"))return;
  const form=document.createElement("form");form.id="profile-note-reply-form";form.hidden=true;form.innerHTML='<label for="profile-note-reply-input">Trả lời ghi chú</label><div><input id="profile-note-reply-input" maxlength="500" placeholder="Viết câu trả lời…"><button type="submit" aria-label="Gửi trả lời"><i class="fa-solid fa-paper-plane"></i></button></div>';
  dialog.appendChild(form);form.onsubmit=sendProfileNoteReply;
  $("profile-note-bubble")?.addEventListener("click",()=>{form.hidden=profileId===viewer?.uid;$("profile-note-reply-input").value=""});
}
async function sendProfileNoteReply(event){
  event.preventDefault();if(!viewer||profileId===viewer.uid||!currentProfileNote)return;
  const input=$("profile-note-reply-input"),content=input.value.trim();if(!content){input.focus();return}const button=event.currentTarget.querySelector("button");button.disabled=true;
  try{const id=[viewer.uid,profileId].sort().join("_");await setDoc(doc(firebaseDatabase,"conversations",id),{members:[viewer.uid,profileId],updatedAt:serverTimestamp()},{merge:true});await addDoc(collection(firebaseDatabase,"conversations",id,"messages"),{senderId:viewer.uid,recipientId:profileId,content,noteReply:{authorId:profileId,content:String(currentProfileNote.content||"Ghi chú"),expiresAt:currentProfileNote.expiresAt||null},createdAt:serverTimestamp(),readAt:null});await addDoc(collection(firebaseDatabase,"messageNotifications"),{recipientId:profileId,senderId:viewer.uid,conversationId:id,isRead:false,createdAt:serverTimestamp()});$("profile-note-detail-dialog").close();const returnTo=`${location.pathname}${location.search}${location.hash||"#posts"}`;location.href=`../messages/messages-page.html?uid=${encodeURIComponent(profileId)}&returnTo=${encodeURIComponent(returnTo)}`}
  catch(error){toast(error?.code==="permission-denied"?"Chỉ bạn bè mới có thể trả lời ghi chú":"Không thể gửi câu trả lời ghi chú")}
  finally{button.disabled=false}
}
function listenProfileNoteRealtime(){
  stopProfileNoteRealtime?.();
  const bubble=$("profile-note-bubble");if(!bubble)return;
  stopProfileNoteRealtime=onSnapshot(doc(firebaseDatabase,"messengerNotes",profileId),snapshot=>{
    const note=snapshot.exists()?snapshot.data():null;
    const content=String(note?.content||"").trim();
    const active=Boolean(note&&noteTimeMillis(note.expiresAt)>Date.now()&&content);
    const isOwner=profileId===viewer?.uid;
    currentProfileNote=active?note:null;
    syncProfileNoteRing(active,currentProfileNote);
    clearTimeout(profileNoteExpiryTimer);
    bubble.hidden=!active&&!isOwner;
    bubble.classList.toggle("is-placeholder",!active);
    bubble.querySelector("span").textContent=active?content:"Bạn đang nghĩ gì?";
    bubble.title=active?content:"Tạo ghi chú mới";
    bubble.setAttribute("aria-label",active?(isOwner?"Xem hoặc chỉnh sửa ghi chú":"Xem đầy đủ ghi chú"):"Tạo ghi chú mới");
    bubble.onclick=()=>openProfileNoteDialog(isOwner);
    if(active)profileNoteExpiryTimer=setTimeout(()=>{
      currentProfileNote=null;
      syncProfileNoteRing(false,null);
      if(isOwner){bubble.hidden=false;bubble.classList.add("is-placeholder");bubble.querySelector("span").textContent="Bạn đang nghĩ gì?";bubble.title="Tạo ghi chú mới"}
      else bubble.hidden=true;
    },Math.max(0,noteTimeMillis(note.expiresAt)-Date.now()));
  },error=>{
    const isOwner=profileId===viewer?.uid;
    syncProfileNoteRing(false,null);
    bubble.hidden=!isOwner;
    if(isOwner){bubble.classList.add("is-placeholder");bubble.querySelector("span").textContent="Bạn đang nghĩ gì?";bubble.onclick=()=>openProfileNoteDialog(true)}
    console.warn("Không thể đọc ghi chú hồ sơ",error);
  });
}

onAuthStateChanged(firebaseAuthentication, async user => {
  if (!user) return location.href = "../../index.html";
  viewer = user; profileId = new URLSearchParams(location.search).get("uid") || user.uid;
  document.body.classList.toggle("viewing-profile", profileId !== user.uid);
  document.body.classList.toggle("own-profile", profileId === user.uid);
  ensureProfilePresentation();
  ensureProfileNoteEditor();
  showOwnProfileNotePlaceholder();
  enhanceProfileNoteReply();
  configureProfileViewMode(profileId === user.uid);
  configureProfileNavigation();
  try{await loadProfile();if(profileId===user.uid){enhanceProfileSelects();alignProfileComposerPrivacy()}listenProfileNoteRealtime();listenProfileRealtime()}catch(error){console.error("Không thể tải hồ sơ",error);if(!Object.keys(profileData).length){profileData=profileId===user.uid?{displayName:resolveDisplayName({},user),email:user.email||""}:{displayName:"Thành viên VHHT",email:""}}renderProfileCore();if(profileId===user.uid){enhanceProfileSelects();alignProfileComposerPrivacy()}listenProfileNoteRealtime();toast("Không thể tải đầy đủ hồ sơ. Vui lòng thử lại.")}
});

function listenProfileRealtime(){
  stopProfileRealtime?.();
  stopProfileRealtime=onSnapshot(doc(firebaseDatabase,"users",profileId),snapshot=>{
    if(!snapshot.exists())return;
    const next=snapshot.data(),resolvedNextName=resolveDisplayName(next,profileId===viewer.uid?viewer:null);next.displayName=isGeneratedDisplayName(resolvedNextName,next.email)&&!isGeneratedDisplayName(profileData.displayName,profileData.email)?profileData.displayName:resolvedNextName;
    profileData={...profileData,...next};
    const editingOwnField=profileId===viewer.uid&&document.activeElement?.matches("#profile-display-name-input,#profile-biography-input,#profile-birthday-input,#profile-gender-input,#profile-location-input,#profile-work-input");
    if(!editingOwnField)renderProfileCore();
  },error=>console.warn("Không thể theo dõi hồ sơ realtime",error));
}

async function loadProfile() {
  const snapshot = await getDoc(doc(firebaseDatabase,"users",profileId));
  profileData = snapshot.exists() ? snapshot.data() : {};
  if(profileId===viewer.uid&&!profileData.memberId){try{await ensurePrivateMemberId()}catch(error){console.error("Không thể tạo ID thành viên",error);toast("Chưa thể tạo ID thành viên. Vui lòng thử lại.")}}
  profileData.displayName=resolveDisplayName(profileData,profileId===viewer.uid?viewer:null);
  renderProfileCore();
  if(profileId!==viewer.uid)setupFriendButton().catch(error=>{console.error("Không thể xác định quan hệ bạn bè",error);toast(error.message||"Không thể tải trạng thái bạn bè")});
  if(profileId===viewer.uid){try{const allUsers=await getDocs(collection(firebaseDatabase,"users")),storedIds=relationshipIds(profileData.friends),friendIds=new Set(storedIds);allUsers.forEach(item=>{if(relationshipIds(item.data().friends).includes(viewer.uid))friendIds.add(item.id)});friendIds.delete(viewer.uid);profileData.friends=[...friendIds];const missing=profileData.friends.filter(uid=>!storedIds.includes(uid));if(missing.length)await setDoc(doc(firebaseDatabase,"users",viewer.uid),{friends:arrayUnion(...missing)},{merge:true})}catch(error){console.warn("Bỏ qua đồng bộ bạn bè hai chiều",error)}}
  renderProfileCore();
  if(profileId!==viewer.uid&&profileData.friendsVisibility==="friends"){try{const own=(await getDoc(doc(firebaseDatabase,"users",viewer.uid))).data()||{};if(!relationshipIds(own.friends).includes(profileId))$("friend-count").textContent="Danh sách bạn bè chỉ dành cho bạn bè"}catch(error){console.warn(error)}}
  if (profileId === viewer.uid) await renderFriendRequests();
}

function renderProfileCore(){
  if(fields.displayName)fields.displayName.value = profileData.displayName || "Thành viên VHHT";
  if(fields.biography)fields.biography.value = profileData.biography || "";
  if(fields.birthday)fields.birthday.value = profileData.birthday || "";
  syncBirthdayDisplay();
  if(fields.gender)fields.gender.value = profileData.gender || "";
  if(fields.location)fields.location.value = profileData.location || "";
  if(fields.work)fields.work.value = profileData.work || "";
  const activityInput=$("profile-activity-input"),friendsVisibility=$("profile-friends-visibility"),accountVisibility=$("profile-account-visibility");
  if(activityInput)activityInput.value=profileData.showActivityStatus===false?"offline":"online";
  if(friendsVisibility)friendsVisibility.value=profileData.friendsVisibility||"public";
  if(accountVisibility)accountVisibility.value=profileData.accountVisibility||"private";
  ["profile-activity-input","profile-friends-visibility","profile-account-visibility","profile-gender-input"].forEach(id=>$(id)?._profileSelectRender?.());
  syncProfileDisplayName(fields.displayName.value); $("profile-bio-heading").textContent = profileData.biography || "Chưa có tiểu sử";
  const privateUsername=String(profileData.username||profileData.usernameNormalized||"").trim().replace(/^@/,"");
  $("profile-username-readonly").textContent=profileId===viewer.uid?(privateUsername||"Chưa thiết lập"):"Riêng tư";
  $("user-avatar-render").src = resolveAvatarUrl(profileData.photoURL || profileData.profileImage,{uid:profileId,displayName:profileData.displayName});
  applyAvatarFallback($("user-avatar-render"),{uid:profileId,displayName:profileData.displayName});
  $("user-avatar-render").style.objectPosition=`${profileData.avatarPositionX??50}% ${profileData.avatarPositionY??50}%`;
  $("composer-avatar").src=$("user-avatar-render").src;
  applyAvatarFallback($("composer-avatar"),{uid:profileId,displayName:profileData.displayName});
  if (profileData.coverURL) $("cover-photo").style.backgroundImage = `url("${profileData.coverURL}")`;
  $("cover-photo").style.backgroundPosition=`${profileData.coverPositionX??50}% ${profileData.coverPositionY??50}%`;
  $("profile-member-id-readonly").textContent = profileId===viewer.uid?(profileData.memberId||"Chưa có ID"):"Riêng tư"; $("profile-email-readonly").textContent = profileData.email || (profileId === viewer.uid ? viewer.email : "Không công khai");
  $("profile-created-at").textContent = profileData.createdAt?.seconds ? new Date(profileData.createdAt.seconds*1000).toLocaleDateString("vi-VN") : "Chưa xác định";
  configureSocialPresentation();
  configureProfileViewMode(profileId===viewer?.uid);
  if(profileData.role!=="admin"&&profileId!==viewer.uid&&profileData.friendsVisibility==="private")$("friend-count").textContent="Danh sách bạn bè đã ẩn";
  window.dispatchEvent(new CustomEvent("vhht-profile-identity",{detail:{profileId,displayName:profileData.displayName,photoURL:profileData.photoURL||profileData.profileImage||""}}));
  window.dispatchEvent(new CustomEvent("vhht-profile-data",{detail:{profileId,viewerId:viewer?.uid||"",isOwner:profileId===viewer?.uid,profile:{...profileData}}}));
  updateReadonlyProfileValues();
  renderProfileNoteBubble();
}

function configureSocialPresentation(){
  const isAdmin=profileData.role==="admin";
  const socialIds=relationshipIds(isAdmin?profileData.followers:profileData.friends);
  $("friend-count").textContent=isAdmin?`${socialIds.length} người theo dõi`:`${socialIds.length} bạn bè`;
  document.body.classList.toggle("admin-profile",isAdmin);
  const tab=$("profile-tab-friends"),preview=document.querySelector(".profile-friends-preview-card"),panel=$("profile-panel-friends");
  if(tab)tab.querySelector("span").textContent=isAdmin?"Người theo dõi":"Bạn bè";
  if(preview){preview.querySelector("h2").textContent=isAdmin?"Người theo dõi":"Bạn bè";const action=preview.querySelector("[data-profile-tab-target]");if(action)action.textContent=isAdmin?"Xem người theo dõi":"Xem tất cả bạn bè"}
  if(panel){panel.querySelector("h2").textContent=isAdmin?"Người theo dõi":"Bạn bè";const description=$("profile-friends-tab-description");if(description)description.textContent=isAdmin?"Những thành viên đang theo dõi tài khoản quản trị.":"Danh sách kết nối của thành viên.";const search=$("profile-friends-search");if(search){search.placeholder=isAdmin?"Tìm trong người theo dõi":"Tìm trong danh sách bạn bè";search.setAttribute("aria-label",search.placeholder)}}
}

function configureProfileViewMode(isOwner){
  document.body.classList.toggle("own-profile",isOwner);
  document.body.classList.toggle("viewing-profile",!isOwner);
  document.querySelectorAll(".owner-only-control,.owner-photo-controls,#avatar-upload-label,#remove-avatar-button").forEach(control=>{
    control.hidden=!isOwner;
    control.classList.toggle("is-owner-hidden",!isOwner);
    control.setAttribute("aria-hidden",String(!isOwner));
  });
  const composer=$("profile-composer");
  if(composer){composer.hidden=!isOwner;composer.setAttribute("aria-hidden",String(!isOwner))}
  if(isOwner)return;
  Object.values(fields).forEach(control=>{
    control.hidden=true;
    const output=document.createElement("div");
    output.className="profile-readonly-value";
    output.dataset.forControl=control.id;
    control.insertAdjacentElement("afterend",output);
  });
  ["profile-activity-input","profile-friends-visibility","profile-account-visibility"].forEach(id=>$(id)?.closest("label")?.classList.add("owner-setting-only"));
}

function profileReturnSource(){const explicit=new URLSearchParams(location.search).get("from")||sessionStorage.getItem("vhht_profile_return_source");if(explicit)return explicit;try{const previous=new URL(document.referrer);if(previous.pathname.endsWith("/admin/admin-dashboard-page.html"))return"dashboard";if(previous.pathname.endsWith("/community/community-feed-page.html")&&previous.searchParams.get("from")==="admin")return"community-admin"}catch{}return"community"}
function configureProfileNavigation(){const source=profileReturnSource(),params=new URLSearchParams(location.search),button=$("back-to-station-btn");if(!button)return;const requested=params.get("returnTo");let safeReturn="";if(requested){try{const parsed=new URL(requested,location.origin);if(parsed.origin===location.origin&&parsed.pathname.includes("/community/"))safeReturn=`${parsed.pathname}${parsed.search}${parsed.hash}`}catch{}}const chatUid=params.get("chat")||sessionStorage.getItem("vhht_profile_return_chat_uid")||params.get("uid");const fallbackTarget=source==="dashboard"?"../../admin/admin-dashboard-page.html":source==="community-admin"?"../community-feed-page.html?from=admin":source==="chat"?`../messages/messages-page.html${chatUid?`?uid=${encodeURIComponent(chatUid)}`:""}`:"../community-feed-page.html";const target=safeReturn||fallbackTarget,labels=safeReturn?["Trở về trang Nhắn tin","Nhắn tin"]:source==="dashboard"?["Quay lại trang quản trị","Quản trị"]:source==="community-admin"?["Quay lại cộng đồng Admin","Cộng đồng"]:source==="chat"?["Trở về đoạn chat","Đoạn chat"]:["Bảng tin cộng đồng","Bảng tin"];button.href=target;button.dataset.returnTarget=target;button.title=labels[0];button.setAttribute("aria-label",labels[0]);button.innerHTML=`<i class="fa-solid fa-arrow-left" aria-hidden="true"></i><span class="profile-back-label"><span class="profile-back-label-long">${labels[0]}</span><span class="profile-back-label-short">${labels[1]}</span></span>`}
function enhanceProfileSelects(){const descriptions={public:"Mọi thành viên có thể xem",friends:"Chỉ những người đã kết bạn",private:"Chỉ tài khoản của bạn",online:"Hiển thị khi bạn đang hoạt động",offline:"Không chia sẻ trạng thái hoạt động","":"Chưa chia sẻ thông tin",Nam:"Giới tính Nam",Nữ:"Giới tính Nữ",Khác:"Danh xưng khác",small:"Gọn và tiết kiệm không gian",normal:"Cân bằng, dễ đọc",large:"Chữ lớn, dễ quan sát",comfortable:"Khoảng cách thoải mái",compact:"Hiển thị được nhiều nội dung",full:"Hiệu ứng chuyển động đầy đủ",reduced:"Hạn chế chuyển động"},icon=value=>value==='public'?'fa-earth-asia':value==='friends'?'fa-user-group':value==='private'?'fa-lock':value==='online'?'fa-circle':value==='offline'?'fa-eye-slash':value==='small'?'fa-compress':value==='large'?'fa-magnifying-glass-plus':value==='compact'?'fa-table-list':value==='comfortable'?'fa-table-cells-large':value==='reduced'?'fa-person-walking-arrow-loop-left':value==='full'?'fa-wand-magic-sparkles':'fa-user';document.querySelectorAll(".profile-card select,#profile-post-privacy,.profile-settings-panel select").forEach(select=>{if(select.dataset.enhanced)return;select.dataset.enhanced="1";select.hidden=true;const control=document.createElement("div");control.className=`profile-privacy-control ${select.id==='profile-post-privacy'?'composer-privacy-control':''}`;const trigger=document.createElement("button");trigger.type="button";trigger.className="profile-privacy-trigger";trigger.setAttribute("aria-expanded","false");const menu=document.createElement("div");menu.className="profile-privacy-menu";menu.hidden=true;const closeMenu=()=>{menu.hidden=true;menu.classList.remove("is-viewport-menu");control.classList.remove("is-menu-open");menu.style.removeProperty("left");menu.style.removeProperty("top");menu.style.removeProperty("--privacy-menu-width");trigger.setAttribute("aria-expanded","false")};const placeMenu=()=>{if(!control.closest(".profile-settings-panel"))return;const rect=trigger.getBoundingClientRect(),width=Math.min(Math.max(rect.width,260),window.innerWidth-24),estimated=Math.min(menu.scrollHeight||300,Math.max(180,window.innerHeight*.45)),roomBelow=window.innerHeight-rect.bottom-12,top=roomBelow>=estimated?rect.bottom+7:Math.max(12,rect.top-estimated-7);menu.classList.add("is-viewport-menu");menu.style.setProperty("--privacy-menu-width",`${width}px`);menu.style.left=`${Math.min(Math.max(12,rect.right-width),window.innerWidth-width-12)}px`;menu.style.top=`${top}px`};const render=()=>{const option=select.options[select.selectedIndex]||select.options[0];if(!option)return;trigger.innerHTML=`<i class="fa-solid ${icon(option.value)}"></i><span>${option.textContent}</span><i class="fa-solid fa-chevron-down"></i>`;menu.querySelectorAll("button").forEach(button=>button.classList.toggle("selected",button.dataset.value===select.value))};select._profileSelectRender=render;[...select.options].forEach(option=>{const item=document.createElement("button");item.type="button";item.dataset.value=option.value;item.innerHTML=`<i class="fa-solid ${icon(option.value)}"></i><span><strong>${option.textContent}</strong><small>${descriptions[option.value]||"Tùy chọn hồ sơ"}</small></span><i class="fa-solid fa-check privacy-check"></i>`;item.onclick=()=>{select.value=option.value;select.dispatchEvent(new Event("change",{bubbles:true}));closeMenu();render()};menu.appendChild(item)});trigger.onclick=()=>{const opening=menu.hidden;closeProfileSelects(control);if(!opening)return closeMenu();menu.hidden=false;control.classList.add("is-menu-open");trigger.setAttribute("aria-expanded","true");requestAnimationFrame(placeMenu)};select.addEventListener("change",render);control.append(trigger,menu);select.insertAdjacentElement("afterend",control);render()})}

// Một số khu vực cài đặt được khởi tạo sau dữ liệu hồ sơ. Theo dõi riêng vùng
// này để mọi select mới đều dùng cùng một bộ chọn của hệ thống, không lóe giao
// diện mặc định của trình duyệt khi chuyển tab hoặc mở bảng lần đầu.
function portalSettingsSelectMenus(){
  const center=$("profile-settings-center");
  if(!center)return;
  center.querySelectorAll(".profile-settings-panel .profile-privacy-control").forEach(control=>{
    const menu=control.querySelector(".profile-privacy-menu"),trigger=control.querySelector(".profile-privacy-trigger");
    if(!menu||!trigger||control._profileMenu)return;
    control._profileMenu=menu;control._profileTrigger=trigger;
    center.appendChild(menu)
  })
}
const settingsSelectObserver=new MutationObserver(()=>{enhanceProfileSelects();portalSettingsSelectMenus()});
const settingsCenter=$("profile-settings-center");
if(settingsCenter)settingsSelectObserver.observe(settingsCenter,{childList:true,subtree:true});
window.addEventListener("vhht-profile-settings-rendered",()=>{enhanceProfileSelects();portalSettingsSelectMenus()});
document.addEventListener("click",event=>{if(event.target.closest("#profile-settings-trigger"))setTimeout(portalSettingsSelectMenus,0)});
function alignProfileComposerPrivacy(){
  const select=$("profile-post-privacy"),control=select?.nextElementSibling;if(!control)return;
  control.id="profile-composer-privacy-control";
  control.classList.add("profile-privacy-control","composer-privacy-control","post-privacy-control","profile-composer-privacy");
  const trigger=control.querySelector(".profile-privacy-trigger"),menu=control.querySelector(".profile-privacy-menu");
  trigger?.classList.add("post-privacy-trigger");menu?.classList.add("post-privacy-menu");
  if(!trigger||!menu)return;
  const syncComposerPrivacyLabel=()=>{const label=select.options[select.selectedIndex]?.textContent||"Quyền riêng tư";trigger.title=`Quyền riêng tư: ${label}`;trigger.setAttribute("aria-label",trigger.title)};
  syncComposerPrivacyLabel();select.addEventListener("change",syncComposerPrivacyLabel);
  // Menu luôn thuộc chính ô quyền riêng tư để mở ngay phía trên nút trên cả
  // desktop lẫn mobile, không còn bị đưa xuống cuối viewport.
  menu.classList.remove("profile-post-privacy-sheet");
  if(menu.parentElement!==control)control.appendChild(menu);
  document.body.classList.remove("profile-privacy-sheet-open");
}

function closeProfileSelects(except=null){document.querySelectorAll(".profile-privacy-control").forEach(control=>{if(control===except)return;const menu=control._profileMenu||control.querySelector(".profile-privacy-menu,.post-privacy-menu"),trigger=control._profileTrigger||control.querySelector(".profile-privacy-trigger,.post-privacy-trigger");if(menu){menu.hidden=true;menu.classList.remove("is-viewport-menu");menu.style.removeProperty("left");menu.style.removeProperty("top");menu.style.removeProperty("--privacy-menu-width")}control.classList.remove("is-menu-open");trigger?.setAttribute("aria-expanded","false")})}
document.addEventListener("click",event=>closeProfileSelects(event.target.closest(".profile-privacy-control")));
document.addEventListener("keydown",event=>{if(event.key==="Escape")closeProfileSelects()});

function updateReadonlyProfileValues(){
  if(profileId===viewer?.uid)return;
  const values={"profile-display-name-input":profileData.displayName||"Chưa đặt tên hiển thị","profile-biography-input":profileData.biography||"Chưa có tiểu sử","profile-birthday-input":profileData.birthday||"Chưa chia sẻ","profile-gender-input":profileData.gender||"Chưa chia sẻ","profile-location-input":profileData.location||"Chưa chia sẻ","profile-work-input":profileData.work||"Chưa chia sẻ"};
  document.querySelectorAll(".profile-readonly-value").forEach(output=>output.textContent=values[output.dataset.forControl]||"Chưa chia sẻ");
}

async function renderFriendRequests() {
  const list=$("friend-requests-list"), requests=relationshipIds(profileData.friendRequests);
  if(!list)return;
  if(!requests.length){list.innerHTML='<div class="no-requests">Không có lời mời mới</div>';return;}
  list.innerHTML="";
  for(const uid of requests){const snap=await getDoc(doc(firebaseDatabase,"users",uid)),data=snap.data()||{};const row=document.createElement("div");row.className="friend-request-row";row.innerHTML=`<img src="${data.photoURL||data.profileImage||DEFAULT_AVATAR}" alt=""><strong>${data.displayName||"Thành viên"}</strong><div><button data-accept>Đồng ý</button><button data-decline>Từ chối</button></div>`;row.querySelector("img").onclick=()=>location.href=`user-profile.html?uid=${encodeURIComponent(uid)}`;const finish=async status=>{const notificationSnap=await getDocs(query(collection(firebaseDatabase,"notifications"),where("recipientId","==",viewer.uid)));await Promise.all(notificationSnap.docs.filter(item=>item.data().type==="friend_request"&&item.data().actorId===uid).map(item=>updateDoc(item.ref,{isRead:true,friendRequestStatus:status,resolvedAt:serverTimestamp(),message:status==="accepted"?"— Bạn đã đồng ý kết bạn":"— Bạn đã từ chối lời mời"})));row.remove()};row.querySelector("[data-accept]").onclick=async()=>{row.style.pointerEvents="none";try{await acceptFriendship(viewer.uid,uid);await addDoc(collection(firebaseDatabase,"notifications"),{recipientId:uid,actorId:viewer.uid,actorName:profileData.displayName||"Thành viên",type:"friend_accepted",message:"đã đồng ý lời mời kết bạn của bạn",isRead:false,createdAt:serverTimestamp()});await finish("accepted");profileData.friends=[...new Set([...(profileData.friends||[]),uid])];$("friend-count").textContent=`${profileData.friends.length} bạn bè`;toast("Hai tài khoản đã được đồng bộ bạn bè")}catch(error){console.error(error);row.style.pointerEvents="";toast(error.message||"Không thể đồng ý kết bạn")}};row.querySelector("[data-decline]").onclick=async()=>{row.style.pointerEvents="none";await updateDoc(doc(firebaseDatabase,"users",viewer.uid),{friendRequests:arrayRemove(uid)});await finish("declined");toast("Đã từ chối lời mời")};list.appendChild(row);}
}

async function setupFriendButton() {
  const button = $("friend-action-btn"),messageButton=$("message-profile-btn");
  const openMessages=()=>{const returnTo=`${location.pathname}${location.search}${location.hash||"#posts"}`;location.href=`../messages/messages-page.html?uid=${encodeURIComponent(profileId)}&returnTo=${encodeURIComponent(returnTo)}`};
  if(profileData.role==="admin"){
    const ownSnapshot=await getDoc(doc(firebaseDatabase,"users",viewer.uid)),own=ownSnapshot.data()||{};
    const following=relationshipIds(own.following).includes(profileId)||relationshipIds(profileData.followers).includes(viewer.uid);
    button.hidden=false;button.disabled=false;button.className=`friend-action-btn${following?" friends":""}`;
    button.innerHTML=following?'<i class="fa-solid fa-bell"></i><span>Đang theo dõi</span>':'<i class="fa-regular fa-bell"></i><span>Theo dõi</span>';
    messageButton.hidden=!following;messageButton.onclick=openMessages;
    button.onclick=async()=>{
      if(following)return openUnfollowDialog(profileId,profileData.displayName||"tài khoản quản trị");
      button.disabled=true;
      try{await Promise.all([setDoc(doc(firebaseDatabase,"users",viewer.uid),{following:arrayUnion(profileId)},{merge:true}),setDoc(doc(firebaseDatabase,"users",profileId),{followers:arrayUnion(viewer.uid)},{merge:true}),addDoc(collection(firebaseDatabase,"notifications"),{recipientId:profileId,actorId:viewer.uid,actorName:own.displayName||"Một thành viên",type:"new_follower",message:"đã theo dõi bạn",isRead:false,createdAt:serverTimestamp()})]);toast("Đã theo dõi. Bạn có thể nhắn tin với ADMIN");await loadProfile()}catch(error){console.error(error);toast(error.message||"Không thể cập nhật theo dõi")}finally{button.disabled=false}
    };
    return;
  }
  button.hidden = false;
  messageButton.hidden=false;messageButton.onclick=openMessages;
  let friendship=await getFriendshipState(viewer.uid,profileId),own=friendship.firstData;
  if(friendship.firstHasSecond!==friendship.secondHasFirst){try{await repairFriendship(viewer.uid,profileId);friendship=await getFriendshipState(viewer.uid,profileId);own=friendship.firstData;toast("Đã sửa trạng thái bạn bè chưa đồng bộ")}catch(error){console.warn("Không thể tự sửa quan hệ bạn bè",error)}}
  if (friendship.firstHasSecond||friendship.secondHasFirst) { button.className="friend-action-btn friends"; button.innerHTML='<i class="fa-solid fa-user-check"></i><span>Bạn bè</span><i class="fa-solid fa-chevron-down friend-caret"></i>';button.disabled=false;button.onclick=()=>openUnfriendDialog(profileId,profileData.displayName||"người này"); return; }
  if ((profileData.friendRequests || []).includes(viewer.uid)) { button.className="friend-action-btn pending"; button.innerHTML='<i class="fa-solid fa-clock"></i><span>Đã gửi lời mời</span>'; button.disabled=true; return; }
  button.className="friend-action-btn";button.innerHTML='<i class="fa-solid fa-user-plus"></i><span>Kết bạn</span>';
  button.onclick = async () => { button.disabled=true; await setDoc(doc(firebaseDatabase,"users",profileId),{friendRequests:arrayUnion(viewer.uid)},{merge:true});await addDoc(collection(firebaseDatabase,"notifications"),{recipientId:profileId,actorId:viewer.uid,actorName:own.displayName||"Một thành viên",type:"friend_request",message:"đã gửi lời mời kết bạn",isRead:false,createdAt:serverTimestamp()}); button.classList.add("pending"); button.querySelector("span").textContent="Đã gửi lời mời"; toast("Đã gửi lời mời kết bạn"); };
}

function openUnfriendDialog(targetId,targetName){
  let overlay=$("unfriend-confirm-dialog");if(!overlay){overlay=document.createElement("div");overlay.id="unfriend-confirm-dialog";document.body.appendChild(overlay)}
  overlay.innerHTML=`<div class="unfriend-dialog-card"><span class="unfriend-dialog-icon"><i class="fa-solid fa-user-minus"></i></span><h3>Hủy kết bạn?</h3><p>Bạn và <strong></strong> sẽ bị xóa khỏi danh sách bạn bè của nhau. Hai người có thể gửi lại lời mời sau.</p><footer><button data-cancel>Giữ bạn bè</button><button class="confirm-unfriend">Hủy kết bạn</button></footer></div>`;
  overlay.querySelector("strong").textContent=targetName;overlay.classList.add("show");
  overlay.querySelector("[data-cancel]").onclick=()=>overlay.classList.remove("show");
  overlay.onclick=event=>{if(event.target===overlay)overlay.classList.remove("show")};
  overlay.querySelector(".confirm-unfriend").onclick=async event=>{const action=event.currentTarget;action.disabled=true;action.textContent="Đang xử lý...";try{await removeFriendship(viewer.uid,targetId);profileData.friends=(profileData.friends||[]).filter(uid=>uid!==targetId);overlay.classList.remove("show");await setupFriendButton();toast(`Đã hủy kết bạn với ${targetName}. Hai bạn vẫn có thể nhắn tin.`)}catch(error){console.error(error);action.disabled=false;action.textContent="Hủy kết bạn";toast(error.message||"Không thể hủy kết bạn")}};
}

function openUnfollowDialog(targetId,targetName){
  let overlay=$("unfollow-confirm-dialog");
  if(!overlay){overlay=document.createElement("div");overlay.id="unfollow-confirm-dialog";document.body.appendChild(overlay)}
  overlay.innerHTML=`<div class="unfriend-dialog-card unfollow-dialog-card"><span class="unfriend-dialog-icon"><i class="fa-solid fa-bell-slash"></i></span><h3>Hủy theo dõi?</h3><p>Bạn sẽ không còn theo dõi cập nhật từ <strong></strong>. Bạn có thể theo dõi lại bất cứ lúc nào.</p><footer><button data-cancel>Tiếp tục theo dõi</button><button class="confirm-unfollow">Hủy theo dõi</button></footer></div>`;
  overlay.querySelector("strong").textContent=targetName;overlay.classList.add("show");
  const close=()=>overlay.classList.remove("show");
  overlay.querySelector("[data-cancel]").onclick=close;
  overlay.onclick=event=>{if(event.target===overlay)close()};
  overlay.querySelector(".confirm-unfollow").onclick=async event=>{const action=event.currentTarget;action.disabled=true;action.textContent="Đang xử lý...";try{await Promise.all([setDoc(doc(firebaseDatabase,"users",viewer.uid),{following:arrayRemove(targetId)},{merge:true}),setDoc(doc(firebaseDatabase,"users",targetId),{followers:arrayRemove(viewer.uid)},{merge:true})]);close();toast(`Đã hủy theo dõi ${targetName}`);await loadProfile()}catch(error){console.error(error);action.disabled=false;action.textContent="Hủy theo dõi";toast(error.message||"Không thể hủy theo dõi")}};
}

$("save-profile-btn").onclick = async () => {
  if(profileId!==viewer.uid) return; const name=fields.displayName.value.trim(); if(!name) return toast("Tên hiển thị không được để trống");
  if(isGeneratedDisplayName(name,viewer.email))return toast("Hãy đặt tên hiển thị riêng, không dùng tên email hoặc tên mặc định");
  const birthdayIso=birthdayDisplay?.value?birthdayToIso(birthdayDisplay.value):"";
  if(birthdayDisplay?.value&&!birthdayIso){birthdayDisplay.setCustomValidity("Hãy nhập ngày hợp lệ theo định dạng dd/mm/yyyy");birthdayDisplay.reportValidity();birthdayDisplay.focus();return}
  birthdayDisplay?.setCustomValidity("");
  if(fields.birthday)fields.birthday.value=birthdayIso;
  const button=$("save-profile-btn"); button.disabled=true;
  const localPayload={displayName:name,biography:fields.biography.value.trim(),birthday:fields.birthday.value,gender:fields.gender.value,location:fields.location.value.trim(),work:fields.work.value.trim(),showActivityStatus:$("profile-activity-input").value!=="offline",friendsVisibility:$("profile-friends-visibility").value,accountVisibility:$("profile-account-visibility").value};
  syncProfileDisplayName(name);$("profile-bio-heading").textContent=localPayload.biography||"Chưa có tiểu sử";
  try {
    const cloudPayload={...localPayload,updatedAt:serverTimestamp()};
    await setDoc(doc(firebaseDatabase,"users",viewer.uid),cloudPayload,{merge:true});
    await updateProfile(viewer,{displayName:name});
    const authoredPosts=await getDocs(query(collection(firebaseDatabase,"posts"),where("authorId","==",viewer.uid)));
    await Promise.all(authoredPosts.docs.map(post=>updateDoc(post.ref,{authorDisplayName:name}))).catch(error=>console.warn("Tên hồ sơ đã lưu nhưng chưa đồng bộ hết bài viết cũ",error));
    profileData={...profileData,...localPayload};
    playUiSound("save-submit");
    toast("Đã lưu và đồng bộ hồ sơ");
  } catch(error){playUiSound("error");console.error(error);toast(error.message||"Không thể lưu hồ sơ");} finally{button.disabled=false;button.innerHTML='<i class="fa-solid fa-check"></i> Lưu thay đổi';}
};
$("copy-member-id-btn").onclick=async()=>{if(profileId!==viewer.uid)return toast("ID thành viên chỉ hiển thị với chủ tài khoản");const memberId=profileData.memberId||await ensurePrivateMemberId();await navigator.clipboard.writeText(memberId);toast("Đã sao chép ID thành viên")};
$("copy-username-btn").onclick=async()=>{if(profileId!==viewer.uid)return toast("Tên đăng nhập chỉ hiển thị với chủ tài khoản");const username=String(profileData.username||profileData.usernameNormalized||"").trim().replace(/^@/,"");if(!username)return toast("Tài khoản chưa thiết lập tên đăng nhập");await navigator.clipboard.writeText(username);toast("Đã sao chép tên đăng nhập")};
$("back-to-station-btn").onclick=async event=>{
  event.preventDefault();
  const target=event.currentTarget.dataset.returnTarget||event.currentTarget.href;
  const effectsEnabled=!soundManager.settings.muted&&soundManager.settings.effectsEnabled;
  if(effectsEnabled){
    await Promise.race([
      soundManager.unlock(),
      new Promise(resolve=>window.setTimeout(resolve,160))
    ]);
    playUiSound("back");
    await new Promise(resolve=>window.setTimeout(resolve,140));
  }
  sessionStorage.removeItem("vhht_profile_return_source");
  sessionStorage.removeItem("vhht_profile_return_chat_uid");
  location.assign(target);
};
$("profile-activity-input").onchange=()=>viewer&&setDoc(doc(firebaseDatabase,"users",viewer.uid),{showActivityStatus:$("profile-activity-input").value!=="offline"},{merge:true});
function toast(message){const el=$("cosmic-toast");el.textContent=message;el.classList.add("visible");setTimeout(()=>el.classList.remove("visible"),2600)}

const canvas=$("cosmic-profile-canvas"),ctx=canvas.getContext("2d");
const profileLowPower=matchMedia("(max-width: 760px), (prefers-reduced-motion: reduce)").matches;
let stars=[],profileStarFrame=0,lastStarPaint=0,resizeTimer=0;
function resize(){
  const ratio=profileLowPower?1:Math.min(devicePixelRatio||1,1.5);
  canvas.width=Math.round(innerWidth*ratio);canvas.height=Math.round(innerHeight*ratio);
  canvas.style.width=`${innerWidth}px`;canvas.style.height=`${innerHeight}px`;
  ctx.setTransform(ratio,0,0,ratio,0,0);
  stars=Array.from({length:profileLowPower?28:56},()=>({x:Math.random()*innerWidth,y:Math.random()*innerHeight,r:.35+Math.random(),a:.22+Math.random()*.55}));
  paintStars(false);
}
function paintStars(animate=true){
  ctx.clearRect(0,0,innerWidth,innerHeight);
  stars.forEach(s=>{if(animate)s.a=.2+(s.a+.012)%.72;ctx.fillStyle=`rgba(125,211,252,${s.a})`;ctx.beginPath();ctx.arc(s.x,s.y,s.r,0,Math.PI*2);ctx.fill()});
}
function animateStars(time){
  if(document.hidden||profileLowPower){profileStarFrame=0;return}
  if(time-lastStarPaint>=50){paintStars();lastStarPaint=time}
  profileStarFrame=requestAnimationFrame(animateStars);
}
function syncStarAnimation(){
  if(!document.hidden&&!profileLowPower&&!profileStarFrame)profileStarFrame=requestAnimationFrame(animateStars);
  else if(document.hidden&&profileStarFrame){cancelAnimationFrame(profileStarFrame);profileStarFrame=0}
}
addEventListener("resize",()=>{clearTimeout(resizeTimer);resizeTimer=setTimeout(resize,160)},{passive:true});
document.addEventListener("visibilitychange",syncStarAnimation);
resize();syncStarAnimation();
