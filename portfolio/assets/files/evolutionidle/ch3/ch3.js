// Variables principales
let ops = 100000;
let clusters = 0;
let coolingSystems = 0;
let energyUnits = 500;
let temperature = 25;
let knowledgePoints = 0;
let efficiency = 1.0;
let autoGenActive = true;
let autobuyEnergy = false;
let frameworkInstalled = false;

let clusterCost = 100;
let coolingCost = 75;

// DOM Elements
const opsDisplay = document.getElementById('ops');
const clustersDisplay = document.getElementById('clusters');
const coolingDisplay = document.getElementById('cooling');
const energyDisplay = document.getElementById('energy');
const temperatureDisplay = document.getElementById('temperature');
const efficiencyDisplay = document.getElementById('efficiency');
const autoGenStatus = document.getElementById('autoGenStatus');

const opsPerSecDisplay = document.getElementById('opsPerSec');
const energyDrainDisplay = document.getElementById('energyDrain');
const tempImpactDisplay = document.getElementById('tempImpact');
const efficiencyStatus = document.getElementById('efficiencyStatus');
const coolingEffectDisplay = document.getElementById('coolingEffect');

const buyEnergyBtn = document.getElementById('buyEnergy');
const toggleAutobuyBtn = document.getElementById('toggleAutobuy');
const installFrameworkBtn = document.getElementById('installFramework');

// Update Display
function updateDisplay() {
    opsDisplay.textContent = Math.round(ops);
    clustersDisplay.textContent = clusters;
    coolingDisplay.textContent = coolingSystems;
    energyDisplay.textContent = Math.round(energyUnits);
    temperatureDisplay.textContent = Math.round(temperature);
    efficiencyDisplay.textContent = Math.round(efficiency * 100) + '%';
    autoGenStatus.textContent = autoGenActive ? 'ACTIVE' : 'LOCKED';

    opsPerSecDisplay.textContent = Math.round(getOpsPerSec());
    energyDrainDisplay.textContent = Math.round(getEnergyConsumption());
    tempImpactDisplay.textContent = temperature >= 80 ? 'Overheating!' : 'Stable';
    efficiencyStatus.textContent = Math.round(efficiency * 100) + '%';
    coolingEffectDisplay.textContent = coolingSystems > 0 ? `-${(coolingSystems * 1.5).toFixed(1)}°C/sec` : 'None';

    if (frameworkInstalled) {
        document.getElementById('goToChapter4').disabled = false;
    } else {
        document.getElementById('goToChapter4').disabled = true;
    }

    // Update button prices
    document.getElementById('addCluster').textContent = `Add Compute Cluster (${clusterCost} Energy)`;
    document.getElementById('addCooling').textContent = `Add Cooling System (${coolingCost} Energy)`;
}

function getOpsPerSec() {
    return Math.floor(clusters ** 1.3 * 500 * efficiency);
}

function getEnergyConsumption() {
    return clusters * 2;
}

function calculateEfficiency() {
    efficiency = 1 - Math.min(0.7, Math.max(0, (temperature - 40) / 100));
}

// Auto-generation Loop
function generateOps() {
    if (!autoGenActive) return;

    const generatedOps = getOpsPerSec();
    const energyCost = getEnergyConsumption();

    if (energyUnits >= energyCost) {
        ops += generatedOps * (Math.random() * 0.1 + 0.95);
        energyUnits -= energyCost;
        temperature += clusters * 0.5 - coolingSystems * 1.5;
        if (temperature < 25) temperature = 25;
    } else {
        temperature += clusters * 0.2 - coolingSystems * 1.5;
    }

    if (autobuyEnergy && ops >= 1000) {
        ops -= 1000;
        energyUnits += 50 + Math.random() * 20;
    }

    calculateEfficiency();
    updateDisplay();
}

setInterval(generateOps, 1000);

// Buttons
const addClusterBtn = document.getElementById('addCluster');
const addCoolingBtn = document.getElementById('addCooling');

addClusterBtn.addEventListener('click', () => {
    if (energyUnits >= clusterCost) {
        clusters++;
        energyUnits -= clusterCost;
        clusterCost = Math.floor(clusterCost * 1.05); // Augmentation du coût de 15% par achat
        updateDisplay();
    }
});

addCoolingBtn.addEventListener('click', () => {
    if (energyUnits >= coolingCost) {
        coolingSystems++;
        energyUnits -= coolingCost;
        coolingCost = Math.floor(coolingCost * 1.15); // Augmentation du coût de 30% par achat
        updateDisplay();
    }
});

buyEnergyBtn.addEventListener('click', () => {
    if (ops >= 1000) {
        ops -= 1000;
        energyUnits += 50 + Math.random() * 20;
        updateDisplay();
    }
});

toggleAutobuyBtn.addEventListener('click', () => {
    autobuyEnergy = !autobuyEnergy;
    toggleAutobuyBtn.textContent = autobuyEnergy ? 'Disable Energy Autobuy' : 'Enable Energy Autobuy';
});

// Framework installation and Chapter 4 unlock
installFrameworkBtn.addEventListener('click', () => {
    if (ops >= 5000000) {
        ops -= 5000000;
        frameworkInstalled = true;
        updateDisplay();
        alert('Framework installed successfully! Launch server.');
    }
});

// Initial Display
updateDisplay();
