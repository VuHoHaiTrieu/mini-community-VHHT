const navigationButtons =
    document.querySelectorAll(
        ".admin-navigation-button"
    );

const pageSections =
    document.querySelectorAll(
        ".admin-page-section"
    );

const shortcutButtons =
    document.querySelectorAll(
        ".dashboard-shortcut-button"
    );



/* =========================================
   SHOW PAGE
========================================= */

function showAdminPage(
    targetPageId
){

    pageSections.forEach(

        (section) => {

            section.classList.remove(
                "active-page-section"
            );

        }

    );


    navigationButtons.forEach(

        (button) => {

            button.classList.remove(
                "active"
            );

        }

    );


    const targetSection =
        document.getElementById(
            targetPageId
        );

    if(targetSection){

        targetSection.classList.add(
            "active-page-section"
        );

    }


    const activeButton =
        document.querySelector(
            `[data-page="${targetPageId}"]`
        );

    if(activeButton){

        activeButton.classList.add(
            "active"
        );

    }

}



/* =========================================
   SIDEBAR NAVIGATION
========================================= */

navigationButtons.forEach(

    (button) => {

        button.addEventListener(

            "click",

            () => {

                const targetPageId =
                    button.dataset.page;

                showAdminPage(
                    targetPageId
                );

            }

        );

    }

);



/* =========================================
   DASHBOARD SHORTCUTS
========================================= */

shortcutButtons.forEach(

    (button) => {

        button.addEventListener(

            "click",

            () => {

                const targetPageId =
                    button.dataset.target;

                showAdminPage(
                    targetPageId
                );

            }

        );

    }

);



/* =========================================
   DEFAULT PAGE
========================================= */

showAdminPage(
    "dashboard-page-section"
);