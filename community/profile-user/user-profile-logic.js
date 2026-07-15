import { firebaseAuthentication, firebaseDatabase } from "../../shared/firebase-connection.js";
import { doc, getDoc, getDocs, setDoc, updateDoc, deleteDoc, addDoc, collection, query, where, orderBy, onSnapshot, arrayUnion, arrayRemove, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { onAuthStateChanged, updateProfile } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { startPresenceTracking } from "../../shared/presence-handler.js";
import { acceptFriendship, repairFriendship, getFriendshipState, removeFriendship } from "../../shared/friendship-service.js";
import { resolveDisplayName, isGeneratedDisplayName } from "../../shared/user-identity.js";
startPresenceTracking();
import("./profile-enhancements.js?v=cloudinary-profile-13").catch(error=>{
  console.error("Không thể khởi tạo công cụ hồ sơ",error);
  const toastElement=document.getElementById("cosmic-toast");
  if(toastElement){toastElement.textContent=`Lỗi công cụ chỉnh ảnh: ${error?.message||"Không xác định"}`;toastElement.classList.add("visible")}
});

const $ = id => document.getElementById(id), DEFAULT_AVATAR = "../../shared/assets/default-avatar.svg";
const fields = { displayName: $("profile-display-name-input"), biography: $("profile-biography-input"), birthday: $("profile-birthday-input"), gender: $("profile-gender-input"), location: $("profile-location-input"), work: $("profile-work-input") };
let viewer = null, profileId = null, profileData = {}, stopProfileRealtime = null, stopProfileNoteRealtime = null, profileNoteExpiryTimer = null, currentProfileNote = null;
let selectedPostFiles=[];

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

function noteTimeMillis(value){return typeof value?.toMillis==="function"?value.toMillis():value?.seconds?value.seconds*1000:0}
function enhanceProfileNoteReply(){
  const dialog=$("profile-note-detail-dialog");if(!dialog||$("profile-note-reply-form"))return;
  const form=document.createElement("form");form.id="profile-note-reply-form";form.hidden=true;form.innerHTML='<label for="profile-note-reply-input">Trả lời ghi chú</label><div><input id="profile-note-reply-input" maxlength="500" placeholder="Viết câu trả lời…"><button type="submit" aria-label="Gửi trả lời"><i class="fa-solid fa-paper-plane"></i></button></div>';
  dialog.appendChild(form);form.onsubmit=sendProfileNoteReply;
  $("profile-note-bubble")?.addEventListener("click",()=>{form.hidden=profileId===viewer?.uid;$("profile-note-reply-input").value=""});
}
async function sendProfileNoteReply(event){
  event.preventDefault();if(!viewer||profileId===viewer.uid||!currentProfileNote)return;
  const input=$("profile-note-reply-input"),content=input.value.trim();if(!content){input.focus();return}const button=event.currentTarget.querySelector("button");button.disabled=true;
  try{const id=[viewer.uid,profileId].sort().join("_");await setDoc(doc(firebaseDatabase,"conversations",id),{members:[viewer.uid,profileId],updatedAt:serverTimestamp()},{merge:true});await addDoc(collection(firebaseDatabase,"conversations",id,"messages"),{senderId:viewer.uid,recipientId:profileId,content,noteReply:{authorId:profileId,content:String(currentProfileNote.content||"Ghi chú"),expiresAt:currentProfileNote.expiresAt||null},createdAt:serverTimestamp(),readAt:null});await addDoc(collection(firebaseDatabase,"messageNotifications"),{recipientId:profileId,senderId:viewer.uid,conversationId:id,isRead:false,createdAt:serverTimestamp()});$("profile-note-detail-dialog").close();location.href=`../messages/messages-page.html?uid=${encodeURIComponent(profileId)}`}
  catch(error){toast(error?.code==="permission-denied"?"Chỉ bạn bè mới có thể trả lời ghi chú":"Không thể gửi câu trả lời ghi chú")}
  finally{button.disabled=false}
}
function listenProfileNoteRealtime(){
  stopProfileNoteRealtime?.();
  const bubble=$("profile-note-bubble");if(!bubble)return;
  stopProfileNoteRealtime=onSnapshot(doc(firebaseDatabase,"messengerNotes",profileId),snapshot=>{
    const note=snapshot.exists()?snapshot.data():null,active=note&&noteTimeMillis(note.expiresAt)>Date.now()&&String(note.content||"").trim();currentProfileNote=active?note:null;
    clearTimeout(profileNoteExpiryTimer);bubble.hidden=!active;if(!active)return;
    const content=String(note.content).trim();bubble.querySelector("span").textContent=content;bubble.title=content;
    profileNoteExpiryTimer=setTimeout(()=>{bubble.hidden=true},Math.max(0,noteTimeMillis(note.expiresAt)-Date.now()));
    bubble.onclick=()=>{const dialog=$("profile-note-detail-dialog");$("profile-note-detail-content").textContent=content;if(!dialog.open)dialog.showModal()};
  },error=>{bubble.hidden=true;console.warn("Không thể đọc ghi chú hồ sơ",error)});
}

window.addEventListener("vhht-profile-post-identity",event=>{
  if(!viewer||event.detail?.profileId!==profileId)return;
  const recoveredName=String(event.detail.displayName||"").trim();
  if(isGeneratedDisplayName(profileData.displayName,profileData.email)&&!isGeneratedDisplayName(recoveredName,profileData.email))profileData.displayName=recoveredName;
  if(!profileData.photoURL&&!profileData.profileImage&&event.detail.photoURL)profileData.photoURL=event.detail.photoURL;
  renderProfileCore();
});

onAuthStateChanged(firebaseAuthentication, async user => {
  if (!user) return location.href = "../../index.html";
  viewer = user; profileId = new URLSearchParams(location.search).get("uid") || user.uid;
  document.body.classList.toggle("viewing-profile", profileId !== user.uid);
  document.body.classList.toggle("own-profile", profileId === user.uid);
  ensureProfilePresentation();
  enhanceProfileNoteReply();
  configureProfileViewMode(profileId === user.uid);
  configureProfileNavigation();
  listenProfileNoteRealtime();
  const contextBadge=document.createElement("span");contextBadge.className="profile-context-badge";contextBadge.innerHTML=profileId===user.uid?'<i class="fa-solid fa-user-gear"></i> Hồ sơ của bạn':'<i class="fa-solid fa-eye"></i> Bạn đang xem hồ sơ thành viên';document.querySelector(".profile-title")?.prepend(contextBadge);
  try{await loadProfile();if(profileId===user.uid){enhanceProfileSelects();alignProfileComposerPrivacy()}listenProfileRealtime()}catch(error){console.error("Không thể tải hồ sơ",error);if(!Object.keys(profileData).length){profileData=profileId===user.uid?{displayName:resolveDisplayName({},user),email:user.email||""}:{displayName:"Thành viên VHHT",email:""}}renderProfileCore();if(profileId===user.uid){enhanceProfileSelects();alignProfileComposerPrivacy()}toast(error.code==="permission-denied"?"Firestore Rules đang từ chối đọc hồ sơ":"Không thể tải đầy đủ hồ sơ")}
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
  profileData.displayName=resolveDisplayName(profileData,profileId===viewer.uid?viewer:null);
  renderProfileCore();
  if(profileId!==viewer.uid)setupFriendButton().catch(error=>{console.error("Không thể xác định quan hệ bạn bè",error);toast(error.message||"Không thể tải trạng thái bạn bè")});
  if(profileId===viewer.uid){try{const allUsers=await getDocs(collection(firebaseDatabase,"users")),friendIds=new Set(profileData.friends||[]);allUsers.forEach(item=>{if((item.data().friends||[]).includes(viewer.uid))friendIds.add(item.id)});friendIds.delete(viewer.uid);profileData.friends=[...friendIds];if(profileData.friends.some(uid=>!(snapshot.data()?.friends||[]).includes(uid)))await setDoc(doc(firebaseDatabase,"users",viewer.uid),{friends:arrayUnion(...profileData.friends)},{merge:true})}catch(error){console.warn("Bỏ qua đồng bộ bạn bè hai chiều",error)}}
  if(isGeneratedDisplayName(profileData.displayName,profileData.email)||(!profileData.photoURL&&!profileData.profileImage)){
    let legacyDisplayName=null,legacyAvatar=null,legacyNotificationName=null;try{const postSnapshot=await getDocs(query(collection(firebaseDatabase,"posts"),where("authorId","==",profileId))),posts=postSnapshot.docs.map(item=>item.data());legacyDisplayName=posts.map(post=>post.authorDisplayName).find(name=>!isGeneratedDisplayName(name,profileData.email));legacyAvatar=posts.map(post=>post.authorAvatar).find(Boolean)}catch(error){console.warn("Không thể đọc nhận diện từ bài viết cũ",error)}try{const notificationSnapshot=await getDocs(query(collection(firebaseDatabase,"notifications"),where("actorId","==",profileId)));legacyNotificationName=notificationSnapshot.docs.map(item=>item.data().actorName).find(name=>!isGeneratedDisplayName(name,profileData.email))}catch(error){console.warn("Không thể đọc nhận diện từ thông báo cũ",error)}
    if(isGeneratedDisplayName(profileData.displayName,profileData.email)){const legacyName=legacyNotificationName||legacyDisplayName;profileData.displayName=!isGeneratedDisplayName(legacyName,profileData.email)?legacyName:resolveDisplayName(profileData,profileId===viewer.uid?viewer:null)}
    if(!profileData.photoURL&&!profileData.profileImage&&legacyAvatar)profileData.photoURL=legacyAvatar;
    if(profileId===viewer.uid&&!isGeneratedDisplayName(profileData.displayName,profileData.email)&&snapshot.data()?.displayName!==profileData.displayName)await setDoc(doc(firebaseDatabase,"users",viewer.uid),{displayName:profileData.displayName},{merge:true}).catch(error=>console.warn("Không thể bổ sung tên hồ sơ",error));
  }
  renderProfileCore();
  if(profileId!==viewer.uid&&profileData.friendsVisibility==="friends"){try{const own=(await getDoc(doc(firebaseDatabase,"users",viewer.uid))).data()||{};if(!(own.friends||[]).includes(profileId))$("friend-count").textContent="Danh sách bạn bè chỉ dành cho bạn bè"}catch(error){console.warn(error)}}
  if (profileId === viewer.uid) await renderFriendRequests();
}

function renderProfileCore(){
  fields.displayName.value = profileData.displayName || "Thành viên VHHT"; fields.biography.value = profileData.biography || ""; fields.birthday.value = profileData.birthday || ""; fields.gender.value = profileData.gender || ""; fields.location.value = profileData.location || ""; fields.work.value = profileData.work || "";
  $("profile-activity-input").value=profileData.showActivityStatus===false?"offline":"online";$("profile-friends-visibility").value=profileData.friendsVisibility||"public";
  $("profile-name-heading").textContent = fields.displayName.value; $("profile-bio-heading").textContent = profileData.biography || "Chưa có tiểu sử";
  $("user-avatar-render").src = profileData.photoURL || profileData.profileImage || DEFAULT_AVATAR;
  $("user-avatar-render").style.objectPosition=`${profileData.avatarPositionX??50}% ${profileData.avatarPositionY??50}%`;
  $("composer-avatar").src=$("user-avatar-render").src;
  if (profileData.coverURL) $("cover-photo").style.backgroundImage = `url("${profileData.coverURL}")`;
  $("cover-photo").style.backgroundPosition=`50% ${profileData.coverPositionY??50}%`;
  $("profile-uid-readonly").textContent = profileId; $("profile-email-readonly").textContent = profileData.email || (profileId === viewer.uid ? viewer.email : "Không công khai");
  $("profile-created-at").textContent = profileData.createdAt?.seconds ? new Date(profileData.createdAt.seconds*1000).toLocaleDateString("vi-VN") : "Chưa xác định";
  $("friend-count").textContent = `${(profileData.friends || []).length} bạn bè`;
  if(profileId!==viewer.uid&&profileData.friendsVisibility==="private")$("friend-count").textContent="Danh sách bạn bè đã ẩn";
  window.dispatchEvent(new CustomEvent("vhht-profile-identity",{detail:{profileId,displayName:profileData.displayName,photoURL:profileData.photoURL||profileData.profileImage||""}}));
  updateReadonlyProfileValues();
}

function configureProfileViewMode(isOwner){
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
function configureProfileNavigation(){const source=profileReturnSource(),button=$("back-to-station-btn"),target=source==="dashboard"?"../../admin/admin-dashboard-page.html":source==="community-admin"?"../community-feed-page.html?from=admin":"../community-feed-page.html";button.href=target;button.dataset.returnTarget=target;if(source==="dashboard"){button.innerHTML='<i class="fa-solid fa-arrow-left"></i> Quay lại trang quản trị'}else if(source==="community-admin"){button.innerHTML='<i class="fa-solid fa-arrow-left"></i> Quay lại cộng đồng Admin'}else{button.innerHTML='<i class="fa-solid fa-arrow-left"></i> Bảng tin cộng đồng'}}
function enhanceProfileSelects(){const descriptions={public:"Mọi thành viên có thể xem",friends:"Chỉ những người đã kết bạn",private:"Chỉ tài khoản của bạn",online:"Hiển thị khi bạn đang hoạt động",offline:"Không chia sẻ trạng thái hoạt động","":"Chưa chia sẻ thông tin",Nam:"Giới tính Nam",Nữ:"Giới tính Nữ",Khác:"Danh xưng khác"},icon=value=>value==='public'?'fa-earth-asia':value==='friends'?'fa-user-group':value==='private'?'fa-lock':value==='online'?'fa-circle':value==='offline'?'fa-eye-slash':'fa-user';document.querySelectorAll(".profile-card select,#profile-post-privacy").forEach(select=>{if(select.dataset.enhanced)return;select.dataset.enhanced="1";select.hidden=true;const control=document.createElement("div");control.className=`profile-privacy-control ${select.id==='profile-post-privacy'?'composer-privacy-control':''}`;const trigger=document.createElement("button");trigger.type="button";trigger.className="profile-privacy-trigger";trigger.setAttribute("aria-expanded","false");const menu=document.createElement("div");menu.className="profile-privacy-menu";menu.hidden=true;const render=()=>{const option=select.options[select.selectedIndex];trigger.innerHTML=`<i class="fa-solid ${icon(option.value)}"></i><span>${option.textContent}</span><i class="fa-solid fa-chevron-down"></i>`;menu.querySelectorAll("button").forEach(button=>button.classList.toggle("selected",button.dataset.value===select.value))};[...select.options].forEach(option=>{const item=document.createElement("button");item.type="button";item.dataset.value=option.value;item.innerHTML=`<i class="fa-solid ${icon(option.value)}"></i><span><strong>${option.textContent}</strong><small>${descriptions[option.value]||"Tùy chọn hồ sơ"}</small></span><i class="fa-solid fa-check privacy-check"></i>`;item.onclick=()=>{select.value=option.value;select.dispatchEvent(new Event("change",{bubbles:true}));menu.hidden=true;trigger.setAttribute("aria-expanded","false");render()};menu.appendChild(item)});trigger.onclick=()=>{menu.hidden=!menu.hidden;trigger.setAttribute("aria-expanded",String(!menu.hidden))};control.append(trigger,menu);select.insertAdjacentElement("afterend",control);render()})}
function alignProfileComposerPrivacy(){
  const select=$("profile-post-privacy"),control=select?.nextElementSibling;if(!control)return;
  control.id="profile-composer-privacy-control";
  control.classList.add("profile-privacy-control","composer-privacy-control","post-privacy-control","profile-composer-privacy");
  const trigger=control.querySelector(".profile-privacy-trigger"),menu=control.querySelector(".profile-privacy-menu");
  trigger?.classList.add("post-privacy-trigger");menu?.classList.add("post-privacy-menu");
  if(!trigger||!menu)return;
  // Menu luôn thuộc chính ô quyền riêng tư để mở ngay phía trên nút trên cả
  // desktop lẫn mobile, không còn bị đưa xuống cuối viewport.
  menu.classList.remove("profile-post-privacy-sheet");
  if(menu.parentElement!==control)control.appendChild(menu);
  document.body.classList.remove("profile-privacy-sheet-open");
}

function closeProfileSelects(except=null){document.querySelectorAll(".profile-privacy-control").forEach(control=>{if(control===except)return;const menu=control.querySelector(".profile-privacy-menu,.post-privacy-menu"),trigger=control.querySelector(".profile-privacy-trigger,.post-privacy-trigger");if(menu)menu.hidden=true;trigger?.setAttribute("aria-expanded","false")})}
document.addEventListener("click",event=>closeProfileSelects(event.target.closest(".profile-privacy-control")));
document.addEventListener("keydown",event=>{if(event.key==="Escape")closeProfileSelects()});

function updateReadonlyProfileValues(){
  if(profileId===viewer?.uid)return;
  const values={"profile-display-name-input":profileData.displayName||"Chưa đặt tên hiển thị","profile-biography-input":profileData.biography||"Chưa có tiểu sử","profile-birthday-input":profileData.birthday||"Chưa chia sẻ","profile-gender-input":profileData.gender||"Chưa chia sẻ","profile-location-input":profileData.location||"Chưa chia sẻ","profile-work-input":profileData.work||"Chưa chia sẻ"};
  document.querySelectorAll(".profile-readonly-value").forEach(output=>output.textContent=values[output.dataset.forControl]||"Chưa chia sẻ");
}

async function renderFriendRequests() {
  const list=$("friend-requests-list"), requests=profileData.friendRequests || [];
  if(!requests.length){list.innerHTML='<div class="no-requests">Không có lời mời mới</div>';return;}
  list.innerHTML="";
  for(const uid of requests){const snap=await getDoc(doc(firebaseDatabase,"users",uid)),data=snap.data()||{};const row=document.createElement("div");row.className="friend-request-row";row.innerHTML=`<img src="${data.photoURL||data.profileImage||DEFAULT_AVATAR}" alt=""><strong>${data.displayName||"Thành viên"}</strong><div><button data-accept>Đồng ý</button><button data-decline>Từ chối</button></div>`;row.querySelector("img").onclick=()=>location.href=`user-profile.html?uid=${encodeURIComponent(uid)}`;const finish=async status=>{const notificationSnap=await getDocs(query(collection(firebaseDatabase,"notifications"),where("recipientId","==",viewer.uid)));await Promise.all(notificationSnap.docs.filter(item=>item.data().type==="friend_request"&&item.data().actorId===uid).map(item=>updateDoc(item.ref,{isRead:true,friendRequestStatus:status,resolvedAt:serverTimestamp(),message:status==="accepted"?"— Bạn đã đồng ý kết bạn":"— Bạn đã từ chối lời mời"})));row.remove()};row.querySelector("[data-accept]").onclick=async()=>{row.style.pointerEvents="none";try{await acceptFriendship(viewer.uid,uid);await addDoc(collection(firebaseDatabase,"notifications"),{recipientId:uid,actorId:viewer.uid,actorName:profileData.displayName||"Thành viên",type:"friend_accepted",message:"đã đồng ý lời mời kết bạn của bạn",isRead:false,createdAt:serverTimestamp()});await finish("accepted");profileData.friends=[...new Set([...(profileData.friends||[]),uid])];$("friend-count").textContent=`${profileData.friends.length} bạn bè`;toast("Hai tài khoản đã được đồng bộ bạn bè")}catch(error){console.error(error);row.style.pointerEvents="";toast(error.message||"Không thể đồng ý kết bạn")}};row.querySelector("[data-decline]").onclick=async()=>{row.style.pointerEvents="none";await updateDoc(doc(firebaseDatabase,"users",viewer.uid),{friendRequests:arrayRemove(uid)});await finish("declined");toast("Đã từ chối lời mời")};list.appendChild(row);}
}

async function setupFriendButton() {
  const button = $("friend-action-btn"); button.hidden = false;
  let friendship=await getFriendshipState(viewer.uid,profileId),own=friendship.firstData;
  if(friendship.firstHasSecond!==friendship.secondHasFirst){try{await repairFriendship(viewer.uid,profileId);friendship=await getFriendshipState(viewer.uid,profileId);own=friendship.firstData;toast("Đã sửa trạng thái bạn bè chưa đồng bộ")}catch(error){console.warn("Không thể tự sửa quan hệ bạn bè",error)}}
  if (friendship.firstHasSecond||friendship.secondHasFirst) { button.className="friend-action-btn friends"; button.innerHTML='<i class="fa-solid fa-user-check"></i><span>Bạn bè</span><i class="fa-solid fa-chevron-down friend-caret"></i>';button.disabled=false;button.onclick=()=>openUnfriendDialog(profileId,profileData.displayName||"người này");$("message-profile-btn").hidden=false;$("message-profile-btn").onclick=()=>location.href=`../messages/messages-page.html?uid=${encodeURIComponent(profileId)}`; return; }
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
  overlay.querySelector(".confirm-unfriend").onclick=async event=>{const action=event.currentTarget;action.disabled=true;action.textContent="Đang xử lý...";try{await removeFriendship(viewer.uid,targetId);profileData.friends=(profileData.friends||[]).filter(uid=>uid!==targetId);overlay.classList.remove("show");$("message-profile-btn").hidden=true;await setupFriendButton();toast(`Đã hủy kết bạn với ${targetName}`)}catch(error){console.error(error);action.disabled=false;action.textContent="Hủy kết bạn";toast(error.message||"Không thể hủy kết bạn")}};
}

$("save-profile-btn").onclick = async () => {
  if(profileId!==viewer.uid) return; const name=fields.displayName.value.trim(); if(!name) return toast("Tên hiển thị không được để trống");
  if(isGeneratedDisplayName(name,viewer.email))return toast("Hãy đặt tên hiển thị riêng, không dùng tên email hoặc tên mặc định");
  const button=$("save-profile-btn"); button.disabled=true;
  const localPayload={displayName:name,biography:fields.biography.value.trim(),birthday:fields.birthday.value,gender:fields.gender.value,location:fields.location.value.trim(),work:fields.work.value.trim(),showActivityStatus:$("profile-activity-input").value!=="offline",friendsVisibility:$("profile-friends-visibility").value,accountVisibility:$("profile-account-visibility").value};
  $("profile-name-heading").textContent=name;$("profile-bio-heading").textContent=localPayload.biography||"Chưa có tiểu sử";
  try {
    const cloudPayload={...localPayload,updatedAt:serverTimestamp()};
    await setDoc(doc(firebaseDatabase,"users",viewer.uid),cloudPayload,{merge:true});
    await updateProfile(viewer,{displayName:name});
    const authoredPosts=await getDocs(query(collection(firebaseDatabase,"posts"),where("authorId","==",viewer.uid)));
    await Promise.all(authoredPosts.docs.map(post=>updateDoc(post.ref,{authorDisplayName:name}))).catch(error=>console.warn("Tên hồ sơ đã lưu nhưng chưa đồng bộ hết bài viết cũ",error));
    profileData={...profileData,...localPayload};
    toast("Đã lưu và đồng bộ hồ sơ");
  } catch(error){console.error(error);toast(error.message||"Không thể lưu hồ sơ");} finally{button.disabled=false;button.innerHTML='<i class="fa-solid fa-check"></i> Lưu thay đổi';}
};
$("copy-uid-btn").onclick=async()=>{await navigator.clipboard.writeText(profileId);toast("Đã sao chép mã thành viên")};
$("back-to-station-btn").onclick=event=>{event.preventDefault();const target=event.currentTarget.dataset.returnTarget||event.currentTarget.href;sessionStorage.removeItem("vhht_profile_return_source");location.assign(target)};
$("profile-activity-input").onchange=()=>viewer&&setDoc(doc(firebaseDatabase,"users",viewer.uid),{showActivityStatus:$("profile-activity-input").value!=="offline"},{merge:true});
function toast(message){const el=$("cosmic-toast");el.textContent=message;el.classList.add("visible");setTimeout(()=>el.classList.remove("visible"),2600)}

const canvas=$("cosmic-profile-canvas"),ctx=canvas.getContext("2d");let stars=[];function resize(){canvas.width=innerWidth;canvas.height=innerHeight;stars=Array.from({length:70},()=>({x:Math.random()*innerWidth,y:Math.random()*innerHeight,r:Math.random()*1.4,a:Math.random()}))}function draw(){ctx.clearRect(0,0,canvas.width,canvas.height);stars.forEach(s=>{s.a=.2+(s.a+.004)% .8;ctx.fillStyle=`rgba(125,211,252,${s.a})`;ctx.beginPath();ctx.arc(s.x,s.y,s.r,0,Math.PI*2);ctx.fill()});requestAnimationFrame(draw)}addEventListener("resize",resize);resize();draw();
