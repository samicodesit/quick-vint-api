import Atropos from "atropos";
import "atropos/css";

const stage = document.querySelector("[data-fidget-stage]");
const moneyStage = document.querySelector(".money-stage");
const loadedAt = performance.now();
const sparkColors = [
  "#06b6d4",
  "#22c55e",
  "#f59e0b",
  "#ec4899",
  "#8b5cf6",
  "#0ea5e9",
];
let lastSparkColor = "";
let particleTimeout = 0;
let summaryTimeout = 0;
let activeStartedAt = 0;
let firstInteractionAt = 0;
let lastInteractionAt = 0;
let summarySentAt = 0;
let totalActiveMs = 0;
let maxActiveMs = 0;
let clickCount = 0;
let dragCount = 0;
let keyboardCount = 0;
let moveCount = 0;
let sparkCount = 0;

function getRandomSparkColor() {
  const nextColors = sparkColors.filter((color) => color !== lastSparkColor);
  const color = nextColors[Math.floor(Math.random() * nextColors.length)];
  lastSparkColor = color;
  return color;
}

function createParticles(originX, originY, color) {
  if (!stage) return;

  window.clearTimeout(particleTimeout);
  stage
    .querySelectorAll(".fidget-particle")
    .forEach((particle) => particle.remove());

  const particleCount = 18;
  const highlightEvery = 5;
  for (let index = 0; index < particleCount; index += 1) {
    const angle = (Math.PI * 2 * index) / particleCount + Math.random() * 0.22;
    const distance = 46 + Math.random() * 82;
    const particle = document.createElement("span");
    const size = 4 + Math.random() * 7;
    const tx = Math.cos(angle) * distance;
    const ty = Math.sin(angle) * distance * 0.72;

    particle.className = "fidget-particle";
    particle.style.setProperty("--particle-x", `${originX}px`);
    particle.style.setProperty("--particle-y", `${originY}px`);
    particle.style.setProperty("--particle-tx", `${tx}px`);
    particle.style.setProperty("--particle-ty", `${ty}px`);
    particle.style.setProperty("--particle-size", `${size}px`);
    particle.style.setProperty("--particle-delay", `${index * 13}ms`);
    particle.style.setProperty(
      "--particle-color",
      index % highlightEvery === 0 ? "rgba(255, 255, 255, 0.98)" : color,
    );
    stage.appendChild(particle);
  }

  particleTimeout = window.setTimeout(() => {
    stage
      .querySelectorAll(".fidget-particle")
      .forEach((particle) => particle.remove());
  }, 1320);
}

function sparkBorder(event) {
  if (!stage || !moneyStage) return;

  const color = getRandomSparkColor();
  const rect = stage.getBoundingClientRect();
  const originX = event ? event.clientX - rect.left : rect.width / 2;
  const originY = event ? event.clientY - rect.top : rect.height / 2;

  stage.style.setProperty("--fidget-border", color);
  stage.style.setProperty("--fidget-spark", `${color}dc`);
  stage.style.setProperty("--fidget-spark-soft", `${color}3d`);
  stage.classList.remove("is-sparking");
  void stage.offsetWidth;
  stage.classList.add("is-sparking");
  createParticles(originX, originY, `${color}e8`);
  sparkCount += 1;
}

function markInteraction() {
  const now = performance.now();
  firstInteractionAt ||= now;
  lastInteractionAt = now;
  window.clearTimeout(summaryTimeout);
  summaryTimeout = window.setTimeout(
    () => flushInteractionSummary("idle"),
    4200,
  );
}

function startActiveSession() {
  markInteraction();
  activeStartedAt ||= performance.now();
}

function endActiveSession() {
  if (!activeStartedAt) return;

  const duration = Math.max(0, performance.now() - activeStartedAt);
  totalActiveMs += duration;
  maxActiveMs = Math.max(maxActiveMs, duration);
  activeStartedAt = 0;
}

function flushInteractionSummary(reason) {
  if (!firstInteractionAt || summarySentAt === lastInteractionAt) return;

  endActiveSession();
  summarySentAt = lastInteractionAt;
  window.dispatchEvent(
    new CustomEvent("autolister:fidget-summary", {
      detail: {
        reason,
        firstInteractionDelayMs: Math.round(firstInteractionAt - loadedAt),
        lastInteractionAgoMs: Math.round(performance.now() - lastInteractionAt),
        totalActiveMs: Math.round(totalActiveMs),
        maxActiveMs: Math.round(maxActiveMs),
        clickCount,
        dragCount,
        keyboardCount,
        moveCount,
        sparkCount,
      },
    }),
  );
}

function initFidget() {
  if (!stage) return;

  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

  const instance = Atropos({
    el: stage,
    activeOffset: 22,
    shadow: true,
    shadowScale: 0.88,
    rotateXMax: 18,
    rotateYMax: 18,
    duration: 420,
    highlight: true,
  });

  stage.addEventListener("keydown", (event) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      keyboardCount += 1;
      markInteraction();
      sparkBorder();
      instance.enter();
      window.setTimeout(() => instance.leave(), 760);
    }
  });

  stage.addEventListener("pointerenter", () => {
    moneyStage?.classList.add("is-active");
    startActiveSession();
  });
  stage.addEventListener("pointerleave", () => {
    moneyStage?.classList.remove("is-active");
    moneyStage?.classList.remove("is-grabbing");
    endActiveSession();
    markInteraction();
    instance.leave();
  });
  stage.addEventListener("pointerdown", () => {
    moneyStage?.classList.add("is-grabbing");
    dragCount += 1;
    startActiveSession();
  });
  stage.addEventListener("pointermove", () => {
    if (!activeStartedAt) return;
    moveCount += 1;
    markInteraction();
  });
  stage.addEventListener("click", (event) => {
    clickCount += 1;
    markInteraction();
    sparkBorder(event);
  });
  stage.addEventListener("pointerup", () => {
    moneyStage?.classList.remove("is-grabbing");
    markInteraction();
    instance.leave();
  });
  stage.addEventListener("pointercancel", () => {
    moneyStage?.classList.remove("is-grabbing");
    endActiveSession();
    markInteraction();
    instance.leave();
  });

  window.addEventListener("pagehide", () =>
    flushInteractionSummary("pagehide"),
  );
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") {
      flushInteractionSummary("visibility_hidden");
    }
  });
}

window.requestAnimationFrame(initFidget);
