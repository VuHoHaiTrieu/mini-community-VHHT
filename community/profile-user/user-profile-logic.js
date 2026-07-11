import { firebaseAuthentication, firebaseDatabase, firebaseStorage } from "../../shared/firebase-connection.js";
import { doc, getDoc, setDoc, updateDoc, deleteDoc, addDoc, collection, query, where, orderBy, onSnapshot, arrayUnion, arrayRemove, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { ref, uploadBytes, getDownloadURL } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-storage.js";

const $ = id => document.getElementById(id), DEFAULT_AVATAR = "https://ui-avatars.com/api/?background=172554&color=bae6fd&name=VHHT";
const fields = { displayName: $("profile-display-name-input"), biography: $("profile-biography-input"), birthday: $("profile-birthday-input"), gender: $("profile-gender-input"), location: $("profile-location-input"), work: $("profile-work-input") };
let viewer = null, profileId = null, profileData = {}, avatarFile = null, coverFile = null;
let selectedPostFiles=[];

onAuthStateChanged(firebaseAuthentication, async user => {
  if (!user) return location.href = "../../index.html";
  viewer = user; profileId = new URLSearchParams(location.search).get("uid") || user.uid;
  document.body.classList.toggle("viewing-profile", profileId !== user.uid);
  await loadProfile();
});

async function loadProfile() {
  const snapshot = await getDoc(doc(firebaseDatabase,"users",profileId));
  profileData = snapshot.exists() ? snapshot.data() : {};
  fields.displayName.value = profileData.displayName || "Thành viên VHHT"; fields.biography.value = profileData.biography || ""; fields.birthday.value = profileData.birthday || ""; fields.gender.value = profileData.gender || ""; fields.location.value = profileData.location || ""; fields.work.value = profileData.work || "";
  $("profile-activity-input").value=profileData.activityStatus||"online";$("profile-friends-visibility").value=profileData.friendsVisibility||"public";
  $("profile-name-heading").textContent = fields.displayName.value; $("profile-bio-heading").textContent = profileData.biography || "Chưa có tiểu sử";
  $("user-avatar-render").src = profileData.photoURL || profileData.profileImage || DEFAULT_AVATAR;
  $("composer-avatar").src=$("user-avatar-render").src;
  if (profileData.coverURL) $("cover-photo").style.backgroundImage = `url("${profileData.coverURL}")`;
  $("profile-uid-readonly").textContent = profileId; $("profile-email-readonly").textContent = profileData.email || (profileId === viewer.uid ? viewer.email : "Không công khai");
  $("profile-created-at").textContent = profileData.createdAt?.seconds ? new Date(profileData.createdAt.seconds*1000).toLocaleDateString("vi-VN") : "Chưa xác định";
  $("friend-count").textContent = `${(profileData.friends || []).length} bạn bè`;
  if(profileId!==viewer.uid&&profileData.friendsVisibility==="private")$("friend-count").textContent="Danh sách bạn bè đã ẩn";
  if(profileId!==viewer.uid&&profileData.friendsVisibility==="friends"){const own=(await getDoc(doc(firebaseDatabase,"users",viewer.uid))).data()||{};if(!(own.friends||[]).includes(profileId))$("friend-count").textContent="Danh sách bạn bè chỉ dành cho bạn bè";}
  if (profileId !== viewer.uid) await setupFriendButton(); else await renderFriendRequests();
}

async function renderFriendRequests() {
  const list=$("friend-requests-list"), requests=profileData.friendRequests || [];
  if(!requests.length){list.innerHTML='<div class="no-requests">Không có lời mời mới</div>';return;}
  list.innerHTML="";
  for(const uid of requests){const snap=await getDoc(doc(firebaseDatabase,"users",uid)),data=snap.data()||{};const row=document.createElement("div");row.className="friend-request-row";row.innerHTML=`<img src="${data.photoURL||data.profileImage||DEFAULT_AVATAR}" alt=""><strong>${data.displayName||"Thành viên"}</strong><button>Chấp nhận</button>`;row.querySelector("img").onclick=()=>location.href=`user-profile.html?uid=${encodeURIComponent(uid)}`;row.querySelector("button").onclick=async()=>{await Promise.all([updateDoc(doc(firebaseDatabase,"users",viewer.uid),{friends:arrayUnion(uid),friendRequests:arrayRemove(uid)}),setDoc(doc(firebaseDatabase,"users",uid),{friends:arrayUnion(viewer.uid)},{merge:true})]);await addDoc(collection(firebaseDatabase,"notifications"),{recipientId:uid,actorId:viewer.uid,actorName:profileData.displayName||"Thành viên",type:"friend_accepted",message:"đã đồng ý lời mời kết bạn của bạn",isRead:false,createdAt:serverTimestamp()});row.remove();toast("Hai bạn đã trở thành bạn bè")};list.appendChild(row);}
}

async function setupFriendButton() {
  const button = $("friend-action-btn"); button.hidden = false;
  const ownSnap = await getDoc(doc(firebaseDatabase,"users",viewer.uid)), own = ownSnap.data() || {};
  if ((own.friends || []).includes(profileId)) { button.className="friend-action-btn friends"; button.innerHTML='<i class="fa-solid fa-user-check"></i><span>Bạn bè</span>'; button.disabled=true;$("message-profile-btn").hidden=false;$("message-profile-btn").onclick=()=>location.href=`../messages/messages-page.html?uid=${encodeURIComponent(profileId)}`; return; }
  if ((profileData.friendRequests || []).includes(viewer.uid)) { button.className="friend-action-btn pending"; button.innerHTML='<i class="fa-solid fa-clock"></i><span>Đã gửi lời mời</span>'; button.disabled=true; return; }
  button.onclick = async () => { button.disabled=true; await setDoc(doc(firebaseDatabase,"users",profileId),{friendRequests:arrayUnion(viewer.uid)},{merge:true});await addDoc(collection(firebaseDatabase,"notifications"),{recipientId:profileId,actorId:viewer.uid,actorName:own.displayName||"Một thành viên",type:"friend_request",message:"đã gửi lời mời kết bạn",isRead:false,createdAt:serverTimestamp()}); button.classList.add("pending"); button.querySelector("span").textContent="Đã gửi lời mời"; toast("Đã gửi lời mời kết bạn"); };
}

$("avatar-file-selector").onchange = e => { avatarFile=e.target.files[0]; if(avatarFile) $("user-avatar-render").src=URL.createObjectURL(avatarFile); };
$("cover-file-selector").onchange = e => { coverFile=e.target.files[0]; if(coverFile) $("cover-photo").style.backgroundImage=`url("${URL.createObjectURL(coverFile)}")`; };
async function upload(file, folder) { if(!file) return null; if(!file.type.startsWith("image/") || file.size>8*1024*1024) throw new Error("Ảnh phải nhỏ hơn 8 MB"); const target=ref(firebaseStorage,`${folder}/${viewer.uid}/${Date.now()}-${file.name.replace(/[^a-zA-Z0-9._-]/g,"_")}`); await uploadBytes(target,file,{contentType:file.type}); return getDownloadURL(target); }

$("save-profile-btn").onclick = async () => {
  if(profileId!==viewer.uid) return; const name=fields.displayName.value.trim(); if(!name) return toast("Tên hiển thị không được để trống");
  const button=$("save-profile-btn"); button.disabled=true;
  try { const [photoURL,coverURL]=await Promise.all([upload(avatarFile,"avatars"),upload(coverFile,"covers")]); const payload={displayName:name,biography:fields.biography.value.trim(),birthday:fields.birthday.value,gender:fields.gender.value,location:fields.location.value.trim(),work:fields.work.value.trim(),updatedAt:serverTimestamp()}; if(photoURL)payload.photoURL=photoURL;if(coverURL)payload.coverURL=coverURL; await setDoc(doc(firebaseDatabase,"users",viewer.uid),payload,{merge:true}); toast("Đã lưu hồ sơ"); await loadProfile(); } catch(error){console.error(error);toast(error.message||"Không thể lưu hồ sơ");} finally{button.disabled=false;}
};
$("copy-uid-btn").onclick=async()=>{await navigator.clipboard.writeText(profileId);toast("Đã sao chép mã thành viên")};
$("back-to-station-btn").onclick=()=>location.href=new URLSearchParams(location.search).get("from")==="admin"?"../../admin/admin-dashboard-page.html":"../community-feed-page.html";
function toast(message){const el=$("cosmic-toast");el.textContent=message;el.classList.add("visible");setTimeout(()=>el.classList.remove("visible"),2600)}

const canvas=$("cosmic-profile-canvas"),ctx=canvas.getContext("2d");let stars=[];function resize(){canvas.width=innerWidth;canvas.height=innerHeight;stars=Array.from({length:70},()=>({x:Math.random()*innerWidth,y:Math.random()*innerHeight,r:Math.random()*1.4,a:Math.random()}))}function draw(){ctx.clearRect(0,0,canvas.width,canvas.height);stars.forEach(s=>{s.a=.2+(s.a+.004)% .8;ctx.fillStyle=`rgba(125,211,252,${s.a})`;ctx.beginPath();ctx.arc(s.x,s.y,s.r,0,Math.PI*2);ctx.fill()});requestAnimationFrame(draw)}addEventListener("resize",resize);resize();draw();
