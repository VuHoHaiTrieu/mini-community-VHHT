import { firebaseAuthentication, firebaseDatabase } from "../../shared/firebase-connection.js";
import { doc, getDoc, getDocs, setDoc, updateDoc, deleteDoc, addDoc, collection, query, where, orderBy, onSnapshot, arrayUnion, arrayRemove, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { onAuthStateChanged, updateProfile } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { startPresenceTracking } from "../../shared/presence-handler.js";
startPresenceTracking();
import("./profile-enhancements.js?v=cloudinary-profile-4").catch(error=>{
  console.error("Không thể khởi tạo công cụ hồ sơ",error);
  const toastElement=document.getElementById("cosmic-toast");
  if(toastElement){toastElement.textContent=`Lỗi công cụ chỉnh ảnh: ${error?.message||"Không xác định"}`;toastElement.classList.add("visible")}
});

const $ = id => document.getElementById(id), DEFAULT_AVATAR = "../../shared/assets/default-avatar.svg";
const fields = { displayName: $("profile-display-name-input"), biography: $("profile-biography-input"), birthday: $("profile-birthday-input"), gender: $("profile-gender-input"), location: $("profile-location-input"), work: $("profile-work-input") };
let viewer = null, profileId = null, profileData = {};
let selectedPostFiles=[];

onAuthStateChanged(firebaseAuthentication, async user => {
  if (!user) return location.href = "../../index.html";
  viewer = user; profileId = new URLSearchParams(location.search).get("uid") || user.uid;
  document.body.classList.toggle("viewing-profile", profileId !== user.uid);
  document.body.classList.toggle("own-profile", profileId === user.uid);
  const contextBadge=document.createElement("span");contextBadge.className="profile-context-badge";contextBadge.innerHTML=profileId===user.uid?'<i class="fa-solid fa-user-gear"></i> Hồ sơ của bạn':'<i class="fa-solid fa-eye"></i> Bạn đang xem hồ sơ thành viên';document.querySelector(".profile-title")?.prepend(contextBadge);
  try{await loadProfile()}catch(error){console.error("Không thể tải hồ sơ",error);profileData={displayName:user.displayName||user.email?.split("@")[0]||"Thành viên VHHT",email:user.email||""};renderProfileCore();toast(error.code==="permission-denied"?"Firestore Rules đang từ chối đọc hồ sơ":"Không thể tải đầy đủ hồ sơ")}
});

async function loadProfile() {
  const snapshot = await getDoc(doc(firebaseDatabase,"users",profileId));
  profileData = snapshot.exists() ? snapshot.data() : {};
  renderProfileCore();
  if(profileId===viewer.uid){try{const allUsers=await getDocs(collection(firebaseDatabase,"users")),friendIds=new Set(profileData.friends||[]);allUsers.forEach(item=>{if((item.data().friends||[]).includes(viewer.uid))friendIds.add(item.id)});friendIds.delete(viewer.uid);profileData.friends=[...friendIds];if(profileData.friends.some(uid=>!(snapshot.data()?.friends||[]).includes(uid)))await setDoc(doc(firebaseDatabase,"users",viewer.uid),{friends:arrayUnion(...profileData.friends)},{merge:true})}catch(error){console.warn("Bỏ qua đồng bộ bạn bè hai chiều",error)}}
  if(!profileData.displayName||(!profileData.photoURL&&!profileData.profileImage)){
    let legacyPost=null;try{const postSnapshot=await getDocs(query(collection(firebaseDatabase,"posts"),where("authorId","==",profileId)));legacyPost=postSnapshot.docs.map(item=>item.data()).find(post=>post.authorDisplayName||post.authorAvatar)}catch(error){console.warn("Bỏ qua dữ liệu hồ sơ từ bài viết cũ",error)}
    if(!profileData.displayName)profileData.displayName=legacyPost?.authorDisplayName||(profileId===viewer.uid?(viewer.displayName||viewer.email?.split("@")[0]):null)||`Thành viên ${profileId.slice(0,6)}`;
    if(!profileData.photoURL&&!profileData.profileImage&&legacyPost?.authorAvatar)profileData.photoURL=legacyPost.authorAvatar;
    if(profileId===viewer.uid&&!snapshot.data()?.displayName)await setDoc(doc(firebaseDatabase,"users",viewer.uid),{displayName:profileData.displayName},{merge:true}).catch(error=>console.warn("Không thể bổ sung tên hồ sơ",error));
  }
  renderProfileCore();
  if(profileId!==viewer.uid&&profileData.friendsVisibility==="friends"){try{const own=(await getDoc(doc(firebaseDatabase,"users",viewer.uid))).data()||{};if(!(own.friends||[]).includes(profileId))$("friend-count").textContent="Danh sách bạn bè chỉ dành cho bạn bè"}catch(error){console.warn(error)}}
  if (profileId !== viewer.uid) await setupFriendButton(); else await renderFriendRequests();
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
}

async function renderFriendRequests() {
  const list=$("friend-requests-list"), requests=profileData.friendRequests || [];
  if(!requests.length){list.innerHTML='<div class="no-requests">Không có lời mời mới</div>';return;}
  list.innerHTML="";
  for(const uid of requests){const snap=await getDoc(doc(firebaseDatabase,"users",uid)),data=snap.data()||{};const row=document.createElement("div");row.className="friend-request-row";row.innerHTML=`<img src="${data.photoURL||data.profileImage||DEFAULT_AVATAR}" alt=""><strong>${data.displayName||"Thành viên"}</strong><div><button data-accept>Đồng ý</button><button data-decline>Từ chối</button></div>`;row.querySelector("img").onclick=()=>location.href=`user-profile.html?uid=${encodeURIComponent(uid)}`;const finish=async status=>{const notificationSnap=await getDocs(query(collection(firebaseDatabase,"notifications"),where("recipientId","==",viewer.uid)));await Promise.all(notificationSnap.docs.filter(item=>item.data().type==="friend_request"&&item.data().actorId===uid).map(item=>updateDoc(item.ref,{isRead:true,friendRequestStatus:status,resolvedAt:serverTimestamp(),message:status==="accepted"?"— Bạn đã đồng ý kết bạn":"— Bạn đã từ chối lời mời"})));row.remove()};row.querySelector("[data-accept]").onclick=async()=>{row.style.pointerEvents="none";await Promise.all([updateDoc(doc(firebaseDatabase,"users",viewer.uid),{friends:arrayUnion(uid),friendRequests:arrayRemove(uid)}),setDoc(doc(firebaseDatabase,"users",uid),{friends:arrayUnion(viewer.uid)},{merge:true})]);await addDoc(collection(firebaseDatabase,"notifications"),{recipientId:uid,actorId:viewer.uid,actorName:profileData.displayName||"Thành viên",type:"friend_accepted",message:"đã đồng ý lời mời kết bạn của bạn",isRead:false,createdAt:serverTimestamp()});await finish("accepted");toast("Hai bạn đã trở thành bạn bè")};row.querySelector("[data-decline]").onclick=async()=>{row.style.pointerEvents="none";await updateDoc(doc(firebaseDatabase,"users",viewer.uid),{friendRequests:arrayRemove(uid)});await finish("declined");toast("Đã từ chối lời mời")};list.appendChild(row);}
}

async function setupFriendButton() {
  const button = $("friend-action-btn"); button.hidden = false;
  const ownSnap = await getDoc(doc(firebaseDatabase,"users",viewer.uid)), own = ownSnap.data() || {};
  if ((own.friends || []).includes(profileId)) { button.className="friend-action-btn friends"; button.innerHTML='<i class="fa-solid fa-user-check"></i><span>Bạn bè</span>'; button.disabled=true;$("message-profile-btn").hidden=false;$("message-profile-btn").onclick=()=>location.href=`../messages/messages-page.html?uid=${encodeURIComponent(profileId)}`; return; }
  if ((profileData.friendRequests || []).includes(viewer.uid)) { button.className="friend-action-btn pending"; button.innerHTML='<i class="fa-solid fa-clock"></i><span>Đã gửi lời mời</span>'; button.disabled=true; return; }
  button.onclick = async () => { button.disabled=true; await setDoc(doc(firebaseDatabase,"users",profileId),{friendRequests:arrayUnion(viewer.uid)},{merge:true});await addDoc(collection(firebaseDatabase,"notifications"),{recipientId:profileId,actorId:viewer.uid,actorName:own.displayName||"Một thành viên",type:"friend_request",message:"đã gửi lời mời kết bạn",isRead:false,createdAt:serverTimestamp()}); button.classList.add("pending"); button.querySelector("span").textContent="Đã gửi lời mời"; toast("Đã gửi lời mời kết bạn"); };
}

$("save-profile-btn").onclick = async () => {
  if(profileId!==viewer.uid) return; const name=fields.displayName.value.trim(); if(!name) return toast("Tên hiển thị không được để trống");
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
$("back-to-station-btn").onclick=()=>location.href=new URLSearchParams(location.search).get("from")==="admin"?"../../admin/admin-dashboard-page.html":"../community-feed-page.html";
$("profile-activity-input").onchange=()=>viewer&&setDoc(doc(firebaseDatabase,"users",viewer.uid),{showActivityStatus:$("profile-activity-input").value!=="offline"},{merge:true});
function toast(message){const el=$("cosmic-toast");el.textContent=message;el.classList.add("visible");setTimeout(()=>el.classList.remove("visible"),2600)}

const canvas=$("cosmic-profile-canvas"),ctx=canvas.getContext("2d");let stars=[];function resize(){canvas.width=innerWidth;canvas.height=innerHeight;stars=Array.from({length:70},()=>({x:Math.random()*innerWidth,y:Math.random()*innerHeight,r:Math.random()*1.4,a:Math.random()}))}function draw(){ctx.clearRect(0,0,canvas.width,canvas.height);stars.forEach(s=>{s.a=.2+(s.a+.004)% .8;ctx.fillStyle=`rgba(125,211,252,${s.a})`;ctx.beginPath();ctx.arc(s.x,s.y,s.r,0,Math.PI*2);ctx.fill()});requestAnimationFrame(draw)}addEventListener("resize",resize);resize();draw();
