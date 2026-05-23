import {
    firebaseAuthentication,
    firebaseDatabase
} from "../shared/firebase-connection.js";


import {
    collection,
    addDoc,
    serverTimestamp,
    doc,
    getDoc
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";


import {
    onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";


const createCommunityPostButton =
    document.getElementById(
        "create-community-post-button"
    );


let authenticatedUser = null;


onAuthStateChanged(
    firebaseAuthentication,
    (user) => {

        authenticatedUser = user;

    }
);


if (createCommunityPostButton) {

    createCommunityPostButton.addEventListener(
        "click",
        createNewCommunityPost
    );

}


async function createNewCommunityPost() {

    const communityPostInput =
        document.getElementById(
            "community-post-input"
        );

    const communityPostContent =
        communityPostInput.value.trim();


    if (communityPostContent === "") {

        return;

    }


    if (!authenticatedUser) {

        alert("Bạn chưa đăng nhập");

        return;

    }


    try {

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


        await addDoc(

            collection(
                firebaseDatabase,
                "posts"
            ),

            {
                authorId:
                    authenticatedUser.uid,

                authorDisplayName:
                    userData.displayName,

                content:
                    communityPostContent,

                createdAt:
                    serverTimestamp(),

                updatedAt:
                    null,

                deletedByAdmin:
                    false,

                deletedReason:
                    ""
            }

        );


        communityPostInput.value = "";

    }

    catch (error) {

        console.error(error);

    }

}