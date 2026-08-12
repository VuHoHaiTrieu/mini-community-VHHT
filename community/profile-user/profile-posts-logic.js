import {firebaseAuthentication as auth,firebaseDatabase as db} from "../../shared/firebase-connection.js";
import {onAuthStateChanged} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {collection,query,where,orderBy,onSnapshot,setDoc,addDoc,doc,getDoc,getDocs,updateDoc,deleteDoc,serverTimestamp,increment,arrayUnion} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import {uploadMedia} from "../../shared/cloudinary-media-service.js";
import {rememberAuthoredPost,readAuthoredPostIds,forgetAuthoredPost} from "../../shared/authored-post-cache.js";
import {resolveDisplayName,isGeneratedDisplayName} from "../../shared/user-identity.js";
import {getDefaultAvatarUrl,resolveAvatarUrl} from "../../shared/default-avatar.js";
const $=id=>document.getElementById(id),DEFAULT=getDefaultAvatarUrl({uid:"vhht-member",displayName:"VHHT"}),EMOJI={like:"👍",love:"❤️",haha:"😂",wow:"😮",sad:"😢",angry:"😡"};
const avatarFor=(uid,name,url)=>resolveAvatarUrl(url,{uid,displayName:name});
let me,profileId,profile={},myProfile={},files=[],stopPosts,directPosts=[],commentStops=new Map();

const conversationId=(first,second)=>[first,second].sort().join("_");
const postShareUrl=postId=>{const url=new URL("../community-feed-page.html",location.href);url.searchParams.set("post",postId);return url.href};
const relationId=value=>typeof value==="string"?value:(value?.uid||value?.userId||value?.id||"");
const relationIds=value=>new Set((Array.isArray(value)?value:[]).map(relationId).filter(Boolean));
const areFriends=(left,right,leftUid,rightUid)=>relationIds(left?.friends).has(rightUid)||relationIds(right?.friends).has(leftUid);
const hasFriendRequest=(person,uid)=>relationIds(person?.friendRequests).has(uid);

function installShareExperience(){
  const list=$("profile-posts-list");if(!list)return;
  const relabel=()=>list.querySelectorAll("[data-share]").forEach(button=>{if(button.dataset.shareEnhanced)return;button.dataset.shareEnhanced="true";button.innerHTML='<span class="post-share-symbol"><i class="fa-solid fa-paper-plane"></i></span><span>Chia sẻ</span>';button.setAttribute("aria-label","Chia sẻ bài viết tới bạn bè")});
  new MutationObserver(relabel).observe(list,{childList:true,subtree:true});relabel();
  document.addEventListener("click",async event=>{
    const button=event.target.closest("#profile-posts-list [data-share]");if(!button)return;
    event.preventDefault();event.stopPropagation();event.stopImmediatePropagation();
    const postId=button.closest(".social-post")?.dataset.id;if(!postId)return;
    button.disabled=true;
    try{const snapshot=await getDoc(doc(db,"posts",postId));if(!snapshot.exists())throw new Error("Bài viết không còn tồn tại");openShareDialog({id:snapshot.id,...snapshot.data()})}
    catch(error){showNotice(error.message||"Không thể mở chức năng chia sẻ","error")}
    finally{button.disabled=false}
  },true);
}

function installProfileShareSummaryExperience(){
  const list=$("profile-posts-list");if(!list)return;
  const enrich=()=>list.querySelectorAll(".social-post").forEach(async card=>{
    const summary=card.querySelector(".post-social-summary");
    if(!summary||card.dataset.shareSummaryLoading)return;
    card.dataset.shareSummaryLoading="true";
    try{
      const [snapshot,sharesSnapshot]=await Promise.all([
        getDoc(doc(db,"posts",card.dataset.id)),
        getDocs(collection(db,"posts",card.dataset.id,"shares"))
      ]);
      if(!snapshot.exists())return;
      const storedCount=Number(snapshot.data().shareCount||0),verifiedCount=sharesSnapshot.size;
      const button=summary.querySelector("[data-share-summary]")||document.createElement("button");
      button.type="button";button.dataset.shareSummary="";
      button.innerHTML=`<i class="fa-solid fa-paper-plane"></i><strong>${Math.max(storedCount,verifiedCount)}</strong><span>lượt chia sẻ</span>`;
      button.setAttribute("aria-label","Xem người đã chia sẻ bài viết");
      if(!button.isConnected)summary.appendChild(button);
    }catch(error){console.warn("Không thể đọc lượt chia sẻ",error)}
  });
  new MutationObserver(enrich).observe(list,{childList:true,subtree:true});enrich();
  list.addEventListener("click",async event=>{
    const button=event.target.closest("[data-share-summary]");if(!button)return;
    event.preventDefault();event.stopPropagation();
    const postId=button.closest(".social-post")?.dataset.id;if(!postId)return;
    button.disabled=true;try{await openProfileSharers(postId)}finally{button.disabled=false}
  });
}

async function openProfileSharers(postId){
  try{
    const sharesSnapshot=await getDocs(collection(db,"posts",postId,"shares"));
    const ids=[...new Set(sharesSnapshot.docs.map(item=>item.data().sharerId).filter(Boolean))];
    if(!ids.length)return showNotice("Bài viết chưa có lượt chia sẻ nào được ghi nhận","info");
    const people=await Promise.all(ids.map(async uid=>{const snapshot=await getDoc(doc(db,"users",uid));const data=snapshot.data()||{},name=resolveDisplayName(data);return{name,avatar:avatarFor(uid,name,data.photoURL||data.profileImage)}}));
    openDialog(`<h3>Người đã chia sẻ bài viết</h3><p>${people.length} thành viên đã chia sẻ bài viết này.</p><div class="reaction-viewer-list">${people.map(person=>`<div><img src="${safe(person.avatar)}" alt=""><span><strong>${safe(person.name)}</strong><small><i class="fa-solid fa-paper-plane"></i> Đã chia sẻ</small></span></div>`).join("")}</div><div class="dialog-actions"><button data-dialog-cancel>Đóng</button></div>`);
  }catch(error){console.error(error);showNotice("Không thể tải danh sách người đã chia sẻ","error")}
}

async function openShareDialog(post){
  if(post.privacy==="private")return showNotice("Bài viết Chỉ mình tôi không thể chia sẻ cho người khác","warning");
  openDialog(`<div class="share-dialog-heading"><span><i class="fa-solid fa-paper-plane"></i></span><div><h3>Chia sẻ tới bạn bè</h3><p>Gửi bài viết trực tiếp vào cuộc trò chuyện.</p></div></div><div class="share-post-preview"><strong>${safe(post.authorDisplayName||profile.displayName||"Thành viên")}</strong><p>${safe(String(post.content||"Bài viết có ảnh/video").slice(0,140))}</p></div><label class="share-message-label" for="share-message-text">Tin nhắn gửi kèm</label><textarea id="share-message-text" maxlength="500" placeholder="Viết lời nhắn cho bạn bè (không bắt buộc)…"></textarea><div class="share-friend-list"><div class="share-loading"><i class="fa-solid fa-circle-notch fa-spin"></i> Đang tải danh sách bạn bè…</div></div><div class="dialog-actions"><button data-dialog-cancel>Đóng</button></div>`,async dialog=>{
    const container=dialog.querySelector(".share-friend-list");
    try{
      const friends=await loadShareFriends(post);
      if(!friends.length){container.innerHTML='<div class="share-empty"><i class="fa-solid fa-user-group"></i><p>Chưa có người bạn phù hợp để chia sẻ bài viết này.</p></div>';return}
      container.replaceChildren(...friends.map(friend=>{
        const row=document.createElement("div");row.className="share-friend-row";
        const avatar=document.createElement("img");avatar.src=avatarFor(friend.uid,friend.displayName,friend.photoURL||friend.profileImage);avatar.alt="";
        const name=document.createElement("strong");name.textContent=resolveDisplayName(friend);
        const send=document.createElement("button");send.type="button";send.className="share-send-button";send.title=`Gửi cho ${name.textContent}`;send.setAttribute("aria-label",send.title);send.innerHTML='<i class="fa-solid fa-paper-plane"></i><span>Gửi</span>';
        send.onclick=async()=>{send.disabled=true;const original=send.innerHTML;send.innerHTML='<i class="fa-solid fa-circle-notch fa-spin"></i><span>Đang gửi</span>';try{await sendSharedPost(friend,post,dialog.querySelector("#share-message-text").value.trim());send.classList.add("sent");send.innerHTML='<i class="fa-solid fa-check"></i><span>Đã gửi</span>';showNotice(`Đã chia sẻ với ${name.textContent}`,"success")}catch(error){console.error(error);send.disabled=false;send.innerHTML=original;showNotice("Không thể gửi bài viết. Hãy thử lại.","error")}};
        row.append(avatar,name,send);return row
      }));
    }catch(error){console.error(error);container.innerHTML='<div class="share-empty error"><i class="fa-solid fa-triangle-exclamation"></i><p>Không thể tải danh sách bạn bè.</p></div>'}
  });
}

async function loadShareFriends(post){
  const [ownSnapshot,usersSnapshot,notificationsSnapshot,postsSnapshot]=await Promise.all([getDoc(doc(db,"users",me.uid)),getDocs(collection(db,"users")),getDocs(collection(db,"notifications")),getDocs(collection(db,"posts"))]);
  const own=ownSnapshot.data()||{},profiles=new Map(),acceptedIds=new Set(),friendIds=new Set([...relationIds(own.friends),...relationIds(myProfile.friends)]);
  usersSnapshot.forEach(snapshot=>profiles.set(snapshot.id,{id:snapshot.id,...snapshot.data()}));
  const recoveredNames=new Map();postsSnapshot.forEach(snapshot=>{const data=snapshot.data(),name=String(data.authorDisplayName||"").trim();if(data.authorId&&!isGeneratedDisplayName(name))recoveredNames.set(data.authorId,name)});
  notificationsSnapshot.forEach(snapshot=>{const notification=snapshot.data(),participants=[notification.actorId,notification.recipientId];if(notification.actorId&&notification.actorName&&!isGeneratedDisplayName(notification.actorName))recoveredNames.set(notification.actorId,notification.actorName);if(!participants.includes(me.uid))return;const other=participants.find(id=>id&&id!==me.uid);if(other&&(notification.type==="friend_accepted"||(notification.type==="friend_request"&&notification.friendRequestStatus==="accepted")))acceptedIds.add(other)});
  profiles.forEach((candidate,id)=>{if(isGeneratedDisplayName(resolveDisplayName(candidate),candidate.email)&&recoveredNames.has(id))candidate.displayName=recoveredNames.get(id)});
  // Trường friends của tài khoản hiện tại là nguồn chính. Chỉ khôi phục quan hệ
  // một chiều từ phía người kia khi đã có lịch sử chấp nhận lời mời rõ ràng.
  // Nhờ vậy bảng chia sẻ khớp với Trạm liên lạc nhưng không kéo tài khoản lạ vào.
  acceptedIds.forEach(id=>{const candidate=profiles.get(id);if(candidate&&relationIds(candidate.friends).has(me.uid))friendIds.add(id)});friendIds.delete(me.uid);
  const authorFriendIds=relationIds(profile.friends);
  const friends=[...friendIds].map(id=>profiles.get(id)).filter(Boolean).filter(friend=>friend.accountStatus!=="suspended").filter(friend=>friend.role!=="admin"||acceptedIds.has(friend.id)||friendIds.has(friend.id)).filter(friend=>post.privacy!=="friends"||post.authorId===me.uid||authorFriendIds.has(friend.id)||relationIds(friend.friends).has(post.authorId));
  friends.sort((a,b)=>resolveDisplayName(a).localeCompare(resolveDisplayName(b),"vi"));return friends;
}

async function sendSharedPost(friend,post,message){
  const id=conversationId(me.uid,friend.id),media=normaliseMedia(post)[0]||null;
  const authorSnapshot=post.authorId?await getDoc(doc(db,"users",post.authorId)):null,authorProfile=authorSnapshot?.data()||{};
  const resolvedAuthor=resolveDisplayName(authorProfile),authorName=!isGeneratedDisplayName(resolvedAuthor,authorProfile.email)?resolvedAuthor:(!isGeneratedDisplayName(post.authorDisplayName)?post.authorDisplayName:(profile.displayName||"Thành viên VHHT"));
  await setDoc(doc(db,"conversations",id),{members:[me.uid,friend.id],updatedAt:serverTimestamp()},{merge:true});
  await addDoc(collection(db,"conversations",id,"messages"),{senderId:me.uid,recipientId:friend.id,content:message,mediaUrl:null,mediaType:null,mediaPublicId:null,sharedPost:{id:post.id,authorId:post.authorId,authorName,content:String(post.content||"").slice(0,220),mediaUrl:media?.url||null,mediaType:media?.type||null,url:postShareUrl(post.id)},createdAt:serverTimestamp(),readAt:null});
  await addDoc(collection(db,"messageNotifications"),{recipientId:friend.id,senderId:me.uid,conversationId:id,isRead:false,createdAt:serverTimestamp()});
  await Promise.all([addDoc(collection(db,"posts",post.id,"shares"),{sharerId:me.uid,recipientId:friend.id,createdAt:serverTimestamp()}),updateDoc(doc(db,"posts",post.id),{shareCount:increment(1)})]);
}

installShareExperience();
installProfileShareSummaryExperience();
onAuthStateChanged(auth,async user=>{if(!user)return;me=user;profileId=new URLSearchParams(location.search).get("uid")||user.uid;$("profile-posts-list").innerHTML='<div class="profile-empty-posts"><i class="fa-solid fa-spinner fa-spin"></i><p>Đang tải bài viết...</p></div>';[profile,myProfile]=await Promise.all([getDoc(doc(db,"users",profileId)).then(s=>s.data()||{}),getDoc(doc(db,"users",user.uid)).then(s=>s.data()||{})]);profile={...profile,friends:[...relationIds(profile.friends)],friendRequests:[...relationIds(profile.friendRequests)]};myProfile={...myProfile,friends:[...relationIds(myProfile.friends)],friendRequests:[...relationIds(myProfile.friendRequests)]};profile.displayName=resolveDisplayName(profile,profileId===user.uid?user:null);myProfile.displayName=resolveDisplayName(myProfile,user);$("composer-avatar").src=avatarFor(user.uid,myProfile.displayName,myProfile.photoURL||myProfile.profileImage);onSnapshot(doc(db,"users",profileId),snapshot=>{if(!snapshot.exists())return;const data=snapshot.data();profile={...profile,...data,friends:[...relationIds(data.friends)],friendRequests:[...relationIds(data.friendRequests)]};profile.displayName=resolveDisplayName(profile,profileId===user.uid?user:null);syncRenderedProfileIdentity()});if(profileId===user.uid)await loadRememberedPosts();await loadProfilePostsByAuthor();listenPosts()});
function syncRenderedProfileIdentity(){$("profile-posts-list").querySelectorAll(".profile-post-author").forEach(header=>{const image=header.querySelector("img"),name=header.querySelector("strong");if(image)image.src=avatarFor(profileId,profile.displayName,profile.photoURL||profile.profileImage);if(name)name.textContent=profile.displayName||"Thành viên VHHT"})}
window.addEventListener("vhht-profile-identity",event=>{if(event.detail?.profileId!==profileId)return;profile={...profile,displayName:event.detail.displayName,photoURL:event.detail.photoURL};syncRenderedProfileIdentity()});
async function loadProfilePostsByAuthor(){try{const snapshot=await getDocs(query(collection(db,"posts"),where("authorId","==",profileId))),isOwner=profileId===me.uid,isFriend=relationIds(profile.friends).has(me.uid);snapshot.forEach(item=>{const post={id:item.id,...item.data()},moderated=post.deletedByAdmin===true||post.moderationStatus==="hidden"||post.moderationStatus==="deleted",canRead=isOwner||(!moderated&&(!post.privacy||post.privacy==="public"||(post.privacy==="friends"&&isFriend)));if(canRead&&!directPosts.some(existing=>existing.id===post.id))directPosts.push(post);if(isOwner)rememberAuthoredPost(me.uid,item.id)});if(directPosts.length)renderPosts(directPosts.sort((a,b)=>(b.createdAt?.seconds||0)-(a.createdAt?.seconds||0)))}catch(error){console.warn("Query bài viết theo tác giả không khả dụng",error)}}
async function loadRememberedPosts(){directPosts=[];for(const id of readAuthoredPostIds(me.uid)){try{const snap=await getDoc(doc(db,"posts",id));if(snap.exists()&&snap.data().authorId===me.uid)directPosts.push({id:snap.id,...snap.data()});else forgetAuthoredPost(me.uid,id)}catch(error){console.warn("Không thể đọc bài đã ghi nhớ",id,error)}}if(directPosts.length)renderPosts(directPosts)}
$("profile-post-media").onchange=e=>{files=[...e.target.files].slice(0,1);renderComposerPreview()};
$("profile-cancel-compose")?.addEventListener("click",()=>{clearComposer();$("profile-post-content")?.focus({preventScroll:true})});
function renderComposerPreview(){$("profile-media-preview").innerHTML=files.map((file,index)=>`<div class="preview-removable">${file.type.startsWith("video/")?`<video src="${URL.createObjectURL(file)}" muted controls></video>`:`<img src="${URL.createObjectURL(file)}" alt="">`}<button type="button" class="remove-selected-media" data-index="${index}" aria-label="Xóa media">×</button></div>`).join("")}
$("profile-media-preview").onclick=e=>{const button=e.target.closest("[data-index]");if(!button)return;files.splice(Number(button.dataset.index),1);renderComposerPreview()};
$("profile-publish-button").onclick=async()=>{if(profileId!==me.uid)return showNotice("Bạn chỉ có thể đăng bài trên hồ sơ của mình","warning");const content=$("profile-post-content").value.trim(),privacyValue=$("profile-post-privacy").value;if(!content&&!files.length)return showNotice("Hãy nhập nội dung hoặc chọn ảnh/video","warning");const button=$("profile-publish-button");button.disabled=true;try{const media=files[0]?await uploadOne(files[0],percent=>button.textContent=`Đang tải ${percent}%`):null,postRef=await addDoc(collection(db,"posts"),{authorId:me.uid,authorEmail:me.email,authorDisplayName:myProfile.displayName||me.displayName||me.email?.split("@")[0]||"Thành viên",authorAvatar:myProfile.photoURL||myProfile.profileImage||"",authorRole:myProfile.role||"user",content,attachedImages:media?[media]:[],attachedImage:media?.url||null,mediaType:media?.type||null,mediaUrl:media?.url||null,mediaPublicId:media?.publicId||null,mediaFormat:media?.format||null,mediaBytes:media?.bytes||null,mediaWidth:media?.width||null,mediaHeight:media?.height||null,mediaDuration:media?.duration||null,privacy:privacyValue,reactions:{},commentCount:0,createdAt:serverTimestamp()});rememberAuthoredPost(me.uid,postRef.id);if(privacyValue!=="private")await Promise.all((myProfile.friends||[]).map(friendId=>addDoc(collection(db,"notifications"),{recipientId:friendId,actorId:me.uid,actorName:myProfile.displayName||me.displayName||me.email?.split("@")[0]||"Thành viên",type:"friend_post",postId:postRef.id,message:`vừa đăng một bài viết ${content?`“${content.slice(0,55)}${content.length>55?'…':''}”`:"có ảnh/video"}`,isRead:false,createdAt:serverTimestamp()}))).catch(error=>console.warn("Bài đã đăng nhưng chưa thể tạo thông báo",error));clearComposer();showNotice("Bài viết đã được đăng","success")}catch(error){console.error(error);showNotice(error.message||"Không thể đăng bài","error")}finally{button.disabled=false;button.textContent="Đăng bài"}};
async function uploadOne(file,onProgress=()=>{}){const media=await uploadMedia(file,onProgress);return{url:media.mediaUrl,type:media.mediaType,publicId:media.mediaPublicId,format:media.mediaFormat,bytes:media.mediaBytes,width:media.mediaWidth,height:media.mediaHeight,duration:media.mediaDuration}}
function clearComposer(){$("profile-post-content").value="";$("profile-post-media").value="";files=[];renderComposerPreview()}
function listenPosts(){if(stopPosts)stopPosts();stopPosts=onSnapshot(collection(db,"posts"),snap=>{const isOwner=profileId===me.uid,isFriend=(profile.friends||[]).includes(me.uid),postMap=new Map();snap.forEach(d=>{const p=d.data(),moderated=p.deletedByAdmin===true||p.moderationStatus==="hidden"||p.moderationStatus==="deleted",canRead=isOwner||(!moderated&&(!p.privacy||p.privacy==="public"||(p.privacy==="friends"&&isFriend)));if(p.authorId===profileId&&canRead){postMap.set(d.id,{id:d.id,...p});if(isOwner)rememberAuthoredPost(me.uid,d.id)}});directPosts.forEach(p=>{if(p.authorId===profileId&&isOwner&&!postMap.has(p.id))postMap.set(p.id,p)});const posts=[...postMap.values()].sort((a,b)=>(b.createdAt?.seconds||0)-(a.createdAt?.seconds||0));renderPosts(posts)},error=>{console.error("Không thể tải danh sách bài viết hồ sơ",error);if(directPosts.length)renderPosts(directPosts);else{$("profile-posts-list").innerHTML='<div class="profile-empty-posts"><i class="fa-solid fa-triangle-exclamation"></i><p>Chưa thể tải bài viết lúc này. Vui lòng thử lại.</p></div>';showNotice("Không thể tải bài viết hồ sơ","error")}})}
function renderPosts(posts){commentStops.forEach(stop=>stop());commentStops.clear();window.dispatchEvent(new CustomEvent("vhht-profile-posts",{detail:{profileId,posts:posts.map(post=>({...post}))}}));const list=$("profile-posts-list");list.innerHTML=posts.map(post=>postTemplate(post)).join("")||'<div class="profile-empty-posts"><i class="fa-regular fa-note-sticky"></i><p>Chưa có bài viết nào.</p></div>';list.querySelectorAll(".profile-post-author").forEach(header=>{const image=header.querySelector("img"),name=header.querySelector("strong");if(image)image.src=avatarFor(profileId,profile.displayName,profile.photoURL||profile.profileImage);if(name)name.textContent=resolveDisplayName(profile,profileId===me.uid?me:null)});bindPostActions(posts);enhanceInlineCommentMedia();focusRequestedProfilePost(posts)}

let lastFocusedRequest="";
function focusRequestedProfilePost(posts){
  const params=new URLSearchParams(location.search),postId=params.get("post"),commentId=params.get("comment");
  if(!postId||lastFocusedRequest===`${postId}:${commentId||""}`)return;
  const card=document.querySelector(`.social-post[data-id="${CSS.escape(postId)}"]`),post=posts.find(item=>item.id===postId);
  if(!card||!post)return;
  lastFocusedRequest=`${postId}:${commentId||""}`;
  requestAnimationFrame(()=>{card.scrollIntoView({behavior:"smooth",block:"center"});card.classList.add("notification-post-focus");setTimeout(()=>card.classList.remove("notification-post-focus"),2600)});
  if(commentId){
    const section=card.querySelector(".inline-comments");if(section?.hidden)toggleComments(card,post);
    const locate=()=>{const target=card.querySelector(`[data-comment-id="${CSS.escape(commentId)}"]`);if(!target)return false;target.scrollIntoView({behavior:"smooth",block:"center"});target.classList.add("notification-comment-focus");return true};
    let attempts=0;const timer=setInterval(()=>{if(locate()||++attempts>20)clearInterval(timer)},120);
  }
}
function enhanceInlineCommentMedia(){$("profile-posts-list").querySelectorAll(".inline-comment-form").forEach(form=>{const input=document.createElement("input");input.type="file";input.accept="image/jpeg,image/png,image/webp,video/mp4,video/webm,video/quicktime";input.hidden=true;input.className="inline-comment-media";const button=document.createElement("button");button.type="button";button.className="inline-comment-media-button";button.innerHTML='<i class="fa-solid fa-photo-film"></i>';button.onclick=()=>input.click();input.onchange=()=>button.classList.toggle("selected",!!input.files[0]);form.querySelector("div")?.prepend(button,input)})}
function moderationState(post){if(post.moderationStatus==="deleted")return"deleted";if(post.moderationStatus==="hidden"||post.deletedByAdmin===true)return"hidden";return null}
function moderationBanner(post){const state=moderationState(post);if(!state||post.authorId!==me.uid)return"";const appeal=post.appeal||{},pending=appeal.status==="pending",rejected=appeal.status==="rejected";return`<aside class="profile-moderation-card ${state}" aria-label="Trạng thái kiểm duyệt"><span class="profile-moderation-icon"><i class="fa-solid ${state==='deleted'?'fa-trash-can':'fa-eye-slash'}"></i></span><div><strong>${state==='deleted'?'Bài viết đã bị ADMIN xóa':'Bài viết đang bị ADMIN ẩn'}</strong><p>${safe(post.moderationReason|| (state==='deleted'?'Nội dung không còn được phân phối trong cộng đồng. Bạn vẫn có thể xem lại và tự xóa khỏi hồ sơ.':'Nội dung chỉ còn hiển thị với bạn trong lúc chờ xử lý.'))}</p>${pending?'<small><i class="fa-regular fa-clock"></i> Khiếu nại đang chờ quản trị viên xem xét</small>':rejected?`<small class="appeal-rejected"><i class="fa-solid fa-circle-xmark"></i> Khiếu nại chưa được chấp thuận${appeal.reviewNote?`: ${safe(appeal.reviewNote)}`:''}</small>`:''}</div>${state==='hidden'&&!pending?'<button type="button" data-appeal><i class="fa-solid fa-scale-balanced"></i><span>Khiếu nại</span></button>':''}</aside>`}
function postTemplate(post){const media=normaliseMedia(post),myReaction=post.reactions?.[me.uid],count=Object.keys(post.reactions||{}).length,own=post.authorId===me.uid,moderated=moderationState(post),readonlyActions=moderated?`<div class="post-social-actions moderated-readonly-actions"><button data-reaction-summary><i class="fa-regular fa-face-smile"></i> Xem cảm xúc</button><button data-toggle-comments><i class="fa-regular fa-comments"></i> Xem bình luận</button></div>`:`<div class="post-social-actions"><div class="inline-react-wrap"><button data-like class="${myReaction?'reacted':''}">${myReaction?EMOJI[myReaction]:"♡"} ${myReaction?reactionName(myReaction):"Thích"}</button><div class="inline-reaction-picker">${Object.entries(EMOJI).map(([key,value])=>`<button data-react="${key}" title="${reactionName(key)}">${value}</button>`).join("")}</div></div><button data-toggle-comments><i class="fa-regular fa-comment"></i> Bình luận</button><button data-share><i class="fa-solid fa-share"></i> Chia sẻ</button></div>`,commentForm=moderated?"":`<form class="inline-comment-form"><img src="${avatarFor(me.uid,myProfile.displayName,myProfile.photoURL||myProfile.profileImage)}" alt=""><div><input placeholder="Viết bình luận..." maxlength="1000"><button><i class="fa-solid fa-paper-plane"></i></button></div></form>`;return`<article class="profile-post-card social-post ${moderated?`is-moderated moderation-${moderated}`:''}" data-id="${post.id}">${moderationBanner(post)}<header class="profile-post-author"><img src="${avatarFor(profileId,profile.displayName,profile.photoURL||profile.profileImage)}" alt=""><span><strong>${safe(profile.displayName||post.authorDisplayName||"Thành viên")}</strong><small>${date(post.createdAt)} · ${privacyIcon(post.privacy)}</small></span>${own?`<button class="post-options-trigger" aria-label="Tùy chọn"><i class="fa-solid fa-ellipsis"></i></button><div class="profile-post-options">${moderated?'':`<button data-edit><i class="fa-regular fa-pen-to-square"></i>Sửa bài viết</button><button data-privacy-menu><i class="fa-solid fa-user-lock"></i>Đổi quyền riêng tư</button>`}<button class="danger" data-delete><i class="fa-regular fa-trash-can"></i>Xóa khỏi hồ sơ</button></div>`:""}</header><div class="profile-post-content">${safe(post.content||"")}</div>${mediaGrid(media)}<div class="post-social-summary"><button data-reaction-summary><i class="fa-regular fa-face-smile"></i><strong>${count}</strong><span>cảm xúc</span></button><button data-toggle-comments><i class="fa-regular fa-comment"></i><strong>${Number(post.commentCount||0)}</strong><span>bình luận</span></button><button data-share-summary><i class="fa-solid fa-paper-plane"></i><strong>${Number(post.shareCount||0)}</strong><span>chia sẻ</span></button></div>${readonlyActions}<section class="inline-comments" hidden><div class="inline-comments-list"></div>${commentForm}</section></article>`}

function privacyIcon(value){
  if(value==="private")return '<i class="fa-solid fa-lock" aria-hidden="true"></i> Chỉ mình tôi';
  if(value==="friends")return '<i class="fa-solid fa-user-group" aria-hidden="true"></i> Bạn bè';
  return '<i class="fa-solid fa-earth-asia" aria-hidden="true"></i> Công khai';
}
function mediaGrid(media){if(!media.length)return"";return`<div class="profile-post-media-grid media-count-${Math.min(media.length,5)}">${media.slice(0,5).map((m,index)=>`<div class="profile-media-item" data-view-media="${index}">${m.type==="video"?`<video src="${m.url}" controls preload="none" playsinline></video>`:`<img src="${m.url}" alt="Ảnh bài viết" loading="lazy" decoding="async">`}${index===4&&media.length>5?`<span class="more-media">+${media.length-5}</span>`:""}</div>`).join("")}</div>`}
function bindPostActions(posts){$("profile-posts-list").querySelectorAll(".social-post").forEach(card=>{const post=posts.find(p=>p.id===card.dataset.id),options=card.querySelector(".profile-post-options");card.querySelector(".post-options-trigger")?.addEventListener("click",()=>options?.classList.toggle("show"));card.querySelector("[data-like]")?.addEventListener("click",()=>setReaction(post,post.reactions?.[me.uid]?null:"like"));card.querySelectorAll("[data-react]").forEach(b=>b.onclick=()=>setReaction(post,b.dataset.react));card.querySelectorAll("[data-reaction-summary]").forEach(b=>b.onclick=()=>openReactionSummary(post));card.querySelectorAll("[data-toggle-comments]").forEach(b=>b.onclick=()=>toggleComments(card,post));card.querySelectorAll("[data-view-media]").forEach(b=>b.onclick=()=>openPostMedia(normaliseMedia(post),Number(b.dataset.viewMedia)));card.querySelector("[data-edit]")?.addEventListener("click",()=>openEditDialog(post));card.querySelector("[data-delete]")?.addEventListener("click",()=>confirmDelete(post));card.querySelector("[data-privacy-menu]")?.addEventListener("click",()=>openPrivacyDialog(post));card.querySelector("[data-appeal]")?.addEventListener("click",()=>openAppealDialog(post));card.querySelector(".inline-comment-form")?.addEventListener("submit",e=>submitComment(e,post,card))})}
async function openReactionSummary(post){
  try{
    const ownSnapshot=await getDoc(doc(db,"users",me.uid));
    if(ownSnapshot.exists())myProfile={...myProfile,...ownSnapshot.data()};
  }catch(error){console.warn("Không thể làm mới trạng thái kết bạn",error)}
  const entries=Object.entries(post.reactions||{});
  if(!entries.length)return showNotice("Bài viết chưa có cảm xúc","info");
  const people=await Promise.all(entries.map(async([uid,type])=>{
    try{
      const snapshot=await getDoc(doc(db,"users",uid)),data=snapshot.data()||{};
      return{uid,type,data,name:resolveDisplayName(data),avatar:avatarFor(uid,resolveDisplayName(data),data.photoURL||data.profileImage)}
    }catch{return{uid,type,data:{},name:"Thành viên VHHT",avatar:avatarFor(uid,"Thành viên VHHT",DEFAULT)}}
  }));
  const reactionTypes=[...new Set(people.map(person=>person.type))];
  const profileHref=uid=>`user-profile.html?uid=${encodeURIComponent(uid)}`;
  const actionFor=person=>{
    if(person.uid===me.uid)return{kind:"profile",label:"Xem hồ sơ",icon:"fa-user"};
    if(areFriends(myProfile,person.data,me.uid,person.uid))return{kind:"message",label:"Nhắn tin",icon:"fa-comment-dots"};
    if(hasFriendRequest(person.data,me.uid)||hasFriendRequest(myProfile,person.uid))return{kind:"pending",label:"Đã gửi yêu cầu",icon:"fa-clock"};
    return{kind:"add",label:"Thêm bạn bè",icon:"fa-user-plus"}
  };
  openDialog(`<section class="engagement-dialog"><header class="engagement-dialog-header"><div><small>TƯƠNG TÁC BÀI VIẾT</small><h3>Người đã bày tỏ cảm xúc</h3><p>${people.length} thành viên đã tương tác với bài viết này.</p></div><button type="button" data-dialog-cancel aria-label="Đóng"><i class="fa-solid fa-xmark"></i></button></header><nav class="engagement-filter-tabs" aria-label="Lọc cảm xúc"><button type="button" class="is-active" data-reaction-filter="all">Tất cả <strong>${people.length}</strong></button>${reactionTypes.map(type=>`<button type="button" data-reaction-filter="${safe(type)}"><span>${EMOJI[type]||"✨"}</span><strong>${people.filter(person=>person.type===type).length}</strong></button>`).join("")}</nav><div class="engagement-people-list">${people.map(person=>{const action=actionFor(person);return`<article class="engagement-person" data-reaction-type="${safe(person.type)}"><a class="engagement-person-identity" href="${profileHref(person.uid)}"><span class="engagement-avatar"><img src="${safe(person.avatar)}" alt=""><b>${EMOJI[person.type]||"✨"}</b></span><span><strong>${safe(person.name)}</strong><small>${reactionName(person.type)}</small></span></a><button type="button" class="engagement-person-action is-${action.kind}" data-person-action="${action.kind}" data-person-id="${safe(person.uid)}"><i class="fa-solid ${action.icon}"></i><span>${action.label}</span></button></article>`}).join("")}</div></section>`,dialog=>{
    dialog.classList.add("engagement-dialog-card");
    dialog.querySelectorAll("[data-reaction-filter]").forEach(button=>button.onclick=()=>{
      dialog.querySelectorAll("[data-reaction-filter]").forEach(item=>item.classList.toggle("is-active",item===button));
      const filter=button.dataset.reactionFilter;
      dialog.querySelectorAll(".engagement-person").forEach(row=>row.hidden=filter!=="all"&&row.dataset.reactionType!==filter)
    });
    dialog.querySelectorAll("[data-person-action]").forEach(button=>button.onclick=async()=>{
      const uid=button.dataset.personId,kind=button.dataset.personAction;
      if(kind==="profile")return location.href=profileHref(uid);
      if(kind==="message")return location.href=`../messages/messages-page.html?uid=${encodeURIComponent(uid)}`;
      if(kind!=="add")return;
      button.disabled=true;
      try{
        await updateDoc(doc(db,"users",uid),{friendRequests:arrayUnion(me.uid)});
        await addDoc(collection(db,"notifications"),{recipientId:uid,actorId:me.uid,actorName:resolveDisplayName(myProfile),type:"friend_request",message:"đã gửi cho bạn một lời mời kết bạn",friendRequestStatus:"pending",isRead:false,createdAt:serverTimestamp()}).catch(error=>console.warn("Không thể tạo thông báo lời mời kết bạn",error));
        button.dataset.personAction="pending";button.className="engagement-person-action is-pending";
        button.innerHTML='<i class="fa-solid fa-clock"></i><span>Đã gửi yêu cầu</span>';
        showNotice("Đã gửi lời mời kết bạn","success")
      }catch(error){console.error(error);button.disabled=false;showNotice("Không thể gửi lời mời kết bạn","error")}
    })
  })
}
function openAppealDialog(post){openDialog(`<div class="appeal-dialog-heading"><span><i class="fa-solid fa-scale-balanced"></i></span><div><h3>Gửi khiếu nại</h3><p>Giải thích ngắn gọn vì sao bài viết nên được xem xét lại.</p></div></div><label for="appeal-message">Nội dung khiếu nại</label><textarea id="appeal-message" maxlength="1000" placeholder="Cung cấp ngữ cảnh giúp quản trị viên đánh giá chính xác…"></textarea><div class="appeal-dialog-note"><i class="fa-solid fa-circle-info"></i><span>Mỗi bài viết chỉ có một khiếu nại đang chờ xử lý.</span></div><div class="dialog-actions"><button data-dialog-cancel>Để sau</button><button class="primary" id="submit-appeal">Gửi khiếu nại</button></div>`,dialog=>dialog.querySelector("#submit-appeal").onclick=async()=>{const message=dialog.querySelector("#appeal-message").value.trim(),button=dialog.querySelector("#submit-appeal");if(message.length<10)return showNotice("Nội dung khiếu nại cần ít nhất 10 ký tự","warning");button.disabled=true;button.innerHTML='<i class="fa-solid fa-circle-notch fa-spin"></i> Đang gửi';try{await updateDoc(doc(db,"posts",post.id),{appeal:{status:"pending",message,submittedAt:serverTimestamp(),reviewedAt:null,reviewNote:""}});closeDialog();showNotice("Khiếu nại đã được gửi tới quản trị viên","success")}catch(error){console.error(error);button.disabled=false;button.textContent="Gửi khiếu nại";showNotice("Không thể gửi khiếu nại. Hãy thử lại.","error")}})}
async function setReaction(post,type){if(moderationState(post))return showNotice("Bài viết đã bị kiểm duyệt nên không thể tương tác","warning");const reactions={...(post.reactions||{})};if(type)reactions[me.uid]=type;else delete reactions[me.uid];await updateDoc(doc(db,"posts",post.id),{reactions});if(type&&post.authorId!==me.uid)await addDoc(collection(db,"notifications"),{recipientId:post.authorId,postAuthorId:post.authorId,actorId:me.uid,actorName:myProfile.displayName||"Thành viên",type:"reaction",reactionType:type,postId:post.id,message:`đã ${reactionVerb(type)} bài viết của bạn`,isRead:false,createdAt:serverTimestamp()})}
function commentReactionCount(comment){return Object.keys(comment.commentReactions||{}).length}
function clearInlineReply(form){if(!form)return;delete form.dataset.parentId;delete form.dataset.replyName;form.querySelector(".inline-reply-composer")?.remove()}
function setInlineReply(form,comment){
  if(!form)return;form.dataset.parentId=comment.id;form.dataset.replyName=comment.authorDisplayName||"Thành viên";
  let context=form.querySelector(".inline-reply-composer");if(!context){context=document.createElement("div");context.className="inline-reply-composer";form.prepend(context)}
  context.innerHTML=`<span><i class="fa-solid fa-reply"></i> Trả lời <strong>${safe(form.dataset.replyName)}</strong></span><button type="button" aria-label="Hủy trả lời"><i class="fa-solid fa-xmark"></i></button>`;
  context.querySelector("button").onclick=()=>clearInlineReply(form);form.querySelector('input:not([type="file"])')?.focus();
}
async function setInlineCommentReaction(post,comment,type="love"){
  if(moderationState(post))return showNotice("Bài viết đã bị kiểm duyệt nên không thể tương tác","warning");
  const reactions={...(comment.commentReactions||{})};if(!type||reactions[me.uid]===type)delete reactions[me.uid];else reactions[me.uid]=type;
  await updateDoc(doc(db,"posts",post.id,"comments",comment.id),{commentReactions:reactions});
}
async function removeInlineComment(post,comment){
  if(comment.authorId!==me.uid)return;await deleteDoc(doc(db,"posts",post.id,"comments",comment.id));showNotice("Đã xóa bình luận","success");
}
async function renderInlineComments(card,post,comments){
  const ids=[...new Set(comments.map(comment=>comment.authorId).filter(Boolean))],profiles=new Map();
  await Promise.all(ids.map(async uid=>{try{const snapshot=await getDoc(doc(db,"users",uid));if(snapshot.exists())profiles.set(uid,snapshot.data())}catch(error){console.warn(error)}}));
  const byId=new Map(comments.map(comment=>[comment.id,comment])),list=card.querySelector(".inline-comments-list");
  list.innerHTML=comments.map(comment=>{
    const person=profiles.get(comment.authorId)||{},name=resolveDisplayName(person)||comment.authorDisplayName||"Thành viên",parent=byId.get(comment.parentId),mine=comment.authorId===me.uid,reactions=commentReactionCount(comment),myReaction=comment.commentReactions?.[me.uid]||"";
    const picker=Object.entries(EMOJI).map(([type,emoji])=>`<button type="button" data-inline-comment-reaction="${type}" class="${myReaction===type?'is-selected':''}" title="${reactionName(type)}">${emoji}</button>`).join("");
    return`<article class="inline-comment ${comment.parentId?'is-reply':''}" data-comment-id="${comment.id}"><img src="${avatarFor(comment.authorId,name,person.photoURL||person.profileImage)}" alt=""><div class="inline-comment-body">${parent?`<button type="button" class="inline-comment-reply-context" data-scroll-comment="${parent.id}"><i class="fa-solid fa-reply"></i><span>Trả lời <strong>${safe(parent.authorDisplayName||"Thành viên")}</strong>: ${safe(String(parent.content||"Bình luận có tệp đính kèm").slice(0,72))}</span></button>`:""}<div class="inline-comment-bubble"><a href="user-profile.html?uid=${encodeURIComponent(comment.authorId)}"><strong>${safe(name)}</strong></a><p>${safe(comment.content||"")}</p>${comment.attachedImage?(comment.mediaType==='video'?`<video class="inline-comment-attachment" src="${safe(comment.attachedImage)}" controls></video>`:`<img class="inline-comment-attachment" src="${safe(comment.attachedImage)}" alt="Ảnh bình luận">`):""}${reactions?`<button type="button" class="inline-comment-reaction-count" title="${reactions} cảm xúc">${topReactions(comment.commentReactions)} <strong>${reactions}</strong></button>`:""}</div><div class="inline-comment-meta"><time>${date(comment.createdAt)}</time><div class="inline-comment-react-wrap"><button type="button" data-comment-react class="${myReaction?'reacted':''}">${myReaction?`${EMOJI[myReaction]} ${reactionName(myReaction)}`:'♡ Thích'}</button><div class="inline-comment-reaction-picker">${picker}<button type="button" data-inline-comment-reaction="clear" class="clear-reaction" title="Gỡ cảm xúc">×</button></div></div><button type="button" data-comment-reply>Trả lời</button><details class="inline-comment-more"><summary aria-label="Tùy chọn bình luận"><i class="fa-solid fa-ellipsis"></i></summary><div><button type="button" data-comment-copy><i class="fa-regular fa-copy"></i> Sao chép</button>${mine?'<button type="button" class="danger" data-comment-delete><i class="fa-regular fa-trash-can"></i> Xóa</button>':""}</div></details></div></div></article>`;
  }).join("")||'<p class="no-inline-comments">Chưa có bình luận nào. Hãy bắt đầu cuộc trò chuyện.</p>';
  list.querySelectorAll(".inline-comment").forEach(node=>{const comment=byId.get(node.dataset.commentId),reactWrap=node.querySelector(".inline-comment-react-wrap");node.querySelector("[data-comment-react]")?.addEventListener("click",event=>{event.stopPropagation();document.querySelectorAll(".inline-comment-react-wrap.picker-open").forEach(item=>{if(item!==reactWrap)item.classList.remove("picker-open")});reactWrap?.classList.toggle("picker-open")});node.querySelectorAll("[data-inline-comment-reaction]").forEach(button=>button.addEventListener("click",async event=>{event.stopPropagation();reactWrap?.classList.remove("picker-open");const type=button.dataset.inlineCommentReaction;await setInlineCommentReaction(post,comment,type==="clear"?null:type)}));node.querySelector("[data-comment-reply]")?.addEventListener("click",()=>setInlineReply(card.querySelector(".inline-comment-form"),comment));node.querySelector("[data-comment-copy]")?.addEventListener("click",async()=>{await navigator.clipboard.writeText(comment.content||"");showNotice("Đã sao chép bình luận","success")});node.querySelector("[data-comment-delete]")?.addEventListener("click",()=>removeInlineComment(post,comment));node.querySelector("[data-scroll-comment]")?.addEventListener("click",event=>{const target=list.querySelector(`[data-comment-id="${CSS.escape(event.currentTarget.dataset.scrollComment)}"]`);target?.scrollIntoView({behavior:"smooth",block:"center"});target?.classList.add("notification-comment-focus")})});
}
function toggleComments(card,post){const section=card.querySelector(".inline-comments");section.hidden=!section.hidden;if(section.hidden)return;if(commentStops.has(post.id))return;commentStops.set(post.id,onSnapshot(query(collection(db,"posts",post.id,"comments"),orderBy("createdAt","asc")),async snap=>{const comments=[];snap.forEach(d=>comments.push({id:d.id,...d.data()}));await renderInlineComments(card,post,comments);if(!moderationState(post))updateDoc(doc(db,"posts",post.id),{commentCount:comments.length}).catch(console.warn)}))}
async function submitComment(event,post,card){event.preventDefault();if(moderationState(post))return showNotice("Bài viết đã bị kiểm duyệt nên không thể bình luận","warning");const form=event.currentTarget,input=form.querySelector('input:not([type="file"])'),fileInput=form.querySelector(".inline-comment-media"),content=input.value.trim(),file=fileInput?.files[0],parentId=form.dataset.parentId||null,replyName=form.dataset.replyName||"";if(!content&&!file)return;const submit=form.querySelector('button[type="submit"],button:not([type])');if(submit)submit.disabled=true;try{const media=file?await uploadOne(file):null,commentRef=await addDoc(collection(db,"posts",post.id,"comments"),{authorId:me.uid,authorDisplayName:myProfile.displayName||"Thành viên",authorAvatar:myProfile.photoURL||myProfile.profileImage||"",content,attachedImage:media?.url||null,mediaType:media?.type||null,parentId,replyToName:replyName||null,commentReactions:{},createdAt:serverTimestamp()});input.value="";if(fileInput)fileInput.value="";clearInlineReply(form);let recipientId=post.authorId;if(parentId){try{const parentSnapshot=await getDoc(doc(db,"posts",post.id,"comments",parentId));recipientId=parentSnapshot.data()?.authorId||recipientId}catch(error){console.warn(error)}}if(recipientId!==me.uid)await addDoc(collection(db,"notifications"),{recipientId,postAuthorId:post.authorId,actorId:me.uid,actorName:myProfile.displayName||"Thành viên",type:parentId?"comment_reply":"comment",postId:post.id,commentId:commentRef.id,parentCommentId:parentId,message:parentId?`đã trả lời bình luận của bạn trong bài viết`:`đã bình luận bài viết của bạn`,isRead:false,createdAt:serverTimestamp()})}finally{if(submit)submit.disabled=false}}
function openEditDialog(post){const media=normaliseMedia(post).slice(0,1);openDialog(`<h3>Chỉnh sửa bài viết</h3><p>Cập nhật nội dung và ảnh/video của bài viết.</p><textarea id="edit-post-text">${safe(post.content||"")}</textarea><div id="edit-media-list" class="edit-media-list">${media.map((m,i)=>`<div data-existing="${i}">${m.type==='video'?`<video src="${m.url}" controls preload="metadata"></video>`:`<img src="${m.url}">`}<button data-remove-existing="${i}">×</button></div>`).join("")}</div><label class="dialog-add-media" for="edit-add-media"><i class="fa-solid fa-photo-film"></i> Thay ảnh/video</label><input id="edit-add-media" type="file" accept="image/jpeg,image/png,image/webp,video/mp4,video/webm,video/quicktime" hidden><div class="dialog-actions"><button data-dialog-cancel>Hủy</button><button class="primary" id="save-edit-post">Lưu thay đổi</button></div>`,dialog=>{const removed=new Set(),input=dialog.querySelector("#edit-add-media");dialog.querySelectorAll("[data-remove-existing]").forEach(b=>b.onclick=()=>{removed.add(Number(b.dataset.removeExisting));b.parentElement.remove()});dialog.querySelector("#save-edit-post").onclick=async()=>{const button=dialog.querySelector("#save-edit-post");button.disabled=true;try{const replacement=input.files[0]?await uploadOne(input.files[0],percent=>button.textContent=`Đang tải ${percent}%`):null,selected=replacement||media.find((_,i)=>!removed.has(i))||null,all=selected?[selected]:[],content=dialog.querySelector("#edit-post-text").value.trim(),payload={content,attachedImages:all,attachedImage:selected?.url||null,mediaType:selected?.type||null,mediaUrl:selected?.url||null,mediaPublicId:selected?.publicId||null,mediaFormat:selected?.format||null,mediaBytes:selected?.bytes||null,mediaWidth:selected?.width||null,mediaHeight:selected?.height||null,mediaDuration:selected?.duration||null,updatedAt:serverTimestamp()};await updateDoc(doc(db,"posts",post.id),payload);const article=document.querySelector(`.social-post[data-id="${post.id}"]`),contentNode=article?.querySelector(".profile-post-content"),oldGrid=article?.querySelector(".profile-post-media-grid");if(contentNode)contentNode.textContent=content;if(oldGrid)oldGrid.remove();if(contentNode&&all.length)contentNode.insertAdjacentHTML("afterend",mediaGrid(all));Object.assign(post,payload);const cached=directPosts.find(item=>item.id===post.id);if(cached)Object.assign(cached,post);closeDialog();showNotice("Đã cập nhật toàn bộ bài viết","success")}catch(e){console.error(e);button.disabled=false;button.textContent="Lưu thay đổi";showNotice(e.message||"Không thể cập nhật bài viết","error")}}})}
function openPrivacyDialog(post){openDialog(`<h3>Quyền riêng tư bài viết</h3><p>Chọn những người có thể xem bài viết này.</p><div class="privacy-dialog-options">${[["public","🌐","Công khai","Mọi người đều xem được"],["friends","👥","Bạn bè","Chỉ bạn bè của bạn"],["private","🔒","Chỉ mình tôi","Ẩn với tất cả người khác"]].map(([v,i,t,d])=>`<label><input type="radio" name="post-privacy-dialog" value="${v}" ${(!post.privacy&&v==='public')||post.privacy===v?'checked':''}><span>${i}</span><div><strong>${t}</strong><small>${d}</small></div></label>`).join("")}</div><div class="dialog-actions"><button data-dialog-cancel>Hủy</button><button class="primary" id="save-privacy">Lưu</button></div>`,dialog=>dialog.querySelector("#save-privacy").onclick=async()=>{await updateDoc(doc(db,"posts",post.id),{privacy:dialog.querySelector('input:checked').value});closeDialog();showNotice("Đã đổi quyền riêng tư","success")})}
function confirmDelete(post){openDialog(`<div class="dialog-danger-icon"><i class="fa-regular fa-trash-can"></i></div><h3>Xóa bài viết?</h3><p>Bài viết và toàn bộ bình luận sẽ không còn xuất hiện. Hành động này không thể hoàn tác.</p><div class="dialog-actions"><button data-dialog-cancel>Giữ bài viết</button><button class="danger" id="confirm-delete-post">Xóa vĩnh viễn</button></div>`,dialog=>dialog.querySelector("#confirm-delete-post").onclick=async()=>{const article=document.querySelector(`.social-post[data-id="${post.id}"]`);await deleteDoc(doc(db,"posts",post.id));directPosts=directPosts.filter(item=>item.id!==post.id);article?.remove();forgetAuthoredPost(me.uid,post.id);closeDialog();showNotice("Bài viết đã được xóa","success")})}
function openDialog(html,setup){let overlay=$("profile-action-dialog");if(!overlay){overlay=document.createElement("div");overlay.id="profile-action-dialog";overlay.innerHTML='<div class="profile-dialog-card"></div>';document.body.appendChild(overlay);overlay.onclick=e=>{if(e.target===overlay)closeDialog()}}const card=overlay.querySelector(".profile-dialog-card");card.className="profile-dialog-card";card.innerHTML=html;overlay.classList.add("show");card.querySelectorAll("[data-dialog-cancel]").forEach(b=>b.onclick=closeDialog);setup?.(card)}function closeDialog(){$("profile-action-dialog")?.classList.remove("show")}
let profileMediaScrollY=0;
function openPostMedia(media,index){
  const item=media[index];let overlay=$("profile-post-lightbox");
  if(!overlay){overlay=document.createElement("div");overlay.id="profile-post-lightbox";overlay.innerHTML='<div class="post-lightbox-tools"><button data-minus aria-label="Thu nhỏ">−</button><output>100%</output><button data-plus aria-label="Phóng to">+</button><button data-reset aria-label="Đặt lại"><i class="fa-solid fa-rotate-left"></i></button><button class="lightbox-close" aria-label="Đóng">×</button></div><div class="profile-lightbox-stage"></div>';document.body.appendChild(overlay)}
  const stage=overlay.querySelector(".profile-lightbox-stage");stage.innerHTML=item.type==='video'?`<video src="${item.url}" controls preload="metadata" playsinline></video>`:`<img src="${item.url}" alt="Ảnh phóng to">`;
  const visual=stage.firstElementChild,output=overlay.querySelector("output"),pointers=new Map();let scale=1,x=0,y=0,drag=null,pinchDistance=0,pinchScale=1;
  const apply=()=>{visual.style.transform=`translate3d(${x}px,${y}px,0) scale(${scale})`;output.textContent=`${Math.round(scale*100)}%`};
  const setScale=value=>{scale=Math.max(1,Math.min(5,value));if(scale===1)x=y=0;apply()};
  const close=()=>{overlay.classList.remove("show");document.body.classList.remove("media-viewer-open");document.body.style.top="";window.scrollTo(0,profileMediaScrollY)};
  overlay.querySelector("[data-plus]").onclick=()=>setScale(scale+.25);overlay.querySelector("[data-minus]").onclick=()=>setScale(scale-.25);overlay.querySelector("[data-reset]").onclick=()=>setScale(1);overlay.querySelector(".lightbox-close").onclick=close;
  overlay.onclick=event=>{if(event.target===overlay)close()};stage.onwheel=event=>{event.preventDefault();event.stopPropagation();setScale(scale+(event.deltaY<0?.15:-.15))};
  visual.onpointerdown=event=>{if(item.type==='video')return;event.preventDefault();pointers.set(event.pointerId,event);visual.setPointerCapture?.(event.pointerId);if(pointers.size===1)drag={cx:event.clientX,cy:event.clientY,x,y};else if(pointers.size===2){const [a,b]=[...pointers.values()];pinchDistance=Math.hypot(a.clientX-b.clientX,a.clientY-b.clientY);pinchScale=scale}};
  visual.onpointermove=event=>{if(!pointers.has(event.pointerId))return;event.preventDefault();pointers.set(event.pointerId,event);if(pointers.size===2){const [a,b]=[...pointers.values()],distance=Math.hypot(a.clientX-b.clientX,a.clientY-b.clientY);setScale(pinchScale*(distance/(pinchDistance||distance)))}else if(drag&&scale>1){x=drag.x+event.clientX-drag.cx;y=drag.y+event.clientY-drag.cy;apply()}};
  const release=event=>{pointers.delete(event.pointerId);drag=null};visual.onpointerup=release;visual.onpointercancel=release;
  profileMediaScrollY=window.scrollY;document.body.style.top=`-${profileMediaScrollY}px`;document.body.classList.add("media-viewer-open");overlay.classList.add("show");apply();
}
document.addEventListener("keydown",event=>{if(event.key==="Escape"&&$("profile-post-lightbox")?.classList.contains("show"))$("profile-post-lightbox").querySelector(".lightbox-close")?.click()});
function showNotice(message,type){let box=$("profile-professional-toast");if(!box){box=document.createElement("div");box.id="profile-professional-toast";document.body.appendChild(box)}box.className=`show ${type}`;box.innerHTML=`<i class="fa-solid ${type==='success'?'fa-circle-check':type==='warning'?'fa-triangle-exclamation':'fa-circle-xmark'}"></i><span>${message}</span>`;clearTimeout(box.timer);box.timer=setTimeout(()=>box.classList.remove("show"),3000)}
const normaliseMedia=p=>p.attachedImages?.length?p.attachedImages:(p.attachedImage?[{url:p.attachedImage,type:p.mediaType||"image"}]:[]),date=t=>t?.seconds?new Date(t.seconds*1000).toLocaleString("vi-VN",{day:"2-digit",month:"2-digit",year:"numeric",hour:"2-digit",minute:"2-digit"}):"Vừa xong",privacy=v=>v==='private'?"🔒 Chỉ mình tôi":v==='friends'?"👥 Bạn bè":"🌐 Công khai",safe=v=>{const d=document.createElement("div");d.textContent=v;return d.innerHTML},reactionName=t=>({like:"Thích",love:"Yêu thích",haha:"Haha",wow:"Wow",sad:"Buồn",angry:"Phẫn nộ"}[t]||"Thích"),reactionVerb=t=>({like:"thích",love:"thả tim",haha:"bày tỏ Haha với",wow:"bày tỏ Wow với",sad:"bày tỏ buồn với",angry:"bày tỏ phẫn nộ với"}[t]),topReactions=r=>[...new Set(Object.values(r||{}).map(v=>EMOJI[v]).filter(Boolean))].slice(0,3).join("");
let mobileReactionGesture=null;
const closeMobileReactionPickers=()=>document.querySelectorAll(".inline-react-wrap.picker-open").forEach(item=>{item.classList.remove("picker-open");item.querySelectorAll(".touch-selected").forEach(button=>button.classList.remove("touch-selected"))});
document.addEventListener("pointerdown",event=>{
    const like=event.target.closest(".inline-react-wrap>[data-like]");
    if(!like||event.pointerType==="mouse")return;
    const wrap=like.closest(".inline-react-wrap");
    closeMobileReactionPickers();
    mobileReactionGesture={pointerId:event.pointerId,wrap,startX:event.clientX,startY:event.clientY,opened:false,selected:null,suppressClick:false};
    mobileReactionGesture.timer=setTimeout(()=>{
        if(!mobileReactionGesture||mobileReactionGesture.pointerId!==event.pointerId)return;
        mobileReactionGesture.opened=true;mobileReactionGesture.suppressClick=true;wrap.classList.add("picker-open");
        navigator.vibrate?.(18);
    },320);
},{passive:true});
document.addEventListener("pointermove",event=>{
    const gesture=mobileReactionGesture;if(!gesture||gesture.pointerId!==event.pointerId)return;
    if(!gesture.opened&&Math.hypot(event.clientX-gesture.startX,event.clientY-gesture.startY)>12){clearTimeout(gesture.timer);mobileReactionGesture=null;return}
    if(!gesture.opened)return;
    event.preventDefault();
    const candidate=document.elementFromPoint(event.clientX,event.clientY)?.closest("[data-react]");
    gesture.wrap.querySelectorAll(".touch-selected").forEach(button=>button.classList.remove("touch-selected"));
    gesture.selected=candidate&&gesture.wrap.contains(candidate)?candidate:null;
    gesture.selected?.classList.add("touch-selected");
},{passive:false});
document.addEventListener("pointerup",event=>{
    const gesture=mobileReactionGesture;if(!gesture||gesture.pointerId!==event.pointerId)return;
    clearTimeout(gesture.timer);
    if(gesture.opened){event.preventDefault();gesture.selected?.click();setTimeout(closeMobileReactionPickers,80)}
    mobileReactionGesture=null;
},{passive:false});
document.addEventListener("pointercancel",()=>{if(mobileReactionGesture)clearTimeout(mobileReactionGesture.timer);mobileReactionGesture=null;closeMobileReactionPickers()});
document.addEventListener("click",event=>{
    if(!event.target.closest(".inline-react-wrap"))closeMobileReactionPickers();
    if(!event.target.closest(".inline-comment-react-wrap"))document.querySelectorAll(".inline-comment-react-wrap.picker-open").forEach(item=>item.classList.remove("picker-open"));
});
const publishButtonLabelObserver=new MutationObserver(()=>{const button=$("profile-publish-button");if(button?.textContent.trim()==="Đăng")button.textContent="Đăng bài"});
publishButtonLabelObserver.observe($("profile-publish-button"),{childList:true,characterData:true,subtree:true});
