// EvolutionIdle - Chapter 2 JS (Balanced upgrades, separate algo efficiency, removed Daemon from upgrades)

let ops = 0;
let computeUnits = 1;
let memoryBanks = 1;
let algorithmEfficiency = 1.0;
let daemonActive = false;
let daemonInterval = null;
let daemonSpeed = 1000;

function computeUpgradeCost(base, level) {
    return Math.floor(base * Math.pow(1.15, level));
}

const opsDisplay = document.getElementById('ops');
const computeUnitsDisplay = document.getElementById('computeUnits');
const memoryBanksDisplay = document.getElementById('memoryBanks');
const upgradeComputeBtn = document.getElementById('upgradeCompute');
const upgradeMemoryBtn = document.getElementById('upgradeMemory');
const unlockDaemonBtn = document.getElementById('unlockAutoGen');
const optimizeAlgoBtn = document.getElementById('optimizeAlgo');
const upgradeEfficiencyBtn = document.getElementById('upgradeEfficiency');
const upgradeButton = document.getElementById('initiateUpgrade');
const chapter3Button = document.getElementById('goToChapter3');
const logOutput = document.getElementById('logOutput');
const autoGenStatus = document.getElementById('autoGenStatus');

function logMessage(message, type = 'INFO') {
    const timestamp = new Date().toLocaleTimeString();
    logOutput.innerText += `\n[${type}] ${timestamp} - ${message}`;
    logOutput.scrollTop = logOutput.scrollHeight;
}

function updateDisplay() {
    opsDisplay.textContent = Math.round(ops);
    computeUnitsDisplay.textContent = computeUnits;
    memoryBanksDisplay.textContent = memoryBanks;
    upgradeComputeBtn.textContent = `+1 Compute Unit (Cost: ${computeUpgradeCost(60, computeUnits)} Ops)`;
    upgradeMemoryBtn.textContent = `+1 Memory Bank (Cost: ${computeUpgradeCost(90, memoryBanks)} Ops)`;
    unlockDaemonBtn.style.display = daemonActive ? 'none' : 'block';
    optimizeAlgoBtn.textContent = `Optimize Algorithm (Cost: 200 Ops)`;
    upgradeEfficiencyBtn.textContent = `Advanced Algorithm Tuning (Cost: 400 Ops)`;
}

function manualGenerateOps() {
    const production = computeUnits * (1 + 0.2 * memoryBanks) * algorithmEfficiency;
    ops += production;
    logMessage(`${production.toFixed(2)} Ops generated manually.`);
    checkProgression();
    updateDisplay();
}

function buyComputeUnit() {
    const cost = computeUpgradeCost(60, computeUnits);
    if (ops >= cost) {
        ops -= cost;
        computeUnits++;
        logMessage("Compute Unit acquired.", 'UPGRADE');
        updateDisplay();
    }
}

function buyMemoryBank() {
    const cost = computeUpgradeCost(90, memoryBanks);
    if (ops >= cost) {
        ops -= cost;
        memoryBanks++;
        logMessage("Memory Bank acquired.", 'UPGRADE');
        updateDisplay();
    }
}

function unlockDaemon() {
    if (ops >= 30 && !daemonActive) {
        ops -= 30;
        daemonActive = true;
        logMessage("Auto Compute Daemon ENABLED!", 'UNLOCK');
        autoGenStatus.textContent = "Auto Compute Daemon: ACTIVE";
        unlockDaemonBtn.style.display = 'none';
        daemonInterval = setInterval(runDaemon, daemonSpeed);
        updateDisplay();
    }
}

function runDaemon() {
    const production = (computeUnits * (1 + 0.2 * memoryBanks) * algorithmEfficiency) * 0.5;
    ops += production;
    logMessage(`${production.toFixed(2)} Ops generated automatically (Daemon).`);
    checkProgression();
    updateDisplay();
}

function optimizeAlgorithm() {
    if (ops >= 200) {
        ops -= 200;
        algorithmEfficiency += 0.1;
        logMessage("Algorithm efficiency improved by +0.1.", 'UPGRADE');
        updateDisplay();
    }
}

function upgradeEfficiency() {
    if (ops >= 400) {
        ops -= 400;
        algorithmEfficiency += 0.25;
        logMessage("Advanced Algorithm Tuning applied (+0.25 Efficiency).", 'UPGRADE');
        updateDisplay();
    }
}

function checkProgression() {
    const threshold = 5000;
    if (ops >= threshold) {
        upgradeButton.disabled = false;
        logMessage("Ops target reached! Interface Upgrade Protocol available.", 'SUCCESS');
    } else {
        upgradeButton.disabled = true;
    }
}

document.getElementById('runLoop').addEventListener('click', manualGenerateOps);
upgradeComputeBtn.addEventListener('click', buyComputeUnit);
upgradeMemoryBtn.addEventListener('click', buyMemoryBank);
unlockDaemonBtn.addEventListener('click', unlockDaemon);
optimizeAlgoBtn.addEventListener('click', optimizeAlgorithm);
upgradeEfficiencyBtn.addEventListener('click', upgradeEfficiency);

upgradeButton.addEventListener('click', () => {
    if (!upgradeButton.disabled) {
        logMessage("Launching Upgrade Protocol...", 'ACTION');
        upgradeButton.disabled = true;
        setTimeout(() => {
            chapter3Button.disabled = false;
            chapter3Button.textContent = "Install graphics drivers";
            logMessage("Upgrade complete! Graphics drivers.", 'SUCCESS');
        }, 5000);
    }
});

chapter3Button.addEventListener('click', () => {
    if (!chapter3Button.disabled) {
        alert('Enable graphics drivers! Proceeding to the next stage...');
    }
});

logMessage("System initialized. Ready for input...");
updateDisplay();
