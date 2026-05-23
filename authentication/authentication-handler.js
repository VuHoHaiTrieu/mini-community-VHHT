import {
    firebaseAuthentication,
    firebaseDatabase
} from "../shared/firebase-connection.js";


import {
    createUserWithEmailAndPassword,
    signInWithEmailAndPassword,
    onAuthStateChanged,
    signOut
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";


import {
    doc,
    setDoc,
    getDoc,
    serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";



/* =======================================================
   REGISTER SYSTEM
======================================================= */

const registerAccountButton =
    document.getElementById("register-account-button");


if (registerAccountButton) {

    registerAccountButton.addEventListener(
        "click",
        registerNewUserAccount
    );

}


async function registerNewUserAccount() {

    const displayNameInput =
        document.getElementById("display-name-input").value;

    const emailInput =
        document.getElementById("email-input").value;

    const passwordInput =
        document.getElementById("password-input").value;

    const confirmPasswordInput =
        document.getElementById("confirm-password-input").value;

    const authenticationStatusMessage =
        document.getElementById("authentication-status-message");


    if (
        displayNameInput === "" ||
        emailInput === "" ||
        passwordInput === "" ||
        confirmPasswordInput === ""
    ) {

        authenticationStatusMessage.innerText =
            "Vui lòng nhập đầy đủ thông tin";

        return;
    }


    if (passwordInput !== confirmPasswordInput) {

        authenticationStatusMessage.innerText =
            "Mật khẩu xác nhận không khớp";

        return;
    }


    try {

        const userCredential =
            await createUserWithEmailAndPassword(
                firebaseAuthentication,
                emailInput,
                passwordInput
            );


        const authenticatedUser =
            userCredential.user;


        await setDoc(

            doc(
                firebaseDatabase,
                "users",
                authenticatedUser.uid
            ),

            {
                displayName: displayNameInput,
                email: emailInput,
                createdAt: serverTimestamp(),
                profileImage: "",
                biography: "",
                role: "user"
            }

        );


        authenticationStatusMessage.innerText =
            "Đăng ký thành công";


        setTimeout(() => {

            window.location.href =
                "./login-page.html";

        }, 1500);

    }

    catch (error) {

        authenticationStatusMessage.innerText =
            error.message;

        console.error(error);

    }

}



/* =======================================================
   LOGIN SYSTEM
======================================================= */

const loginAccountButton =
    document.getElementById("login-account-button");


if (loginAccountButton) {

    loginAccountButton.addEventListener(
        "click",
        loginExistingUserAccount
    );

}


async function loginExistingUserAccount() {

    const loginEmailInput =
        document.getElementById("login-email-input").value;

    const loginPasswordInput =
        document.getElementById("login-password-input").value;

    const loginStatusMessage =
        document.getElementById("login-status-message");


    if (
        loginEmailInput === "" ||
        loginPasswordInput === ""
    ) {

        loginStatusMessage.innerText =
            "Vui lòng nhập email và mật khẩu";

        return;
    }


    try {

        const userCredential =
            await signInWithEmailAndPassword(
                firebaseAuthentication,
                loginEmailInput,
                loginPasswordInput
            );


        const authenticatedUser =
            userCredential.user;


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


        loginStatusMessage.innerText =
            "Đăng nhập thành công";


        setTimeout(() => {

            if (userData.role === "admin") {

                window.location.href =
                    "../admin/admin-dashboard-page.html";

            }

            else {

                window.location.href =
                    "../community/community-feed-page.html";

            }

        }, 1000);

    }

    catch (error) {

        loginStatusMessage.innerText =
            error.message;

        console.error(error);

    }

}



/* =======================================================
   AUTO LOGIN SESSION
======================================================= */

onAuthStateChanged(
    firebaseAuthentication,
    (authenticatedUser) => {

        console.log(
            "Authenticated User:",
            authenticatedUser
        );

    }
);



/* =======================================================
   LOGOUT SYSTEM
======================================================= */

const logoutButton =
    document.getElementById("logout-button");


if (logoutButton) {

    logoutButton.addEventListener(
        "click",
        logoutAuthenticatedUser
    );

}


async function logoutAuthenticatedUser() {

    try {

        await signOut(firebaseAuthentication);

        window.location.href =
            "../authentication/login-page.html";

    }

    catch (error) {

        console.error(error);

    }

}