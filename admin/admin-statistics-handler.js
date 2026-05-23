import {
    firebaseDatabase
} from "../shared/firebase-connection.js";


import {
    collection,
    getDocs
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";


loadAdminStatistics();


async function loadAdminStatistics() {

    const usersSnapshot =
        await getDocs(
            collection(
                firebaseDatabase,
                "users"
            )
        );


    const postsSnapshot =
        await getDocs(
            collection(
                firebaseDatabase,
                "posts"
            )
        );


    document.getElementById(
        "total-users-count"
    ).innerText =
        usersSnapshot.size;


    document.getElementById(
        "total-posts-count"
    ).innerText =
        postsSnapshot.size;

}