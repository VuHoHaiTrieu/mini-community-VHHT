import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";

import { getAuth } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

import { getFirestore } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

import { firebaseProjectConfiguration } from "../configuration/firebase-project-config.js";

const firebaseApplication = initializeApp(firebaseProjectConfiguration);

const firebaseAuthentication = getAuth(firebaseApplication);

const firebaseDatabase = getFirestore(firebaseApplication);

export {
    firebaseAuthentication,
    firebaseDatabase
};
