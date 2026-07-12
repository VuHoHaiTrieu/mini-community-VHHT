import {
    firebaseAuthentication,
    firebaseDatabase
} from "../shared/firebase-connection.js";


import {
    onAuthStateChanged, signOut, updateProfile
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { resolveDisplayName, isGeneratedDisplayName } from "../shared/user-identity.js";


import {
    doc,
    getDoc, getDocs, collection, query, where, setDoc
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";


onAuthStateChanged(

    firebaseAuthentication,

    async (authenticatedUser) => {

        if (!authenticatedUser) {

            window.location.href =
                "../authentication/login-page.html";

            return;
        }


        const userDocumentReference =
            doc(
                firebaseDatabase,
                "users",
                authenticatedUser.uid
            );


        const userDocumentSnapshot =
            await getDoc(userDocumentReference);


        let userData =
            userDocumentSnapshot.data();


        if (userData.role !== "admin") {

            alert(
                "Bạn không có quyền truy cập"
            );

            window.location.href =
                "../community/community-feed-page.html";
            return;
        }

        userData=await recoverAdminIdentity(userData,authenticatedUser);
        renderAdminIdentity(userData,authenticatedUser);
        setupAdminLogout();
        document.body.classList.add("admin-ready");

    }

);

async function recoverAdminIdentity(data,user){
    let displayName=resolveDisplayName(data,user);
    if(isGeneratedDisplayName(displayName,data?.email||user.email)){
        try{const posts=await getDocs(query(collection(firebaseDatabase,"posts"),where("authorId","==",user.uid)));const historicalName=posts.docs.map(item=>item.data().authorDisplayName).find(name=>!isGeneratedDisplayName(name,data?.email||user.email));if(historicalName)displayName=historicalName}catch(error){console.warn("Không thể phục hồi tên admin từ bài viết",error)}
    }
    if(!isGeneratedDisplayName(displayName,data?.email||user.email)&&data?.displayName!==displayName){await setDoc(doc(firebaseDatabase,"users",user.uid),{displayName},{merge:true});await updateProfile(user,{displayName}).catch(console.warn)}
    return {...data,displayName};
}

function renderAdminIdentity(data,user){
    let identity=document.querySelector(".admin-identity-chip");
    if(!identity){identity=document.createElement("button");identity.className="admin-identity-chip";document.querySelector(".admin-main-topbar")?.appendChild(identity)}
    identity.innerHTML=`<img alt=""><span><strong></strong><small>ADMIN</small></span>`;
    identity.querySelector("img").src=data.photoURL||data.profileImage||"../shared/assets/default-avatar.svg";
    identity.querySelector("strong").textContent=resolveDisplayName(data,user);
    identity.onclick=()=>{sessionStorage.setItem("vhht_profile_return_source","dashboard");location.href="../community/profile-user/user-profile.html?from=dashboard"};
}

function setupAdminLogout(){
    const button=document.getElementById("logout-button");if(!button||button.dataset.ready)return;button.dataset.ready="true";
    button.onclick=()=>{let overlay=document.getElementById("admin-logout-confirm");if(!overlay){overlay=document.createElement("div");overlay.id="admin-logout-confirm";document.body.appendChild(overlay)}overlay.innerHTML=`<div><span><i class="fa-solid fa-power-off"></i></span><h3>Kết thúc phiên quản trị?</h3><p>Bạn sẽ đăng xuất khỏi Command Center và cần xác thực lại để tiếp tục quản lý hệ thống.</p><footer><button data-cancel>Ở lại</button><button data-confirm>Đăng xuất</button></footer></div>`;overlay.classList.add("show");overlay.querySelector("[data-cancel]").onclick=()=>overlay.classList.remove("show");overlay.onclick=e=>{if(e.target===overlay)overlay.classList.remove("show")};overlay.querySelector("[data-confirm]").onclick=async e=>{e.currentTarget.disabled=true;await signOut(firebaseAuthentication);location.href="../authentication/login-page.html"}};
}
document.getElementById("admin-profile-entry")?.addEventListener("click",()=>sessionStorage.setItem("vhht_profile_return_source","dashboard"));
document.getElementById("admin-community-entry")?.addEventListener("click",()=>sessionStorage.setItem("vhht_community_admin_mode","1"));
