import {firebaseAuthentication as auth,firebaseDatabase as db} from "../../shared/firebase-connection.js";
import {onAuthStateChanged} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {collection,query,where,orderBy,onSnapshot,setDoc,addDoc,doc,getDoc,getDocs,updateDoc,deleteDoc,serverTimestamp,increment,arrayUnion,runTransaction} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import {uploadMedia} from "../../shared/cloudinary-media-service.js";
import {rememberAuthoredPost,readAuthoredPostIds,forgetAuthoredPost} from "../../shared/authored-post-cache.js";
import {resolveDisplayName,isGeneratedDisplayName} from "../../shared/user-identity.js";
import {getDefaultAvatarUrl,resolveAvatarUrl} from "../../shared/default-avatar.js";
import {sendFriendRequest} from "../../shared/friendship-service.js";
const $=id=>document.getElementById(id),DEFAULT=getDefaultAvatarUrl({uid:"vhht-member",displayName:"VHHT"}),EMOJI={like:"👍",love:"❤️",haha:"😂",wow:"😮",sad:"😢",angry:"😡"};
const avatarFor=(uid,name,url)=>resolveAvatarUrl(url,{uid,displayName:name});
let me,profileId,profile={},myProfile={},files=[],stopPosts,stopSavedPosts,directPosts=[],visiblePosts=[],commentStops=new Map(),postsListenerGeneration=0;
let dialogReturnFocus=null;
const savedPostIds=new Set();
const savedDocumentId=postId=>`${me.uid}_${postId}`;
function syncProfileSaveButtons(){document.querySelectorAll("[data-save-post]").forEach(button=>{const postId=button.closest(".social-post")?.dataset.id,saved=savedPostIds.has(postId);button.classList.toggle("is-saved",saved);button.setAttribute("aria-pressed",String(saved));button.querySelector("i").className=`${saved?"fa-solid":"fa-regular"} fa-bookmark`;button.querySelector("strong").textContent=saved?"Bỏ lưu bài viết":"Lưu bài viết"})}
async function toggleProfileSavedPost(postId){const reference=doc(db,"savedPosts",savedDocumentId(postId)),wasSaved=savedPostIds.has(postId);if(wasSaved)await deleteDoc(reference);else await setDoc(reference,{userId:me.uid,postId,createdAt:serverTimestamp()});if(wasSaved)savedPostIds.delete(postId);else savedPostIds.add(postId);syncProfileSaveButtons()}
function listenProfileSavedPosts(){stopSavedPosts?.();stopSavedPosts=onSnapshot(query(collection(db,"savedPosts"),where("userId","==",me.uid)),snapshot=>{savedPostIds.clear();snapshot.forEach(item=>savedPostIds.add(item.data().postId));syncProfileSaveButtons()},error=>console.warn("Không thể đồng bộ bài viết đã lưu",error))}

const conversationId=(first,second)=>[first,second].sort().join("_");
const postShareUrl=postId=>{const url=new URL("../community-feed-page.html",location.href);url.searchParams.set("post",postId);return url.href};
const relationId=value=>typeof value==="string"?value:(value?.uid||value?.userId||value?.id||"");
const relationIds=value=>new Set((Array.isArray(value)?value:[]).map(relationId).filter(Boolean));
const areFriends=(left,right,leftUid,rightUid)=>relationIds(left?.friends).has(rightUid)||relationIds(right?.friends).has(leftUid);
const hasFriendRequest=(person,uid)=>relationIds(person?.friendRequests).has(uid);
const normalizedEmail=value=>String(value||"").trim().toLowerCase();
const belongsToCurrentProfile=post=>post?.authorId===profileId||(profileId===me?.uid&&normalizedEmail(post?.authorEmail)&&normalizedEmail(post.authorEmail)===normalizedEmail(me?.email));
const isOwnPost=post=>post?.authorId===me?.uid||(normalizedEmail(post?.authorEmail)&&normalizedEmail(post.authorEmail)===normalizedEmail(me?.email));

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
  openDialog(`<section class="profile-share-experience"><header class="share-dialog-heading"><span><i class="fa-solid fa-paper-plane"></i></span><div><small>CHIA SẺ BÀI VIẾT</small><h3>Gửi tới bạn bè</h3><p>Bài viết được gửi trực tiếp vào cuộc trò chuyện.</p></div><button type="button" class="share-dialog-close" data-dialog-cancel aria-label="Đóng"><i class="fa-solid fa-xmark"></i></button></header><div class="share-post-preview"><strong>${safe(post.authorDisplayName||profile.displayName||"Thành viên")}</strong><p>${safe(String(post.content||"Bài viết có ảnh/video").slice(0,180))}</p></div><label class="share-message-label" for="share-message-text">Lời nhắn <span>Không bắt buộc</span></label><div class="share-message-field"><textarea id="share-message-text" maxlength="500" placeholder="Viết lời nhắn đi kèm…"></textarea><output id="share-message-count">0/500</output></div><label class="share-recipient-label" for="share-friend-search">Chọn người nhận</label><div class="share-friend-search"><i class="fa-solid fa-magnifying-glass"></i><input id="share-friend-search" type="search" autocomplete="off" placeholder="Tìm theo tên bạn bè…"><button type="button" aria-label="Xóa tìm kiếm" hidden><i class="fa-solid fa-xmark"></i></button></div><div class="share-recipient-status" aria-live="polite">Đang tải danh sách bạn bè…</div><div class="share-friend-list"><div class="share-loading"><i class="fa-solid fa-circle-notch fa-spin"></i> Đang tải danh sách bạn bè…</div></div></section>`,async dialog=>{
    const container=dialog.querySelector(".share-friend-list");
    const search=dialog.querySelector("#share-friend-search"),clearSearch=dialog.querySelector(".share-friend-search button"),status=dialog.querySelector(".share-recipient-status"),message=dialog.querySelector("#share-message-text"),counter=dialog.querySelector("#share-message-count");
    message.addEventListener("input",()=>counter.textContent=`${message.value.length}/500`);
    const filterRows=()=>{const needle=search.value.trim().toLocaleLowerCase("vi"),rows=[...container.querySelectorAll(".share-friend-row")];let visible=0;rows.forEach(row=>{const match=!needle||row.dataset.search.includes(needle);row.hidden=!match;if(match)visible++});clearSearch.hidden=!search.value;status.textContent=needle?`${visible} kết quả phù hợp`:`${rows.length} người bạn có thể nhận`;};
    search.addEventListener("input",filterRows);clearSearch.onclick=()=>{search.value="";filterRows();search.focus()};
    try{
      const friends=await loadShareFriends(post);
      if(!friends.length){status.textContent="Không có người nhận phù hợp";container.innerHTML='<div class="share-empty"><i class="fa-solid fa-user-group"></i><p>Chưa có người bạn phù hợp để chia sẻ bài viết này.</p></div>';search.disabled=true;return}
      container.replaceChildren(...friends.map(friend=>{
        const row=document.createElement("div");row.className="share-friend-row";
        const resolvedName=resolveDisplayName(friend);row.dataset.search=resolvedName.toLocaleLowerCase("vi");
        const avatar=document.createElement("img");avatar.src=avatarFor(friend.id,resolvedName,friend.photoURL||friend.profileImage);avatar.alt="";
        const identity=document.createElement("span");identity.className="share-friend-identity";const name=document.createElement("strong");name.textContent=resolvedName;const hint=document.createElement("small");hint.textContent="Bạn bè";identity.append(name,hint);
        const send=document.createElement("button");send.type="button";send.className="share-send-button";send.title=`Gửi cho ${name.textContent}`;send.setAttribute("aria-label",send.title);send.innerHTML='<i class="fa-solid fa-paper-plane"></i><span>Gửi</span>';
        send.onclick=async()=>{send.disabled=true;const original=send.innerHTML;send.innerHTML='<i class="fa-solid fa-circle-notch fa-spin"></i><span>Đang gửi</span>';try{await sendSharedPost(friend,post,message.value.trim());send.classList.add("sent");send.innerHTML='<i class="fa-solid fa-check"></i><span>Đã gửi</span>';hint.textContent="Đã nhận bài viết";showNotice(`Đã chia sẻ với ${name.textContent}`,"success")}catch(error){console.error(error);send.disabled=false;send.innerHTML=original;showNotice("Không thể gửi bài viết. Hãy thử lại.","error")}};
        row.append(avatar,identity,send);return row
      }));
      filterRows();
    }catch(error){console.error(error);status.textContent="Tải danh sách thất bại";container.innerHTML='<div class="share-empty error"><i class="fa-solid fa-triangle-exclamation"></i><p>Không thể tải danh sách bạn bè.</p></div>'}
  });
}

async function loadShareFriends(post){
  const [ownSnapshot,usersSnapshot,receivedNotificationsSnapshot,sentNotificationsSnapshot]=await Promise.all([getDoc(doc(db,"users",me.uid)),getDocs(collection(db,"users")),getDocs(query(collection(db,"notifications"),where("recipientId","==",me.uid))),getDocs(query(collection(db,"notifications"),where("actorId","==",me.uid)))]);
  const own=ownSnapshot.data()||{},profiles=new Map(),acceptedIds=new Set(),friendIds=new Set([...relationIds(own.friends),...relationIds(myProfile.friends)]);
  usersSnapshot.forEach(snapshot=>profiles.set(snapshot.id,{id:snapshot.id,...snapshot.data()}));
  const recoveredNames=new Map();
  const relationshipNotifications=new Map();receivedNotificationsSnapshot.forEach(snapshot=>relationshipNotifications.set(snapshot.id,snapshot));sentNotificationsSnapshot.forEach(snapshot=>relationshipNotifications.set(snapshot.id,snapshot));
  relationshipNotifications.forEach(snapshot=>{const notification=snapshot.data(),participants=[notification.actorId,notification.recipientId];if(notification.actorId&&notification.actorName&&!isGeneratedDisplayName(notification.actorName))recoveredNames.set(notification.actorId,notification.actorName);if(!participants.includes(me.uid))return;const other=participants.find(id=>id&&id!==me.uid);if(other&&(notification.type==="friend_accepted"||(notification.type==="friend_request"&&notification.friendRequestStatus==="accepted")))acceptedIds.add(other)});
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
  const shareRef=doc(db,"posts",post.id,"shares",`${me.uid}_${friend.id}`),postRef=doc(db,"posts",post.id);
  await runTransaction(db,async transaction=>{const existingShare=await transaction.get(shareRef);if(existingShare.exists())return;transaction.set(shareRef,{sharerId:me.uid,recipientId:friend.id,createdAt:serverTimestamp()});transaction.update(postRef,{shareCount:increment(1)})});
}

installShareExperience();
installProfileShareSummaryExperience();
onAuthStateChanged(auth,async user=>{
  stopSavedPosts?.();stopSavedPosts=null;savedPostIds.clear();
  const list=$("profile-posts-list"),countLabel=$("profile-post-count-label");
  if(!user){
    if(list)list.innerHTML='<div class="profile-empty-posts"><i class="fa-solid fa-user-lock"></i><p>Vui lòng đăng nhập để xem bài viết.</p></div>';
    if(countLabel)countLabel.textContent="Chưa đăng nhập";
    return;
  }
  me=user;profileId=new URLSearchParams(location.search).get("uid")||user.uid;listenProfileSavedPosts();
  if(list)list.innerHTML='<div class="profile-empty-posts"><i class="fa-solid fa-spinner fa-spin"></i><p>Đang tải bài viết...</p></div>';
  // Danh sách bài viết là dữ liệu chính của thẻ này, vì vậy không để nó phải
  // chờ hai tài liệu hồ sơ phụ. Trên mạng di động một getDoc bị pending trước
  // đây sẽ khiến giao diện mắc kẹt vĩnh viễn ở "Đang tải bài viết".
  listenPosts();
  try{
    const [profileSnapshot,mySnapshot]=await Promise.all([
      getDoc(doc(db,"users",profileId)).catch(()=>null),
      getDoc(doc(db,"users",user.uid)).catch(()=>null)
    ]);
    profile=profileSnapshot?.data?.()||{};myProfile=mySnapshot?.data?.()||{};
    profile={...profile,friends:[...relationIds(profile.friends)],friendRequests:[...relationIds(profile.friendRequests)]};
    myProfile={...myProfile,friends:[...relationIds(myProfile.friends)],friendRequests:[...relationIds(myProfile.friendRequests)]};
    profile.displayName=resolveDisplayName(profile,profileId===user.uid?user:null);
    myProfile.displayName=resolveDisplayName(myProfile,user);
    const composerAvatar=$("composer-avatar");
    if(composerAvatar)composerAvatar.src=avatarFor(user.uid,myProfile.displayName,myProfile.photoURL||myProfile.profileImage);
    onSnapshot(doc(db,"users",profileId),snapshot=>{if(!snapshot.exists())return;const data=snapshot.data();profile={...profile,...data,friends:[...relationIds(data.friends)],friendRequests:[...relationIds(data.friendRequests)]};profile.displayName=resolveDisplayName(profile,profileId===user.uid?user:null);syncRenderedProfileIdentity()},error=>console.warn("Không thể theo dõi hồ sơ",error));
    // Đăng ký lại sau khi đã biết quan hệ bạn bè để áp dụng đúng quyền riêng tư.
    listenPosts();
    const fallbacks=[];
    if(profileId===user.uid)fallbacks.push(loadRememberedPosts());
    await Promise.allSettled(fallbacks);
  }catch(error){
    console.error("Không thể khởi tạo bài viết hồ sơ",error);
    if(list)list.innerHTML='<div class="profile-empty-posts"><i class="fa-solid fa-triangle-exclamation"></i><p>Chưa thể tải bài viết lúc này. Vui lòng thử lại.</p></div>';
    if(countLabel)countLabel.textContent="Không thể tải bài viết";
  }
});
function syncRenderedProfileIdentity(){$("profile-posts-list").querySelectorAll(".profile-post-author").forEach(header=>{const image=header.querySelector("img"),name=header.querySelector("strong");if(image)image.src=avatarFor(profileId,profile.displayName,profile.photoURL||profile.profileImage);if(name)name.textContent=profile.displayName||"Thành viên VHHT"})}
window.addEventListener("vhht-profile-identity",event=>{if(event.detail?.profileId!==profileId)return;profile={...profile,displayName:event.detail.displayName,photoURL:event.detail.photoURL};syncRenderedProfileIdentity()});
async function loadProfilePostsByAuthor(){
  try{
    // Dùng cùng nguồn collection đang hoạt động ở bảng tin. Việc lọc ở phía client
    // cũng tương thích với các bài cũ chưa có đủ trường/index sau các lần nâng cấp.
    const requests=[getDocs(collection(db,"posts"))];
    // Tài khoản đăng nhập Google có thể đã được liên kết sau khi các bài cũ được
    // tạo. Email xác thực giúp khôi phục đúng bài của chính tài khoản đó.
    if(profileId===me.uid&&normalizedEmail(me.email))requests.push(getDocs(query(collection(db,"posts"),where("authorEmail","==",normalizedEmail(me.email)))).catch(()=>null));
    const snapshots=await Promise.all(requests),isOwner=profileId===me.uid,isFriend=relationIds(profile.friends).has(me.uid);
    snapshots.filter(Boolean).forEach(snapshot=>snapshot.forEach(item=>{
      const post={id:item.id,...item.data()},moderated=post.deletedByAdmin===true||post.moderationStatus==="hidden"||post.moderationStatus==="deleted";
      if(!belongsToCurrentProfile(post))return;
      const canRead=isOwner||(!moderated&&(!post.privacy||post.privacy==="public"||(post.privacy==="friends"&&isFriend)));
      if(canRead&&!directPosts.some(existing=>existing.id===post.id))directPosts.push(post);
      if(isOwner&&isOwnPost(post))rememberAuthoredPost(me.uid,item.id);
    }));
    renderPosts(sortProfilePosts(directPosts));
  }catch(error){console.warn("Query bài viết theo tác giả không khả dụng",error)}
}
async function loadRememberedPosts(){for(const id of readAuthoredPostIds(me.uid)){try{const snap=await getDoc(doc(db,"posts",id));if(snap.exists()&&snap.data().authorId===me.uid&&!directPosts.some(post=>post.id===snap.id))directPosts.push({id:snap.id,...snap.data()});else if(!snap.exists())forgetAuthoredPost(me.uid,id)}catch(error){console.warn("Không thể đọc bài đã ghi nhớ",id,error)}}const list=$("profile-posts-list");if(directPosts.length&&list?.querySelector(".fa-spinner"))renderPosts(sortProfilePosts(directPosts))}
$("profile-post-media").onchange=e=>{files=[...e.target.files].slice(0,1);renderComposerPreview()};
$("profile-cancel-compose")?.addEventListener("click",()=>{clearComposer();$("profile-post-content")?.blur()});
function renderComposerPreview(){$("profile-media-preview").innerHTML=files.map((file,index)=>`<div class="preview-removable">${file.type.startsWith("video/")?`<video src="${URL.createObjectURL(file)}" muted controls></video>`:`<img src="${URL.createObjectURL(file)}" alt="">`}<button type="button" class="remove-selected-media" data-index="${index}" aria-label="Xóa ảnh hoặc video" title="Xóa tệp"><i class="fa-solid fa-xmark" aria-hidden="true"></i></button></div>`).join("")}
$("profile-media-preview").onclick=e=>{const button=e.target.closest("[data-index]");if(!button)return;files.splice(Number(button.dataset.index),1);renderComposerPreview()};
const composerTextarea=$("profile-post-content");
const resizeComposerTextarea=()=>{
  if(!composerTextarea)return;
  const composer=composerTextarea.closest(".profile-composer");
  const hasDraft=Boolean(composerTextarea.value.trim()||files.length);
  const composerHasFocus=Boolean(composer?.contains(document.activeElement));
  composer?.classList.toggle("is-expanded",hasDraft||composerHasFocus);
  composerTextarea.style.height="auto";
  const maximum=window.matchMedia("(max-width: 620px)").matches?260:320;
  const compactMinimum=window.matchMedia("(max-width: 620px)").matches?44:52;
  const minimum=hasDraft||composerHasFocus?72:compactMinimum;
  const nextHeight=Math.min(Math.max(composerTextarea.scrollHeight,minimum),maximum);
  composerTextarea.style.height=`${nextHeight}px`;
  composerTextarea.style.overflowY=composerTextarea.scrollHeight>maximum?"auto":"hidden";
};
composerTextarea?.addEventListener("input",resizeComposerTextarea);
composerTextarea?.addEventListener("focus",resizeComposerTextarea);
composerTextarea?.addEventListener("blur",()=>window.setTimeout(resizeComposerTextarea,0));
window.addEventListener("resize",resizeComposerTextarea,{passive:true});
resizeComposerTextarea();
$("profile-publish-button").onclick=async()=>{if(profileId!==me.uid)return showNotice("Bạn chỉ có thể đăng bài trên hồ sơ của mình","warning");const content=$("profile-post-content").value.trim(),privacyValue=$("profile-post-privacy").value;if(!content&&!files.length)return showNotice("Hãy nhập nội dung hoặc chọn ảnh/video","warning");const button=$("profile-publish-button");button.disabled=true;try{const media=files[0]?await uploadOne(files[0],percent=>button.textContent=`Đang tải ${percent}%`):null,postRef=await addDoc(collection(db,"posts"),{authorId:me.uid,authorEmail:me.email,authorDisplayName:myProfile.displayName||me.displayName||me.email?.split("@")[0]||"Thành viên",authorAvatar:myProfile.photoURL||myProfile.profileImage||"",authorRole:myProfile.role||"user",content,attachedImages:media?[media]:[],attachedImage:media?.url||null,mediaType:media?.type||null,mediaUrl:media?.url||null,mediaPublicId:media?.publicId||null,mediaFormat:media?.format||null,mediaBytes:media?.bytes||null,mediaWidth:media?.width||null,mediaHeight:media?.height||null,mediaDuration:media?.duration||null,privacy:privacyValue,audienceIds:privacyValue==="public"?[]:privacyValue==="private"?[me.uid]:[...new Set([me.uid,...(myProfile.friends||[])])],moderationStatus:null,deletedByAdmin:false,reactions:{},commentCount:0,createdAt:serverTimestamp()});rememberAuthoredPost(me.uid,postRef.id);if(privacyValue!=="private")await Promise.all((myProfile.friends||[]).map(friendId=>addDoc(collection(db,"notifications"),{recipientId:friendId,actorId:me.uid,actorName:myProfile.displayName||me.displayName||me.email?.split("@")[0]||"Thành viên",type:"friend_post",postId:postRef.id,message:`vừa đăng một bài viết ${content?`“${content.slice(0,55)}${content.length>55?'…':''}”`:"có ảnh/video"}`,isRead:false,createdAt:serverTimestamp()}))).catch(error=>console.warn("Bài đã đăng nhưng chưa thể tạo thông báo",error));clearComposer();showNotice("Bài viết đã được đăng","success")}catch(error){console.error(error);showNotice(error.message||"Không thể đăng bài","error")}finally{button.disabled=false;button.textContent="Đăng bài"}};
async function uploadOne(file,onProgress=()=>{}){const media=await uploadMedia(file,onProgress);return{url:media.mediaUrl,type:media.mediaType,publicId:media.mediaPublicId,format:media.mediaFormat,bytes:media.mediaBytes,width:media.mediaWidth,height:media.mediaHeight,duration:media.mediaDuration}}
function clearComposer(){$("profile-post-content").value="";$("profile-post-content").dispatchEvent(new Event("input"));$("profile-post-media").value="";files=[];renderComposerPreview()}
function postTimestamp(value){
  if(!value)return 0;
  if(typeof value.toMillis==="function")return value.toMillis();
  if(typeof value.seconds==="number")return value.seconds*1000+Math.floor((value.nanoseconds||0)/1e6);
  if(value instanceof Date)return value.getTime();
  const parsed=Number(value);
  return Number.isFinite(parsed)?parsed:0;
}
function sortProfilePosts(posts){
  return [...posts].sort((a,b)=>{
    const pinnedA=postTimestamp(a.pinnedAt),pinnedB=postTimestamp(b.pinnedAt);
    if(Boolean(pinnedA)!==Boolean(pinnedB))return pinnedB?1:-1;
    if(pinnedA!==pinnedB)return pinnedB-pinnedA;
    return postTimestamp(b.createdAt)-postTimestamp(a.createdAt);
  });
}
async function listenPosts(){
  if(!me||!profileId)return;
  if(stopPosts)stopPosts();
  const listenerGeneration=++postsListenerGeneration;
  const listenerUserId=me.uid;
  const migrationSnapshot=await getDoc(doc(db,"system","securityMigration")).catch(()=>null);
  if(!me||me.uid!==listenerUserId||listenerGeneration!==postsListenerGeneration)return;
  const migrationData=migrationSnapshot?.data?.()||{};
  const secureMode=migrationData.status==="complete"&&migrationData.schemaVersion===2;
  const secureSources={};
  const renderSecureSources=()=>{
    const postMap=new Map(Object.values(secureSources).flatMap(source=>[...source]));
    const isOwner=profileId===me.uid;
    directPosts=[...postMap.entries()].map(([id,data])=>({id,...data})).filter(post=>{
      const moderated=post.deletedByAdmin===true||post.moderationStatus==="hidden"||post.moderationStatus==="deleted";
      const isFriend=relationIds(profile.friends).has(me.uid);
      const canRead=isOwner||(!moderated&&(!post.privacy||post.privacy==="public"||(post.privacy==="friends"&&isFriend)));
      return belongsToCurrentProfile(post)&&canRead;
    });
    if(isOwner)directPosts.forEach(post=>rememberAuthoredPost(me.uid,post.id));
    renderPosts(sortProfilePosts(directPosts));
  };
  const secureQueries=!secureMode?{legacy:collection(db,"posts")}:profileId===me.uid
    ? {own:query(collection(db,"posts"),where("authorId","==",me.uid))}
    : {
        public:query(collection(db,"posts"),where("privacy","==","public"),where("moderationStatus","==",null),where("deletedByAdmin","==",false)),
        audience:query(collection(db,"posts"),where("privacy","==","friends"),where("audienceIds","array-contains",me.uid),where("moderationStatus","==",null),where("deletedByAdmin","==",false))
      };
  const secureUnsubscribers=Object.entries(secureQueries).map(([name,sourceQuery])=>onSnapshot(sourceQuery,snap=>{
    secureSources[name]=new Map(snap.docs.map(item=>[item.id,item.data()]));
    if(!snap.metadata.hasPendingWrites)renderSecureSources();
  },error=>console.error(`Không thể tải nguồn bài viết ${name}`,error)));
  stopPosts=()=>{
    if(listenerGeneration===postsListenerGeneration)postsListenerGeneration++;
    secureUnsubscribers.forEach(unsubscribe=>unsubscribe());
  };
  return;
  // Bảng tin cũng nghe toàn bộ collection này. Lọc tại đây tránh listener hồ sơ
  // bị treo do index/trường authorId không đồng nhất ở dữ liệu cũ.
  const authorPosts=collection(db,"posts");
  stopPosts=onSnapshot(authorPosts,snap=>{
    const isOwner=profileId===me.uid,isFriend=relationIds(profile.friends).has(me.uid),postMap=new Map();
    snap.forEach(d=>{
      const p=d.data(),moderated=p.deletedByAdmin===true||p.moderationStatus==="hidden"||p.moderationStatus==="deleted";
      if(!belongsToCurrentProfile(p))return;
      const canRead=isOwner||(!moderated&&(!p.privacy||p.privacy==="public"||(p.privacy==="friends"&&isFriend)));
      if(canRead){postMap.set(d.id,{id:d.id,...p});if(isOwner)rememberAuthoredPost(me.uid,d.id)}
    });
    // Phản ứng đã được cập nhật trực tiếp trên card. Không dựng lại toàn bộ
    // danh sách cho snapshot ghi cục bộ vì thao tác đó làm màn hình bị giật.
    if(snap.metadata.hasPendingWrites)return;
    directPosts=[...postMap.values()];
    renderPosts(sortProfilePosts(directPosts));
  },error=>{
    console.error("Không thể tải danh sách bài viết hồ sơ",error);
    if(directPosts.length)renderPosts(directPosts);
    else{
      const list=$("profile-posts-list"),countLabel=$("profile-post-count-label");
      if(list)list.innerHTML='<div class="profile-empty-posts"><i class="fa-solid fa-triangle-exclamation"></i><p>Chưa thể tải bài viết lúc này. Vui lòng thử lại.</p></div>';
      if(countLabel)countLabel.textContent="Không thể tải bài viết";
      showNotice("Không thể tải bài viết hồ sơ","error");
    }
  });
}
function renderPosts(posts){
  visiblePosts=sortProfilePosts(posts);
  posts=visiblePosts;
  commentStops.forEach(stop=>stop());commentStops.clear();
  const countLabel=$("profile-post-count-label"),heroCount=$("profile-hero-post-count"),list=$("profile-posts-list");
  if(countLabel)countLabel.textContent=`${posts.length} bài viết`;
  if(heroCount)heroCount.textContent=String(posts.length);
  if(!list)return;
  // Luôn hoàn tất phần giao diện chính trước. Trước đây sự kiện phụ được phát ở
  // đây; nếu một listener thư viện ảnh lỗi, DOM vẫn giữ nguyên spinner vô hạn.
  list.innerHTML=posts.map(post=>postTemplate(post)).join("")||'<div class="profile-empty-posts"><i class="fa-regular fa-note-sticky"></i><p>Chưa có bài viết nào.</p></div>';
  list.querySelectorAll(".profile-post-author").forEach(header=>{const image=header.querySelector("img"),name=header.querySelector("strong");if(image)image.src=avatarFor(profileId,profile.displayName,profile.photoURL||profile.profileImage);if(name)name.textContent=resolveDisplayName(profile,profileId===me.uid?me:null)});
  posts.forEach(post=>decoratePostManagement(list.querySelector(`.social-post[data-id="${CSS.escape(post.id)}"]`),post));
  bindPostActions(posts);enhanceInlineCommentMedia();focusRequestedProfilePost(posts);
  try{window.dispatchEvent(new CustomEvent("vhht-profile-posts",{detail:{profileId,posts:posts.map(post=>({...post}))}}))}catch(error){console.warn("Không thể đồng bộ phần tóm tắt bài viết",error)}
}

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
function renderPostContent(value){
  const source=String(value||"");
  const tokenPattern=/(https?:\/\/[^\s<]+|@[A-Za-z0-9._]{2,32}\b|(?<!\d)0(?:[\s.-]?\d){8,10}(?!\d))/g;
  let output="",cursor=0,match;
  while((match=tokenPattern.exec(source))){
    output+=safe(source.slice(cursor,match.index));
    let token=match[0];
    if(token.startsWith("http")){
      const trailing=token.match(/[),.!?;:]+$/)?.[0]||"";
      const url=trailing?token.slice(0,-trailing.length):token;
      output+=`<a class="post-inline-link" href="${safe(url)}" target="_blank" rel="noopener noreferrer nofollow">${safe(url)}</a>${safe(trailing)}`;
    }else{
      const copyValue=token.startsWith("@")?token:token.replace(/[\s.-]/g,"");
      const label=token.startsWith("@")?"ID TikTok":"số điện thoại";
      output+=`<button type="button" class="post-copy-token" data-copy-post-token="${safe(copyValue)}" aria-label="Sao chép ${label}" title="Sao chép ${label}">${safe(token)} <i class="fa-regular fa-copy" aria-hidden="true"></i></button>`;
    }
    cursor=match.index+token.length;
  }
  return output+safe(source.slice(cursor));
}

async function copyPostToken(value,button){
  try{
    if(navigator.clipboard&&window.isSecureContext)await navigator.clipboard.writeText(value);
    else{
      const helper=document.createElement("textarea");helper.value=value;helper.style.position="fixed";helper.style.opacity="0";document.body.appendChild(helper);helper.select();document.execCommand("copy");helper.remove();
    }
    const original=button.innerHTML;button.innerHTML='<i class="fa-solid fa-check" aria-hidden="true"></i> Đã sao chép';button.classList.add("is-copied");
    setTimeout(()=>{button.innerHTML=original;button.classList.remove("is-copied")},1400);
  }catch(error){console.error(error);showNotice("Không thể sao chép. Hãy thử lại.","error")}
}

document.addEventListener("click",event=>{
  const button=event.target.closest("[data-copy-post-token]");
  if(!button)return;
  event.preventDefault();
  copyPostToken(button.dataset.copyPostToken,button);
});
function postTemplate(post){const media=normaliseMedia(post),myReaction=post.reactions?.[me.uid],count=Object.keys(post.reactions||{}).length,own=isOwnPost(post),moderated=moderationState(post),readonlyActions=moderated?`<div class="post-social-actions moderated-readonly-actions"><button data-reaction-summary><i class="fa-regular fa-face-smile"></i> Xem cảm xúc</button><button data-toggle-comments><i class="fa-regular fa-comments"></i> Xem bình luận</button></div>`:`<div class="post-social-actions"><div class="inline-react-wrap"><button data-like class="${myReaction?'reacted':''}">${myReaction?EMOJI[myReaction]:"♡"} ${myReaction?reactionName(myReaction):"Thích"}</button><div class="inline-reaction-picker">${Object.entries(EMOJI).map(([key,value])=>`<button data-react="${key}" title="${reactionName(key)}">${value}</button>`).join("")}</div></div><button data-toggle-comments><i class="fa-regular fa-comment"></i> Bình luận</button><button data-share><i class="fa-solid fa-share"></i> Chia sẻ</button></div>`,commentForm=moderated?"":`<form class="inline-comment-form"><img src="${avatarFor(me.uid,myProfile.displayName,myProfile.photoURL||myProfile.profileImage)}" alt=""><div><input placeholder="Viết bình luận..." maxlength="1000"><button><i class="fa-solid fa-paper-plane"></i></button></div></form>`;return`<article class="profile-post-card social-post ${moderated?`is-moderated moderation-${moderated}`:''}" data-id="${post.id}">${moderationBanner(post)}<header class="profile-post-author"><img src="${avatarFor(profileId,profile.displayName,profile.photoURL||profile.profileImage)}" alt=""><span><strong>${safe(profile.displayName||post.authorDisplayName||"Thành viên")}</strong><small>${date(post.createdAt)} · ${privacyIcon(post.privacy)}</small></span>${own?`<button class="post-options-trigger" aria-label="Tùy chọn"><i class="fa-solid fa-ellipsis"></i></button><div class="profile-post-options">${moderated?'':`<button data-edit><i class="fa-regular fa-pen-to-square"></i>Sửa bài viết</button><button data-privacy-menu><i class="fa-solid fa-user-lock"></i>Đổi quyền riêng tư</button>`}<button class="danger" data-delete><i class="fa-regular fa-trash-can"></i>Xóa khỏi hồ sơ</button></div>`:`<button type="button" class="profile-post-report-trigger" data-report-post aria-label="Báo cáo bài viết" title="Báo cáo bài viết"><i class="fa-regular fa-flag"></i></button>`}</header><div class="profile-post-content">${renderPostContent(post.content||"")}</div>${mediaGrid(media)}<div class="post-social-summary"><button data-reaction-summary><i class="fa-regular fa-face-smile"></i><strong>${count}</strong><span>cảm xúc</span></button><button data-toggle-comments><i class="fa-regular fa-comment"></i><strong>${Number(post.commentCount||0)}</strong><span>bình luận</span></button><button data-share-summary><i class="fa-solid fa-paper-plane"></i><strong>${Number(post.shareCount||0)}</strong><span>chia sẻ</span></button></div>${readonlyActions}<section class="inline-comments" hidden><div class="inline-comments-list"></div>${commentForm}</section></article>`}

function reportProfilePost(post){
  if(isOwnPost(post))return;
  openDialog(`<div class="appeal-dialog-heading"><span><i class="fa-regular fa-flag"></i></span><div><h3>Báo cáo bài viết</h3><p>Chỉ quản trị viên được xem nội dung báo cáo và danh tính người gửi.</p></div></div><label for="profile-report-reason">Lý do báo cáo</label><textarea id="profile-report-reason" maxlength="1000" placeholder="Mô tả hành vi hoặc nội dung vi phạm…"></textarea><div class="dialog-actions"><button data-dialog-cancel>Hủy</button><button class="danger" id="submit-profile-report">Gửi báo cáo</button></div>`,dialog=>dialog.querySelector("#submit-profile-report").onclick=async()=>{
    const reason=dialog.querySelector("#profile-report-reason").value.trim(),button=dialog.querySelector("#submit-profile-report");
    if(reason.length<10)return showNotice("Lý do báo cáo cần ít nhất 10 ký tự","warning");
    button.disabled=true;
    try{const reportRef=doc(db,"postReports",`${post.id}_${me.uid}`),existing=await getDoc(reportRef);if(existing.exists()){closeDialog();return showNotice(existing.data().status==="pending"?"Báo cáo đang chờ quản trị viên xử lý":"Báo cáo đã được quản trị viên xử lý","info")}await setDoc(reportRef,{postId:post.id,postAuthorId:post.authorId,reporterId:me.uid,reason,status:"pending",createdAt:serverTimestamp()});closeDialog();showNotice("Báo cáo đã được gửi tới quản trị viên","success")}
    catch(error){console.error(error);button.disabled=false;showNotice("Không thể gửi báo cáo. Hãy kiểm tra kết nối hoặc quyền truy cập.","error")}
  })
}
document.addEventListener("click",event=>{if(!event.target.closest(".profile-post-overflow"))document.querySelectorAll(".profile-post-report-menu:not([hidden])").forEach(menu=>{menu.hidden=true;menu.previousElementSibling?.setAttribute("aria-expanded","false")})});

function decoratePostManagement(card,post){
  if(!card)return;
  card.querySelector(":scope > .profile-post-pinned-badge")?.remove();
  card.classList.remove("is-pinned-post");
  const pinned=Boolean(postTimestamp(post.pinnedAt));
  if(pinned){
    card.classList.add("is-pinned-post");
    const badge=document.createElement("div");
    badge.className="profile-post-pinned-badge";
    badge.innerHTML='<i class="fa-solid fa-thumbtack"></i><span>Bài viết đã ghim</span>';
    card.prepend(badge);
  }
  const trigger=card.querySelector(".post-options-trigger"),menu=card.querySelector(".profile-post-options");
  if(!trigger||!menu)return;
  trigger.setAttribute("aria-haspopup","menu");
  trigger.setAttribute("aria-expanded","false");
  trigger.title="Quản lý bài viết";
  menu.classList.add("profile-post-actions-menu");
  menu.setAttribute("role","menu");
  const header=document.createElement("div");
  header.className="post-actions-menu-header";
  header.innerHTML='<span class="post-actions-menu-symbol"><i class="fa-solid fa-sliders"></i></span><span><strong>Quản lý bài viết</strong><small>Chọn thao tác bạn muốn thực hiện</small></span>';
  menu.prepend(header);
  const upgrade=(button,icon,title,description)=>{
    if(!button)return;
    button.setAttribute("role","menuitem");
    button.innerHTML=`<span class="post-option-icon"><i class="${icon}"></i></span><span class="post-option-copy"><strong>${title}</strong><small>${description}</small></span><i class="fa-solid fa-chevron-right post-option-chevron"></i>`;
  };
  if(!moderationState(post)){
    const pin=document.createElement("button");
    pin.type="button";
    pin.dataset.pinPost="";
    pin.className=`post-pin-action${pinned?" is-active":""}`;
    upgrade(pin,"fa-solid fa-thumbtack",pinned?"Bỏ ghim bài viết":"Ghim lên đầu hồ sơ",pinned?"Đưa bài về thứ tự thông thường":"Bài ghim mới nhất sẽ đứng đầu");
    menu.insertBefore(pin,menu.querySelector("button")||null);
  }
  upgrade(menu.querySelector("[data-edit]"),"fa-regular fa-pen-to-square","Chỉnh sửa bài viết","Cập nhật nội dung hoặc tệp đính kèm");
  upgrade(menu.querySelector("[data-privacy-menu]"),"fa-solid fa-shield-halved","Quyền riêng tư","Chọn người có thể xem bài viết");
  upgrade(menu.querySelector("[data-delete]"),"fa-regular fa-trash-can","Xóa bài viết","Xóa vĩnh viễn khỏi hồ sơ");
}
function privacyIcon(value){
  if(value==="private")return '<i class="fa-solid fa-lock" aria-hidden="true"></i> Chỉ mình tôi';
  if(value==="friends")return '<i class="fa-solid fa-user-group" aria-hidden="true"></i> Bạn bè';
  return '<i class="fa-solid fa-earth-asia" aria-hidden="true"></i> Công khai';
}
function mediaGrid(media){if(!media.length)return"";return`<div class="profile-post-media-grid media-count-${Math.min(media.length,5)}">${media.slice(0,5).map((m,index)=>`<div class="profile-media-item" data-view-media="${index}">${m.type==="video"?`<video src="${m.url}" controls preload="none" playsinline></video>`:`<img src="${m.url}" alt="Ảnh bài viết" loading="lazy" decoding="async">`}${index===4&&media.length>5?`<span class="more-media">+${media.length-5}</span>`:""}</div>`).join("")}</div>`}
function bindPostActions(posts){
  const list=$("profile-posts-list");
  if(!list)return;
  list.querySelectorAll(".social-post").forEach(card=>{
    const post=posts.find(item=>item.id===card.dataset.id);
    if(!post)return;
    const legacyReportTrigger=card.querySelector(".profile-post-report-trigger[data-report-post]");
    if(legacyReportTrigger){
      legacyReportTrigger.removeAttribute("data-report-post");legacyReportTrigger.dataset.reportMenu="";legacyReportTrigger.innerHTML='<i class="fa-solid fa-ellipsis"></i>';legacyReportTrigger.setAttribute("aria-label","Tùy chọn bài viết");legacyReportTrigger.setAttribute("aria-haspopup","menu");legacyReportTrigger.setAttribute("aria-expanded","false");
      const overflow=document.createElement("div");overflow.className="profile-post-overflow";legacyReportTrigger.replaceWith(overflow);overflow.appendChild(legacyReportTrigger);
      const reportMenu=document.createElement("div");reportMenu.className="profile-post-report-menu";reportMenu.setAttribute("role","menu");reportMenu.hidden=true;reportMenu.innerHTML='<button type="button" data-save-post role="menuitem"><i class="fa-regular fa-bookmark"></i><span><strong>Lưu bài viết</strong><small>Xem lại trong bộ lọc Đã lưu</small></span></button><button type="button" data-report-post role="menuitem"><i class="fa-regular fa-flag"></i><span><strong>Báo cáo bài viết</strong><small>Gửi nội dung tới quản trị viên</small></span></button>';overflow.appendChild(reportMenu);syncProfileSaveButtons();
      legacyReportTrigger.onclick=event=>{event.stopPropagation();const opening=reportMenu.hidden;document.querySelectorAll(".profile-post-report-menu:not([hidden])").forEach(menu=>menu.hidden=true);reportMenu.hidden=!opening;legacyReportTrigger.setAttribute("aria-expanded",String(opening))};
    }
    const options=card.querySelector(".profile-post-options");
    const wrap=card.querySelector(".inline-react-wrap");
    const like=wrap?.querySelector("[data-like]");
    const coarse=matchMedia("(hover: none), (pointer: coarse)").matches;
    const paintReaction=type=>{
      const reactions={...(post.reactions||{})};
      if(type)reactions[me.uid]=type;else delete reactions[me.uid];
      if(like){
        like.classList.toggle("reacted",!!type);
        like.innerHTML=`${type?(EMOJI[type]||"❤️"):"♡"} ${type?reactionName(type):"Thích"}`;
        like.classList.remove("reaction-just-changed");
        requestAnimationFrame(()=>like.classList.add("reaction-just-changed"));
      }
      wrap?.querySelectorAll("[data-react]").forEach(item=>{
        const active=item.dataset.react===type;
        item.classList.toggle("is-current",active);
        item.setAttribute("aria-pressed",String(active));
      });
      const count=card.querySelector("[data-reaction-summary] strong");
      if(count)count.textContent=String(Object.keys(reactions).length);
    };
    card.querySelector(".post-options-trigger")?.addEventListener("click",event=>{
      event.stopPropagation();
      document.querySelectorAll(".profile-post-options.show").forEach(menu=>{
        if(menu!==options){menu.classList.remove("show");menu.previousElementSibling?.setAttribute("aria-expanded","false")}
      });
      const opening=!options?.classList.contains("show");
      options?.classList.toggle("show",opening);
      event.currentTarget.setAttribute("aria-expanded",String(opening));
    });
    options?.addEventListener("click",event=>{
      if(event.target.closest("button")){options.classList.remove("show");card.querySelector(".post-options-trigger")?.setAttribute("aria-expanded","false")}
    });
    like?.addEventListener("click",async event=>{
      if(coarse){
        event.preventDefault();event.stopPropagation();
        document.querySelectorAll(".inline-react-wrap.picker-open").forEach(item=>{if(item!==wrap)item.classList.remove("picker-open")});
        wrap.classList.toggle("picker-open");
        return;
      }
      const old=post.reactions?.[me.uid]||null,next=old?null:"like";
      paintReaction(next);
      try{await setReaction(post,next)}catch{paintReaction(old)}
    });
    card.querySelectorAll("[data-react]").forEach(button=>{
      const selected=post.reactions?.[me.uid]===button.dataset.react;
      button.classList.toggle("is-current",selected);
      button.setAttribute("aria-pressed",String(selected));
      button.onclick=async event=>{
        event.preventDefault();event.stopPropagation();
        const old=post.reactions?.[me.uid]||null;
        const next=old===button.dataset.react?null:button.dataset.react;
        button.classList.add("reaction-pop");
        wrap?.classList.remove("picker-open");
        paintReaction(next);
        try{await setReaction(post,next)}catch{paintReaction(old)}
      };
    });
    card.querySelectorAll("[data-reaction-summary]").forEach(button=>button.onclick=()=>openReactionSummary(post));
    card.querySelectorAll("[data-toggle-comments]").forEach(button=>button.onclick=()=>toggleComments(card,post));
    card.querySelectorAll("[data-view-media]").forEach(button=>button.onclick=()=>openPostMedia(normaliseMedia(post),Number(button.dataset.viewMedia)));
    card.querySelector("[data-edit]")?.addEventListener("click",()=>openEditDialog(post));
    card.querySelector("[data-pin-post]")?.addEventListener("click",()=>togglePinnedPost(post));
    card.querySelector("[data-delete]")?.addEventListener("click",()=>confirmDelete(post));
    card.querySelector("[data-privacy-menu]")?.addEventListener("click",()=>openPrivacyDialog(post));
    card.querySelector("[data-appeal]")?.addEventListener("click",()=>openAppealDialog(post));
    card.querySelector("[data-save-post]")?.addEventListener("click",async event=>{event.stopPropagation();const button=event.currentTarget;if(button.disabled)return;const wasSaved=savedPostIds.has(post.id);button.disabled=true;try{await toggleProfileSavedPost(post.id);showNotice(wasSaved?"Đã bỏ lưu bài viết":"Đã lưu bài viết","success")}catch(error){console.error(error);showNotice("Không thể thay đổi trạng thái lưu bài viết","error")}finally{button.disabled=false;button.closest(".profile-post-report-menu").hidden=true}});
    card.querySelector("[data-report-post]")?.addEventListener("click",event=>{event.stopPropagation();event.currentTarget.closest(".profile-post-report-menu").hidden=true;reportProfilePost(post)});
    card.querySelector(".inline-comment-form")?.addEventListener("submit",event=>submitComment(event,post,card));
  });
}
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
        await sendFriendRequest(me.uid,uid);
        await addDoc(collection(db,"notifications"),{recipientId:uid,actorId:me.uid,actorName:resolveDisplayName(myProfile),type:"friend_request",message:"đã gửi cho bạn một lời mời kết bạn",friendRequestStatus:"pending",isRead:false,createdAt:serverTimestamp()}).catch(error=>console.warn("Không thể tạo thông báo lời mời kết bạn",error));
        button.dataset.personAction="pending";button.className="engagement-person-action is-pending";
        button.innerHTML='<i class="fa-solid fa-clock"></i><span>Đã gửi yêu cầu</span>';
        showNotice("Đã gửi lời mời kết bạn","success")
      }catch(error){console.error(error);button.disabled=false;showNotice("Không thể gửi lời mời kết bạn","error")}
    })
  })
}
function openAppealDialog(post){openDialog(`<div class="appeal-dialog-heading"><span><i class="fa-solid fa-scale-balanced"></i></span><div><h3>Gửi khiếu nại</h3><p>Giải thích ngắn gọn vì sao bài viết nên được xem xét lại.</p></div></div><label for="appeal-message">Nội dung khiếu nại</label><textarea id="appeal-message" maxlength="1000" placeholder="Cung cấp ngữ cảnh giúp quản trị viên đánh giá chính xác…"></textarea><div class="appeal-dialog-note"><i class="fa-solid fa-circle-info"></i><span>Mỗi bài viết chỉ có một khiếu nại đang chờ xử lý.</span></div><div class="dialog-actions"><button data-dialog-cancel>Để sau</button><button class="primary" id="submit-appeal">Gửi khiếu nại</button></div>`,dialog=>dialog.querySelector("#submit-appeal").onclick=async()=>{const message=dialog.querySelector("#appeal-message").value.trim(),button=dialog.querySelector("#submit-appeal");if(message.length<10)return showNotice("Nội dung khiếu nại cần ít nhất 10 ký tự","warning");button.disabled=true;button.innerHTML='<i class="fa-solid fa-circle-notch fa-spin"></i> Đang gửi';try{await updateDoc(doc(db,"posts",post.id),{appeal:{status:"pending",message,submittedAt:serverTimestamp(),reviewedAt:null,reviewNote:""}});closeDialog();showNotice("Khiếu nại đã được gửi tới quản trị viên","success")}catch(error){console.error(error);button.disabled=false;button.textContent="Gửi khiếu nại";showNotice("Không thể gửi khiếu nại. Hãy thử lại.","error")}})}
async function setReaction(post,type){if(moderationState(post))return showNotice("Bài viết đã bị kiểm duyệt nên không thể tương tác","warning");const previous={...(post.reactions||{})},reactions={...previous};if(type)reactions[me.uid]=type;else delete reactions[me.uid];post.reactions=reactions;try{await updateDoc(doc(db,"posts",post.id),{reactions});if(type&&previous[me.uid]!==type&&post.authorId!==me.uid)await addDoc(collection(db,"notifications"),{recipientId:post.authorId,postAuthorId:post.authorId,actorId:me.uid,actorName:myProfile.displayName||"Thành viên",type:"reaction",reactionType:type,postId:post.id,message:`đã ${reactionVerb(type)} bài viết của bạn`,isRead:false,createdAt:serverTimestamp()})}catch(error){post.reactions=previous;showNotice("Chưa thể cập nhật cảm xúc. Hãy thử lại.","error");throw error}}
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
    return`<article class="inline-comment ${comment.parentId?'is-reply':''}" data-comment-id="${comment.id}"><img src="${avatarFor(comment.authorId,name,person.photoURL||person.profileImage)}" alt=""><div class="inline-comment-body">${parent?`<button type="button" class="inline-comment-reply-context" data-scroll-comment="${parent.id}"><i class="fa-solid fa-reply"></i><span>Trả lời <strong>${safe(parent.authorDisplayName||"Thành viên")}</strong>: ${safe(String(parent.content||"Bình luận có tệp đính kèm").slice(0,72))}</span></button>`:""}<div class="inline-comment-bubble"><a href="user-profile.html?uid=${encodeURIComponent(comment.authorId)}"><strong>${safe(name)}</strong></a><div class="inline-comment-more"><button type="button" class="inline-comment-more-trigger" data-comment-menu aria-expanded="false" aria-label="Tùy chọn bình luận"><i class="fa-solid fa-ellipsis-vertical"></i></button><div class="inline-comment-more-menu" role="menu"><button type="button" data-comment-copy><i class="fa-regular fa-copy"></i> Sao chép</button>${mine?'<button type="button" class="danger" data-comment-delete><i class="fa-regular fa-trash-can"></i> Xóa</button>':""}</div></div><p>${safe(comment.content||"")}</p>${comment.attachedImage?(comment.mediaType==='video'?`<video class="inline-comment-attachment" src="${safe(comment.attachedImage)}" controls></video>`:`<img class="inline-comment-attachment" src="${safe(comment.attachedImage)}" alt="Ảnh bình luận">`):""}${reactions?`<button type="button" class="inline-comment-reaction-count" title="${reactions} cảm xúc">${topReactions(comment.commentReactions)} <strong>${reactions}</strong></button>`:""}</div><div class="inline-comment-meta"><time>${date(comment.createdAt)}</time><div class="inline-comment-react-wrap"><button type="button" data-comment-react class="${myReaction?'reacted':''}">${myReaction?`${EMOJI[myReaction]} ${reactionName(myReaction)}`:'♡ Thích'}</button><div class="inline-comment-reaction-picker">${picker}</div></div><button type="button" data-comment-reply>Trả lời</button></div></div></article>`;
  }).join("")||'<p class="no-inline-comments">Chưa có bình luận nào. Hãy bắt đầu cuộc trò chuyện.</p>';
  list.querySelectorAll(".inline-comment").forEach(node=>{const comment=byId.get(node.dataset.commentId),reactWrap=node.querySelector(".inline-comment-react-wrap"),pickerNode=node.querySelector(".inline-comment-reaction-picker"),menu=node.querySelector(".inline-comment-more"),menuTrigger=node.querySelector("[data-comment-menu]");menuTrigger?.addEventListener("click",event=>{event.stopPropagation();document.querySelectorAll(".inline-comment-more.menu-open").forEach(item=>{if(item!==menu){item.classList.remove("menu-open");item.querySelector("[data-comment-menu]")?.setAttribute("aria-expanded","false")}});document.querySelectorAll(".inline-comment-react-wrap.picker-open").forEach(item=>item.classList.remove("picker-open"));const opening=!menu?.classList.contains("menu-open");menu?.classList.toggle("menu-open",opening);menuTrigger.setAttribute("aria-expanded",String(opening))});node.querySelector("[data-comment-react]")?.addEventListener("click",event=>{event.stopPropagation();document.querySelectorAll(".inline-comment-more.menu-open").forEach(item=>{item.classList.remove("menu-open");item.querySelector("[data-comment-menu]")?.setAttribute("aria-expanded","false")});document.querySelectorAll(".inline-comment-react-wrap.picker-open").forEach(item=>{if(item!==reactWrap)item.classList.remove("picker-open")});const opening=!reactWrap?.classList.contains("picker-open");reactWrap?.classList.toggle("picker-open",opening);pickerNode?.classList.remove("picker-align-right");if(opening&&pickerNode){requestAnimationFrame(()=>{const rect=pickerNode.getBoundingClientRect();if(rect.right>window.innerWidth-8)pickerNode.classList.add("picker-align-right")})}});node.querySelectorAll("[data-inline-comment-reaction]").forEach(button=>button.addEventListener("click",async event=>{event.stopPropagation();reactWrap?.classList.remove("picker-open");await setInlineCommentReaction(post,comment,button.dataset.inlineCommentReaction)}));node.querySelector("[data-comment-reply]")?.addEventListener("click",()=>setInlineReply(card.querySelector(".inline-comment-form"),comment));node.querySelector("[data-comment-copy]")?.addEventListener("click",async()=>{menu?.classList.remove("menu-open");menuTrigger?.setAttribute("aria-expanded","false");await navigator.clipboard.writeText(comment.content||"");showNotice("Đã sao chép bình luận","success")});node.querySelector("[data-comment-delete]")?.addEventListener("click",()=>{menu?.classList.remove("menu-open");menuTrigger?.setAttribute("aria-expanded","false");removeInlineComment(post,comment)});node.querySelector("[data-scroll-comment]")?.addEventListener("click",event=>{const target=list.querySelector(`[data-comment-id="${CSS.escape(event.currentTarget.dataset.scrollComment)}"]`);target?.scrollIntoView({behavior:"smooth",block:"center"});target?.classList.add("notification-comment-focus")})});
}
function toggleComments(card,post){const section=card.querySelector(".inline-comments");section.hidden=!section.hidden;if(section.hidden)return;if(commentStops.has(post.id))return;commentStops.set(post.id,onSnapshot(query(collection(db,"posts",post.id,"comments"),orderBy("createdAt","asc")),async snap=>{const comments=[];snap.forEach(d=>comments.push({id:d.id,...d.data()}));await renderInlineComments(card,post,comments);if(!moderationState(post))updateDoc(doc(db,"posts",post.id),{commentCount:comments.length}).catch(console.warn)}))}
async function submitComment(event,post,card){event.preventDefault();if(moderationState(post))return showNotice("Bài viết đã bị kiểm duyệt nên không thể bình luận","warning");const form=event.currentTarget,input=form.querySelector('input:not([type="file"])'),fileInput=form.querySelector(".inline-comment-media"),content=input.value.trim(),file=fileInput?.files[0],parentId=form.dataset.parentId||null,replyName=form.dataset.replyName||"";if(!content&&!file)return;const submit=form.querySelector('button[type="submit"],button:not([type])');if(submit)submit.disabled=true;try{const media=file?await uploadOne(file):null,commentRef=await addDoc(collection(db,"posts",post.id,"comments"),{authorId:me.uid,authorDisplayName:myProfile.displayName||"Thành viên",authorAvatar:myProfile.photoURL||myProfile.profileImage||"",content,attachedImage:media?.url||null,mediaType:media?.type||null,parentId,replyToName:replyName||null,commentReactions:{},createdAt:serverTimestamp()});input.value="";if(fileInput)fileInput.value="";clearInlineReply(form);let recipientId=post.authorId;if(parentId){try{const parentSnapshot=await getDoc(doc(db,"posts",post.id,"comments",parentId));recipientId=parentSnapshot.data()?.authorId||recipientId}catch(error){console.warn(error)}}if(recipientId!==me.uid)await addDoc(collection(db,"notifications"),{recipientId,postAuthorId:post.authorId,actorId:me.uid,actorName:myProfile.displayName||"Thành viên",type:parentId?"comment_reply":"comment",postId:post.id,commentId:commentRef.id,parentCommentId:parentId,message:parentId?`đã trả lời bình luận của bạn trong bài viết`:`đã bình luận bài viết của bạn`,isRead:false,createdAt:serverTimestamp()})}finally{if(submit)submit.disabled=false}}
function openEditDialog(post){const media=normaliseMedia(post).slice(0,1);openDialog(`<h3>Chỉnh sửa bài viết</h3><p>Cập nhật nội dung và ảnh/video của bài viết.</p><textarea id="edit-post-text">${safe(post.content||"")}</textarea><div id="edit-media-list" class="edit-media-list">${media.map((m,i)=>`<div data-existing="${i}">${m.type==='video'?`<video src="${m.url}" controls preload="metadata"></video>`:`<img src="${m.url}">`}<button data-remove-existing="${i}">×</button></div>`).join("")}</div><label class="dialog-add-media" for="edit-add-media"><i class="fa-solid fa-photo-film"></i> Thay ảnh/video</label><input id="edit-add-media" type="file" accept="image/jpeg,image/png,image/webp,video/mp4,video/webm,video/quicktime" hidden><div class="dialog-actions"><button data-dialog-cancel>Hủy</button><button class="primary" id="save-edit-post">Lưu thay đổi</button></div>`,dialog=>{const removed=new Set(),input=dialog.querySelector("#edit-add-media");dialog.querySelectorAll("[data-remove-existing]").forEach(b=>b.onclick=()=>{removed.add(Number(b.dataset.removeExisting));b.parentElement.remove()});dialog.querySelector("#save-edit-post").onclick=async()=>{const button=dialog.querySelector("#save-edit-post");button.disabled=true;try{const replacement=input.files[0]?await uploadOne(input.files[0],percent=>button.textContent=`Đang tải ${percent}%`):null,selected=replacement||media.find((_,i)=>!removed.has(i))||null,all=selected?[selected]:[],content=dialog.querySelector("#edit-post-text").value.trim(),payload={content,attachedImages:all,attachedImage:selected?.url||null,mediaType:selected?.type||null,mediaUrl:selected?.url||null,mediaPublicId:selected?.publicId||null,mediaFormat:selected?.format||null,mediaBytes:selected?.bytes||null,mediaWidth:selected?.width||null,mediaHeight:selected?.height||null,mediaDuration:selected?.duration||null,updatedAt:serverTimestamp()};await updateDoc(doc(db,"posts",post.id),payload);const article=document.querySelector(`.social-post[data-id="${post.id}"]`),contentNode=article?.querySelector(".profile-post-content"),oldGrid=article?.querySelector(".profile-post-media-grid");if(contentNode)contentNode.innerHTML=renderPostContent(content);if(oldGrid)oldGrid.remove();if(contentNode&&all.length)contentNode.insertAdjacentHTML("afterend",mediaGrid(all));Object.assign(post,payload);const cached=directPosts.find(item=>item.id===post.id);if(cached)Object.assign(cached,post);closeDialog();showNotice("Đã cập nhật toàn bộ bài viết","success")}catch(e){console.error(e);button.disabled=false;button.textContent="Lưu thay đổi";showNotice(e.message||"Không thể cập nhật bài viết","error")}}})}
function openPrivacyDialog(post){openDialog(`<h3>Quyền riêng tư bài viết</h3><p>Chọn những người có thể xem bài viết này.</p><div class="privacy-dialog-options">${[["public","🌐","Công khai","Mọi người đều xem được"],["friends","👥","Bạn bè","Chỉ bạn bè của bạn"],["private","🔒","Chỉ mình tôi","Ẩn với tất cả người khác"]].map(([v,i,t,d])=>`<label><input type="radio" name="post-privacy-dialog" value="${v}" ${(!post.privacy&&v==='public')||post.privacy===v?'checked':''}><span>${i}</span><div><strong>${t}</strong><small>${d}</small></div></label>`).join("")}</div><div class="dialog-actions"><button data-dialog-cancel>Hủy</button><button class="primary" id="save-privacy">Lưu</button></div>`,dialog=>dialog.querySelector("#save-privacy").onclick=async()=>{await updateDoc(doc(db,"posts",post.id),{privacy:dialog.querySelector('input:checked').value,audienceIds:dialog.querySelector('input:checked').value==="public"?[]:dialog.querySelector('input:checked').value==="private"?[me.uid]:[...new Set([me.uid,...(myProfile.friends||[])])]});closeDialog();showNotice("Đã đổi quyền riêng tư","success")})}
async function togglePinnedPost(post){
  const wasPinned=Boolean(postTimestamp(post.pinnedAt)),previousValue=post.pinnedAt||null;
  const optimisticValue=wasPinned?null:Date.now();
  const applyValue=value=>{
    [visiblePosts,directPosts].forEach(posts=>{const target=posts.find(item=>item.id===post.id);if(target)target.pinnedAt=value});
    post.pinnedAt=value;
  };
  applyValue(optimisticValue);
  renderPosts(visiblePosts);
  try{
    await updateDoc(doc(db,"posts",post.id),{pinnedAt:wasPinned?null:serverTimestamp()});
    showNotice(wasPinned?"Đã bỏ ghim bài viết":"Đã ghim bài viết lên đầu hồ sơ","success");
  }catch(error){
    console.error(error);applyValue(previousValue);renderPosts(visiblePosts);
    showNotice("Không thể thay đổi trạng thái ghim. Hãy thử lại.","error");
  }
}
function confirmDelete(post){
  openDialog(`<div class="dialog-danger-icon"><i class="fa-regular fa-trash-can"></i></div><h3>Xóa bài viết?</h3><p>Bài viết và toàn bộ bình luận sẽ không còn xuất hiện. Hành động này không thể hoàn tác.</p><div class="dialog-actions"><button data-dialog-cancel>Giữ bài viết</button><button class="danger" id="confirm-delete-post">Xóa vĩnh viễn</button></div>`,dialog=>dialog.querySelector("#confirm-delete-post").onclick=async()=>{
    const button=dialog.querySelector("#confirm-delete-post"),previousVisible=[...visiblePosts],previousDirect=[...directPosts];
    button.disabled=true;
    visiblePosts=visiblePosts.filter(item=>item.id!==post.id);directPosts=directPosts.filter(item=>item.id!==post.id);
    closeDialog();renderPosts(visiblePosts);
    try{
      await deleteDoc(doc(db,"posts",post.id));forgetAuthoredPost(me.uid,post.id);
      showNotice("Bài viết đã được xóa","success");
    }catch(error){
      console.error(error);visiblePosts=previousVisible;directPosts=previousDirect;renderPosts(visiblePosts);
      showNotice("Không thể xóa bài viết. Nội dung đã được khôi phục.","error");
    }
  });
}
function openDialog(html,setup){let overlay=$("profile-action-dialog");dialogReturnFocus=document.activeElement instanceof HTMLElement?document.activeElement:null;if(!overlay){overlay=document.createElement("div");overlay.id="profile-action-dialog";overlay.setAttribute("role","dialog");overlay.setAttribute("aria-modal","true");overlay.innerHTML='<div class="profile-dialog-card" tabindex="-1"></div>';document.body.appendChild(overlay);overlay.onclick=e=>{if(e.target===overlay)closeDialog()};overlay.addEventListener("keydown",event=>{if(event.key==="Escape"){event.preventDefault();closeDialog()}})}const card=overlay.querySelector(".profile-dialog-card");card.className="profile-dialog-card";card.innerHTML=html;overlay.setAttribute("aria-hidden","false");overlay.classList.add("show");card.querySelectorAll("[data-dialog-cancel]").forEach(b=>b.onclick=closeDialog);setup?.(card);requestAnimationFrame(()=>card.querySelector("input:not([disabled]),textarea:not([disabled]),button:not([disabled])")?.focus())}function closeDialog(){const overlay=$("profile-action-dialog");overlay?.classList.remove("show");overlay?.setAttribute("aria-hidden","true");if(dialogReturnFocus?.isConnected)dialogReturnFocus.focus({preventScroll:true});dialogReturnFocus=null}
let profileMediaScrollY=0;
function openPostMedia(media,index){
  const item=media[index];let overlay=$("profile-post-lightbox");
  if(!overlay){overlay=document.createElement("div");overlay.id="profile-post-lightbox";overlay.innerHTML='<div class="post-lightbox-tools"><button data-previous aria-label="Ảnh trước"><i class="fa-solid fa-chevron-left"></i></button><button data-minus aria-label="Thu nhỏ">−</button><output>100%</output><button data-plus aria-label="Phóng to">+</button><button data-reset aria-label="Đặt lại"><i class="fa-solid fa-rotate-left"></i></button><button data-download aria-label="Tải xuống"><i class="fa-solid fa-download"></i></button><button data-fullscreen aria-label="Toàn màn hình"><i class="fa-solid fa-expand"></i></button><button data-next aria-label="Ảnh tiếp theo"><i class="fa-solid fa-chevron-right"></i></button><button class="lightbox-close" aria-label="Đóng">×</button></div><div class="profile-lightbox-stage"></div>';document.body.appendChild(overlay)}
  const stage=overlay.querySelector(".profile-lightbox-stage");stage.innerHTML=item.type==='video'?`<video src="${item.url}" controls preload="metadata" playsinline></video>`:`<img src="${item.url}" alt="Ảnh phóng to">`;
  const visual=stage.firstElementChild,output=overlay.querySelector("output"),pointers=new Map();let scale=1,x=0,y=0,drag=null,pinchDistance=0,pinchScale=1;
  const apply=()=>{visual.style.transform=`translate3d(${x}px,${y}px,0) scale(${scale})`;output.textContent=`${Math.round(scale*100)}%`};
  const setScale=value=>{scale=Math.max(1,Math.min(5,value));if(scale===1)x=y=0;apply()};
  const close=()=>{overlay.classList.remove("show");document.body.classList.remove("media-viewer-open");document.body.style.top="";if(document.fullscreenElement===overlay)document.exitFullscreen?.().catch(()=>{});window.scrollTo(0,profileMediaScrollY);document.removeEventListener("keydown",onViewerKey)};
  overlay.querySelector("[data-plus]").onclick=()=>setScale(scale+.25);overlay.querySelector("[data-minus]").onclick=()=>setScale(scale-.25);overlay.querySelector("[data-reset]").onclick=()=>setScale(1);overlay.querySelector(".lightbox-close").onclick=close;
  const move=step=>{const next=(index+step+media.length)%media.length;close();setTimeout(()=>openPostMedia(media,next),0)};
  overlay.querySelector("[data-previous]").hidden=media.length<2;overlay.querySelector("[data-next]").hidden=media.length<2;overlay.querySelector("[data-previous]").onclick=()=>move(-1);overlay.querySelector("[data-next]").onclick=()=>move(1);
  overlay.querySelector("[data-fullscreen]").onclick=async()=>{try{if(document.fullscreenElement)await document.exitFullscreen();else await overlay.requestFullscreen?.()}catch(error){console.warn("Không thể mở toàn màn hình",error)}};
  overlay.querySelector("[data-download]").hidden=item.type==='video';overlay.querySelector("[data-download]").onclick=async event=>{const button=event.currentTarget;button.disabled=true;try{const response=await fetch(item.url);if(!response.ok)throw new Error("download-failed");const url=URL.createObjectURL(await response.blob()),link=document.createElement("a");link.href=url;link.download=`vhht-post-image-${index+1}.jpg`;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000)}catch{window.open(item.url,"_blank","noopener,noreferrer")}finally{button.disabled=false}};
  const onViewerKey=event=>{if(event.key==="ArrowLeft"&&media.length>1)move(-1);else if(event.key==="ArrowRight"&&media.length>1)move(1);else if(event.key==="+")setScale(scale+.25);else if(event.key==="-")setScale(scale-.25)};document.addEventListener("keydown",onViewerKey);
  overlay.onclick=event=>{if(event.target===overlay)close()};stage.onwheel=event=>{event.preventDefault();event.stopPropagation();setScale(scale+(event.deltaY<0?.15:-.15))};
  visual.onpointerdown=event=>{if(item.type==='video')return;event.preventDefault();pointers.set(event.pointerId,event);visual.setPointerCapture?.(event.pointerId);if(pointers.size===1)drag={cx:event.clientX,cy:event.clientY,x,y};else if(pointers.size===2){const [a,b]=[...pointers.values()];pinchDistance=Math.hypot(a.clientX-b.clientX,a.clientY-b.clientY);pinchScale=scale}};
  visual.onpointermove=event=>{if(!pointers.has(event.pointerId))return;event.preventDefault();pointers.set(event.pointerId,event);if(pointers.size===2){const [a,b]=[...pointers.values()],distance=Math.hypot(a.clientX-b.clientX,a.clientY-b.clientY);setScale(pinchScale*(distance/(pinchDistance||distance)))}else if(drag&&scale>1){x=drag.x+event.clientX-drag.cx;y=drag.y+event.clientY-drag.cy;apply()}};
  const release=event=>{pointers.delete(event.pointerId);drag=null};visual.onpointerup=release;visual.onpointercancel=release;
  profileMediaScrollY=window.scrollY;document.body.style.top=`-${profileMediaScrollY}px`;document.body.classList.add("media-viewer-open");overlay.classList.add("show");apply();
}
document.addEventListener("keydown",event=>{if(event.key==="Escape"&&$("profile-post-lightbox")?.classList.contains("show"))$("profile-post-lightbox").querySelector(".lightbox-close")?.click()});
function showNotice(message,type){let box=$("profile-professional-toast");if(!box){box=document.createElement("div");box.id="profile-professional-toast";document.body.appendChild(box)}box.className=`show ${type}`;box.innerHTML=`<i class="fa-solid ${type==='success'?'fa-circle-check':type==='warning'?'fa-triangle-exclamation':'fa-circle-xmark'}"></i><span>${message}</span>`;clearTimeout(box.timer);box.timer=setTimeout(()=>box.classList.remove("show"),3000)}
const normaliseMedia=p=>p.attachedImages?.length?p.attachedImages:(p.attachedImage?[{url:p.attachedImage,type:p.mediaType||"image"}]:[]),date=t=>t?.seconds?new Date(t.seconds*1000).toLocaleString("vi-VN",{day:"2-digit",month:"2-digit",year:"numeric",hour:"2-digit",minute:"2-digit"}):"Vừa xong",privacy=v=>v==='private'?"🔒 Chỉ mình tôi":v==='friends'?"👥 Bạn bè":"🌐 Công khai",safe=v=>{const d=document.createElement("div");d.textContent=v;return d.innerHTML},reactionName=t=>({like:"Thích",love:"Yêu thích",haha:"Haha",wow:"Wow",sad:"Buồn",angry:"Phẫn nộ"}[t]||"Thích"),reactionVerb=t=>({like:"thích",love:"thả tim",haha:"bày tỏ Haha với",wow:"bày tỏ Wow với",sad:"bày tỏ buồn với",angry:"bày tỏ phẫn nộ với"}[t]),topReactions=r=>[...new Set(Object.values(r||{}).map(v=>EMOJI[v]).filter(Boolean))].slice(0,3).join("");
const closeMobileReactionPickers=()=>document.querySelectorAll(".inline-react-wrap.picker-open").forEach(item=>{item.classList.remove("picker-open");item.querySelectorAll(".touch-selected").forEach(button=>button.classList.remove("touch-selected"))});
document.addEventListener("click",event=>{
  if(!event.target.closest(".post-options-trigger")&&!event.target.closest(".profile-post-options")){
    document.querySelectorAll(".profile-post-options.show").forEach(menu=>{menu.classList.remove("show");menu.previousElementSibling?.setAttribute("aria-expanded","false")});
  }
  if(!event.target.closest(".inline-react-wrap"))closeMobileReactionPickers();
    if(!event.target.closest(".inline-comment-react-wrap"))document.querySelectorAll(".inline-comment-react-wrap.picker-open").forEach(item=>item.classList.remove("picker-open"));
    if(!event.target.closest(".inline-comment-more"))document.querySelectorAll(".inline-comment-more.menu-open").forEach(item=>{item.classList.remove("menu-open");item.querySelector("[data-comment-menu]")?.setAttribute("aria-expanded","false")});
});
const publishButtonLabelObserver=new MutationObserver(()=>{const button=$("profile-publish-button");if(button?.textContent.trim()==="Đăng")button.textContent="Đăng bài"});
publishButtonLabelObserver.observe($("profile-publish-button"),{childList:true,characterData:true,subtree:true});

// Keep the published-post privacy editor consistent with the composer.
// This declaration intentionally replaces the legacy radio/emoji dialog above.
function openPrivacyDialogV2(post){
  const current=post.privacy||"public";
  const choices=[
    ["public","fa-earth-asia","Công khai"],
    ["friends","fa-user-group","Bạn bè"],
    ["private","fa-lock","Chỉ mình tôi"]
  ];
  openDialog(`
    <div class="post-privacy-dialog-head">
      <span class="post-privacy-dialog-symbol" aria-hidden="true"><i class="fa-solid fa-shield-halved"></i></span>
      <div><h3>Ai có thể xem?</h3><p>Quyền riêng tư bài viết</p></div>
    </div>
    <div class="privacy-dialog-options" role="radiogroup" aria-label="Quyền riêng tư bài viết">
      ${choices.map(([value,icon,label])=>`
        <label class="privacy-option ${current===value?"selected":""}">
          <input type="radio" name="post-privacy-dialog" value="${value}" ${current===value?"checked":""}>
          <span class="privacy-option-icon" aria-hidden="true"><i class="fa-solid ${icon}"></i></span>
          <strong>${label}</strong>
          <span class="privacy-option-check" aria-hidden="true"><i class="fa-solid fa-check"></i></span>
        </label>`).join("")}
    </div>
    <div class="dialog-actions post-privacy-dialog-actions">
      <button type="button" data-dialog-cancel>Hủy</button>
      <button type="button" class="primary" id="save-privacy">Lưu</button>
    </div>`,dialog=>{
      dialog.classList.add("post-privacy-dialog-card");
      const options=[...dialog.querySelectorAll(".privacy-option")];
      const syncSelected=()=>options.forEach(option=>option.classList.toggle("selected",option.querySelector("input").checked));
      options.forEach(option=>option.querySelector("input").addEventListener("change",syncSelected));
      dialog.querySelector("#save-privacy").onclick=async event=>{
        const selected=dialog.querySelector('input[name="post-privacy-dialog"]:checked')?.value||current;
        if(selected===current){closeDialog();return}
        event.currentTarget.disabled=true;
        try{
          await updateDoc(doc(db,"posts",post.id),{privacy:selected,audienceIds:selected==="public"?[]:selected==="private"?[me.uid]:[...new Set([me.uid,...(myProfile.friends||[])])]});
          post.privacy=selected;
          closeDialog();
          showNotice("Đã cập nhật quyền riêng tư","success");
        }catch(error){
          event.currentTarget.disabled=false;
          showNotice("Chưa thể lưu thay đổi","error");
        }
      };
    });
}
openPrivacyDialog=openPrivacyDialogV2;

function openEditDialogV2(post){
  const media=normaliseMedia(post).slice(0,1);
  openDialog(`
    <div class="post-edit-dialog-head">
      <span class="post-edit-dialog-symbol"><i class="fa-solid fa-pen-to-square" aria-hidden="true"></i></span>
      <div>
        <h3>Chỉnh sửa bài viết</h3>
        <p>Cập nhật nội dung hoặc tệp đính kèm</p>
      </div>
    </div>
    <label class="post-edit-field-label" for="edit-post-text">Nội dung</label>
    <textarea id="edit-post-text" placeholder="Bạn muốn chia sẻ điều gì?">${safe(post.content||"")}</textarea>
    <section class="post-edit-media-section">
      <div class="post-edit-media-heading">
        <span>Ảnh hoặc video</span>
        <small id="edit-media-status">${media.length?"1 tệp":"Chưa có tệp"}</small>
      </div>
      <div id="edit-media-list" class="edit-media-list"></div>
      <label class="dialog-add-media" for="edit-add-media">
        <i class="fa-solid fa-image" aria-hidden="true"></i><span>${media.length?"Thay tệp":"Thêm tệp"}</span>
      </label>
      <input id="edit-add-media" type="file" accept="image/*,video/*" hidden>
    </section>
    <div class="dialog-actions post-edit-dialog-actions">
      <button type="button" data-dialog-cancel>Hủy</button>
      <button type="button" class="primary" id="save-edit-post"><i class="fa-solid fa-check" aria-hidden="true"></i><span>Lưu thay đổi</span></button>
    </div>`,dialog=>{
    dialog.classList.add("post-edit-dialog-card");
    const removed=new Set();
    const input=dialog.querySelector("#edit-add-media");
    const list=dialog.querySelector("#edit-media-list");
    const status=dialog.querySelector("#edit-media-status");
    const editTextarea=dialog.querySelector("#edit-post-text");
    const resizeEditTextarea=()=>{
      editTextarea.style.height="auto";
      const maximum=window.matchMedia("(max-width: 620px)").matches?240:300;
      const nextHeight=Math.min(Math.max(editTextarea.scrollHeight,132),maximum);
      editTextarea.style.height=`${nextHeight}px`;
      editTextarea.style.overflowY=editTextarea.scrollHeight>maximum?"auto":"hidden";
      editTextarea.classList.toggle("is-scrollable",editTextarea.scrollHeight>maximum);
    };
    editTextarea.addEventListener("input",resizeEditTextarea);
    requestAnimationFrame(resizeEditTextarea);
    let previewUrl="";
    const emptyMarkup=`<div class="edit-media-empty"><i class="fa-regular fa-image" aria-hidden="true"></i><span>Chưa có ảnh hoặc video</span></div>`;
    const revokePreview=()=>{if(previewUrl){URL.revokeObjectURL(previewUrl);previewUrl="";}};
    const renderExisting=()=>{
      revokePreview();
      const entry=media.find((_,index)=>!removed.has(index));
      if(!entry){list.innerHTML=emptyMarkup;status.textContent="Chưa có tệp";return;}
      const index=media.indexOf(entry);
      const visual=entry.type==="video"?`<video src="${safe(entry.url)}" controls preload="metadata"></video>`:`<img src="${safe(entry.url)}" alt="Ảnh hiện tại">`;
      list.innerHTML=`<div class="edit-media-card">${visual}<button type="button" class="edit-media-remove" data-remove-existing="${index}" aria-label="Xóa tệp này" title="Xóa tệp"><i class="fa-solid fa-trash-can" aria-hidden="true"></i></button></div>`;
      status.textContent="1 tệp";
      list.querySelector("[data-remove-existing]").onclick=event=>{removed.add(Number(event.currentTarget.dataset.removeExisting));renderExisting();};
    };
    const renderSelected=file=>{
      revokePreview();
      previewUrl=URL.createObjectURL(file);
      const visual=file.type.startsWith("video/")?`<video src="${previewUrl}" controls preload="metadata"></video>`:`<img src="${previewUrl}" alt="Ảnh mới đã chọn">`;
      list.innerHTML=`<div class="edit-media-card is-new">${visual}<span class="edit-media-new-badge">Mới</span><button type="button" class="edit-media-remove" data-remove-new aria-label="Bỏ tệp vừa chọn" title="Bỏ tệp"><i class="fa-solid fa-trash-can" aria-hidden="true"></i></button></div>`;
      status.textContent="1 tệp mới";
      list.querySelector("[data-remove-new]").onclick=()=>{input.value="";renderExisting();};
    };
    renderExisting();
    input.addEventListener("change",()=>{const file=input.files&&input.files[0];if(file)renderSelected(file);});
    dialog.querySelector("#save-edit-post").onclick=async event=>{
      const button=event.currentTarget;
      const label=button.querySelector("span");
      const originalLabel=label.textContent;
      button.disabled=true;
      try{
        const replacement=input.files&&input.files[0]?await uploadOne(input.files[0],progress=>{label.textContent=`Đang tải ${progress}%`;}):null;
        const kept=media.find((_,index)=>!removed.has(index))||null;
        const selected=replacement||kept;
        const content=dialog.querySelector("#edit-post-text").value.trim();
        const payload={content,updatedAt:serverTimestamp(),media:selected?[selected]:[],imageUrl:selected&&selected.type!=="video"?selected.url:"",videoUrl:selected&&selected.type==="video"?selected.url:""};
        await updateDoc(doc(db,"posts",post.id),payload);
        const local=directPosts.find(item=>item.id===post.id);
        if(local)Object.assign(local,{content,media:payload.media,imageUrl:payload.imageUrl,videoUrl:payload.videoUrl});
        const card=document.querySelector(`[data-post-id="${post.id}"]`);
        if(card){
          const text=card.querySelector(".post-content");
          if(text)text.textContent=content;
        const grid=card.querySelector(".profile-post-media-grid, .post-media-grid");
          if(grid)grid.outerHTML=mediaGrid(payload.media);
        }
        revokePreview();
        closeDialog();
        showNotice("Đã lưu thay đổi.");
      }catch(error){
        console.error("Không thể cập nhật bài viết",error);
        label.textContent=originalLabel;
        button.disabled=false;
        showNotice("Chưa thể lưu thay đổi. Vui lòng thử lại.","error");
      }
    };
  });
}
openEditDialog=openEditDialogV2;
