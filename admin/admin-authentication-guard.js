import {
    firebaseAuthentication,
    firebaseDatabase
} from "../shared/firebase-connection.js";


import {
    onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";


import {
    doc,
    getDoc
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


        const userData =
            userDocumentSnapshot.data();


        if (userData.role !== "admin") {

            alert(
                "Bạn không có quyền truy cập"
            );

            window.location.href =
                "../community/community-feed-page.html";
        }

    }

);