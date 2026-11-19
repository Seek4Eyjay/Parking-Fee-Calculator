"use strict";

/* =====================================================
   1. FIREBASE CONFIGURATION
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
   2. PARKING RULES & CAPACITY
   ===================================================== */
const RULES = {
  currency: "₱",
  perFullHour: 10,
  maxDays: 30,
  capacity: {
    large: 50,
    small: 50
  },
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
const DEMO_ACTIVE_KEY = "parkingFeeDemoActive";
const DEMO_LOG_KEY = "parkingFeeDemoLog";
const DEMO_SLOTS_KEY = "parkingFeeDemoSlots";

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

// Left Form (Check-In & Check-Out)
const panelModeBar = $("panel-mode-bar");
const modePill = $("mode-pill");
const cancelCheckoutBtn = $("cancel-checkout-btn");
const entryTitle = $("entry-title");
const panelGuide = $("panel-guide");

const slotPickerBox = $("slot-picker-box");
const selectedSlotDisplay = $("selected-slot-display");
const jumpToMapBtn = $("jump-to-map-btn");

const form = $("fee-form");
const vehicleSelect = $("category");
const vehicleDetailInput = $("vehicle-detail");
const plateInput = $("plate");
const entryInput = $("entry");
const nowInButton = $("now-in-btn");
const exitField = $("exit-field");
const exitInput = $("exit");
const nowButton = $("now-btn");
const errorBox = $("error");
const checkinNotice = $("checkin-notice");

const checkinActions = $("checkin-actions");
const parkSubmitBtn = $("park-submit-btn");
const resetCheckinBtn = $("reset-checkin-btn");
const checkoutActions = $("checkout-actions");
const calcCheckoutBtn = $("calc-checkout-btn");

// Right Ticket (Result & Payment)
const feeAmount = $("fee-amount");
const feeNote = $("fee-note");
const placeholder = $("placeholder");
const resultBox = $("result");
const factsList = $("facts");
const breakdownList = $("breakdown");
const saveButton = $("save-btn");

// Parking Map & Space Looker
const mapStatsBox = $("map-stats");
const lotFullBanner = $("lot-full-banner");
const sizeLockHint = $("size-lock-hint");
const slotSearchInput = $("slot-search");
const clearSearchBtn = $("clear-search-btn");

const zoneLargeBadge = $("zone-large-badge");
const zoneSmallBadge = $("zone-small-badge");
const largeZoneCount = $("large-zone-count");
const smallZoneCount = $("small-zone-count");
const lotBaysRow = $("lot-bays-row");
const resetMapBtn = $("reset-map-btn");

// Rules & Saved log
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
let occupiedSlots = {}; // Map of slotId -> { vehicleKey, label, detail, plate, timeIn }

// Workflow state: "checkin" or "checkout"
let workflowMode = "checkin";
let selectedVacantSlot = null;
let checkoutSlotId = null;

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
   DEMO STORAGE HELPERS (Temporary per browser tab)
   ===================================================== */
function loadDemoLog() {
  try {
    const raw = sessionStorage.getItem(DEMO_LOG_KEY);
    const data = raw ? JSON.parse(raw) : [];
    return Array.isArray(data) ? data : [];
  } catch (e) {
    return [];
  }
}

function saveDemoLog() {
  try {
    sessionStorage.setItem(DEMO_LOG_KEY, JSON.stringify(log));
  } catch (e) {}
}

function loadDemoSlots() {
  try {
    const raw = sessionStorage.getItem(DEMO_SLOTS_KEY);
    const data = raw ? JSON.parse(raw) : {};
    return data && typeof data === "object" ? data : {};
  } catch (e) {
    return {};
  }
}

function saveDemoSlots() {
  try {
    sessionStorage.setItem(DEMO_SLOTS_KEY, JSON.stringify(occupiedSlots));
  } catch (e) {}
}

function clearDemoStorage() {
  try {
    sessionStorage.removeItem(DEMO_ACTIVE_KEY);
    sessionStorage.removeItem(DEMO_LOG_KEY);
    sessionStorage.removeItem(DEMO_SLOTS_KEY);
  } catch (e) {}
}

/* =====================================================
   AUTHENTICATION
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
    ? "Register to keep your own private parking map and session records."
    : "Sign in to access the parking map, fee calculator, and session log.";
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

async function enterApp(userObj, animate = true) {
  const firstRect = animate && logoLink ? logoLink.getBoundingClientRect() : null;

  if (userObj.isDemo) {
    currentUser = {
      uid: "demo",
      username: "demo",
      name: "Demo Attendant",
      isDemo: true
    };
    log = loadDemoLog();
    occupiedSlots = loadDemoSlots();
  } else {
    const username = (userObj.email || "").replace(AUTH_DOMAIN, "") || "user";
    const displayName = userObj.displayName || username;
    currentUser = {
      uid: userObj.uid,
      username: username,
      name: displayName,
      isDemo: false
    };
    await loadCloudData();
  }

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

  switchToCheckinMode(true);
  renderParkingMap();
  renderLog();
}

async function logoutUser() {
  const firstRect = logoLink ? logoLink.getBoundingClientRect() : null;
  const wasDemo = currentUser && currentUser.isDemo;

  clearDemoStorage();
  if (!wasDemo && auth.currentUser) {
    await auth.signOut();
  }

  currentUser = null;
  log = [];
  occupiedSlots = {};
  selectedVacantSlot = null;
  checkoutSlotId = null;

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
  if (username === "demo") {
    showAuthError("Username 'demo' is reserved. Use the Try Demo Account button.", authUsernameInput);
    return;
  }
  if (password.length < 6) {
    showAuthError("Password must be at least 6 characters.", authPasswordInput);
    return;
  }

  const email = username + AUTH_DOMAIN;
  setAuthLoading(true);
  clearDemoStorage();

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
        occupiedSlots: {},
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

  if (auth.currentUser) {
    await auth.signOut();
  }

  try {
    sessionStorage.setItem(DEMO_ACTIVE_KEY, "true");
    sessionStorage.setItem(DEMO_LOG_KEY, "[]");
    sessionStorage.setItem(DEMO_SLOTS_KEY, "{}");
  } catch (e) {}

  await enterApp({ isDemo: true }, true);
});

/* =====================================================
   CHECK-IN & CHECK-OUT WORKFLOW MODES
   ===================================================== */
function getSelectedVehicleSize() {
  const vehicle = RULES.vehicles[vehicleSelect.value];
  return vehicle ? vehicle.size : "large";
}

function updateSlotPickerDisplay() {
  slotPickerBox.classList.remove("has-vacant-slot", "has-taken-slot");

  if (workflowMode === "checkout" && checkoutSlotId) {
    slotPickerBox.classList.add("has-taken-slot");
    selectedSlotDisplay.classList.remove("is-empty");
    selectedSlotDisplay.textContent = checkoutSlotId + " (Taken — Checking Out)";
    jumpToMapBtn.hidden = true;
  } else if (selectedVacantSlot) {
    slotPickerBox.classList.add("has-vacant-slot");
    selectedSlotDisplay.classList.remove("is-empty");
    const sizeLabel = selectedVacantSlot.startsWith("L-") ? "Big Vehicle" : "Small Vehicle";
    selectedSlotDisplay.textContent = selectedVacantSlot + " (" + sizeLabel + ")";
    jumpToMapBtn.hidden = false;
    jumpToMapBtn.textContent = "Change slot ↓";
  } else {
    selectedSlotDisplay.classList.add("is-empty");
    selectedSlotDisplay.textContent = "No slot selected — pick a green slot below";
    jumpToMapBtn.hidden = false;
    jumpToMapBtn.textContent = "Pick on map ↓";
  }
}

function switchToCheckinMode(clearInputs = true) {
  workflowMode = "checkin";
  checkoutSlotId = null;
  selectedVacantSlot = null;

  panelModeBar.hidden = true;
  entryTitle.textContent = "Park a vehicle";
  panelGuide.textContent = "Select Vehicle type, click an available green slot on the map below, and set Time in.";

  vehicleSelect.disabled = false;
  vehicleDetailInput.disabled = false;
  plateInput.disabled = false;
  entryInput.disabled = false;
  nowInButton.hidden = false;

  exitField.hidden = true;
  exitInput.value = "";
  checkinActions.hidden = false;
  checkoutActions.hidden = true;

  if (clearInputs) {
    form.reset();
    checkinNotice.hidden = true;
  }

  clearError();
  clearResult();
  updateSlotPickerDisplay();
  renderParkingMap();
}

function switchToCheckoutMode(slotId) {
  const occupant = occupiedSlots[slotId];
  if (!occupant) return;

  workflowMode = "checkout";
  checkoutSlotId = slotId;
  selectedVacantSlot = null;
  checkinNotice.hidden = true;

  panelModeBar.hidden = false;
  modePill.textContent = "Vehicle Check-Out";
  entryTitle.textContent = "Check out Slot " + slotId;
  panelGuide.textContent = "Set Time out (or click Use current time) to see the total fee, then click Paid Now.";

  // Load parked vehicle details into the form
  vehicleSelect.value = occupant.vehicleKey;
  vehicleDetailInput.value = occupant.detail || "";
  plateInput.value = occupant.plate || "";
  entryInput.value = toInputValue(new Date(occupant.timeIn));

  // Lock check-in details so they match the parked record
  vehicleSelect.disabled = true;
  vehicleDetailInput.disabled = true;
  plateInput.disabled = true;
  entryInput.disabled = true;
  nowInButton.hidden = true;

  // Show Time Out field ready for departure
  exitField.hidden = false;
  exitInput.value = "";
  checkinActions.hidden = true;
  checkoutActions.hidden = false;

  clearError();
  clearResult();
  feeNote.textContent = "Set Time out for Slot " + slotId + " to see the total fee.";

  updateSlotPickerDisplay();
  renderParkingMap();

  calculatorMain.scrollIntoView({ behavior: "smooth" });
}

cancelCheckoutBtn.addEventListener("click", function () {
  switchToCheckinMode(true);
});

resetCheckinBtn.addEventListener("click", function () {
  switchToCheckinMode(true);
});

// When Vehicle Type changes during Check-In, lock the opposite parking area
vehicleSelect.addEventListener("change", function () {
  if (workflowMode !== "checkin") return;

  const currentSize = getSelectedVehicleSize();
  if (selectedVacantSlot) {
    const slotSize = selectedVacantSlot.startsWith("L-") ? "large" : "small";
    if (slotSize !== currentSize) {
      selectedVacantSlot = null;
    }
  }

  clearError();
  checkinNotice.hidden = true;
  updateSlotPickerDisplay();
  renderParkingMap();
});

nowInButton.addEventListener("click", function () {
  entryInput.value = toInputValue(new Date());
  clearError();
});

/* =====================================================
   PARKING SPACE LOOKER & ARCHITECTURAL 5-BAY MAP
   ===================================================== */
function buildSlotIds(sizeKey) {
  const prefix = sizeKey === "large" ? "L-" : "S-";
  const count = RULES.capacity[sizeKey];
  const ids = [];
  for (let i = 1; i <= count; i++) {
    ids.push(prefix + String(i).padStart(2, "0"));
  }
  return ids;
}

const LARGE_SLOTS = buildSlotIds("large");
const SMALL_SLOTS = buildSlotIds("small");

// 5 Double-loaded vertical bays (20 stalls each = 100 stalls total)
// Left 5 columns of 10 = L-01 to L-50 (Big Vehicles)
// Right 5 columns of 10 = S-01 to S-50 (Small Vehicles)
const ARCHITECTURAL_BAYS = [
  {
    leftSlots:  LARGE_SLOTS.slice(0, 10),   // L-01 to L-10
    rightSlots: LARGE_SLOTS.slice(10, 20)   // L-11 to L-20
  },
  {
    leftSlots:  LARGE_SLOTS.slice(20, 30),  // L-21 to L-30
    rightSlots: LARGE_SLOTS.slice(30, 40)   // L-31 to L-40
  },
  {
    leftSlots:  LARGE_SLOTS.slice(40, 50),  // L-41 to L-50
    rightSlots: SMALL_SLOTS.slice(0, 10)    // S-01 to S-10
  },
  {
    leftSlots:  SMALL_SLOTS.slice(10, 20),  // S-11 to S-20
    rightSlots: SMALL_SLOTS.slice(20, 30)   // S-21 to S-30
  },
  {
    leftSlots:  SMALL_SLOTS.slice(30, 40),  // S-31 to S-40
    rightSlots: SMALL_SLOTS.slice(40, 50)   // S-41 to S-50
  }
];

async function persistSlotsState() {
  if (!currentUser) return;

  if (currentUser.isDemo) {
    saveDemoSlots();
    return;
  }

  try {
    await db.collection("users").doc(currentUser.uid).set(
      { occupiedSlots: occupiedSlots },
      { merge: true }
    );
  } catch (error) {
    console.error("Failed to save parking map state:", error);
  }
}

function createSlotButton(slotId, query, selectedSize) {
  const zoneSize = slotId.startsWith("L-") ? "large" : "small";
  const occupant = occupiedSlots[slotId];
  const isTaken = Boolean(occupant);
  const isSelected = (workflowMode === "checkin" && selectedVacantSlot === slotId) ||
                     (workflowMode === "checkout" && checkoutSlotId === slotId);

  let matchesSearch = true;
  if (query) {
    const codeMatch = slotId.toLowerCase().includes(query);
    const plateMatch = isTaken && occupant.plate && occupant.plate.toLowerCase().includes(query);
    const labelMatch = isTaken && occupant.label && occupant.label.toLowerCase().includes(query);
    matchesSearch = codeMatch || plateMatch || labelMatch;
  }

  const btn = document.createElement("button");
  btn.type = "button";

  let classes = "slot-btn " + (isTaken ? "is-taken" : "is-vacant");
  if (isSelected) classes += " is-selected";
  if (query) {
    classes += matchesSearch ? " is-search-match" : " is-search-dimmed";
  }
  btn.className = classes;

  // Enforce size lock on vacant slots: cannot click opposite parking area
  if (!isTaken && zoneSize !== selectedSize) {
    btn.disabled = true;
    btn.title = slotId + " — Locked (Select a " + RULES.sizes[zoneSize].label.toLowerCase() + " in Vehicle type first)";
  } else if (!isTaken) {
    btn.title = slotId + " — VACANT";
  } else {
    btn.title = slotId + " — TAKEN (" + occupant.label + (occupant.plate ? ", " + occupant.plate : "") + ")";
  }

  const codeSpan = makeElement("span", slotId, "slot-code");
  const subLabel = isTaken ? (occupant.plate || occupant.label || "TAKEN") : "VACANT";
  const subSpan = makeElement("span", subLabel, "slot-sub");

  btn.appendChild(codeSpan);
  btn.appendChild(subSpan);

  btn.addEventListener("click", function () {
    if (isTaken) {
      switchToCheckoutMode(slotId);
    } else {
      if (workflowMode === "checkout") {
        switchToCheckinMode(true);
      }
      selectedVacantSlot = slotId;
      clearError();
      checkinNotice.hidden = true;
      updateSlotPickerDisplay();
      renderParkingMap();
      calculatorMain.scrollIntoView({ behavior: "smooth" });
    }
  });

  return btn;
}

function renderParkingMap() {
  const largeTaken = LARGE_SLOTS.filter((id) => Boolean(occupiedSlots[id])).length;
  const smallTaken = SMALL_SLOTS.filter((id) => Boolean(occupiedSlots[id])).length;

  const largeVacant = RULES.capacity.large - largeTaken;
  const smallVacant = RULES.capacity.small - smallTaken;
  const totalOccupied = largeTaken + smallTaken;
  const totalCapacity = RULES.capacity.large + RULES.capacity.small;
  const totalVacant = totalCapacity - totalOccupied;

  // 1. Capacity Looker Stat Cards
  mapStatsBox.textContent = "";

  const statItems = [
    {
      number: largeVacant + " / " + RULES.capacity.large,
      label: "Big vehicle spaces vacant",
      isFull: largeVacant === 0,
      statusText: largeVacant === 0 ? "Big Zone Full" : "Available"
    },
    {
      number: smallVacant + " / " + RULES.capacity.small,
      label: "Small vehicle spaces vacant",
      isFull: smallVacant === 0,
      statusText: smallVacant === 0 ? "Small Zone Full" : "Available"
    },
    {
      number: totalVacant + " / " + totalCapacity,
      label: "Total spaces available (" + totalOccupied + " taken)",
      isFull: totalVacant === 0,
      statusText: totalVacant === 0 ? "Parking Area Full" : "Lot Open"
    }
  ];

  statItems.forEach(function (item) {
    const card = makeElement("div", undefined, "stat" + (item.isFull ? " is-full" : ""));
    card.appendChild(makeElement("p", item.number, "stat-number"));
    card.appendChild(makeElement("p", item.label, "stat-label"));
    card.appendChild(makeElement("span", item.statusText, "stat-pill " + (item.isFull ? "full" : "open")));
    mapStatsBox.appendChild(card);
  });

  // 2. Full Alert Banner
  if (totalVacant === 0) {
    lotFullBanner.textContent = "PARKING AREA FULL: All 50 Big vehicle slots and 50 Small vehicle slots are currently taken.";
    lotFullBanner.hidden = false;
  } else if (largeVacant === 0) {
    lotFullBanner.textContent = "BIG VEHICLE ZONE FULL: All 50 Large vehicle slots (L-01 to L-50) are taken. Small vehicle spaces are still available.";
    lotFullBanner.hidden = false;
  } else if (smallVacant === 0) {
    lotFullBanner.textContent = "SMALL VEHICLE ZONE FULL: All 50 Small vehicle slots (S-01 to S-50) are taken. Big vehicle spaces are still available.";
    lotFullBanner.hidden = false;
  } else {
    lotFullBanner.hidden = true;
  }

  // 3. Zone Badges & Size-Lock Hint
  const selectedSize = getSelectedVehicleSize();
  largeZoneCount.textContent = "(" + largeVacant + "/" + RULES.capacity.large + ")";
  smallZoneCount.textContent = "(" + smallVacant + "/" + RULES.capacity.small + ")";

  zoneLargeBadge.classList.toggle("is-active-zone", workflowMode === "checkin" && selectedSize === "large");
  zoneSmallBadge.classList.toggle("is-active-zone", workflowMode === "checkin" && selectedSize === "small");

  if (workflowMode === "checkin") {
    sizeLockHint.textContent = selectedSize === "large"
      ? "Vehicle Type is Large: Only green slots for Large vehicles (L-01 to L-50) can be clicked."
      : "Vehicle Type is Small: Only green slots for Small vehicles (S-01 to S-50) can be clicked.";
  } else {
    sizeLockHint.textContent = "Checking out Slot " + checkoutSlotId + ". Click any other red slot to switch.";
  }

  // 4. Render 5 Architectural Double-Loaded Bays
  const query = slotSearchInput.value.trim().toLowerCase();
  lotBaysRow.textContent = "";

  ARCHITECTURAL_BAYS.forEach(function (bay) {
    const bayEl = makeElement("div", undefined, "parking-bay");

    // Top rounded concrete end-cap
    bayEl.appendChild(makeElement("div", undefined, "bay-endcap top"));

    // Center row: Left 10 stalls | Lamp spine | Right 10 stalls
    const stallsWrap = makeElement("div", undefined, "bay-stalls-wrap");

    const leftCol = makeElement("div", undefined, "bay-col");
    bay.leftSlots.forEach(function (slotId) {
      leftCol.appendChild(createSlotButton(slotId, query, selectedSize));
    });

    const spine = makeElement("div", undefined, "bay-spine");
    spine.setAttribute("aria-hidden", "true");
    for (let i = 0; i < 5; i++) {
      spine.appendChild(makeElement("span", undefined, "lamp-node"));
    }

    const rightCol = makeElement("div", undefined, "bay-col");
    bay.rightSlots.forEach(function (slotId) {
      rightCol.appendChild(createSlotButton(slotId, query, selectedSize));
    });

    stallsWrap.appendChild(leftCol);
    stallsWrap.appendChild(spine);
    stallsWrap.appendChild(rightCol);

    bayEl.appendChild(stallsWrap);

    // Bottom rounded concrete end-cap
    bayEl.appendChild(makeElement("div", undefined, "bay-endcap bottom"));

    lotBaysRow.appendChild(bayEl);
  });
}

// Search bar filtering
slotSearchInput.addEventListener("input", function () {
  clearSearchBtn.hidden = slotSearchInput.value.trim() === "";
  renderParkingMap();
});

clearSearchBtn.addEventListener("click", function () {
  slotSearchInput.value = "";
  clearSearchBtn.hidden = true;
  renderParkingMap();
});

// Reset entire parking lot map
resetMapBtn.addEventListener("click", async function () {
  if (Object.keys(occupiedSlots).length === 0) return;
  if (!window.confirm("Mark all 100 parking spaces (Big & Small) as vacant?")) return;

  occupiedSlots = {};
  await persistSlotsState();
  switchToCheckinMode(true);
  renderParkingMap();
});

/* =====================================================
   CHECK-IN SUBMIT (PARK VEHICLE IN SELECTED GREEN SLOT)
   ===================================================== */
form.addEventListener("submit", async function (event) {
  event.preventDefault();
  if (workflowMode !== "checkin") return;

  clearError();
  checkinNotice.hidden = true;

  const detail = vehicleDetailInput.value.trim();
  const plate = plateInput.value.trim().toUpperCase();

  if (!selectedVacantSlot) {
    errorBox.textContent = "Pick an available green parking slot on the map below first.";
    errorBox.hidden = false;
    document.getElementById("parking-map").scrollIntoView({ behavior: "smooth" });
    return;
  }

  const vehicleKey = vehicleSelect.value;
  const vehicle = RULES.vehicles[vehicleKey];
  const slotSize = selectedVacantSlot.startsWith("L-") ? "large" : "small";

  if (slotSize !== vehicle.size) {
    errorBox.textContent = "Selected slot " + selectedVacantSlot + " does not match " + vehicle.label + ".";
    errorBox.hidden = false;
    return;
  }

  if (detail && !/^[A-Za-z0-9 .,'()/-]{2,50}$/.test(detail)) {
    showError({
      field: vehicleDetailInput,
      message: "Vehicle detail must be 2 to 50 characters (color, brand, and model)."
    });
    return;
  }
  if (plate && !/^[A-Za-z0-9 -]{3,20}$/.test(plate)) {
    showError({
      field: plateInput,
      message: "Plate number must be 3 to 20 characters: letters, numbers, spaces or hyphens."
    });
    return;
  }
  if (!entryInput.value) {
    showError({ field: entryInput, message: "Enter Time in or click Use current time." });
    return;
  }

  const entry = new Date(entryInput.value);
  if (isNaN(entry.getTime())) {
    showError({ field: entryInput, message: "Time in is not a valid date and time." });
    return;
  }

  parkSubmitBtn.disabled = true;
  parkSubmitBtn.textContent = "Parking...";

  const parkedSlotId = selectedVacantSlot;
  occupiedSlots[parkedSlotId] = {
    vehicleKey: vehicleKey,
    label: vehicle.label,
    detail: detail,
    plate: plate,
    timeIn: entry.toISOString()
  };

  await persistSlotsState();

  parkSubmitBtn.disabled = false;
  parkSubmitBtn.textContent = "Park vehicle in slot";

  selectedVacantSlot = null;
  form.reset();
  updateSlotPickerDisplay();
  renderParkingMap();

  checkinNotice.textContent = "Parked! " + vehicle.label + (plate ? " (" + plate + ")" : "") + " is now in Slot " + parkedSlotId + " (Red).";
  checkinNotice.hidden = false;
});

/* =====================================================
   CHECK-OUT FEE CALCULATION & "PAID NOW"
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

function runCheckoutCalculation() {
  if (workflowMode !== "checkout" || !checkoutSlotId) return;
  clearError();

  if (!exitInput.value) {
    showError({ field: exitInput, message: "Set Time out or click Use current time." });
    return;
  }

  const entry = new Date(entryInput.value);
  const exit = new Date(exitInput.value);

  if (isNaN(exit.getTime())) {
    showError({ field: exitInput, message: "Time out is not valid. Check the date and time." });
    return;
  }
  if (exit <= entry) {
    showError({ field: exitInput, message: "Time out must be later than Time in." });
    return;
  }
  if ((exit - entry) / 60000 > RULES.maxDays * MINUTES_PER_DAY) {
    showError({
      field: exitInput,
      message: "That is more than " + RULES.maxDays + " days. Check that the dates are correct."
    });
    return;
  }

  const occupant = occupiedSlots[checkoutSlotId];
  const vehicleKey = occupant.vehicleKey;
  const result = calculateFee(vehicleKey, entry, exit);

  lastResult = {
    slotId: checkoutSlotId,
    vehicleKey: vehicleKey,
    label: occupant.label,
    plate: occupant.plate || "",
    detail: occupant.detail || "",
    entry: entry,
    exit: exit,
    minutes: result.minutes,
    hours: result.hours,
    fee: result.fee,
    lines: result.lines
  };

  showResult(lastResult);
}

nowButton.addEventListener("click", function () {
  exitInput.value = toInputValue(new Date());
  runCheckoutCalculation();
});

exitInput.addEventListener("change", function () {
  if (exitInput.value) {
    runCheckoutCalculation();
  }
});

calcCheckoutBtn.addEventListener("click", runCheckoutCalculation);

/* ---------- Showing the ticket result ---------- */
function addFact(label, value) {
  factsList.appendChild(makeElement("dt", label));
  factsList.appendChild(makeElement("dd", value));
}

function showResult(data) {
  const vehicle = RULES.vehicles[data.vehicleKey];
  const size = RULES.sizes[vehicle.size];

  feeAmount.textContent = money(data.fee);
  feeAmount.classList.remove("is-empty");
  feeNote.textContent = "Slot " + data.slotId + " • " + vehicle.label + " parked for " + formatDuration(data.minutes);

  factsList.textContent = "";
  addFact("Parking slot", data.slotId);
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
  saveButton.textContent = "Paid Now & Save to Log";

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
  feeNote.textContent = "Click a red taken slot on the map when a vehicle is leaving.";
  resultBox.hidden = true;
  placeholder.hidden = false;
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

/* =====================================================
   "PAID NOW & SAVE TO LOG" -> TURNS RED SLOT BACK TO GREEN
   ===================================================== */
saveButton.addEventListener("click", async function () {
  if (!lastResult || !currentUser) return;

  saveButton.disabled = true;
  saveButton.textContent = "Processing payment...";

  const paidSlotId = lastResult.slotId;
  const record = {
    slotId: paidSlotId,
    plate: lastResult.plate,
    label: lastResult.label,
    detail: lastResult.detail,
    entry: lastResult.entry.toISOString(),
    exit: lastResult.exit.toISOString(),
    minutes: lastResult.minutes,
    fee: lastResult.fee,
    createdAtMs: Date.now()
  };

  // Free the parking slot (turns Red -> Green)
  delete occupiedSlots[paidSlotId];

  if (currentUser.isDemo) {
    log.push(record);
    saveDemoLog();
    saveDemoSlots();
    renderLog();
    switchToCheckinMode(true);
    checkinNotice.textContent = "Payment recorded! Slot " + paidSlotId + " is now VACANT (Green).";
    checkinNotice.hidden = false;
    return;
  }

  try {
    const docRef = await userSessionsRef().add(record);
    await persistSlotsState();

    log.push(Object.assign({ id: docRef.id }, record));
    renderLog();

    switchToCheckinMode(true);
    checkinNotice.textContent = "Payment recorded! Slot " + paidSlotId + " is now VACANT (Green).";
    checkinNotice.hidden = false;
  } catch (error) {
    console.error("Failed to save paid session:", error);
    saveButton.disabled = false;
    saveButton.textContent = "Paid Now & Save to Log";
    alert("Could not save to the database. Check your internet connection.");
  }
});

/* =====================================================
   SAVED SESSIONS & CLOUD SYNC
   ===================================================== */
function userDocRef() {
  return db.collection("users").doc(currentUser.uid);
}

function userSessionsRef() {
  return userDocRef().collection("sessions");
}

async function loadCloudData() {
  if (!currentUser || currentUser.isDemo) {
    log = [];
    occupiedSlots = {};
    return;
  }
  try {
    const [userSnap, sessionsSnap] = await Promise.all([
      userDocRef().get(),
      userSessionsRef().get()
    ]);

    if (userSnap.exists && userSnap.data().occupiedSlots) {
      occupiedSlots = userSnap.data().occupiedSlots;
    } else {
      occupiedSlots = {};
    }

    const items = [];
    sessionsSnap.forEach(function (doc) {
      items.push(Object.assign({ id: doc.id }, doc.data()));
    });
    items.sort((a, b) => (a.createdAtMs || 0) - (b.createdAtMs || 0));
    log = items;
  } catch (error) {
    console.error("Could not load cloud data:", error);
    log = [];
    occupiedSlots = {};
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
    row.appendChild(makeElement("td", entry.slotId || "—"));
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
  logSummary.textContent = owner + plural(log.length, "paid session") + " saved, " + money(total) + " collected in total.";
}

clearLogButton.addEventListener("click", async function () {
  if (!currentUser || !window.confirm("Delete all of your saved sessions?")) return;

  if (currentUser.isDemo) {
    log = [];
    saveDemoLog();
    renderLog();
    return;
  }

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

/* ---------- Start ---------- */
renderRules();

// Restore active Demo session on page refresh
let hasActiveDemo = false;
try {
  hasActiveDemo = sessionStorage.getItem(DEMO_ACTIVE_KEY) === "true";
} catch (e) {}

if (hasActiveDemo) {
  isInitialAuthCheck = false;
  enterApp({ isDemo: true }, false);
}

auth.onAuthStateChanged(async function (user) {
  if (isRegistering) return;

  if (user && user.email === "demo" + AUTH_DOMAIN) {
    await auth.signOut();
    return;
  }

  if (sessionStorage.getItem(DEMO_ACTIVE_KEY) === "true") return;

  const shouldAnimate = !isInitialAuthCheck;
  isInitialAuthCheck = false;

  if (user) {
    await enterApp(user, shouldAnimate);
  }
});