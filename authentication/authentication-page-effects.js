document.addEventListener("DOMContentLoaded", () => {
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const starfield = document.createElement("div");
    const loader = document.createElement("div");

    starfield.className = "auth-starfield";
    starfield.setAttribute("aria-hidden", "true");

    const starCount = window.innerWidth < 480 ? 52 : window.innerWidth < 1024 ? 72 : 96;
    const astronautCount = window.innerWidth < 480 ? 5 : window.innerWidth < 1024 ? 7 : 10;
    const stars = document.createDocumentFragment();

    for (let index = 0; index < starCount; index += 1) {
        const star = document.createElement("span");
        const isCross = Math.random() < 0.16;
        const size = isCross ? 6 + Math.random() * 5 : 0.8 + Math.random() * 1.9;

        star.className = `auth-star${isCross ? " is-cross" : ""}`;
        star.style.setProperty("--star-x", `${(Math.random() * 100).toFixed(2)}%`);
        star.style.setProperty("--star-y", `${(Math.random() * 100).toFixed(2)}%`);
        star.style.setProperty("--star-size", `${size.toFixed(2)}px`);
        star.style.setProperty("--star-opacity", `${(0.22 + Math.random() * 0.48).toFixed(2)}`);
        star.style.setProperty("--star-delay", `${(-Math.random() * 5).toFixed(2)}s`);
        star.style.setProperty("--star-duration", `${(2.4 + Math.random() * 3.8).toFixed(2)}s`);
        stars.appendChild(star);
    }

    for (let index = 0; index < astronautCount; index += 1) {
        const astronaut = document.createElement("span");
        astronaut.className = `auth-floating-astronaut${Math.random() < 0.5 ? " is-mirrored" : ""}`;
        astronaut.setAttribute("aria-hidden", "true");
        astronaut.innerHTML = '<i class="fa-solid fa-user-astronaut"></i>';
        astronaut.style.setProperty("--astronaut-x", `${(6 + Math.random() * 86).toFixed(2)}%`);
        astronaut.style.setProperty("--astronaut-y", `${(8 + Math.random() * 80).toFixed(2)}%`);
        astronaut.style.setProperty("--astronaut-size", `${(9 + Math.random() * 7).toFixed(2)}px`);
        astronaut.style.setProperty("--astronaut-opacity", `${(0.11 + Math.random() * 0.13).toFixed(2)}`);
        astronaut.style.setProperty("--astronaut-rotation", `${(-28 + Math.random() * 56).toFixed(2)}deg`);
        astronaut.style.setProperty("--astronaut-drift-x", `${(-18 + Math.random() * 36).toFixed(2)}px`);
        astronaut.style.setProperty("--astronaut-drift-y", `${(-14 + Math.random() * 28).toFixed(2)}px`);
        astronaut.style.setProperty("--astronaut-delay", `${(-Math.random() * 8).toFixed(2)}s`);
        astronaut.style.setProperty("--astronaut-duration", `${(12 + Math.random() * 10).toFixed(2)}s`);
        stars.appendChild(astronaut);
    }

    starfield.appendChild(stars);
    document.body.prepend(starfield);

    loader.className = "auth-page-loader";
    loader.setAttribute("role", "status");
    loader.setAttribute("aria-live", "polite");
    loader.setAttribute("aria-label", "Đang mở cổng kết nối VHHT");
    loader.innerHTML = `
        <span class="auth-loader-orbit" aria-hidden="true">
            <span class="auth-loader-core"></span>
        </span>
        <span class="auth-loader-label">Đang mở cổng kết nối...</span>
    `;

    document.body.appendChild(loader);

    const finishLoading = () => {
        document.body.classList.add("auth-page-ready");
        loader.classList.add("is-hidden");
        window.setTimeout(() => loader.remove(), reduceMotion ? 0 : 280);
    };

    window.setTimeout(finishLoading, reduceMotion ? 0 : 420);

    let revealTimer = 0;
    const cardGuide = document.querySelector(".auth-card-guide");
    const guideText = cardGuide?.querySelector("[data-auth-guide]");
    const defaultGuideText = document.body.classList.contains("register-page")
        ? "Sẵn sàng tạo quỹ đạo"
        : "Sẵn sàng kết nối";
    const focusGuideText = {
        "display-name-input": "Bạn muốn mọi người gọi là gì?",
        "email-input": "Tín hiệu email của bạn",
        "login-email-input": "Tín hiệu email của bạn",
        "password-input": "Tạo khóa bảo vệ",
        "login-password-input": "Nhập khóa bảo vệ",
        "confirm-password-input": "Xác nhận khóa bảo vệ"
    };
    const updateGuide = (text, listening = false) => {
        if (!cardGuide || !guideText) return;
        guideText.textContent = text;
        cardGuide.classList.toggle("is-listening", listening);
    };
    const getInputGuide = (input) => {
        const value = input.value.trim();
        if (!value) return focusGuideText[input.id] || defaultGuideText;
        if (input.id === "display-name-input") return `Chào ${value.slice(0, 18)}!`;
        if (input.type === "email") return value.includes("@") ? "Đã nhận tín hiệu email" : "Email cần có ký hiệu @";
        if (input.id === "confirm-password-input") {
            const password = document.querySelector("#password-input")?.value || "";
            return value === password ? "Hai khóa đã trùng khớp" : "Kiểm tra lại khóa xác nhận";
        }
        if (input.type === "password") return value.length >= 6 ? "Khóa bảo vệ đã sẵn sàng" : "Cần ít nhất 6 ký tự";
        return defaultGuideText;
    };
    const revealInput = (input, delay = 220) => {
        if (window.innerWidth >= 768) return;
        window.clearTimeout(revealTimer);
        revealTimer = window.setTimeout(() => {
            const target = input.closest(".authentication-field") || input;
            target.scrollIntoView({
                behavior: reduceMotion ? "auto" : "smooth",
                block: "center",
                inline: "nearest"
            });
        }, delay);
    };

    document.querySelectorAll(".authentication-input").forEach((input) => {
        const group = input.closest(".input-group");
        if (!group) return;

        const syncFilledState = () => {
            group.classList.toggle("has-value", Boolean(input.value.trim()));
        };

        input.addEventListener("focus", () => {
            group.classList.add("is-focused");
            updateGuide(getInputGuide(input), true);
            revealInput(input);
        });
        input.addEventListener("blur", () => {
            group.classList.remove("is-focused");
            syncFilledState();
            window.setTimeout(() => {
                if (!document.activeElement?.classList.contains("authentication-input")) {
                    updateGuide(defaultGuideText, false);
                }
            }, 120);
        });
        input.addEventListener("input", () => {
            syncFilledState();
            updateGuide(getInputGuide(input), true);
        });
        syncFilledState();
    });

    window.visualViewport?.addEventListener("resize", () => {
        const activeInput = document.activeElement;
        if (activeInput?.classList.contains("authentication-input")) {
            revealInput(activeInput, 90);
        }
    });

    const authenticationCard = document.querySelector(".authentication-card");
    if (authenticationCard) {
        let cardFrame = 0;
        const moveCardGlow = (event) => {
            const rect = authenticationCard.getBoundingClientRect();
            const x = Math.max(0, Math.min(100, ((event.clientX - rect.left) / rect.width) * 100));
            const y = Math.max(0, Math.min(100, ((event.clientY - rect.top) / rect.height) * 100));
            window.cancelAnimationFrame(cardFrame);
            cardFrame = window.requestAnimationFrame(() => {
                authenticationCard.style.setProperty("--card-glow-x", `${x.toFixed(1)}%`);
                authenticationCard.style.setProperty("--card-glow-y", `${y.toFixed(1)}%`);
            });
        };

        authenticationCard.addEventListener("pointerenter", () => authenticationCard.classList.add("is-interacting"));
        authenticationCard.addEventListener("pointermove", moveCardGlow);
        authenticationCard.addEventListener("pointerleave", () => {
            authenticationCard.classList.remove("is-interacting");
            authenticationCard.style.setProperty("--card-glow-x", "50%");
            authenticationCard.style.setProperty("--card-glow-y", "0%");
        });
        authenticationCard.addEventListener("pointerdown", (event) => {
            moveCardGlow(event);
            authenticationCard.classList.remove("is-card-pulsing");
            void authenticationCard.offsetWidth;
            authenticationCard.classList.add("is-card-pulsing");
        });
        authenticationCard.addEventListener("animationend", (event) => {
            if (event.animationName === "authCardPulse") authenticationCard.classList.remove("is-card-pulsing");
        });
    }
});
