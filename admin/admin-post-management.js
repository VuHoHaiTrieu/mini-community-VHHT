import {
    firebaseDatabase
} from "../shared/firebase-connection.js";

import {
    collection,
    onSnapshot,
    doc,
    updateDoc,
    deleteDoc,
    serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";



const postsTbody =
    document.getElementById(
        "posts-tbody"
    );

const totalPostsCount =
    document.getElementById(
        "total-posts-count"
    );

const postSearchInput =
    document.getElementById(
        "post-search"
    );

const refreshPostsBtn =
    document.getElementById(
        "refresh-posts"
    );



let allPosts = [];



/* =========================================
   REALTIME POSTS
========================================= */

const postsCollection =
    collection(
        firebaseDatabase,
        "posts"
    );

onSnapshot(

    postsCollection,

    (snapshot) => {

        allPosts = [];

        snapshot.forEach((docSnap) => {

            allPosts.push({

                id: docSnap.id,

                ...docSnap.data()

            });

        });

        renderPostsTable(
            allPosts
        );

        totalPostsCount.textContent =
            snapshot.size;

    }

);



/* =========================================
   RENDER POSTS
========================================= */

function renderPostsTable(postsArray){

    postsTbody.innerHTML = "";


    if(postsArray.length === 0){

        postsTbody.innerHTML = `

            <tr>

                <td colspan="5" class="admin-empty-state">

                    Không có bài viết

                </td>

            </tr>

        `;

        return;
    }


    postsArray.forEach((post) => {

        const row =
            document.createElement("tr");

        const isDeleted =
            post.deletedByAdmin === true;

        row.innerHTML = `

            <td>

                <div class="table-user-info">

                    <div class="table-user-avatar">

                        ${(post.authorDisplayName || "U")
                            .charAt(0)
                            .toUpperCase()}

                    </div>

                    <div>

                        <div class="table-user-name">

                            ${post.authorDisplayName || "Không rõ"}

                        </div>

                    </div>

                </div>

            </td>



            <td class="post-content-cell">

                ${
                    post.content
                    ? post.content.length > 120
                        ? post.content.substring(0,120) + "..."
                        : post.content
                    : "Không có nội dung"
                }

            </td>



            <td>

                ${
                    isDeleted

                    ?

                    `
                    <span class="status-badge deleted-status">

                        <i class="fa-solid fa-eye-slash"></i>

                        Đã ẩn

                    </span>
                    `

                    :

                    `
                    <span class="status-badge active-status">

                        <i class="fa-solid fa-earth-asia"></i>

                        Hiển thị

                    </span>
                    `
                }

            </td>



            <td>

                ${
                    post.createdAt?.seconds
                    ? formatDate(
                        post.createdAt.seconds * 1000
                    )
                    : "Không rõ"
                }

            </td>



            <td class="action-cell">

                <div class="table-actions">
                    <button class="table-action-btn inspect-post-btn" data-id="${post.id}" title="Xem đầy đủ"><i class="fa-solid fa-up-right-from-square"></i></button>

                    ${
                        !isDeleted

                        ?

                        `
                        <button
                            class="table-action-btn hide-post-btn"
                            data-id="${post.id}"
                            title="Ẩn bài">

                            <i class="fa-solid fa-eye-slash"></i>

                        </button>
                        `

                        :

                        `
                        <button
                            class="table-action-btn restore-post-btn"
                            data-id="${post.id}"
                            title="Khôi phục">

                            <i class="fa-solid fa-rotate-left"></i>

                        </button>
                        `
                    }
                    <button class="table-action-btn delete-post-permanent-btn" data-id="${post.id}" title="Xóa vĩnh viễn"><i class="fa-regular fa-trash-can"></i></button>

                </div>

            </td>

        `;

        postsTbody.appendChild(row);

    });

}



/* =========================================
   ACTIONS
========================================= */

postsTbody.addEventListener(

    "click",

    async (event) => {

        const button =
            event.target.closest(
                ".table-action-btn"
            );

        if(!button) return;

        const postId =
            button.dataset.id;

        if(!postId) return;


        if(
            button.classList.contains(
                "hide-post-btn"
            )
        ){

            await hidePost(postId);

        }


        if(
            button.classList.contains(
                "restore-post-btn"
            )
        ){

            await restorePost(postId);

        }
        if(button.classList.contains("inspect-post-btn")) window.open(`../community/community-feed-page.html?post=${encodeURIComponent(postId)}`,"_blank");
        if(button.classList.contains("delete-post-permanent-btn")&&confirm("Xóa vĩnh viễn bài viết và dữ liệu liên quan? Hành động này không thể hoàn tác."))await deleteDoc(doc(firebaseDatabase,"posts",postId));

    }

);



async function hidePost(postId){

    const confirmAction =
        confirm(
            "Ẩn bài viết?"
        );

    if(!confirmAction) return;

    await updateDoc(

        doc(
            firebaseDatabase,
            "posts",
            postId
        ),

        {
            deletedByAdmin: true,
            moderatedAt: serverTimestamp()
        }

    );

    showToast(
        "Đã ẩn bài viết"
    );

}



async function restorePost(postId){

    const confirmAction =
        confirm(
            "Khôi phục bài viết?"
        );

    if(!confirmAction) return;

    await updateDoc(

        doc(
            firebaseDatabase,
            "posts",
            postId
        ),

        {
            deletedByAdmin: false,
            restoredAt: serverTimestamp()
        }

    );

    showToast(
        "Đã khôi phục bài viết"
    );

}



/* =========================================
   SEARCH
========================================= */

postSearchInput.addEventListener(

    "input",

    (event) => {

        const keyword =
            event.target.value
            .toLowerCase()
            .trim();

        const filteredPosts =
            allPosts.filter((post) => {

                return (

                    (post.authorDisplayName || "")
                    .toLowerCase()
                    .includes(keyword)

                    ||

                    (post.content || "")
                    .toLowerCase()
                    .includes(keyword)

                );

            });

        renderPostsTable(
            filteredPosts
        );

    }

);



/* =========================================
   REFRESH
========================================= */

refreshPostsBtn.addEventListener(

    "click",

    () => {

        renderPostsTable(
            allPosts
        );

        showToast(
            "Đã cập nhật bài viết"
        );

    }

);



/* =========================================
   DATE FORMAT
========================================= */

function formatDate(timestamp){

    return new Date(timestamp)
        .toLocaleString(
            "vi-VN"
        );

}



/* =========================================
   TOAST
========================================= */

function showToast(message){

    const toast =
        document.createElement("div");

    toast.className =
        "admin-toast-notification";

    toast.innerHTML = `

        <i class="fa-solid fa-circle-check"></i>

        <span>${message}</span>

    `;

    document.body.appendChild(
        toast
    );

    setTimeout(() => {

        toast.classList.add(
            "show-toast"
        );

    }, 50);

    setTimeout(() => {

        toast.remove();

    }, 2500);

}
