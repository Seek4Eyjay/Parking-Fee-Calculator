"use strict";

/* =====================================================
   1. PASTE YOUR FIREBASE CONFIG HERE (from Step 1)
   ===================================================== */
const firebaseConfig = {
  apiKey: "AIzaSyCTmiuLpeeCERg-4n6KlxsK5GxNOqR98Cw",
  authDomain: "parking-fee-calculator-614a4.firebaseapp.com",
  projectId: "parking-fee-calculator-614a4",
  storageBucket: "parking-fee-calculator-614a4.firebasestorage.app",
  messagingSenderId: "314571661343",
  appId: "1:314571661343:web:483ca3585676dd09e6752a"
};

firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.firestore();

/* =====================================================
   2. PARKING RULES
   ===================================================== */
const RULES = {
  currency: "₱",
  perFullHour: 10,
  maxDays: 30,
  sizes: {
    large: { groupLabel: "Large vehicles", label: "Large vehicle", startFee: 50 },
    small: { groupLabel: "Small vehicles", label: "Small vehicle", startFee: 20 }
  },
  vehicles: {
    sedan:      { label: "Sedan",        size: "large" },
    suv:        { label: "SUV",          size: "large" },
    pickup:     { label: "Pickup truck", size: "large" },
    van:        { label: "Van",          size: "large" },
    truck:      { label: "Truck",        size: "large" },
    motorcycle: { label: "Motorcycle",   size: "small" },
    tricycle:   { label: "Tricycle",     size: "small" },
    sportsbike: { label: "Sports bike",  size: "small" },
    scooter:    { label: "Scooter",      size: "small" }
  }
};

const MINUTES_PER_DAY = 24 * 60;
const AUTH_DOMAIN = "@parkingcalc.app";

/* ---------- Page elements ---------- */
const $ = (id) => document.getElementById(id);

$("load-warning").hidden = true;

// Auth & Navigation elements
const logoLink = document.querySelector(".logo");
const mainNav = $("main-nav");
const userBadge = $("user-badge");
const logoutBtn = $("logout-btn");
const authScreen = $("auth-screen");
const calculatorMain = $("calculator");

const tabLogin = $("tab-login");
const tabRegister = $("tab-register");
const authTitle = $("auth-title");
const authSubtitle = $("auth-subtitle");
const authForm = $("auth-form");
const nameField = $("name-field");
const authNameInput = $("auth-name");
const authUsernameInput = $("auth-username");
const authPasswordInput = $("auth-password");
const authError = $("auth-error");
const authSubmitBtn = $("auth-submit");
const demoBtn = $("demo-btn");

// Calculator elements
const form = $("fee-form");
const vehicleSelect = $("category");
const vehicleDetailInput = $("vehicle-detail");
const plateInput = $("plate");
const entryInput = $("entry");
const exitInput = $("exit");
const nowButton = $("now-btn");
const errorBox = $("error");

const feeAmount = $("fee-amount");
const feeNote = $("fee-note");
const placeholder = $("placeholder");
const resultBox = $("result");
const factsList = $("facts");
const breakdownList = $("breakdown");
const saveButton = $("save-btn");

const statsBox = $("stats");
const rulesNote = $("rules-note");
const ratesBody = $("rates-body");

const logSummary = $("log-summary");
const logEmpty = $("log-empty");
const logTable = $("log-table");
const logBody = $("log-body");
const clearLogButton = $("clear-log");

let authMode = "login";
let currentUser = null;
let lastResult = null;
let log = [];
let isRegistering = false;
let isInitialAuthCheck = true;

/* ---------- Small helpers ---------- */
function money(amount) {
  return RULES.currency + amount.toLocaleString("en-PH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
}

function wholeMoney(amount) {
  return RULES.currency + amount;
}

function plural(count, word) {
  return count + " " + word + (count === 1 ? "" : "s");
}

function formatDuration(totalMinutes) {
  const days = Math.floor(totalMinutes / MINUTES_PER_DAY);
  const hours = Math.floor((totalMinutes % MINUTES_PER_DAY) / 60);
  const minutes = totalMinutes % 60;
  const parts = [];

  if (days) parts.push(plural(days, "day"));
  if (hours) parts.push(plural(hours, "hour"));
  if (minutes || parts.length === 0) parts.push(plural(minutes, "minute"));

  return parts.join(" ");
}

function formatDateTime(date) {
  return date.toLocaleString("en-PH", { dateStyle: "medium", timeStyle: "short" });
}

function toInputValue(date) {
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 16);
}

function makeElement(tag, text, className) {
  const element = document.createElement(tag);
  if (text !== undefined) element.textContent = text;
  if (className) element.className = className;
  return element;
}

function animateLogoTransition(firstRect) {
  const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (!logoLink || !firstRect || firstRect.width === 0 || prefersReducedMotion) return;

  const lastRect = logoLink.getBoundingClientRect();
  const deltaX = firstRect.left - lastRect.left;
  const deltaY = firstRect.top - lastRect.top;

  if (Math.abs(deltaX) < 1 && Math.abs(deltaY) < 1) return;

  logoLink.style.transition = "none";
  logoLink.style.transform = "translate(" + deltaX + "px, " + deltaY + "px)";

  void logoLink.offsetWidth;

  logoLink.style.transition = "transform 0.65s cubic-bezier(0.22, 1, 0.36, 1)";
  logoLink.style.transform = "translate(0, 0)";

  logoLink.addEventListener("transitionend", function cleanup() {
    logoLink.style.transition = "";
    logoLink.style.transform = "";
    logoLink.removeEventListener("transitionend", cleanup);
  });
}

/* =====================================================
   FIREBASE AUTHENTICATION
   ===================================================== */
function setAuthLoading(loading) {
  authSubmitBtn.disabled = loading;
  demoBtn.disabled = loading;
  if (loading) {
    authSubmitBtn.textContent = authMode === "register" ? "Creating..." : "Signing in...";
  } else {
    authSubmitBtn.textContent = authMode === "register" ? "Create account" : "Log in";
  }
}

function friendlyAuthError(error) {
  switch (error.code) {
    case "auth/email-already-in-use":
      return "That username is already taken. Choose another.";
    case "auth/user-not-found":
    case "auth/wrong-password":
    case "auth/invalid-credential":
      return "Invalid username or password.";
    case "auth/weak-password":
      return "Password must be at least 6 characters.";
    case "auth/too-many-requests":
      return "Too many attempts. Wait a moment and try again.";
    case "auth/network-request-failed":
      return "Network error. Check your internet connection.";
    default:
      return error.message || "Authentication failed. Please try again.";
  }
}

function setAuthMode(mode) {
  authMode = mode;
  const isRegister = mode === "register";

  tabLogin.classList.toggle("is-active", !isRegister);
  tabLogin.setAttribute("aria-selected", String(!isRegister));
  tabRegister.classList.toggle("is-active", isRegister);
  tabRegister.setAttribute("aria-selected", String(isRegister));

  nameField.hidden = !isRegister;
  authTitle.textContent = isRegister ? "Create an account" : "Attendant sign in";
  authSubtitle.textContent = isRegister
    ? "Register to keep your own private parking session records."
    : "Sign in to access the calculator and your personal session log.";
  authSubmitBtn.textContent = isRegister ? "Create account" : "Log in";
  authPasswordInput.setAttribute("autocomplete", isRegister ? "new-password" : "current-password");

  clearAuthError();
}

function showAuthError(message, field) {
  authError.textContent = message;
  authError.hidden = false;
  if (field) field.focus();
}

function clearAuthError() {
  authError.hidden = true;
  authError.textContent = "";
}

async function enterApp(firebaseUser, animate = true) {
  const firstRect = animate && logoLink ? logoLink.getBoundingClientRect() : null;
  const username = (firebaseUser.email || "").replace(AUTH_DOMAIN, "") || "user";
  const displayName = firebaseUser.displayName || username;

  currentUser = {
    uid: firebaseUser.uid,
    username: username,
    name: displayName
  };

  userBadge.textContent = "@" + currentUser.username;
  userBadge.title = currentUser.name;
  authScreen.hidden = true;
  mainNav.hidden = false;
  calculatorMain.hidden = false;

  document.body.classList.add("is-logged-in");
  document.body.classList.toggle("animate-header", animate);

  if (animate) {
    animateLogoTransition(firstRect);
  }

  form.reset();
  clearResult();
  await loadCloudLog();
  renderLog();
}

async function logoutUser() {
  const firstRect = logoLink ? logoLink.getBoundingClientRect() : null;

  await auth.signOut();
  currentUser = null;
  log = [];

  authForm.reset();
  setAuthMode("login");
  mainNav.hidden = true;
  calculatorMain.hidden = true;
  authScreen.hidden = false;

  document.body.classList.remove("is-logged-in", "animate-header");
  animateLogoTransition(firstRect);
}

tabLogin.addEventListener("click", () => setAuthMode("login"));
tabRegister.addEventListener("click", () => setAuthMode("register"));
authForm.addEventListener("input", clearAuthError);
logoutBtn.addEventListener("click", logoutUser);

authForm.addEventListener("submit", async function (event) {
  event.preventDefault();
  clearAuthError();

  const username = authUsernameInput.value.trim().toLowerCase();
  const password = authPasswordInput.value;
  const displayName = authNameInput.value.trim();

  if (!/^[a-z0-9_]{3,20}$/.test(username)) {
    showAuthError("Username must be 3–20 characters (letters, numbers, or underscores).", authUsernameInput);
    return;
  }
  if (password.length < 6) {
    showAuthError("Password must be at least 6 characters.", authPasswordInput);
    return;
  }

  const email = username + AUTH_DOMAIN;
  setAuthLoading(true);

  try {
    if (authMode === "register") {
      if (!displayName) {
        setAuthLoading(false);
        showAuthError("Enter your full name.", authNameInput);
        return;
      }

      isRegistering = true;
      const cred = await auth.createUserWithEmailAndPassword(email, password);
      await cred.user.updateProfile({ displayName: displayName });
      await db.collection("users").doc(cred.user.uid).set({
        username: username,
        name: displayName,
        createdAt: firebase.firestore.FieldValue.serverTimestamp()
      });
      isRegistering = false;
      await enterApp(cred.user, true);
    } else {
      await auth.signInWithEmailAndPassword(email, password);
    }
  } catch (error) {
    isRegistering = false;
    showAuthError(friendlyAuthError(error), authPasswordInput);
  } finally {
    setAuthLoading(false);
  }
});

demoBtn.addEventListener("click", async function () {
  clearAuthError();
  setAuthLoading(true);

  const demoEmail = "demo" + AUTH_DOMAIN;
  const demoPass = "demo1234";

  try {
    await auth.signInWithEmailAndPassword(demoEmail, demoPass);
  } catch (error) {
    if (error.code === "auth/user-not-found" || error.code === "auth/invalid-credential") {
      try {
        isRegistering = true;
        const cred = await auth.createUserWithEmailAndPassword(demoEmail, demoPass);
        await cred.user.updateProfile({ displayName: "Demo Attendant" });
        await db.collection("users").doc(cred.user.uid).set({
          username: "demo",
          name: "Demo Attendant",
          createdAt: firebase.firestore.FieldValue.serverTimestamp()
        });
        isRegistering = false;
        await enterApp(cred.user, true);
      } catch (createErr) {
        isRegistering = false;
        showAuthError(friendlyAuthError(createErr));
      }
    } else {
      showAuthError(friendlyAuthError(error));
    }
  } finally {
    setAuthLoading(false);
  }
});

/* =====================================================
   FEE CALCULATION
   ===================================================== */
function calculateFee(vehicleKey, entry, exit) {
  const vehicle = RULES.vehicles[vehicleKey];
  const size = RULES.sizes[vehicle.size];

  const minutes = Math.round((exit - entry) / 60000);
  const hours = Math.floor(minutes / 60);
  const hoursCharge = hours * RULES.perFullHour;

  const lines = [
    { text: "Starting fee (" + size.label.toLowerCase() + ")", amount: size.startFee }
  ];
  if (hours > 0) {
    lines.push({
      text: plural(hours, "full hour") + " × " + money(RULES.perFullHour),
      amount: hoursCharge
    });
  }

  return {
    minutes: minutes,
    hours: hours,
    fee: size.startFee + hoursCharge,
    lines: lines
  };
}

/* ---------- Validation ---------- */
function validate() {
  const detail = vehicleDetailInput.value.trim();
  const plate = plateInput.value.trim();

  if (detail && !/^[A-Za-z0-9 .,'()/-]{2,50}$/.test(detail)) {
    return {
      field: vehicleDetailInput,
      message: "Vehicle detail must be 2 to 50 characters (color, brand, and model)."
    };
  }
  if (plate && !/^[A-Za-z0-9 -]{3,20}$/.test(plate)) {
    return {
      field: plateInput,
      message: "Plate number must be 3 to 20 characters: letters, numbers, spaces or hyphens."
    };
  }
  if (!entryInput.value) {
    return { field: entryInput, message: "Enter the time the vehicle came in." };
  }
  if (!exitInput.value) {
    return { field: exitInput, message: "Enter the time the vehicle went out." };
  }

  const entry = new Date(entryInput.value);
  const exit = new Date(exitInput.value);

  if (isNaN(entry.getTime()) || isNaN(exit.getTime())) {
    return { field: entryInput, message: "One of the dates is not valid. Check the date and time." };
  }
  if (exit <= entry) {
    return { field: exitInput, message: "Time out must be later than time in." };
  }
  if ((exit - entry) / 60000 > RULES.maxDays * MINUTES_PER_DAY) {
    return {
      field: exitInput,
      message: "That is more than " + RULES.maxDays + " days. Check that the dates are correct."
    };
  }
  return null;
}

function showError(problem) {
  errorBox.textContent = problem.message;
  errorBox.hidden = false;
  problem.field.setAttribute("aria-invalid", "true");
  problem.field.focus();
}

function clearError() {
  errorBox.hidden = true;
  errorBox.textContent = "";
  [vehicleDetailInput, plateInput, entryInput, exitInput].forEach(function (field) {
    field.removeAttribute("aria-invalid");
  });
}

/* ---------- Showing the result ---------- */
function addFact(label, value) {
  factsList.appendChild(makeElement("dt", label));
  factsList.appendChild(makeElement("dd", value));
}

function showResult(data) {
  const vehicle = RULES.vehicles[data.vehicleKey];
  const size = RULES.sizes[vehicle.size];

  feeAmount.textContent = money(data.fee);
  feeAmount.classList.remove("is-empty");
  feeNote.textContent = vehicle.label + " parked for " + formatDuration(data.minutes);

  factsList.textContent = "";
  addFact("Vehicle", vehicle.label + " (" + size.label.toLowerCase() + ")" + (data.plate ? ", " + data.plate : ""));
  if (data.detail) {
    addFact("Vehicle detail", data.detail);
  }
  addFact("Time in", formatDateTime(data.entry));
  addFact("Time out", formatDateTime(data.exit));
  addFact("Time parked", formatDuration(data.minutes));
  const leftoverMinutes = data.minutes % 60;
  addFact("Full hours", plural(data.hours, "hour") + (leftoverMinutes ? " (" + plural(leftoverMinutes, "minute") + " not charged)" : ""));
  addFact("Rate", money(size.startFee) + " to start, plus " + money(RULES.perFullHour) + " for each full hour");

  breakdownList.textContent = "";
  data.lines.forEach(function (line) {
    const item = makeElement("li");
    item.appendChild(makeElement("span", line.text));
    item.appendChild(makeElement("span", money(line.amount), "amount"));
    breakdownList.appendChild(item);
  });

  saveButton.disabled = false;
  saveButton.textContent = "Save to log";

  placeholder.hidden = true;
  resultBox.hidden = false;

  resultBox.classList.remove("fresh");
  void resultBox.offsetWidth;
  resultBox.classList.add("fresh");
}

function clearResult() {
  lastResult = null;
  feeAmount.textContent = RULES.currency + "--.--";
  feeAmount.classList.add("is-empty");
  feeNote.textContent = "Fill in the times and choose Calculate fee.";
  resultBox.hidden = true;
  placeholder.hidden = false;
  clearError();
}

/* =====================================================
   CLOUD SAVED SESSIONS (Firestore)
   ===================================================== */
function userSessionsRef() {
  return db.collection("users").doc(currentUser.uid).collection("sessions");
}

async function loadCloudLog() {
  if (!currentUser) {
    log = [];
    return;
  }
  try {
    const snapshot = await userSessionsRef().get();
    const items = [];
    snapshot.forEach(function (doc) {
      items.push(Object.assign({ id: doc.id }, doc.data()));
    });
    items.sort((a, b) => (a.createdAtMs || 0) - (b.createdAtMs || 0));
    log = items;
  } catch (error) {
    console.error("Could not load sessions:", error);
    log = [];
  }
}

function renderLog() {
  logBody.textContent = "";

  const hasRows = log.length > 0;
  logTable.hidden = !hasRows;
  logTable.parentElement.hidden = !hasRows;
  logEmpty.hidden = hasRows;
  clearLogButton.hidden = !hasRows;

  if (!hasRows) {
    logSummary.textContent = "";
    return;
  }

  let total = 0;

  log.slice().reverse().forEach(function (entry) {
    total += entry.fee;
    const row = makeElement("tr");
    row.appendChild(makeElement("td", entry.plate || "No plate"));
    row.appendChild(makeElement("td", entry.label));
    row.appendChild(makeElement("td", entry.detail || "—"));
    row.appendChild(makeElement("td", formatDateTime(new Date(entry.entry))));
    row.appendChild(makeElement("td", formatDateTime(new Date(entry.exit))));
    row.appendChild(makeElement("td", formatDuration(entry.minutes)));
    row.appendChild(makeElement("td", money(entry.fee), "num"));
    logBody.appendChild(row);
  });

  const owner = currentUser ? currentUser.name + "'s log: " : "";
  logSummary.textContent = owner + plural(log.length, "session") + " saved, " + money(total) + " collected in total.";
}

/* ---------- Page setup ---------- */
function vehiclesOfSize(sizeKey) {
  return Object.keys(RULES.vehicles).filter(function (key) {
    return RULES.vehicles[key].size === sizeKey;
  });
}

function renderRules() {
  Object.keys(RULES.sizes).forEach(function (sizeKey) {
    const size = RULES.sizes[sizeKey];
    const keys = vehiclesOfSize(sizeKey);

    const group = document.createElement("optgroup");
    group.label = size.groupLabel;
    keys.forEach(function (key) {
      const option = makeElement("option", RULES.vehicles[key].label);
      option.value = key;
      group.appendChild(option);
    });
    vehicleSelect.appendChild(group);

    const examples = keys.map(function (key) { return RULES.vehicles[key].label; }).join(", ");
    const row = makeElement("tr");
    row.appendChild(makeElement("td", size.label));
    row.appendChild(makeElement("td", examples));
    row.appendChild(makeElement("td", money(size.startFee), "num"));
    row.appendChild(makeElement("td", money(RULES.perFullHour), "num"));
    ratesBody.appendChild(row);
  });

  [
    { number: wholeMoney(RULES.sizes.large.startFee), label: "Large vehicle starting fee" },
    { number: wholeMoney(RULES.sizes.small.startFee), label: "Small vehicle starting fee" },
    { number: "+" + wholeMoney(RULES.perFullHour), label: "Added for every full hour" }
  ].forEach(function (stat) {
    const card = makeElement("div", undefined, "stat");
    card.appendChild(makeElement("p", stat.number, "stat-number"));
    card.appendChild(makeElement("p", stat.label, "stat-label"));
    statsBox.appendChild(card);
  });

  rulesNote.textContent = "Minutes that do not make a full hour are not charged. There is no free parking time.";
}

/* ---------- Events ---------- */
form.addEventListener("submit", function (event) {
  event.preventDefault();
  clearError();

  const problem = validate();
  if (problem) {
    showError(problem);
    return;
  }

  const entry = new Date(entryInput.value);
  const exit = new Date(exitInput.value);
  const vehicleKey = vehicleSelect.value;
  const result = calculateFee(vehicleKey, entry, exit);

  lastResult = {
    vehicleKey: vehicleKey,
    label: RULES.vehicles[vehicleKey].label,
    plate: plateInput.value.trim().toUpperCase(),
    detail: vehicleDetailInput.value.trim(),
    entry: entry,
    exit: exit,
    minutes: result.minutes,
    hours: result.hours,
    fee: result.fee,
    lines: result.lines
  };

  showResult(lastResult);
});

form.addEventListener("input", clearError);
form.addEventListener("reset", clearResult);

nowButton.addEventListener("click", function () {
  exitInput.value = toInputValue(new Date());
  clearError();
});

saveButton.addEventListener("click", async function () {
  if (!lastResult || !currentUser) return;

  saveButton.disabled = true;
  saveButton.textContent = "Saving...";

  const record = {
    plate: lastResult.plate,
    label: lastResult.label,
    detail: lastResult.detail,
    entry: lastResult.entry.toISOString(),
    exit: lastResult.exit.toISOString(),
    minutes: lastResult.minutes,
    fee: lastResult.fee,
    createdAtMs: Date.now()
  };

  try {
    const docRef = await userSessionsRef().add(record);
    log.push(Object.assign({ id: docRef.id }, record));
    renderLog();
    saveButton.textContent = "Saved to log";
  } catch (error) {
    console.error("Failed to save session:", error);
    saveButton.disabled = false;
    saveButton.textContent = "Save to log";
    alert("Could not save to the database. Check your internet connection.");
  }
});

clearLogButton.addEventListener("click", async function () {
  if (!currentUser || !window.confirm("Delete all of your saved sessions?")) return;

  clearLogButton.disabled = true;
  try {
    const snapshot = await userSessionsRef().get();
    const batch = db.batch();
    snapshot.forEach((doc) => batch.delete(doc.ref));
    await batch.commit();

    log = [];
    renderLog();
  } catch (error) {
    console.error("Failed to clear log:", error);
    alert("Could not clear the database log. Please try again.");
  } finally {
    clearLogButton.disabled = false;
  }
});

/* ---------- Start ---------- */
renderRules();

auth.onAuthStateChanged(async function (user) {
  if (isRegistering) return;

  const shouldAnimate = !isInitialAuthCheck;
  isInitialAuthCheck = false;

  if (user) {
    await enterApp(user, shouldAnimate);
  }
});