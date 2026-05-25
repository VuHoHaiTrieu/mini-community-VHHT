import {
    firebaseDatabase
} from "../shared/firebase-connection.js";

import {
    collection,
    onSnapshot,
    doc,
    updateDoc,
    deleteDoc
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";



const usersTbody =
    document.getElementById(
        "users-tbody"
    );

const totalUsersCount =
    document.getElementById(
        "total-users-count"
    );

const userSearchInput =
    document.getElementById(
        "user-search"
    );

const refreshUsersButton =
    document.getElementById(
        "refresh-users"
    );



let allUsers = [];



/* =========================================
   REALTIME USERS
========================================= */

const usersCollectionReference =
    collection(
        firebaseDatabase,
        "users"
    );

onSnapshot(

    usersCollectionReference,

    (snapshot) => {

        allUsers = [];

        snapshot.forEach((docSnap) => {

            allUsers.push({

                id: docSnap.id,

                ...docSnap.data()

            });

        });

        renderUsersTable(
            allUsers
        );

        totalUsersCount.textContent =
            snapshot.size;

    }

);



/* =========================================
   RENDER USERS
========================================= */

function renderUsersTable(usersArray){

    usersTbody.innerHTML = "";


    if(usersArray.length === 0){

        usersTbody.innerHTML = `

            <tr>

                <td colspan="5" class="admin-empty-state">

                    Không có người dùng

                </td>

            </tr>

        `;

        return;
    }


    usersArray.forEach((user) => {

        const row =
            document.createElement("tr");

        const displayName =
            user.displayName ||
            "Người dùng";

        const email =
            user.email ||
            "Không có email";

        const role =
            user.role || "user";

        row.innerHTML = `

            <td>

                <div class="table-user-info">

                    <div class="table-user-avatar">

                        ${displayName
                            .charAt(0)
                            .toUpperCase()}

                    </div>

                    <div>

                        <div class="table-user-name">

                            ${displayName}

                        </div>

                    </div>

                </div>

            </td>



            <td>

                <div class="table-user-email">

                    ${email}

                </div>

            </td>



            <td>

                <span class="
                    role-badge
                    ${role === "admin"
                        ? "admin-badge"
                        : "user-badge"}
                ">

                    ${
                        role === "admin"
                        ? "Admin"
                        : "User"
                    }

                </span>

            </td>



            <td>

                <span class="status-badge active-status">

                    <i class="fa-solid fa-circle"></i>

                    Hoạt động

                </span>

            </td>



            <td class="action-cell">

                <div class="table-actions">

                    ${
                        role !== "admin"

                        ?

                        `

                        <button
                            class="table-action-btn make-admin-btn"
                            data-id="${user.id}"
                            title="Cấp Admin">

                            <i class="fa-solid fa-user-shield"></i>

                        </button>

                        `

                        :

                        `

                        <button
                            class="table-action-btn admin-lock-btn"
                            disabled>

                            <i class="fa-solid fa-shield"></i>

                        </button>

                        `
                    }



                    <button
                        class="table-action-btn delete-btn"
                        data-id="${user.id}"
                        title="Xóa">

                        <i class="fa-solid fa-trash"></i>

                    </button>

                </div>

            </td>

        `;

        usersTbody.appendChild(row);

    });

}



/* =========================================
   ACTIONS
========================================= */

usersTbody.addEventListener(

    "click",

    async (event) => {

        const button =
            event.target.closest(
                ".table-action-btn"
            );

        if(!button) return;

        const userId =
            button.dataset.id;

        if(!userId) return;


        if(
            button.classList.contains(
                "make-admin-btn"
            )
        ){

            await makeAdmin(userId);

        }


        if(
            button.classList.contains(
                "delete-btn"
            )
        ){

            await deleteUser(userId);

        }

    }

);



/* =========================================
   MAKE ADMIN
========================================= */

async function makeAdmin(userId){

    const confirmAction =
        confirm(
            "Cấp quyền Admin?"
        );

    if(!confirmAction) return;

    await updateDoc(

        doc(
            firebaseDatabase,
            "users",
            userId
        ),

        {
            role: "admin"
        }

    );

    showToast(
        "Đã cấp Admin"
    );

}



/* =========================================
   DELETE USER
========================================= */

async function deleteUser(userId){

    const confirmDelete =
        confirm(
            "Xóa người dùng?"
        );

    if(!confirmDelete) return;

    await deleteDoc(

        doc(
            firebaseDatabase,
            "users",
            userId
        )

    );

    showToast(
        "Đã xóa người dùng"
    );

}



/* =========================================
   SEARCH
========================================= */

userSearchInput.addEventListener(

    "input",

    (event) => {

        const keyword =
            event.target.value
            .toLowerCase()
            .trim();

        const filteredUsers =
            allUsers.filter((user) => {

                return (

                    (user.displayName || "")
                    .toLowerCase()
                    .includes(keyword)

                    ||

                    (user.email || "")
                    .toLowerCase()
                    .includes(keyword)

                );

            });

        renderUsersTable(
            filteredUsers
        );

    }

);



/* =========================================
   REFRESH
========================================= */

refreshUsersButton.addEventListener(

    "click",

    () => {

        renderUsersTable(
            allUsers
        );

        showToast(
            "Đã cập nhật dữ liệu"
        );

    }

);



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